'use strict';

const { minutesBetween, formatDuration } = require('./time');
const { getBoundaries, getZones } = require('./zones');

// An "occurrence" passed in here looks like:
//   { id, title, start: Date, end: Date }
// Pass every occurrence that touches the Planning Day, including ones that
// started in the previous Planning Day and run past this day's Fajr.

// Merge overlapping or touching intervals so overlapped time is counted once.
function mergeIntervals(intervals) {
  const sorted = intervals
    .map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged.map((m) => ({ start: new Date(m.start), end: new Date(m.end) }));
}

function sumMinutes(intervals) {
  return intervals.reduce((sum, i) => sum + minutesBetween(i.start, i.end), 0);
}

// Cut an interval to a window. Returns null when nothing is left.
function clipInterval(interval, windowStart, windowEnd) {
  const start = Math.max(interval.start.getTime(), windowStart.getTime());
  const end = Math.min(interval.end.getTime(), windowEnd.getTime());
  if (end <= start) return null;
  return { start: new Date(start), end: new Date(end) };
}

// Ids of occurrences that overlap at least one other occurrence.
// One pass over the occurrences sorted by start: everything still running when the next one starts overlaps it, and
// all of those overlap each other (they all contain that start moment).
function findOverlappingIds(occurrences) {
  const ids = new Set();
  const items = occurrences.map((o) => ({ id: o.id, start: o.start.getTime(), end: o.end.getTime() })).sort((a, b) => a.start - b.start);
  let active = [];
  for (const item of items) {
    active = active.filter((a) => a.end > item.start);
    if (active.length > 0) {
      ids.add(item.id);
      for (const a of active) ids.add(a.id);
    }
    active.push(item);
  }
  return ids;
}

// Build the 5 zone sections for one Planning Day, with the three duration figures.
function computeDayLayout(provider, planningDayKey, occurrences) {
  const boundaries = getBoundaries(provider, planningDayKey);
  const zones = getZones(boundaries);
  const overlapping = findOverlappingIds(occurrences);

  const sections = zones.map((zone) => {
    // Listed under the zone where it STARTS (only there).
    const listed = occurrences
      .filter((o) => o.start >= zone.start && o.start < zone.end)
      .sort((a, b) => a.start - b.start)
      .map((o) => {
        const part = clipInterval(o, zone.start, zone.end);
        return {
          ...o,
          overlaps: overlapping.has(o.id),
          extendsPastZoneEnd: o.end > zone.end,
          minutesInZone: part ? minutesBetween(part.start, part.end) : 0,
        };
      });

    // Started in an earlier zone but still running when this zone begins.
    const continued = occurrences
      .filter((o) => o.start < zone.start && o.end > zone.start)
      .sort((a, b) => a.start - b.start)
      .map((o) => {
        const part = clipInterval(o, zone.start, zone.end);
        return {
          ...o,
          overlaps: overlapping.has(o.id),
          minutesInZone: part ? minutesBetween(part.start, part.end) : 0,
        };
      });

    // Scheduled = merged, zone-clipped time of every occurrence touching the zone.
    const clipped = occurrences
      .map((o) => clipInterval(o, zone.start, zone.end))
      .filter(Boolean);
    const scheduledMinutes = sumMinutes(mergeIntervals(clipped));
    const freeMinutes = Math.max(0, zone.totalMinutes - scheduledMinutes);

    return {
      index: zone.index,
      name: zone.name,
      start: zone.start,
      end: zone.end,
      totalMinutes: zone.totalMinutes,
      scheduledMinutes,
      freeMinutes,
      totalLabel: formatDuration(zone.totalMinutes),
      scheduledLabel: formatDuration(scheduledMinutes),
      freeLabel: formatDuration(freeMinutes),
      tasks: listed,
      continued,
    };
  });

  return { planningDayKey, boundaries, zones: sections };
}

module.exports = {
  mergeIntervals,
  sumMinutes,
  clipInterval,
  findOverlappingIds,
  computeDayLayout,
};
