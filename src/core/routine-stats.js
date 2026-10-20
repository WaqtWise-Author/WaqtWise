'use strict';

// Statistics for the routines: how steadily each routine is kept. Only times that have already passed count,
// only on the days the routine applies to, and only from the day the routine was made. A paused routine has no
// times, so it is skipped. Nothing here is saved: it is worked out from each routine's ticks (see routines.js).

const { occurrencesOn } = require('./routines');
const { addDaysToKey, dateKey, formatTime12 } = require('./time');

const SPARK_DAYS = 14;

function pct(done, planned) {
  return planned > 0 ? Math.round((done / planned) * 100) : null;
}

// range: { fromKey, toKey }. Returns { items, total: { planned, done, pct } }.
function computeRoutineStats(routines, range, now = new Date()) {
  const nowMs = now.getTime();
  const todayKey = dateKey(now);
  const items = [];
  let allPlanned = 0;
  let allDone = 0;

  for (const routine of routines) {
    const created = dateKey(new Date(routine.createdAt || now));
    const fromKey = range.fromKey > created ? range.fromKey : created;
    const toKey = range.toKey < todayKey ? range.toKey : todayKey;
    let planned = 0;
    let done = 0;
    const perSlot = new Map(); // minutes after midnight -> { planned, done }
    const days = [];

    for (let key = fromKey; key <= toKey; key = addDaysToKey(key, 1)) {
      let dayPlanned = 0;
      let dayDone = 0;
      for (const o of occurrencesOn(routine, key)) {
        if (o.at.getTime() > nowMs) continue; // not yet
        dayPlanned += 1;
        if (o.done) dayDone += 1;
        const mod = o.slot % 1440;
        const entry = perSlot.get(mod) || { planned: 0, done: 0, at: o.at };
        entry.planned += 1;
        if (o.done) entry.done += 1;
        perSlot.set(mod, entry);
      }
      if (dayPlanned > 0) days.push({ key, planned: dayPlanned, done: dayDone });
      planned += dayPlanned;
      done += dayDone;
    }

    // The weakest time of the day: the lowest share done, among times that came up at least 3 times.
    let weakest = null;
    for (const entry of perSlot.values()) {
      if (entry.planned < 3 || entry.done === entry.planned) continue;
      const rate = entry.done / entry.planned;
      if (!weakest || rate < weakest.rate) weakest = { rate, at: entry.at, done: entry.done, planned: entry.planned };
    }

    // The current streak: days in a row (on the days it applies) with every time done. Today counts only when all of
    // its times are done; it never breaks the streak while times are still to come.
    let streak = 0;
    const earliest = addDaysToKey(todayKey, -400) > created ? addDaysToKey(todayKey, -400) : created;
    for (let key = todayKey; key >= earliest; key = addDaysToKey(key, -1)) {
      const list = occurrencesOn(routine, key);
      if (list.length === 0) continue;
      const full = list.every((o) => o.done);
      if (key === todayKey) {
        if (full) streak += 1;
        continue;
      }
      if (!full) break;
      streak += 1;
    }

    items.push({
      id: routine.id,
      title: routine.title,
      enabled: routine.enabled,
      planned,
      done,
      pct: pct(done, planned),
      streak,
      days: days.slice(-SPARK_DAYS).map((d) => ({ key: d.key, planned: d.planned, done: d.done, pct: pct(d.done, d.planned) })),
      weakest: weakest ? { label: formatTime12(weakest.at), pct: Math.round(weakest.rate * 100), done: weakest.done, planned: weakest.planned } : null,
    });
    allPlanned += planned;
    allDone += done;
  }

  items.sort((a, b) => (a.pct === null) - (b.pct === null) || (a.pct === null ? 0 : a.pct - b.pct) || (a.title < b.title ? -1 : 1));
  return { items, total: { planned: allPlanned, done: allDone, pct: pct(allDone, allPlanned) } };
}

module.exports = { computeRoutineStats };
