'use strict';

// Routines: things that repeat several times a day inside a time window, for example "drink water every
// 2 hours 30 minutes from 8:00 AM to 8:00 PM on the chosen days". They live in their own list (data.routines),
// apart from the planner's tasks: they are not placed in zones and are not part of the statistics. Each time
// of a routine can ring (a notification, a full-screen alert, or both) and can be ticked as done.
//
//   { id, title, notes, categoryId|null,
//     from: '08:00', to: '20:00',        // the window (if "to" is earlier than "from" the window runs past midnight)
//     everyMinutes: 150,                 // 5 .. 1440; the first time is "from", then every N minutes while <= "to"
//     weekdays: [0..6],                  // the days the window STARTS on (0 = Sunday)
//     alerts: { notification, fullScreen },
//     randomNotes,                       // full-screen alert: show one of the notes (separated by ;) each time
//     quietAfterPrayerMinutes,           // 0 = off; otherwise a time that falls from a prayer's call until N minutes later rings when that period ends
//     enabled,                           // false = paused
//     completions: { '2026-10-19': [480, 630] },  // minutes after midnight (of the start day) already ticked
//     createdAt }

const { t } = require('./i18n');
const { MAX_TITLE_LENGTH, MAX_NOTES_LENGTH, MAX_ROUTINES } = require('./limits');
const { isValidKey, addDaysToKey, weekdayOfKey, splitKey, dateKey, formatTime12, formatDuration } = require('./time');

const MIN_EVERY_MINUTES = 5;
const MAX_EVERY_MINUTES = 24 * 60;
const KEEP_COMPLETION_DAYS = 400;
const MAX_QUIET_MINUTES = 60;
const PRAYER_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseTime(text) {
  const match = typeof text === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function clockText(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function cleanCreatedAt(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : null;
}

// How far the window reaches in minutes after "from" (a window that ends earlier than it starts runs past midnight).
function windowLength(from, to) {
  return to > from ? to - from : to + 1440 - from;
}

// The minutes after midnight (of the start day) of every time in the window. Can be above 1439 after midnight.
function routineSlots(routine) {
  const from = parseTime(routine.from);
  const to = parseTime(routine.to);
  if (from === null || to === null || !(routine.everyMinutes >= MIN_EVERY_MINUTES)) return [];
  const last = from + windowLength(from, to);
  const slots = [];
  for (let m = from; m <= last; m += routine.everyMinutes) slots.push(m);
  return slots;
}

function slotDate(key, slot) {
  const { y, m, d } = splitKey(key);
  return new Date(y, m - 1, d, 0, slot, 0, 0);
}

function normalizeCompletions(raw, now) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  const oldest = addDaysToKey(dateKey(now), -KEEP_COMPLETION_DAYS);
  for (const [key, list] of Object.entries(raw)) {
    if (!isValidKey(key) || key < oldest || !Array.isArray(list)) continue;
    const slots = Array.from(new Set(list.filter((n) => Number.isInteger(n) && n >= 0 && n < 2880))).sort((a, b) => a - b);
    if (slots.length) out[key] = slots;
  }
  return out;
}

// Builds a clean routine from a form or a file. Returns { routine } or { error }.
function normalizeRoutine(raw, now = new Date()) {
  if (!isPlainObject(raw)) return { error: 'not a routine' };
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title === '') return { error: t('Please enter a title') };
  if (title.length > MAX_TITLE_LENGTH) return { error: t('The title is too long (at most {max} characters)', { max: MAX_TITLE_LENGTH }) };
  if (typeof raw.id !== 'string' || raw.id === '') return { error: 'missing id' };
  const from = parseTime(raw.from);
  const to = parseTime(raw.to);
  if (from === null) return { error: t('Please choose the time the routine starts') };
  if (to === null) return { error: t('Please choose the time the routine ends') };
  if (from === to) return { error: t('The end time must be different from the start time') };
  const every = raw.everyMinutes;
  if (!Number.isInteger(every) || every < MIN_EVERY_MINUTES || every > MAX_EVERY_MINUTES) {
    return { error: t('Repeat every at least {min} minutes and at most 24 hours', { min: MIN_EVERY_MINUTES }) };
  }
  const weekdays = Array.isArray(raw.weekdays)
    ? Array.from(new Set(raw.weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b)
    : [];
  if (weekdays.length === 0) return { error: t('Choose at least one day') };
  const alerts = isPlainObject(raw.alerts) ? raw.alerts : {};
  const notification = alerts.notification === true;
  const fullScreen = alerts.fullScreen === true;
  return {
    routine: {
      id: raw.id,
      title,
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, MAX_NOTES_LENGTH) : '',
      categoryId: typeof raw.categoryId === 'string' && raw.categoryId !== '' ? raw.categoryId : null,
      from: clockText(from),
      to: clockText(to),
      everyMinutes: every,
      weekdays,
      alerts: { notification, fullScreen },
      quietAfterPrayerMinutes: Number.isInteger(raw.quietAfterPrayerMinutes) && raw.quietAfterPrayerMinutes >= 0 && raw.quietAfterPrayerMinutes <= MAX_QUIET_MINUTES ? raw.quietAfterPrayerMinutes : 0,
      randomNotes: raw.randomNotes === true, // the full-screen alert shows one of the notes (separated by ;) at random
      enabled: raw.enabled !== false,
      completions: normalizeCompletions(raw.completions, now),
      createdAt: cleanCreatedAt(raw.createdAt) || now.toISOString(),
    },
  };
}

