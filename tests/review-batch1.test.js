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
