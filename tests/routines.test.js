'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRoutine, routineSlots, clockText, occurrencesOn, occurrencesInWindow, setSlotDone, describeRoutine,
  RoutineEngine, emptyData, normalizeData, buildExport, parseImport,
} = require('../src/core');
const { PlannerService, PUBLIC_METHODS } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { at, atS, constantProvider } = require('./helpers');

const DAY = '2026-10-04'; // a Sunday
const raw = (extra = {}) => ({
  id: 'r1', title: 'Drink water', from: '08:00', to: '20:00', everyMinutes: 150, weekdays: [0, 1, 2, 3, 4, 5, 6],
  alerts: { notification: true, fullScreen: false }, ...extra,
});
const make = (extra) => normalizeRoutine(raw(extra), at(DAY, '07:00')).routine;
const times = (r) => routineSlots(r).map(clockText);

test('a routine repeats from the start time every N minutes while it is inside the window', () => {
  assert.deepEqual(times(make()), ['08:00', '10:30', '13:00', '15:30', '18:00']);
  assert.deepEqual(times(make({ everyMinutes: 60, to: '10:00' })), ['08:00', '09:00', '10:00'], 'the end time itself counts');
  assert.deepEqual(times(make({ everyMinutes: 90 })), ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00']);
  assert.deepEqual(times(make({ from: '22:00', to: '02:00', everyMinutes: 60 })), ['22:00', '23:00', '00:00', '01:00', '02:00'], 'runs past midnight');
});

test('a routine is checked: title, times, step, days', () => {
  const bad = (extra, part) => assert.match(normalizeRoutine(raw(extra)).error, part);
  bad({ title: '  ' }, /title/i);
  bad({ from: '8am' }, /starts/);
  bad({ to: '' }, /ends/);
  bad({ to: '08:00' }, /different/);
  bad({ everyMinutes: 4 }, /at least 5/);
  bad({ everyMinutes: 1441 }, /24 hours/);
  bad({ everyMinutes: 30.5 }, /at least 5/);
  bad({ weekdays: [] }, /at least one day/);
  const ok = normalizeRoutine(raw({ weekdays: [3, 1, 1, 9], title: ' Water ' }));
  assert.deepEqual(ok.routine.weekdays, [1, 3]);
  assert.equal(ok.routine.title, 'Water');
  assert.equal(ok.routine.enabled, true);
  assert.equal(describeRoutine(ok.routine), 'Every 2h 30m, 8:00 AM – 8:00 PM');
});

test('times belong to the chosen weekdays and a paused routine has none', () => {
  const mon = make({ weekdays: [1] });
  assert.equal(occurrencesOn(mon, '2026-10-04').length, 0); // Sunday
  assert.equal(occurrencesOn(mon, '2026-10-05').length, 5); // Monday
  assert.equal(occurrencesOn(make({ enabled: false }), DAY).length, 0);
});

test('a window that runs past midnight belongs to the day it starts on', () => {
  const night = make({ from: '23:00', to: '01:00', everyMinutes: 60 });
  const found = occurrencesInWindow([night], at('2026-10-05', '00:00').getTime() - 1, at('2026-10-05', '06:00').getTime());
  assert.deepEqual(found.map((o) => [o.dateKey, clockText(o.slot)]), [['2026-10-04', '00:00'], ['2026-10-04', '01:00']]);
  assert.equal(found[0].at.getTime(), at('2026-10-05', '00:00').getTime());
});

test('ticking a time as done is remembered per day and only for real times', () => {
  const r = make();
  const done = setSlotDone(r, DAY, 630, true, at(DAY, '12:00'));
  assert.deepEqual(done.completions, { [DAY]: [630] });
  assert.equal(occurrencesOn(done, DAY).filter((o) => o.done).length, 1);
  assert.equal(setSlotDone(done, DAY, 631, true), done, 'not one of the times: unchanged');
  assert.deepEqual(setSlotDone(done, DAY, 630, false, at(DAY, '12:00')).completions, {});
  const old = normalizeRoutine({ ...raw(), completions: { '2026-01-01': [480], [DAY]: [480] } }, at(DAY, '12:00')).routine;
  assert.deepEqual(Object.keys(old.completions), [DAY], 'ticks older than 60 days are forgotten');
});

// ---- the engine -------------------------------------------------------------------------------------------------------

function world(routines, settings = {}) {
  const w = { routines, clock: at(DAY, '07:59'), toasts: [], alerts: [], saves: [], errors: [], done: [], settings: { notificationsEnabled: true, fullScreenAlerts: true, snoozeMinutes: 5, ...settings } };
  w.engine = new RoutineEngine({
    getRoutines: () => w.routines,
    getSettings: () => w.settings,
    notify: (p) => w.toasts.push([w.clock, p]),
    showAlert: (items) => w.alerts.push([w.clock, items]),
    markDone: (id, key, slot) => { w.done.push([id, key, slot]); w.routines = w.routines.map((r) => (r.id === id ? setSlotDone(r, key, slot, true, w.clock) : r)); },
    saveState: (s) => w.saves.push(s),
    onError: (e) => w.errors.push(e),
    now: () => w.clock,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  w.run = (from, to) => { for (let t = from.getTime(); t <= to.getTime(); t += 15000) { w.clock = new Date(t); w.engine.tick(w.clock); } };
  return w;
}

test('the engine rings a notification at each time, once', () => {
  const w = world([make()]);
  w.run(at(DAY, '07:59'), at(DAY, '14:00'));
  assert.equal(w.errors.length, 0);
  assert.deepEqual(w.toasts.map(([, p]) => p.title), ['Drink water', 'Drink water', 'Drink water']); // 8:00, 10:30, 13:00
  assert.equal(w.toasts[0][0].getTime(), at(DAY, '08:00').getTime());
  assert.equal(w.alerts.length, 0);
  assert.match(w.toasts[1][1].lines[0], /10:30 AM/);
  w.run(at(DAY, '14:00'), at(DAY, '14:30'));
  assert.equal(w.toasts.length, 3, 'nothing rings twice');
});

test('each routine chooses: notification, full-screen alert, or both', () => {
  const both = world([make({ alerts: { notification: true, fullScreen: true } })]);
  both.run(at(DAY, '07:59'), at(DAY, '08:05'));
  assert.equal(both.toasts.length, 1);
  assert.equal(both.alerts.length, 1);
  assert.equal(both.alerts[0][1][0].kind, 'routine');

  const full = world([make({ alerts: { notification: false, fullScreen: true } })]);
  full.run(at(DAY, '07:59'), at(DAY, '08:05'));
  assert.equal(full.toasts.length, 0);
  assert.equal(full.alerts.length, 1);

  const off = world([make({ alerts: { notification: true, fullScreen: true } })], { notificationsEnabled: false, fullScreenAlerts: false });
  off.run(at(DAY, '07:59'), at(DAY, '08:05'));
  assert.equal(off.toasts.length + off.alerts.length, 0, 'the switches in Settings still apply');
});

test('a time already ticked, a paused routine and a day that is not chosen stay quiet', () => {
  const ticked = setSlotDone(make(), DAY, 480, true, at(DAY, '07:00'));
  const w = world([ticked, make({ id: 'r2', enabled: false }), make({ id: 'r3', weekdays: [1] })]);
  w.run(at(DAY, '07:59'), at(DAY, '08:30'));
  assert.equal(w.toasts.length, 0);
});

test('a time that was missed (computer asleep) is skipped, not shown late', () => {
  const w = world([make()]);
  w.run(at(DAY, '07:59'), at(DAY, '07:59'));
  w.clock = at(DAY, '09:00');
  w.engine.tick(w.clock);
  assert.equal(w.toasts.length, 0);
  w.clock = at(DAY, '10:30');
  w.engine.tick(w.clock);
  assert.equal(w.toasts.length, 1);
});

test('snooze brings the reminder back; done stops it', () => {
  const w = world([make({ alerts: { notification: false, fullScreen: true } })]);
  w.run(at(DAY, '07:59'), at(DAY, '08:00'));
  const item = w.alerts[0][1][0];
  w.engine.handleAction({ type: 'snooze', routineId: item.routineId, dateKey: item.dateKey, slot: item.slot, fullScreen: true });
  w.run(at(DAY, '08:00'), at(DAY, '08:06'));
  assert.equal(w.alerts.length, 2, 'it rings again after 5 minutes');
  assert.equal(w.alerts[1][1][0].snoozed, true);
  w.engine.handleAction({ type: 'snooze', routineId: item.routineId, dateKey: item.dateKey, slot: item.slot, fullScreen: true });
  w.engine.handleAction({ type: 'done', routineId: item.routineId, dateKey: item.dateKey, slot: item.slot });
  w.run(at(DAY, '08:06'), at(DAY, '08:20'));
  assert.equal(w.alerts.length, 2, 'done cancels the waiting snooze');
  assert.deepEqual(w.done, [['r1', DAY, 480]]);
});

test('the engine state survives a restart (no repeat after reopening)', () => {
  const w = world([make()]);
  w.run(at(DAY, '07:59'), at(DAY, '08:01'));
  const saved = w.saves[w.saves.length - 1];
  const again = world([make()]);
  again.engine = new RoutineEngine({ getRoutines: () => [make()], getSettings: () => again.settings, notify: (p) => again.toasts.push(p), saveState: () => {}, now: () => again.clock, initialState: saved, setTimeout: () => 1, clearTimeout: () => {} });
  again.clock = at(DAY, '08:01');
  again.engine.tick(again.clock);
  again.clock = at(DAY, '08:02');
  again.engine.tick(again.clock);
  assert.equal(again.toasts.length, 0);
});

// ---- the service, saving and backups -----------------------------------------------------------------------------------

function service() {
  let n = 0;
  return new PlannerService({ store: new MemoryStore(), now: () => at(DAY, '10:00'), newId: () => `id${++n}`, providerFactory: () => constantProvider });
}
const form = (extra = {}) => ({ title: 'Stretch', from: '09:00', to: '17:00', hours: 1, minutes: 30, weekdays: [0, 1, 2, 3, 4], notification: true, fullScreen: false, ...extra });

test('service: add, edit, pause, tick, delete a routine', () => {
  const s = service();
  assert.ok(['getRoutines', 'saveRoutine', 'deleteRoutine', 'setRoutineEnabled', 'setRoutineSlotDone', 'newRoutineDefaults', 'getRoutineForEdit'].every((m) => PUBLIC_METHODS.includes(m)));
  const id = s.saveRoutine({ form: form() }).id;
  let r = s.getRoutines()[0];
  assert.equal(r.everyMinutes, 90);
  assert.equal(r.timesPerDay, 6);
  assert.equal(r.doneToday, 0);
  assert.equal(r.times[0].label, '9:00 AM');
  assert.equal(r.times[0].past, true);
  assert.equal(r.nextLabel, '10:30 AM');
  assert.equal(s.getRoutineLeftToday(), 5);

  assert.deepEqual(s.getRoutineForEdit({ id }), { title: 'Stretch', notes: '', categoryId: null, from: '09:00', to: '17:00', hours: 1, minutes: 30, weekdays: [0, 1, 2, 3, 4], notification: true, fullScreen: false, randomNotes: false, enabled: true });
  s.setRoutineSlotDone({ id, dateKey: DAY, slot: 540, done: true });
  assert.equal(s.getRoutines()[0].doneToday, 1);
  s.saveRoutine({ id, form: form({ title: 'Stretch more', fullScreen: true }) });
  assert.equal(s.getRoutines()[0].doneToday, 1, 'a change that keeps the times keeps the ticks');
  s.saveRoutine({ id, form: form({ hours: 2, minutes: 0 }) });
  assert.equal(s.getRoutines()[0].doneToday, 0, 'new times: the old ticks are dropped');

  s.setRoutineEnabled({ id, enabled: false });
  assert.equal(s.getRoutines()[0].times.length, 0);
  assert.equal(s.getRoutineLeftToday(), 0);
  s.deleteRoutine({ id });
  assert.equal(s.getRoutines().length, 0);
  assert.throws(() => s.deleteRoutine({ id }));
});

test('service: a routine with no way to remind is refused, a paused one may have none', () => {
  const s = service();
  assert.throws(() => s.saveRoutine({ form: form({ notification: false, fullScreen: false }) }), /notification, a full-screen alert, or both/);
  assert.doesNotThrow(() => s.saveRoutine({ form: form({ notification: false, fullScreen: false, enabled: false }) }));
  assert.throws(() => s.saveRoutine({ form: form({ hours: 0, minutes: 2 }) }), /at least 5/);
});

test('routines are saved, exported and imported', () => {
  const s = service();
  s.saveRoutine({ form: form() });
  const file = buildExport(s.data);
  assert.equal(file.routines.length, 1);
  const { data } = parseImport(JSON.parse(JSON.stringify(file)));
  assert.equal(data.routines[0].title, 'Stretch');
  assert.deepEqual(data.routines[0].weekdays, [0, 1, 2, 3, 4]);
  const { data: clean, warnings } = normalizeData({ ...emptyData(), routines: [{ id: 'x', title: '' }, { id: 'y', title: 'Ok', from: '08:00', to: '09:00', everyMinutes: 30, weekdays: [1], alerts: { notification: true } }, 5] });
  assert.equal(clean.routines.length, 1);
  assert.equal(warnings.length, 2);
  assert.deepEqual(normalizeData({}).data.routines, []);
});

test('deleting a category frees the routines that used it', () => {
  const s = service();
  const cat = s.data.categories[0].id;
  s.saveRoutine({ form: form({ categoryId: cat }) });
  assert.equal(s.getRoutines()[0].categoryName !== '', true);
  s.deleteCategory({ id: cat });
  assert.equal(s.getRoutines()[0].categoryId, null);
});

test('the full-screen alert item for a routine has what the alert screen needs', () => {
  const s = service();
  const id = s.saveRoutine({ form: form() }).id;
  const [item] = s.buildRoutineAlertItems([{ id: 'o1', routineId: id, slot: 540, dateKey: DAY, title: 'Stretch', notes: 'legs', at: at(DAY, '09:00'), snoozed: false }]);
  assert.equal(item.kind, 'routine');
  assert.equal(item.startLabel, '9:00 AM');
  assert.equal(item.endLabel, '');
  assert.equal(item.taskId, `routine:${id}`);
});

test('random notes: a routine shows a different note each time it rings, only on the full-screen alert', () => {
  const s = service();
  const id = s.saveRoutine({ form: form({ fullScreen: true, notes: 'one;two;three', randomNotes: true }) }).id;
  assert.equal(s.getRoutineForEdit({ id }).randomNotes, true);
  const ring = (slot, snoozed = false) => s.buildRoutineAlertItems([{ id: `o${slot}${snoozed}`, routineId: id, slot, dateKey: DAY, title: 'Stretch', notes: 'one;two;three', randomNotes: true, at: at(DAY, '09:00'), snoozed }])[0].notes;
  const seen = [ring(540), ring(630), ring(720)];
  assert.deepEqual(seen.slice().sort(), ['one', 'three', 'two'], 'each note once before any repeats');
  assert.notEqual(ring(810), seen[2], 'never the same note twice in a row');
  assert.equal(s.data.noteRotation[`routine:${id}`].dateKey, DAY);
  const plain = s.buildRoutineAlertItems([{ id: 'p', routineId: id, slot: 540, dateKey: DAY, title: 'x', notes: 'one;two', randomNotes: false, at: at(DAY, '09:00') }])[0];
  assert.equal(plain.notes, 'one;two', 'switched off: the notes are shown as written');
  s.deleteRoutine({ id });
  assert.equal(s.data.noteRotation[`routine:${id}`], undefined);
});

test('the engine passes the random-notes choice only for full-screen routines', () => {
  const full = world([make({ alerts: { notification: false, fullScreen: true }, randomNotes: true, notes: 'a;b' })]);
  full.run(at(DAY, '07:59'), at(DAY, '08:01'));
  assert.equal(full.alerts[0][1][0].randomNotes, true);
  const toastOnly = world([make({ randomNotes: true, notes: 'a;b' })]);
  toastOnly.run(at(DAY, '07:59'), at(DAY, '08:01'));
  assert.equal(toastOnly.toasts.length, 1);
  assert.equal(toastOnly.toasts[0][1].lines.join('').includes('a'), false, 'a notification never shows the notes');
});

test('the note memory of a routine survives loading the data', () => {
  const s = service();
  const id = s.saveRoutine({ form: form({ fullScreen: true, notes: 'one;two', randomNotes: true }) }).id;
  s.buildRoutineAlertItems([{ id: 'o', routineId: id, slot: 540, dateKey: DAY, title: 'x', notes: 'one;two', randomNotes: true, at: at(DAY, '09:00') }]);
  const again = normalizeData(JSON.parse(JSON.stringify(s.data))).data;
  assert.ok(again.noteRotation[`routine:${id}`]);
});