// The times of one routine on one calendar date (the date the window starts on).
// Returns [{ id, routineId, dateKey, slot, at: Date, done }]. Empty when the routine is paused or not on that weekday.
function occurrencesOn(routine, key) {
  if (!routine.enabled || !routine.weekdays.includes(weekdayOfKey(key))) return [];
  const done = new Set((routine.completions && routine.completions[key]) || []);
  return routineSlots(routine).map((slot) => ({
    id: `routine:${routine.id}@${key}#${slot}`,
    routineId: routine.id,
    dateKey: key,
    slot,
    at: slotDate(key, slot),
    done: done.has(slot),
  }));
}

// Every time that falls in (fromMs, toMs], oldest first. Looks one day back for windows that run past midnight.
function occurrencesInWindow(routines, fromMs, toMs) {
  const result = [];
  const first = addDaysToKey(dateKey(new Date(fromMs)), -1);
  const last = dateKey(new Date(toMs));
  for (const routine of routines) {
    for (let key = first; key <= last; key = addDaysToKey(key, 1)) {
      for (const o of occurrencesOn(routine, key)) {
        const at = o.at.getTime();
        if (at > fromMs && at <= toMs) result.push(o);
      }
    }
  }
  return result.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

// ---- Quiet while praying ---------------------------------------------------------------------------------------

// The prayer times (Date objects) around a moment, from the planner's prayer provider (a function of a date key).
function prayerMomentsAround(provider, at) {
  const moments = [];
  if (typeof provider !== 'function') return moments;
  const day = dateKey(at);
  for (const key of [addDaysToKey(day, -1), day, addDaysToKey(day, 1)]) {
    let times = null;
    try {
      times = provider(key);
    } catch (error) {
      times = null;
    }
    if (!times) continue;
    for (const name of PRAYER_NAMES) if (times[name] instanceof Date) moments.push(times[name].getTime());
  }
  return moments;
}

// When a routine time really rings: at its own time, or, if it falls in the quiet period after a prayer's call
// (the routine's own choice), when that period ends. Returns a Date.
function ringTime(routine, at, provider) {
  const quiet = (routine.quietAfterPrayerMinutes || 0) * 60000;
  if (!quiet) return at;
  const ms = at.getTime();
  for (const p of prayerMomentsAround(provider, at)) if (ms >= p && ms < p + quiet) return new Date(p + quiet);
  return at;
}

// Like occurrencesInWindow, but by the moment each time rings (see ringTime): [{ ...occurrence, ringAt }].
// A time moved past `toMs` is not in the result yet (it is held until its new moment).
function ringsInWindow(routines, fromMs, toMs, provider) {
  const byId = new Map(routines.map((r) => [r.id, r]));
  const lookback = MAX_QUIET_MINUTES * 60000;
  const result = [];
  for (const o of occurrencesInWindow(routines, fromMs - lookback, toMs)) {
    const ringAt = ringTime(byId.get(o.routineId), o.at, provider);
    const ms = ringAt.getTime();
    if (ms > fromMs && ms <= toMs) result.push({ ...o, ringAt });
  }
  return result.sort((a, b) => a.ringAt - b.ringAt || (a.id < b.id ? -1 : 1));
}

// A new routine record with one time ticked (or un-ticked). The time must really be one of the routine's times.
function setSlotDone(routine, key, slot, done, now = new Date()) {
  if (!isValidKey(key) || !routineSlots(routine).includes(slot)) return routine;
  const completions = { ...(routine.completions || {}) };
  const set = new Set(completions[key] || []);
  if (done) set.add(slot);
  else set.delete(slot);
  if (set.size) completions[key] = Array.from(set).sort((a, b) => a - b);
  else delete completions[key];
  return { ...routine, completions: normalizeCompletions(completions, now) };
}

// A short sentence such as "Every 2 h 30 min, 8:00 AM – 8:00 PM".
function describeRoutine(routine) {
  const from = parseTime(routine.from);
  const to = parseTime(routine.to);
  const at = (minutes) => formatTime12(slotDate('2000-01-01', minutes));
  return t('Every {every}, {from} – {to}', { every: formatDuration(routine.everyMinutes), from: at(from), to: at(to) });
}

module.exports = {
  MIN_EVERY_MINUTES,
  MAX_EVERY_MINUTES,
  MAX_ROUTINES,
  parseTime,
  clockText,
  routineSlots,
  normalizeRoutine,
  occurrencesOn,
  occurrencesInWindow,
  ringTime,
  ringsInWindow,
  MAX_QUIET_MINUTES,
  KEEP_COMPLETION_DAYS,
  setSlotDone,
  describeRoutine,
};
