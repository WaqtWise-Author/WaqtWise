'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PlannerService } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { snoozeUntil, isValidSnoozeOption } = require('../src/core/snooze');
const { at, constantProvider } = require('./helpers');

const DAY = '2026-10-04';

function make(time = '10:00') {
  let n = 0;
  const clock = { now: at(DAY, time) };
  const service = new PlannerService({ store: new MemoryStore(), now: () => clock.now, newId: () => `id${++n}`, providerFactory: () => constantProvider });
  return { service, clock };
}

const form = (extra = {}) => ({
  title: 'X', start: { mode: 'fixed', time: '08:00' }, durationMinutes: 30, date: DAY, recurrence: null,
  reminders: { enabled: false, offsets: [], fullScreen: false }, priority: 'Medium', categoryId: null, notes: '', ...extra,
});

test('Undo: a deleted task comes back, and only until something else changes', () => {
  const { service } = make();
  const { taskId } = service.saveTask({ mode: 'create', form: form() });
  const res = service.deleteTask({ taskId, dateKey: DAY, scope: 'all' });
  assert.ok(res.undoId);
  assert.equal(service.getTasks().length, 0);
  service.undoDelete({ id: res.undoId });
  assert.equal(service.getTasks().length, 1);
  assert.throws(() => service.undoDelete({ id: res.undoId }), 'a second undo of the same delete is refused');

  const again = service.deleteTask({ taskId, dateKey: DAY, scope: 'all' });
  service.saveTask({ mode: 'create', form: form({ title: 'Other' }) });
  assert.throws(() => service.undoDelete({ id: again.undoId }), 'another change makes the undo unsafe');
  assert.equal(service.getTasks().length, 1);
});

test('Undo: free tasks and routines too', () => {
  const { service } = make();
  const a = service.saveFreeTask({ form: { title: 'Read' } }).id;
  const r = service.deleteFreeTask({ id: a });
  service.undoDelete({ id: r.undoId });
  assert.equal(service.getFreeTasks().length, 1);
});

test('Snooze lengths: minutes, the next prayer, and the fallback', () => {
  const now = at(DAY, '10:00').getTime();
  const provider = (key) => constantProvider(key);
  assert.equal(snoozeUntil(now, 7, undefined, provider), now + 7 * 60000);
  assert.equal(snoozeUntil(now, 7, 30, provider), now + 30 * 60000);
  assert.equal(snoozeUntil(now, 7, 60, provider), now + 60 * 60000);
  const dhuhr = constantProvider(DAY).dhuhr.getTime();
  assert.equal(snoozeUntil(now, 7, 'prayer', provider), dhuhr + 20 * 60000);
  assert.equal(snoozeUntil(now, 7, 'prayer', null), now + 7 * 60000, 'no prayer times: the usual length');
  assert.equal(isValidSnoozeOption(15), true);
  assert.equal(isValidSnoozeOption('prayer'), true);
  assert.equal(isValidSnoozeOption(12), false);
  assert.equal(isValidSnoozeOption('x'), false);
});

test('Free-time hint: shown only when nothing is running and the gap is long enough', () => {
  const { service, clock } = make('10:00');
  const key = service.bootstrap().currentPlanningDayKey;
  const hint = () => service.getDay(key).freeHint;
  assert.match(hint(), /free before/);
  service.saveTask({ mode: 'create', form: form({ title: 'Call', start: { mode: 'fixed', time: '10:05' } }) });
  assert.equal(hint(), '', 'only 5 minutes before the next task');
  service.saveTask({ mode: 'create', form: form({ title: 'Walk', start: { mode: 'fixed', time: '09:30' }, durationMinutes: 60 }) });
  assert.equal(hint(), '', 'a task is running now');
  clock.now = at(DAY, '10:50');
  assert.equal(service.getDay(key).freeHint === '' || /free before/.test(service.getDay(key).freeHint), true);
});
