'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TASK_INFO, TASK_INFO_IDS, DEFAULT_TASK_INFO, DEFAULT_SETTINGS, mergeSettings, sanitizeSettings, describeStart, validateTaskInfo } = require('../src/core');
const { PlannerService } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { at, constantProvider } = require('./helpers');

test('Task details: every detail has a name and an explanation, and the defaults are today\'s look', () => {
  assert.equal(new Set(TASK_INFO_IDS).size, TASK_INFO.length);
  for (const x of TASK_INFO) assert.ok(x.title && x.about && typeof x.on === 'boolean', x.id);
  assert.deepEqual(DEFAULT_SETTINGS.taskInfo, DEFAULT_TASK_INFO);
  for (const id of ['time', 'duration', 'priority', 'category', 'status', 'conflicts', 'continues', 'backupStart']) assert.equal(DEFAULT_TASK_INFO[id], true, id);
  for (const id of ['endTime', 'repeat', 'startRule', 'reminders', 'fullScreen', 'notes']) assert.equal(DEFAULT_TASK_INFO[id], false, id);
  assert.notEqual(DEFAULT_SETTINGS.taskInfo, DEFAULT_TASK_INFO, 'the default is a copy');
});

test('Task details: one switch can change without touching the others, and bad values are refused', () => {
  const next = mergeSettings(DEFAULT_SETTINGS, { taskInfo: { repeat: true } });
  assert.equal(next.taskInfo.repeat, true);
  assert.equal(next.taskInfo.time, true);
  assert.equal(DEFAULT_SETTINGS.taskInfo.repeat, false, 'the default object is not changed');
  for (const bad of [{ bogus: true }, { repeat: 'yes' }, 'all', null, [true]]) {
    assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { taskInfo: bad }), /Choose which details/);
  }
  assert.equal(validateTaskInfo({ notes: false }).length, 0);
});

test('Task details: saved or imported settings are cleaned, missing switches get the default', () => {
  assert.deepEqual(sanitizeSettings({ taskInfo: { notes: true, bogus: 1 } }).taskInfo, DEFAULT_TASK_INFO, 'a damaged object falls back to the defaults');
  const keep = sanitizeSettings({ taskInfo: { notes: true } }).taskInfo;
  assert.equal(keep.notes, true);
  assert.equal(keep.time, true, 'a switch that was not saved takes its default');
  assert.deepEqual(sanitizeSettings({ taskInfo: 5 }).taskInfo, DEFAULT_TASK_INFO);
  assert.deepEqual(sanitizeSettings({}).taskInfo, DEFAULT_TASK_INFO);
});

test('Task details: what the start follows is described in words', () => {
  assert.equal(describeStart({ mode: 'fixed', time: '09:00' }), '');
  assert.equal(describeStart({ mode: 'prayer', prayer: 'asr', direction: 'after', minutes: 10 }), 'Starts 10m after Asr');
  assert.equal(describeStart({ mode: 'prayer', prayer: 'fajr', direction: 'before', minutes: 90 }), 'Starts 1h 30m before Fajr');
  assert.equal(describeStart({ mode: 'prayer', prayer: 'maghrib', direction: 'after', minutes: 0 }), 'Starts at Maghrib');
  assert.equal(describeStart({ mode: 'task', point: 'end', direction: 'after', minutes: 15 }, 'Gym'), 'Starts 15m after “Gym” ends');
  assert.equal(describeStart({ mode: 'task', point: 'start', direction: 'before', minutes: 5 }, 'Gym'), 'Starts 5m before “Gym” starts');
  assert.equal(describeStart({ mode: 'task', point: 'end', direction: 'after', minutes: 0 }, 'Gym'), 'Starts when “Gym” ends');
  assert.equal(describeStart({ mode: 'task', point: 'end', direction: 'after', minutes: 0 }, null), 'Starts when “a deleted task” ends');
});

test('Task details: the Daily View gives each task row everything a row may show', () => {
  let n = 0;
  const clock = { now: at('2026-10-07', '08:00') };
  const service = new PlannerService({ store: new MemoryStore(), now: () => clock.now, newId: () => `i${++n}`, providerFactory: () => constantProvider });
  service.bootstrap();
  const base = { durationMinutes: 30, priority: 'High', categoryId: null };
  const first = service.saveTask({ mode: 'create', form: { ...base, title: 'Gym', start: { mode: 'fixed', time: '09:00' }, date: '2026-10-07', recurrence: { startDate: '2026-10-07', frequency: 'weekly', interval: 2, weekdays: [3] }, reminders: { enabled: true, offsets: [10, 60], fullScreen: true }, notes: '\n  First line of notes\nsecond line' } });
  service.saveTask({ mode: 'create', form: { ...base, title: 'Shower', start: { mode: 'task', taskId: first.taskId, point: 'end', direction: 'after', minutes: 15, fallbackTime: '10:00' }, date: '2026-10-07', recurrence: null, reminders: { enabled: false, offsets: [] }, notes: '' } });
  const rows = service.getDay('2026-10-07').zones.flatMap((z) => z.tasks);
  const gym = rows.find((r) => r.title === 'Gym');
  const shower = rows.find((r) => r.title === 'Shower');
  assert.match(gym.repeatSummary, /2 weeks/);
  assert.deepEqual(gym.reminderOffsets.slice().sort((a, b) => a - b), [10, 60]);
  assert.equal(gym.hasFullScreen, true);
  assert.equal(gym.notesLine, 'First line of notes');
  assert.equal(gym.startRuleLabel, '');
  assert.equal(shower.repeatSummary, '');
  assert.equal(shower.startRuleLabel, 'Starts 15m after “Gym” ends');
  assert.deepEqual(shower.reminderOffsets, []);
  assert.equal(shower.notesLine, '');
  // the choice is saved with the other settings
  service.saveSettings({ taskInfo: { notes: true } });
  assert.equal(service.getSettings().taskInfo.notes, true);
  assert.equal(service.getSettings().taskInfo.time, true);
});
