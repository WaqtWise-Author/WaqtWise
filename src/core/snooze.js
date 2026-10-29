'use strict';

// How long a snooze lasts. The full-screen alert offers a few choices besides the length set in Settings:
// 5, 15, 30 or 60 minutes, or "After the next prayer" (20 minutes after the next call to prayer, so the prayer is over).

const { dateKey, addDaysToKey } = require('./time');

const MS_PER_MINUTE = 60000;
const SNOOZE_CHOICES = [5, 15, 30, 60];
const AFTER_PRAYER_MINUTES = 20;
const PRAYER_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Is this one of the choices the alert may send? (a number of minutes from SNOOZE_CHOICES, 'prayer', or nothing)
function isValidSnoozeOption(option) {
  return option === undefined || option === null || option === 'prayer' || SNOOZE_CHOICES.includes(option);
}

// The moment (ms) the end of the next prayer falls after `nowMs`, or null when the prayer times are not available.
function afterNextPrayer(nowMs, provider) {
  if (typeof provider !== 'function') return null;
  const today = dateKey(new Date(nowMs));
  let best = null;
  for (const key of [addDaysToKey(today, -1), today, addDaysToKey(today, 1)]) {
    let times = null;
    try {
      times = provider(key);
    } catch (error) {
      times = null;
    }
    if (!times) continue;
    for (const name of PRAYER_NAMES) {
      if (!(times[name] instanceof Date)) continue;
      const end = times[name].getTime() + AFTER_PRAYER_MINUTES * MS_PER_MINUTE;
      if (end > nowMs && (best === null || end < best)) best = end;
    }
  }
  return best;
}

// When a snooze started now ends. `defaultMinutes` is the length from Settings.
function snoozeUntil(nowMs, defaultMinutes, option, provider) {
  if (option === 'prayer') {
    const end = afterNextPrayer(nowMs, provider);
    if (end !== null) return end;
  } else if (SNOOZE_CHOICES.includes(option)) {
    return nowMs + option * MS_PER_MINUTE;
  }
  return nowMs + (defaultMinutes || 5) * MS_PER_MINUTE;
}

module.exports = { SNOOZE_CHOICES, AFTER_PRAYER_MINUTES, isValidSnoozeOption, afterNextPrayer, snoozeUntil };
