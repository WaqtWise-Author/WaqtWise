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

test('the next task: the nearest one that has not started, with the day when it is not today', () => {
  const s = service(); // 10:00 on a Sunday
  assert.equal(s.getNextTask(), null);
  add(s, 'Past', DAY, '09:00');
  add(s, 'Tomorrow task', '2026-10-05', '08:15');
  assert.deepEqual(s.getNextTask(), { title: 'Tomorrow task', when: 'Tomorrow 8:15 AM' });
  const { taskId } = add(s, 'Later today', DAY, '16:30');
  add(s, 'Evening', DAY, '19:00');
  assert.deepEqual(s.getNextTask(), { title: 'Later today', when: '4:30 PM' });
  s.data.tasks = s.data.tasks.map((x) => (x.id === taskId ? setCompletion(x, DAY, true) : x));
  assert.deepEqual(s.getNextTask(), { title: 'Evening', when: '7:00 PM' }, 'a task that is done is skipped');
});

test('the end of the Planning Day is the next Fajr', () => {
  const s = service(at(DAY, '10:00'));
  assert.equal(s.nextFajrMs(), at('2026-10-05', '05:05').getTime());
  const night = service(at(DAY, '02:00'));
  assert.equal(night.nextFajrMs(), at(DAY, '05:05').getTime(), 'after midnight it is the Fajr of the same day');
});
