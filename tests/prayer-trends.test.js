'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computePrayerTrends, niceAxis, bucketsFor, computeDayLayout } = require('../src/core');
const { PlannerService } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { constantProvider, provider, at } = require('./helpers');

const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const trends = (from, to) => computePrayerTrends({
  provider, fromKey: from, toKey: to, minutesOfDay, layoutFor: (key) => computeDayLayout(provider, key, []),
});

test('Trends: a week has a point for each day, with the earliest, the latest and the change', () => {
  const r = trends('2026-10-04', '2026-10-06');
  assert.equal(r.bucket, 'day');
  assert.equal(r.count, 3);
  const fajr = r.prayers.find((p) => p.id === 'fajr');
  assert.deepEqual(fajr.points.map((p) => p.value), [5 * 60 + 5, 5 * 60 + 6, 5 * 60 + 7]);
  assert.equal(fajr.lowest.valueLabel, fajr.points[0].valueLabel);
  assert.equal(fajr.change, 2);
  assert.ok(fajr.axis.low < fajr.points[0].value && fajr.axis.high > fajr.points[2].value, 'the axis covers every value');
  const zone1 = r.zones[0];
  assert.equal(zone1.total.points[0].value, (11 * 60 + 48) - (5 * 60 + 5));
  assert.ok(zone1.total.change < 0, 'Fajr starts later and Dhuhr earlier, so the zone shrinks');
  assert.equal(zone1.free.points[0].value, zone1.total.points[0].value, 'no tasks: all of it is free');
});

test('Trends: one day is flagged as single; long ranges are averaged by week or month', () => {
  assert.equal(trends('2026-10-04', '2026-10-04').single, true);
  assert.equal(bucketsFor('2026-09-26', '2026-10-25').kind, 'day');
  const longer = bucketsFor('2026-01-01', '2026-06-30');
  assert.equal(longer.kind, 'week');
  assert.equal(longer.list[0].keys.length, 7);
  assert.equal(bucketsFor('2025-01-01', '2026-10-25').kind, 'month');
});

test('Trends: the axis uses round figures', () => {
  const a = niceAxis(305, 311);
  assert.ok(a.ticks.length >= 3 && a.ticks.length <= 8, JSON.stringify(a));
  assert.ok(a.low <= 305 && a.high >= 311);
  assert.ok(a.ticks.every((v) => v % 1 === 0));
  const flat = niceAxis(300, 300);
  assert.ok(flat.low < 300 && flat.high > 300);
});

test('Trends: the service gives them with the statistics, and free time follows the tasks', () => {
  let n = 0;
  const service = new PlannerService({ store: new MemoryStore(), now: () => at('2026-10-06', '12:00'), newId: () => `id${++n}`, providerFactory: () => constantProvider });
  service.saveTask({ mode: 'create', form: { title: 'Study', start: { mode: 'fixed', time: '08:00' }, durationMinutes: 60, date: '2026-10-05', recurrence: null, reminders: { enabled: false, offsets: [], fullScreen: false }, priority: 'Medium', categoryId: null, notes: '' } });
  const stats = service.getStats({ range: 'custom', fromKey: '2026-10-04', toKey: '2026-10-06' });
  const z = stats.prayerTrends.zones[0];
  assert.equal(z.free.points[1].value, z.total.points[1].value - 60, 'an hour of tasks on Oct 5 is not free');
  assert.equal(z.free.points[0].value, z.total.points[0].value);
  assert.ok(service.getSettings().statsCharts.includes('prayertimes'));
  assert.ok(service.getSettings().statsCharts.includes('zonelength'));
  assert.equal(service.getStats({ range: 'day' }).prayerTrends.single, true);
});

test('Trends: a year of data is quick', () => {
  let n = 0;
  const everyDay = (key) => ({ fajr: at(key, '05:05'), dhuhr: at(key, '11:48'), asr: at(key, '15:14'), maghrib: at(key, '18:00'), isha: at(key, '19:20') });
  const service = new PlannerService({ store: new MemoryStore(), now: () => at('2026-12-31', '12:00'), newId: () => `id${++n}`, providerFactory: () => everyDay });
  for (let i = 0; i < 5; i++) service.saveTask({ mode: 'create', form: { title: `Daily ${i}`, start: { mode: 'fixed', time: `${String(6 + i).padStart(2, '0')}:00` }, durationMinutes: 30, date: '2026-01-01', recurrence: { startDate: '2026-01-01', frequency: 'daily', interval: 1, end: { type: 'never' } }, reminders: { enabled: false, offsets: [], fullScreen: false }, priority: 'Medium', categoryId: null, notes: '' } });
  const started = Date.now();
  const stats = service.getStats({ range: 'year', anchorKey: '2026-12-31' });
  assert.equal(stats.prayerTrends.bucket, 'week');
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});
