'use strict';

// Problems found in the code review of 15 Oct 2026 (batch 1): each one has a test here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { createTask, normalizeData, emptyData, occurrencesForPlanningDay, } = require('../src/core');
const { MAX_TITLE_LENGTH, MAX_NOTES_LENGTH } = require('../src/core/limits');
const { PlannerService } = require('../src/main/service');
const { MemoryStore, FileStore } = require('../src/main/store');
const { at, constantProvider } = require('./helpers');

const DAY = '2026-10-04';
const fixed = (time) => ({ mode: 'fixed', time });
function makeService(now = at(DAY, '10:00')) {
  let n = 0;
  return new PlannerService({ store: new MemoryStore(), now: () => now, newId: () => `id${++n}`, providerFactory: () => constantProvider });
}
const form = (extra = {}) => ({ title: 'Task', start: fixed('08:00'), durationMinutes: 30, date: DAY, recurrence: null, notes: '', priority: 'Medium', categoryId: null, reminders: { enabled: false, offsets: [] }, ...extra });

// 1. A city many hours ahead of the computer still has a valid Planning Day at every moment.
test('Planning Day: a city far ahead of or behind the computer never fails to find its zone', () => {
  const script = `
    const z = require(${JSON.stringify(path.join(__dirname, '../src/core/zones.js'))});
    function mk(off) { return (key) => { const [y, m, d] = key.split('-').map(Number);
      const at = (h, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi) - off * 3600e3);
      return { fajr: at(5), dhuhr: at(12), asr: at(15, 30), maghrib: at(18), isha: at(19, 30) }; }; }
    const bad = [];
    for (const off of [-12, -8, 0, 3, 8, 9, 12, 14]) {
      const p = mk(off);
      for (let i = 0; i < 1440; i++) {
        const t = new Date(Date.UTC(2026, 9, 10) + i * 60000);
        try {
          const r = z.deriveZone(p, t);
          // the answer must be the Planning Day whose Fajr is the latest one not after the moment
          const f = p(r.planningDayKey).fajr.getTime();
          const nf = p(z.addDaysToKey ? z.addDaysToKey(r.planningDayKey, 1) : r.planningDayKey).fajr.getTime();
          if (!(f <= t.getTime() && (!z.addDaysToKey || t.getTime() < nf))) bad.push(off + ' wrong day');
        } catch (e) { bad.push(off + ' ' + e.message); }
      }
    }
    console.log(JSON.stringify(bad.slice(0, 3)));`;
  for (const tz of ['Africa/Cairo', 'Pacific/Auckland', 'America/Los_Angeles']) {
    const out = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz } }).toString().trim();
    assert.equal(out, '[]', `computer in ${tz}: ${out}`);
  }
});

// 5. A task title is limited to 200 characters.
test('Task title: at most 200 characters when saving, copying and reading a file', () => {
  const service = makeService();
  assert.equal(MAX_TITLE_LENGTH, 200);
  assert.throws(() => service.saveTask({ mode: 'create', form: form({ title: 'x'.repeat(201) }) }), /too long|طويل/);
  const { taskId } = service.saveTask({ mode: 'create', form: form({ title: 'y'.repeat(200) }) });
  assert.throws(() => service.saveTask({ mode: 'edit', taskId, dateKey: DAY, scope: 'all', form: form({ title: 'z'.repeat(250) }) }), /too long|طويل/);
  const copied = service.duplicateTask({ taskId });
  const copy = service.data.tasks.find((t) => t.id === copied.taskId);
  assert.ok(copy.title.length <= 200, 'the copy still fits');
  assert.ok(/copy/.test(copy.title) || copy.title.length === 200);
  // notes are cut, not refused
  const long = service.saveTask({ mode: 'create', form: form({ notes: 'n'.repeat(MAX_NOTES_LENGTH + 50) }) });
  assert.equal(service.data.tasks.find((t) => t.id === long.taskId).notes.length, MAX_NOTES_LENGTH);
  // a file with a very long title keeps the task (shortened) instead of dropping it
  const raw = { ...emptyData(), tasks: [{ ...createTask({ id: 'a', title: 'ok', start: fixed('09:00'), durationMinutes: 30, date: DAY }), title: 'L'.repeat(900) }] };
  const { data } = normalizeData(JSON.parse(JSON.stringify(raw)));
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].title.length, 200);
});

