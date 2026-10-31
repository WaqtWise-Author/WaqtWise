'use strict';

// Statistics: how the five prayer times, and the length of each zone, change over the chosen range.
//
// computePrayerTrends(...) returns plain data for two line charts:
//   prayers: for each prayer, the time of day it falls at (minutes after midnight, in the city's own clock)
//   zones:   for each zone, its total length and its free time (minutes)
// A range of up to 62 days has a point for each day; a longer one is averaged by week (up to 400 days) or by month.

const { addDaysToKey, keyToDayNumber, weekdayOfKey, splitKey, formatKeyShort, formatDuration, formatTime12 } = require('./time');
const { ZONE_NAMES } = require('./zones');
const { t: tr, weekdayShort, monthLong, monthShort } = require('./i18n');

const PRAYER_IDS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const DAILY_LIMIT = 62;
const WEEKLY_LIMIT = 400;
const MAX_DAYS = 800;
const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240];

const days = (a, b) => keyToDayNumber(b) - keyToDayNumber(a);
const clock = (minutes) => formatTime12(new Date(2000, 0, 1, Math.floor(minutes / 60) % 24, Math.round(minutes % 60)));
const avg = (list) => Math.round(list.reduce((s, v) => s + v, 0) / list.length);

// Round figures for the up-and-down axis: about 4 to 6 lines that cover every value.
function niceAxis(min, max) {
  const spread = Math.max(max - min, 1);
  const wanted = spread / 4;
  const step = STEPS.find((s) => s >= wanted) || STEPS[STEPS.length - 1];
  const pad = Math.max(spread * 0.1, step / 2);
  const low = Math.floor((min - pad) / step) * step;
  const high = Math.ceil((max + pad) / step) * step;
  const ticks = [];
  for (let v = low; v <= high + 0.001; v += step) ticks.push(v);
  return { low, high, ticks };
}

function bucketsFor(fromKey, toKey) {
  const length = days(fromKey, toKey) + 1;
  const keys = [];
  for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) keys.push(k);
  if (length <= DAILY_LIMIT) {
    const short = length > 31;
    return { kind: 'day', list: keys.map((k) => ({
      keys: [k],
      label: short ? formatKeyShort(k) : String(splitKey(k).d),
      title: `${weekdayShort(weekdayOfKey(k))}${tr(', ')}${formatKeyShort(k, true)}`,
    })) };
  }
  if (length <= WEEKLY_LIMIT) {
    const list = [];
    for (let i = 0; i < keys.length; i += 7) {
      const part = keys.slice(i, i + 7);
      list.push({ keys: part, label: formatKeyShort(part[0]), title: tr('Week of {date}', { date: formatKeyShort(part[0]) }) });
    }
    return { kind: 'week', list };
  }
  const list = [];
  for (const k of keys) {
    const last = list[list.length - 1];
    const ym = k.slice(0, 7);
    if (last && last.ym === ym) last.keys.push(k);
    else {
      const { y, m } = splitKey(k);
      list.push({ ym, keys: [k], label: monthShort(m - 1), title: `${monthLong(m - 1)} ${y}` });
    }
  }
  return { kind: 'month', list };
}

// values: one number (minutes) for each bucket. format: how a value is written. Returns the line and its summary.
function summarize(buckets, values, format) {
  const points = buckets.map((b, i) => ({ label: b.label, title: b.title, value: values[i], valueLabel: format(values[i]) }));
  const nums = values;
  let lo = 0;
  let hi = 0;
  nums.forEach((v, i) => { if (v < nums[lo]) lo = i; if (v > nums[hi]) hi = i; });
  const axis = niceAxis(nums[lo], nums[hi]);
  return {
    points,
    axis: { low: axis.low, high: axis.high, ticks: axis.ticks.map((v) => ({ value: v, label: format(v, true) })) },
    lowest: { value: nums[lo], valueLabel: format(nums[lo]), title: buckets[lo].title },
    highest: { value: nums[hi], valueLabel: format(nums[hi]), title: buckets[hi].title },
    first: nums[0],
    last: nums[nums.length - 1],
    change: nums[nums.length - 1] - nums[0],
    changeLabel: formatDuration(Math.abs(nums[nums.length - 1] - nums[0])),
  };
}

// provider(key) -> { fajr, dhuhr, asr, maghrib, isha } (Dates)
// minutesOfDay(date) -> minutes after midnight on the city's clock
// layoutFor(key) -> the day's layout ({ zones: [{ totalMinutes, freeMinutes }] }) of the Planning Day with that key
function computePrayerTrends({ provider, fromKey, toKey, minutesOfDay, layoutFor }) {
  let from = fromKey;
  if (days(from, toKey) + 1 > MAX_DAYS) from = addDaysToKey(toKey, -(MAX_DAYS - 1));
  const { kind, list } = bucketsFor(from, toKey);

  const times = new Map();
  const layouts = new Map();
  const timesOn = (k) => { if (!times.has(k)) times.set(k, provider(k)); return times.get(k); };
  const layoutOn = (k) => { if (!layouts.has(k)) layouts.set(k, layoutFor(k)); return layouts.get(k); };
  const mean = (b, valueOf) => avg(b.keys.map(valueOf));

  const prayers = PRAYER_IDS.map((id, i) => ({
    id,
    name: tr(PRAYER_NAMES[i]),
    ...summarize(list, list.map((b) => mean(b, (k) => minutesOfDay(timesOn(k)[id]))), (v) => clock(v)),
  }));

  const zones = PRAYER_IDS.map((id, i) => ({
    index: i + 1,
    name: tr(ZONE_NAMES[i]),
    total: summarize(list, list.map((b) => mean(b, (k) => layoutOn(k).zones[i].totalMinutes)), (v) => formatDuration(Math.max(0, v))),
    free: summarize(list, list.map((b) => mean(b, (k) => layoutOn(k).zones[i].freeMinutes)), (v) => formatDuration(Math.max(0, v))),
  }));

  return { bucket: kind, count: list.length, single: list.length < 2, fromKey: from, toKey, prayers, zones };
}

module.exports = { computePrayerTrends, niceAxis, bucketsFor };
