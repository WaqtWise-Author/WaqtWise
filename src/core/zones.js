'use strict';

const { t } = require('./i18n');
const { dateKey, addDaysToKey, addMinutes, minutesBetween } = require('./time');

// A "prayer provider" is any function: (dateKey) => { fajr, dhuhr, asr, maghrib, isha }
// where every value is a Date. The real app uses the prayer-adapter; tests use fixed times.

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const ZONE_NAMES = [
  'Fajr → Dhuhr',
  'Dhuhr → Asr',
  'Asr → Maghrib',
  'Maghrib → Isha',
  'Isha → Fajr',
];

// The 6 boundary moments of a Planning Day (the 6th is the NEXT day's Fajr).
function getBoundaries(provider, planningDayKey) {
  const today = provider(planningDayKey);
  const next = provider(addDaysToKey(planningDayKey, 1));
  return {
    planningDayKey,
    fajr: today.fajr,
    dhuhr: today.dhuhr,
    asr: today.asr,
    maghrib: today.maghrib,
    isha: today.isha,
    nextFajr: next.fajr,
  };
}

// The 5 zones of a Planning Day. Start-inclusive, end-exclusive.
function getZones(boundaries) {
  const points = [
    boundaries.fajr,
    boundaries.dhuhr,
    boundaries.asr,
    boundaries.maghrib,
    boundaries.isha,
    boundaries.nextFajr,
  ];
  return ZONE_NAMES.map((name, i) => ({
    index: i + 1,
    name,
    start: points[i],
    end: points[i + 1],
    totalMinutes: minutesBetween(points[i], points[i + 1]),
  }));
}

// Which Planning Day contains this moment?
// A Planning Day runs from its Fajr to the next day's Fajr, so a moment before
// that calendar day's Fajr (e.g. 2:00 AM) belongs to the PREVIOUS Planning Day.
// The prayer times may belong to a city in another time zone than the computer's, so the computer's calendar
// date can be a day behind (or ahead of) the city's. Look at the next, the same and the previous date, newest first.
function findPlanningDayKey(provider, moment) {
  const key = dateKey(moment);
  const t = moment.getTime();
  for (const offset of [1, 0, -1]) {
    const candidate = addDaysToKey(key, offset);
    if (t >= provider(candidate).fajr.getTime()) return candidate;
  }
  return addDaysToKey(key, -2);
}

// "Today" = the Planning Day that contains the current moment (not the calendar date).
function currentPlanningDayKey(provider, now = new Date()) {
  return findPlanningDayKey(provider, now);
}

// Zone is ALWAYS derived, never stored.
function deriveZone(provider, moment) {
  const planningDayKey = findPlanningDayKey(provider, moment);
  const boundaries = getBoundaries(provider, planningDayKey);
  const zones = getZones(boundaries);
  const t = moment.getTime();
  const zone = zones.find((z) => t >= z.start.getTime() && t < z.end.getTime());
  if (!zone) {
    throw new Error(`Could not derive a zone for ${moment.toISOString()}`);
  }
  return {
    planningDayKey,
    zoneIndex: zone.index,
    zoneName: zone.name,
    zone,
    boundaries,
  };
}

// Prayer-relative start: e.g. { prayer: 'asr', direction: 'after', minutes: 10 }
// The reference prayer is taken from the given calendar date.
function resolvePrayerRelative(provider, calendarDateKey, relative) {
  const { prayer, direction, minutes } = relative || {};
  if (!PRAYERS.includes(prayer)) {
    throw new Error(`Unknown prayer: ${prayer}`);
  }
  if (direction !== 'before' && direction !== 'after') {
    throw new Error(`Direction must be "before" or "after", got: ${direction}`);
  }
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error(t('Minutes must be a whole number, 0 or more'));
  }
  const base = provider(calendarDateKey)[prayer];
  return addMinutes(base, direction === 'before' ? -minutes : minutes);
}

// End Time is always Start + Duration (in minutes).
function computeEnd(start, durationMinutes) {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(t('Duration must be more than 0 minutes'));
  }
  return addMinutes(start, durationMinutes);
}

module.exports = {
  PRAYERS,
  ZONE_NAMES,
  getBoundaries,
  getZones,
  findPlanningDayKey,
  currentPlanningDayKey,
  deriveZone,
  resolvePrayerRelative,
  computeEnd,
};