// 9. A long task that began days ago is still listed while it runs.
test('A task that lasts several days appears on the later days and is not lost after two days', () => {
  const long = createTask({ id: 'long', title: 'Trip', start: fixed('09:00'), durationMinutes: 6 * 24 * 60, date: '2026-10-01', recurrence: null });
  const list = (key) => occurrencesForPlanningDay(constantProvider, [long], key).map((o) => o.taskId);
  assert.deepEqual(list('2026-10-06'), ['long'], 'day 5 of the trip');
  assert.deepEqual(list('2026-10-07'), ['long'], 'day 6 of the trip');
  assert.deepEqual(list('2026-10-09'), [], 'after it ended');
});

// 11. Deleting a category also clears it from the free list.
test('Deleting a category clears it from free tasks too', () => {
  const service = makeService();
  const cat = service.getBootstrapCategoryId ? null : service.data.categories[0].id;
  service.saveFreeTask({ form: { title: 'Free one', categoryId: cat } });
  assert.equal(service.data.freeTasks[0].categoryId, cat);
  service.deleteCategory({ id: cat });
  assert.equal(service.data.freeTasks[0].categoryId, null);
});

// 12. A copy dated in a day that is over, and "Mark as Done" from an alert, count in the saved statistics.
test('Copying a past task and marking it done from an alert update the saved statistics', () => {
  const service = makeService(at('2026-10-10', '12:00'));
  const created = service.saveTask({ mode: 'create', form: form({ date: '2026-10-08', title: 'Past' }) });
  service.getStats({ range: 'day' }); // makes the history exist
  const copied = service.duplicateTask({ taskId: created.taskId });
  const rows = Object.values(service.data.statsHistory.days).flat();
  assert.ok(rows.some((r) => r[0] === copied.taskId), 'the copy is in the history');
  const task = service.data.tasks.find((t) => t.id === created.taskId);
  const { setCompletion } = require('../src/core');
  service.updateTaskFromEngine(setCompletion(task, '2026-10-08', true, at('2026-10-10', '12:00')), '2026-10-08');
  const row = Object.values(service.data.statsHistory.days).flat().find((r) => r[0] === created.taskId && r[1] === '2026-10-08');
  assert.ok(row && row[5] === 1, 'the history row is marked done');
});

// 4. A busy data file is not a damaged file.
test('A data file that stays busy is reported, not set aside, and the older backup is not loaded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-busy-'));
  const file = path.join(dir, 'data.json');
  const store = new FileStore(file, { sleep: () => {} });
  store.save({ ...emptyData(), tasks: [createTask({ id: 'a', title: 'Newest', start: fixed('09:00'), durationMinutes: 30, date: DAY })] });
  store.save({ ...emptyData(), tasks: [createTask({ id: 'a', title: 'Newest', start: fixed('09:00'), durationMinutes: 30, date: DAY })] });
  const real = fs.readFileSync;
  fs.readFileSync = (f, ...rest) => { if (String(f) === file) throw Object.assign(new Error('EBUSY: busy'), { code: 'EBUSY' }); return real(f, ...rest); };
  try {
    assert.throws(() => store.load(), /cannot be opened|لا يمكن فتح/);
  } finally {
    fs.readFileSync = real;
  }
  assert.ok(fs.existsSync(file), 'the file was not renamed');
  assert.equal(fs.readdirSync(dir).filter((x) => x.includes('damaged')).length, 0);
  // a short blip is simply retried
  let calls = 0;
  fs.readFileSync = (f, ...rest) => { if (String(f) === file && ++calls <= 2) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return real(f, ...rest); };
  try {
    assert.equal(store.load().tasks[0].title, 'Newest');
  } finally {
    fs.readFileSync = real;
  }
});

