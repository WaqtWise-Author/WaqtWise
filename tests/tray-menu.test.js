'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { setCompletion } = require('../src/core');
const { buildTrayMenuTemplate } = require('../src/main/tray');
const { PlannerService } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { at, constantProvider } = require('./helpers');

const DAY = '2026-10-04';
function service(now = at(DAY, '10:00')) {
  let n = 0;
  return new PlannerService({ store: new MemoryStore(), now: () => now, newId: () => `id${++n}`, providerFactory: () => constantProvider });
}
const add = (s, title, date, time) => s.saveTask({ mode: 'create', form: { title, date, start: { mode: 'fixed', time }, durationMinutes: 30, reminders: { enabled: false, offsets: [], fullScreen: false } } });

test('the tray menu template: information lines, submenus and separators', () => {
  const click = () => {};
  assert.deepEqual(buildTrayMenuTemplate([
    { id: 'a', label: 'Info', enabled: false },
    { id: 'b', label: 'Sub', separatorBefore: true, submenu: [{ id: 'c', label: 'One', click }] },
    { id: 'd', label: 'Go', click },
  ]), [
    { label: 'Info', enabled: false },
    { type: 'separator' },
    { label: 'Sub', submenu: [{ label: 'One', click }] },
    { label: 'Go', click },
  ]);
});

test('the next prayer: its name and the time until it (at least 1 minute), Fajr of the next day after Isha', () => {
  assert.deepEqual(service(at(DAY, '10:00')).getNextPrayer(), { name: 'Dhuhr', ms: at(DAY, '11:48').getTime(), inLabel: '1h 48m' });
  assert.equal(service(at(DAY, '21:00')).getNextPrayer().name, 'Fajr');
  assert.equal(service(at(DAY, '21:00')).getNextPrayer().inLabel, '8h 5m');
  assert.equal(service(new Date(at(DAY, '11:47').getTime() + 30000)).getNextPrayer().inLabel, '1m', 'rounded up, never 0m');
});

test('the end of the Planning Day is the next Fajr', () => {
  const s = service(at(DAY, '10:00'));
  assert.equal(s.nextFajrMs(), at('2026-10-05', '05:05').getTime());
  const night = service(at(DAY, '02:00'));
  assert.equal(night.nextFajrMs(), at(DAY, '05:05').getTime(), 'after midnight it is the Fajr of the same day');
});

test('the next prayer is the nearest prayer start after now, tomorrow\'s Fajr after Isha', () => {
  const s = service(at(DAY, '10:00'));
  const ms = s.nextPrayerMs();
  assert.ok(ms > at(DAY, '10:00').getTime() && ms < at('2026-10-05', '05:06').getTime());
  assert.ok(ms <= s.nextFajrMs());
  const late = service(at(DAY, '23:50'));
  assert.equal(late.nextPrayerMs(), late.nextFajrMs(), 'after Isha the next prayer is the next Fajr');
});
