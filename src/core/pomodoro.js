'use strict';

// Pomodoro: work in focused sessions with breaks in between. Each Pomodoro the person makes has its own Focus Time
// and Short Break, an optional Long Break after every few rounds, how it tells the person that a part is over
// (a notification or a full-screen alert), and whether it stops by itself at prayer time.
//
// The running timer is kept in memory only (like a pause from the tray, it ends when the app closes). The next part
// never starts by itself: when a part ends the timer waits until the person starts the next one.
// Focus time that was done is written to a small log, which the Statistics card reads.
//
// Plain functions, no Electron and no clock of their own (the time is always passed in), so they are easy to test.

const { t } = require('./i18n');
const { dateKey, addDaysToKey } = require('./time');

const POMODORO_LIMITS = {
  focus: [1, 240], // minutes
  break: [1, 120],
  longBreak: [1, 120],
  every: [2, 12], // rounds before a long break
};
const MAX_POMODOROS = 50;
const MAX_POMODORO_LOG = 20000;
const POMODORO_LOG_DAYS = 400;
const POMODORO_ALERTS = ['notification', 'fullScreen'];
const EXTEND_MINUTES = 5; // "5 More Minutes" after a focus part

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const wholeIn = (v, [min, max]) => Number.isInteger(v) && v >= min && v <= max;

// The defaults of a new Pomodoro (the classic 25 / 5, with a 15-minute long break after every 4 rounds).
function newPomodoroForm() {
  return {
    title: '', focusMinutes: 25, breakMinutes: 5,
    longBreak: true, longBreakMinutes: 15, longBreakEvery: 4,
    alert: 'fullScreen', holdAtPrayer: true,
  };
}

// raw: a saved Pomodoro (or one made from the form). Returns { pomodoro } or { error } (a message for people).
function normalizePomodoro(raw, now = new Date()) {
  if (!isPlainObject(raw)) return { error: t('This Pomodoro could not be read') };
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : '';
  if (title === '') return { error: t('Please enter a name') };
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.length > 100) return { error: t('This Pomodoro could not be read') };
  if (!wholeIn(raw.focusMinutes, POMODORO_LIMITS.focus)) return { error: t('Focus Time must be a whole number of minutes from {min} to {max}', { min: POMODORO_LIMITS.focus[0], max: POMODORO_LIMITS.focus[1] }) };
  if (!wholeIn(raw.breakMinutes, POMODORO_LIMITS.break)) return { error: t('Short Break must be a whole number of minutes from {min} to {max}', { min: POMODORO_LIMITS.break[0], max: POMODORO_LIMITS.break[1] }) };
  const long = isPlainObject(raw.longBreak) ? raw.longBreak : { enabled: false, minutes: 15, every: 4 };
  const enabled = long.enabled === true;
  const longMinutes = wholeIn(long.minutes, POMODORO_LIMITS.longBreak) ? long.minutes : null;
  const every = wholeIn(long.every, POMODORO_LIMITS.every) ? long.every : null;
  if (enabled && longMinutes === null) return { error: t('Long Break must be a whole number of minutes from {min} to {max}', { min: POMODORO_LIMITS.longBreak[0], max: POMODORO_LIMITS.longBreak[1] }) };
  if (enabled && every === null) return { error: t('The long break comes after {min} to {max} rounds', { min: POMODORO_LIMITS.every[0], max: POMODORO_LIMITS.every[1] }) };
  const created = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : now.toISOString();
  return {
    pomodoro: {
      id: raw.id,
      title,
      focusMinutes: raw.focusMinutes,
      breakMinutes: raw.breakMinutes,
      longBreak: { enabled, minutes: longMinutes === null ? 15 : longMinutes, every: every === null ? 4 : every },
      alert: POMODORO_ALERTS.includes(raw.alert) ? raw.alert : 'notification',
      holdAtPrayer: raw.holdAtPrayer === true,
      createdAt: created,
    },
  };
}

// The log of focus time: [{ pomodoroId, dateKey, minutes, complete, at }]. Damaged entries are dropped; only the last
// 400 days are kept (counted back from `now`), and at most MAX_POMODORO_LOG entries.
function normalizePomodoroLog(list, now = new Date()) {
  if (!Array.isArray(list)) return [];
  const oldest = addDaysToKey(dateKey(now), -POMODORO_LOG_DAYS);
  return list
    .filter((x) => isPlainObject(x) && typeof x.pomodoroId === 'string' && typeof x.dateKey === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.dateKey)
      && Number.isInteger(x.minutes) && x.minutes > 0 && x.minutes <= POMODORO_LIMITS.focus[1] + 60 && x.dateKey >= oldest)
    .map((x) => ({ pomodoroId: x.pomodoroId, dateKey: x.dateKey, minutes: x.minutes, complete: x.complete === true, at: typeof x.at === 'string' ? x.at : '' }))
    .slice(-MAX_POMODORO_LOG);
}

// ---- the running timer ----------------------------------------------------------------------------------------------
// state: null, or {
//   pomodoroId, part: 'focus' | 'break' | 'longBreak', round (1, 2, ...), status: 'running' | 'paused' | 'waiting',
//   partMs (the whole length of this part), endsAt (while running), remainingMs (while paused),
//   extended (a "5 More Minutes" focus part), heldFor (the prayer name when it stopped for prayer),
//   next: { part, round } (while waiting: what comes when the person starts it)
// }

function partMinutes(p, part) {
  if (part === 'focus') return p.focusMinutes;
  if (part === 'longBreak') return p.longBreak.minutes;
  return p.breakMinutes;
}

