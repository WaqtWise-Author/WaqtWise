'use strict';

// One list of missed reminders (1.7.1): what is waiting, oldest first, for one notification with the total.

const test = require('node:test');
const assert = require('node:assert/strict');

const { PlannerService } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { at, constantProvider } = require('./helpers');
const { formatMissedNotification } = require('../src/core/reminders');

const DAY = '2026-10-04';
function makeService() {
  let n = 0;
  return new PlannerService({
    store: new MemoryStore(), now: () => at(DAY, '10:00'), newId: () => `id${++n}`, providerFactory: () => constantProvider,
    onDataChanged: () => {}, onSettingsChanged: () => {},
  });
}
const form = (title) => ({ title, start: { mode: 'fixed', time: '08:00' }, durationMinutes: 30, date: DAY, recurrence: null, priority: 'Medium', categoryId: null, notes: '', reminders: { enabled: false, offsets: [], fullScreen: false } });

test('missedSummary: everything waiting, oldest first; reminders seen again are not added twice; deleted tasks drop out', () => {
  const s = makeService();
  const ids = ['A', 'B', 'C'].map((title) => { s.saveTask({ mode: 'create', scope: 'all', form: form(title) }); return s.data.tasks.find((x) => x.title === title).id; });
  const item = (i, hour) => ({ taskId: ids[i], dateKey: DAY, title: 'ABC'[i], start: at(DAY, hour), zoneName: 'Fajr → Dhuhr', alreadyStarted: true });
  s.addMissed([item(1, '09:00')]);
  s.addMissed([item(0, '08:00'), item(1, '09:00'), item(2, '09:30')]); // a later start: the old one comes again with new ones
  assert.deepEqual(s.missedSummary().map((m) => m.title), ['A', 'B', 'C']);
  assert.equal(s.getMissed().length, 3);
  s.deleteTask({ taskId: ids[2], scope: 'all' });
  assert.deepEqual(s.missedSummary().map((m) => m.title), ['A', 'B']);
  // the notification is made from the whole list
  const payload = formatMissedNotification(s.missedSummary(), { soundEnabled: true });
  assert.ok(payload.toastXml ? payload.toastXml.includes('A') && payload.toastXml.includes('B') : JSON.stringify(payload).includes('B'));
});
