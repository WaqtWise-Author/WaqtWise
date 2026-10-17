'use strict';

// Speed-ups from the review of 15 Oct 2026 must give exactly the same answers as the plain way of working them out.

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateDates, normalizeRule, validateRule, addDaysToKey, keyToDayNumber, dayNumberToKey } = require('../src/core');
const { findOverlappingIds } = require('../src/core/layout');

let seed = 12345;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

function randomRule() {
  const startDate = addDaysToKey('2025-01-01', rnd(500));
  const frequency = ['daily', 'weekly', 'monthly', 'yearly'][rnd(4)];
  const rule = { startDate, frequency, interval: 1 + rnd(3) };
  if (frequency === 'weekly') rule.weekdays = Array.from(new Set([rnd(7), rnd(7), rnd(7)]));
  if (frequency === 'monthly') rule.monthly = [{ type: 'dayOfMonth', days: [1 + rnd(28), 1 + rnd(28)] }, { type: 'lastDay' }, { type: 'nthWeekday', weekday: rnd(7), positions: [1 + rnd(4)] }, { type: 'lastWorkingDay' }][rnd(4)];
  if (frequency === 'yearly') rule.yearly = { month: 1 + rnd(12), type: 'dayOfMonth', day: 1 + rnd(28) };
  return rule;
}

test('A rule that ends after N times gives the first N dates of the same rule without an end, for any range', () => {
  for (let i = 0; i < 300; i++) {
    const base = randomRule();
    const count = 1 + rnd(60);
    const counted = { ...base, end: { type: 'count', count } };
    const all = generateDates({ ...base, end: { type: 'never' } }, base.startDate, addDaysToKey(base.startDate, 365 * 40)).slice(0, count);
    assert.deepEqual(generateDates(counted, base.startDate, addDaysToKey(base.startDate, 365 * 40)), all, JSON.stringify(counted));
    const from = addDaysToKey(base.startDate, rnd(900) - 100);
    const to = addDaysToKey(from, rnd(400));
    assert.deepEqual(generateDates(counted, from, to), all.filter((k) => k >= from && k <= to), `${JSON.stringify(counted)} ${from}..${to}`);
    assert.deepEqual(generateDates(counted, from, to), all.filter((k) => k >= from && k <= to), 'the second call (remembered) gives the same');
  }
});

test('A changed rule is not answered from memory', () => {
  const rule = { startDate: '2026-01-01', frequency: 'daily', interval: 1, end: { type: 'count', count: 3 } };
  assert.equal(generateDates(rule, '2026-01-01', '2026-12-31').length, 3);
  rule.end.count = 10;
  assert.equal(generateDates(rule, '2026-01-01', '2026-12-31').length, 10);
  assert.equal(generateDates(rule, '2026-01-01', '2026-12-31', { workingDays: [1] }).length, 10);
});

test('Rule checking and copying still work like before', () => {
  const rule = { startDate: '2026-02-30', frequency: 'daily', interval: 0 };
  assert.ok(validateRule(rule).length >= 2);
  const copy = normalizeRule({ startDate: '2026-01-05', frequency: 'weekly', weekdays: [1, 3] });
  assert.deepEqual(copy.weekdays, [1, 3]);
  const original = { startDate: '2026-01-05', frequency: 'weekly' };
  const normalized = normalizeRule(original);
  assert.equal(original.weekdays, undefined, 'the original rule is not changed');
  assert.deepEqual(normalized.weekdays, [1]);
  assert.throws(() => generateDates(null, '2026-01-01', '2026-01-02'));
});

test('Overlapping occurrences: the one-pass way finds the same ones as comparing every pair', () => {
  const T = (m) => new Date(Date.UTC(2026, 9, 10, 0, m));
  for (let i = 0; i < 200; i++) {
    const list = Array.from({ length: 1 + rnd(25) }, (_, n) => { const s = rnd(600); return { id: `o${n}`, start: T(s), end: T(s + 1 + rnd(120)) }; });
    const expected = new Set();
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (list[a].start < list[b].end && list[b].start < list[a].end) { expected.add(list[a].id); expected.add(list[b].id); }
    }
    assert.deepEqual([...findOverlappingIds(list)].sort(), [...expected].sort());
  }
});

test('Date conversions remembered in memory keep giving the same answers', () => {
  for (let i = 0; i < 2000; i++) {
    const n = 18000 + rnd(4000);
    const key = dayNumberToKey(n);
    assert.equal(keyToDayNumber(key), n);
    assert.equal(dayNumberToKey(n), key);
  }
  assert.throws(() => keyToDayNumber('2026-13-99x'));
  assert.throws(() => keyToDayNumber('2026-13-99x'), 'a bad key is not remembered as good');
});

// ---- the reminder bookkeeping is saved on its own ----
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileStore } = require('../src/main/store');
const { PlannerService } = require('../src/main/service');
const { emptyData } = require('../src/core');
const { at, constantProvider } = require('./helpers');

test('The once-a-minute reminder bookkeeping is written to a small file, not to the whole data file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-state-'));
  const file = path.join(dir, 'data.json');
  const store = new FileStore(file, { sleep: () => {} });
  const service = new PlannerService({ store, now: () => at('2026-10-04', '10:00'), providerFactory: () => constantProvider });
  service.saveSettings({ notificationsEnabled: true }); // a full save
  const before = fs.statSync(file).mtimeMs;
  const dataText = fs.readFileSync(file, 'utf8');
  const state = { ...service.getReminderState(), lastTickAt: 1234567890 };
  service.saveReminderState(state);
  assert.equal(fs.readFileSync(file, 'utf8'), dataText, 'data.json is not rewritten');
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.ok(fs.statSync(path.join(dir, 'state.json')).size < 2000, 'the state file is small');
  // a new start reads the newest bookkeeping
  const again = new FileStore(file, { sleep: () => {} }).load();
  assert.equal(again.reminderState.lastTickAt, 1234567890);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).lastTickAt, 1234567890);
});

test('A damaged state file is ignored, and a full save writes it again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-state2-'));
  const file = path.join(dir, 'data.json');
  const store = new FileStore(file, { sleep: () => {} });
  const data = emptyData();
  data.reminderState = { ...data.reminderState, lastTickAt: 777 };
  store.save(data);
  fs.writeFileSync(path.join(dir, 'state.json'), '{ not json');
  assert.equal(new FileStore(file, { sleep: () => {} }).load().reminderState.lastTickAt, 777, 'falls back to the copy in data.json');
  store.save(data);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).lastTickAt, 777);
});