// What follows a part: after focus a break (a long one after every N rounds, when it is on); after a break, the next round.
function partAfter(p, part, round) {
  if (part === 'focus') {
    const long = p.longBreak.enabled && round % p.longBreak.every === 0;
    return { part: long ? 'longBreak' : 'break', round };
  }
  return { part: 'focus', round: round + 1 };
}

function running(p, part, round, nowMs, extra = {}) {
  const partMs = (extra.minutes || partMinutes(p, part)) * 60000;
  return { pomodoroId: p.id, part, round, status: 'running', partMs, endsAt: nowMs + partMs, remainingMs: partMs, extended: Boolean(extra.extended), heldFor: '', next: null };
}

function startTimer(p, nowMs) {
  return running(p, 'focus', 1, nowMs);
}

function remainingOf(state, nowMs) {
  if (!state) return 0;
  if (state.status === 'running') return Math.max(0, state.endsAt - nowMs);
  if (state.status === 'paused') return state.remainingMs;
  return 0;
}

// The whole minutes of focus done so far in the current part (for the log when it is skipped or stopped early).
function focusedMinutes(state, nowMs) {
  if (!state || state.part !== 'focus' || state.status === 'waiting') return 0;
  return Math.floor((state.partMs - remainingOf(state, nowMs)) / 60000);
}

function pauseTimer(state, nowMs, heldFor = '') {
  if (!state || state.status !== 'running') return state;
  return { ...state, status: 'paused', remainingMs: remainingOf(state, nowMs), endsAt: 0, heldFor };
}

function resumeTimer(state, nowMs) {
  if (!state || state.status !== 'paused') return state;
  return { ...state, status: 'running', endsAt: nowMs + state.remainingMs, heldFor: '' };
}

// The part is over (its time ran out, or the person skipped it). Returns { state, log } where log is
// { minutes, complete } for a focus part (null for a break, or when no whole minute was done).
function finishPart(p, state, nowMs, early = false) {
  if (!state || state.status === 'waiting') return { state, log: null };
  const minutes = early ? focusedMinutes(state, nowMs) : Math.round(state.partMs / 60000);
  const log = state.part === 'focus' && minutes > 0 ? { minutes, complete: !early && !state.extended } : null;
  const next = partAfter(p, state.part, state.round);
  return {
    state: { ...state, status: 'waiting', endsAt: 0, remainingMs: 0, heldFor: '', next, finished: state.part },
    log,
  };
}

// The person starts what comes next (from waiting).
function startNextPart(p, state, nowMs) {
  if (!state || state.status !== 'waiting' || !state.next) return state;
  return running(p, state.next.part, state.next.round, nowMs);
}

// "5 More Minutes": after a focus part, focus a little longer (the same round; the break waits).
function extendFocus(p, state, nowMs, minutes = EXTEND_MINUTES) {
  if (!state || state.status !== 'waiting' || state.finished !== 'focus') return state;
  return running(p, 'focus', state.round, nowMs, { minutes, extended: true });
}

// The log entry when the timer is stopped in the middle of a focus part (null when there is nothing to keep).
function stopLog(state, nowMs) {
  const minutes = focusedMinutes(state, nowMs);
  return minutes > 0 ? { minutes, complete: false } : null;
}

// ---- texts --------------------------------------------------------------------------------------------------------

function partName(part) {
  if (part === 'focus') return t('Focus');
  if (part === 'longBreak') return t('Long Break');
  return t('Short Break');
}

// "18:42" or "1:05:00" from milliseconds (rounded up, so it never shows 0:00 while time is left).
function clockLabel(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

// ---- statistics ---------------------------------------------------------------------------------------------------

// range: { fromKey, toKey }. Returns { minutes, sessions, days: [{ key, minutes }], items: [{ id, title, minutes, sessions }] }.
function computePomodoroStats(pomodoros, log, range) {
  const inRange = (log || []).filter((x) => x.dateKey >= range.fromKey && x.dateKey <= range.toKey);
  const names = new Map((pomodoros || []).map((p) => [p.id, p.title]));
  const byDay = new Map();
  const byItem = new Map();
  let minutes = 0;
  let sessions = 0;
  for (const x of inRange) {
    minutes += x.minutes;
    if (x.complete) sessions += 1;
    byDay.set(x.dateKey, (byDay.get(x.dateKey) || 0) + x.minutes);
    const item = byItem.get(x.pomodoroId) || { id: x.pomodoroId, title: names.get(x.pomodoroId) || t('Deleted Pomodoro'), minutes: 0, sessions: 0 };
    item.minutes += x.minutes;
    if (x.complete) item.sessions += 1;
    byItem.set(x.pomodoroId, item);
  }
  const days = [];
  let count = 0;
  for (let key = range.fromKey; key <= range.toKey && count < 400; key = addDaysToKey(key, 1), count += 1) days.push({ key, minutes: byDay.get(key) || 0 });
  const items = [...byItem.values()].sort((a, b) => b.minutes - a.minutes || (a.title < b.title ? -1 : 1));
  return { minutes, sessions, days, items };
}

module.exports = {
  POMODORO_LIMITS,
  MAX_POMODOROS,
  MAX_POMODORO_LOG,
  POMODORO_LOG_DAYS,
  POMODORO_ALERTS,
  EXTEND_MINUTES,
  newPomodoroForm,
  normalizePomodoro,
  normalizePomodoroLog,
  partMinutes,
  partAfter,
  startTimer,
  remainingOf,
  focusedMinutes,
  pauseTimer,
  resumeTimer,
  finishPart,
  startNextPart,
  extendFocus,
  stopLog,
  partName,
  clockLabel,
  computePomodoroStats,
};