// ---- batch 2: security and data safety ----
const { checkRequest, PUBLIC_METHODS } = require('../src/main/service');
const { validateSettings } = require('../src/core/settings');

test('Requests from the window: ids must be text, dates must be real dates, methods must be public', () => {
  assert.doesNotThrow(() => checkRequest('setDone', [{ taskId: 'a', dateKey: '2026-10-04', done: true }]));
  assert.throws(() => checkRequest('setDone', [{ taskId: { x: 1 }, dateKey: '2026-10-04' }]));
  assert.throws(() => checkRequest('getTaskDetails', [{ taskId: 'a', dateKey: 'constructor' }]));
  assert.throws(() => checkRequest('deleteTask', [{ taskId: 5, dateKey: '2026-10-04' }]));
  assert.throws(() => checkRequest('importData', []));
  assert.throws(() => checkRequest('getDay', 'x'));
  assert.ok(PUBLIC_METHODS.length > 10);
});

test('Settings: unknown keys are refused', () => {
  assert.ok(validateSettings({ evil: 1 }).length > 0);
  assert.deepEqual(validateSettings({ startWithWindows: true }), []);
  const service = makeService();
  assert.throws(() => service.saveSettings({ notASetting: true }));
  assert.equal('notASetting' in service.getSettings(), false);
});

test('Importing a backup does not change "start with Windows" and caps the dates of one task', () => {
  const service = makeService();
  service.saveSettings({ startWithWindows: false });
  const file = JSON.parse(JSON.stringify(service.exportData())); // as it would be read from a file
  file.settings.startWithWindows = true;
  const many = Array.from({ length: 6000 }, (_, i) => new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10));
  file.tasks = [{ ...createTask({ id: 'm', title: 'Many', start: fixed('09:00'), durationMinutes: 30, date: DAY }), exceptions: many, additions: many }];
  service.importData(JSON.stringify(file));
  assert.equal(service.getSettings().startWithWindows, false);
  assert.equal(service.data.tasks[0].exceptions.length, 3660);
  assert.equal(service.data.tasks[0].additions.length, 3660);
});

test('Prayer times: adjustments that put the prayers out of order are refused and nothing changes', () => {
  const service = makeService();
  const orderProvider = (settings) => (key) => {
    const a = settings.adjustments;
    const d = constantProvider(key);
    const shift = (date, m) => new Date(date.getTime() + m * 60000);
    return { fajr: shift(d.fajr, a.fajr), dhuhr: shift(d.dhuhr, a.dhuhr), asr: shift(d.asr, a.asr), maghrib: shift(d.maghrib, a.maghrib), isha: shift(d.isha, a.isha) };
  };
  service.providerFactory = orderProvider;
  service.saveSettings({ adjustments: { dhuhr: 10 } });
  assert.equal(service.getSettings().adjustments.dhuhr, 10);
  assert.throws(() => service.saveSettings({ adjustments: { dhuhr: 120, asr: -120 } }), /out of order|ترتيب/);
  assert.equal(service.getSettings().adjustments.dhuhr, 10, 'the refused change was not kept');
  assert.equal(service.getSettings().adjustments.asr, 0);
});

test('A data file made by a newer version is refused, not opened and overwritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-newer-'));
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify({ ...emptyData(), version: 99 }));
  const store = new FileStore(file, { sleep: () => {} });
  assert.throws(() => store.load(), /newer version|إصدار أحدث/);
  assert.ok(fs.existsSync(file));
  assert.equal(fs.readdirSync(dir).filter((x) => x.includes('damaged')).length, 0);
});

test('When saving fails, the window is still told that the data changed', () => {
  let changed = 0;
  const store = new MemoryStore();
  const service = new PlannerService({ store, now: () => at(DAY, '10:00'), providerFactory: () => constantProvider, onDataChanged: () => { changed += 1; } });
  store.save = () => { throw Object.assign(new Error('x'), { code: 'EACCES' }); };
  assert.throws(() => service.saveTask({ mode: 'create', form: form() }));
  assert.ok(changed >= 1);
  assert.equal(service.getSaveStatus().ok, false);
});
