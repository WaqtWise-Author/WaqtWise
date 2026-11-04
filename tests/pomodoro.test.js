'use strict';

// Pomodoro (1.3.0): the Pomodoros, the timer (parts, rounds, long break, pause, skip, stop, 5 more minutes,
// stopping at prayer time), the focus log, the Statistics card, and saving / export / import / undo.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePomodoro, normalizePomodoroLog, startTimer, finishPart, startNextPart, extendFocus, pauseTimer, resumeTimer, remainingOf,
  partAfter, clockLabel, computePomodoroStats, normalizeData, buildExport, parseImport, emptyData, STATS_CHART_IDS, DEFAULT_SETTINGS,
} = require('../src/core');
const { PlannerService, PUBLIC_METHODS, checkRequest } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { at, constantProvider } = require('./helpers');

const DAY = '2026-10-04';
const MIN = 60000;

const raw = (extra = {}) => ({ id: 'p1', title: 'Study', focusMinutes: 25, breakMinutes: 5, longBreak: { enabled: true, minutes: 15, every: 4 }, alert: 'fullScreen', holdAtPrayer: false, ...extra });
const make = (extra) => normalizePomodoro(raw(extra), at(DAY, '07:00')).pomodoro;

// A service with a clock the test moves forward. The constant provider has Dhuhr at 11:48 and Asr at 15:14.
function setup(startAt = '09:00') {
  let nowMs = at(DAY, startAt).getTime();
  let n = 0;
  const signals = [];
  const changes = [];
  const s = new PlannerService({
    store: new MemoryStore(), now: () => new Date(nowMs), newId: () => `id${++n}`, providerFactory: () => constantProvider,
    onPomodoroSignal: (x) => signals.push(x), onPomodoroChanged: (v) => changes.push(v),
  });
  const advance = (minutes) => { nowMs += minutes * MIN; };
  const set = (hhmm) => { nowMs = at(DAY, hhmm).getTime(); };
  return { s, advance, set, signals, changes };
}
const form = (extra = {}) => ({ title: 'Study', focusMinutes: 25, breakMinutes: 5, longBreak: true, longBreakMinutes: 15, longBreakEvery: 4, alert: 'fullScreen', holdAtPrayer: false, ...extra });

test('a Pomodoro is checked: name, focus, break, long break', () => {
  const bad = (extra, part) => assert.match(normalizePomodoro(raw(extra)).error, part);
  bad({ title: '  ' }, /name/);
  bad({ focusMinutes: 0 }, /Focus Time/);
  bad({ focusMinutes: 241 }, /Focus Time/);
  bad({ focusMinutes: 2.5 }, /Focus Time/);
  bad({ breakMinutes: 0 }, /Short Break/);
  bad({ longBreak: { enabled: true, minutes: 0, every: 4 } }, /Long Break/);
  bad({ longBreak: { enabled: true, minutes: 15, every: 1 } }, /rounds/);
  const off = make({ longBreak: { enabled: false, minutes: 999, every: 99 }, alert: 'nonsense' });
  assert.deepEqual(off.longBreak, { enabled: false, minutes: 15, every: 4 }, 'a long break that is off keeps safe values');
  assert.equal(off.alert, 'notification', 'an unknown alert choice falls back to a notification');
  assert.equal(make({ title: '  Read  ' }).title, 'Read');
});

test('the parts follow each other: focus, break, ... and a long break after every 4 rounds', () => {
  const p = make();
  assert.deepEqual(partAfter(p, 'focus', 1), { part: 'break', round: 1 });
  assert.deepEqual(partAfter(p, 'break', 1), { part: 'focus', round: 2 });
  assert.deepEqual(partAfter(p, 'focus', 4), { part: 'longBreak', round: 4 });
  assert.deepEqual(partAfter(p, 'longBreak', 4), { part: 'focus', round: 5 });
  assert.deepEqual(partAfter(p, 'focus', 8), { part: 'longBreak', round: 8 });
  const plain = make({ longBreak: { enabled: false, minutes: 15, every: 4 } });
  assert.deepEqual(partAfter(plain, 'focus', 4), { part: 'break', round: 4 }, 'no long break when it is off');
});

test('the timer: run, pause, resume, finish (waits for the person), next, 5 more minutes', () => {
  const p = make();
  let st = startTimer(p, 0);
  assert.equal(st.status, 'running');
  assert.equal(remainingOf(st, 10 * MIN), 15 * MIN);
  st = pauseTimer(st, 10 * MIN);
  assert.equal(remainingOf(st, 99 * MIN), 15 * MIN, 'paused: the time left stays');
  st = resumeTimer(st, 20 * MIN);
  assert.equal(st.endsAt, 35 * MIN);
  const done = finishPart(p, st, 35 * MIN);
  assert.deepEqual(done.log, { minutes: 25, complete: true });
  assert.equal(done.state.status, 'waiting', 'the break does not start by itself');
  assert.deepEqual(done.state.next, { part: 'break', round: 1 });
  const more = extendFocus(p, done.state, 40 * MIN, 5);
  assert.equal(more.part, 'focus');
  assert.equal(more.partMs, 5 * MIN);
  const after = finishPart(p, more, 45 * MIN);
  assert.deepEqual(after.log, { minutes: 5, complete: false }, 'the extra minutes count, but not as a full session');
  const brk = startNextPart(p, after.state, 50 * MIN);
  assert.equal(brk.part, 'break');
  assert.equal(brk.partMs, 5 * MIN);
  assert.equal(finishPart(p, brk, 55 * MIN).log, null, 'a break writes nothing to the log');
  const afterBreak = finishPart(p, brk, 55 * MIN).state;
  assert.equal(extendFocus(p, afterBreak, 56 * MIN), afterBreak, '"5 More Minutes" is only offered after a focus part');
});

test('skipping a focus part early keeps the whole minutes done', () => {
  const p = make();
  const st = startTimer(p, 0);
  assert.deepEqual(finishPart(p, st, 12.5 * MIN, true).log, { minutes: 12, complete: false });
  assert.equal(finishPart(p, st, 0.5 * MIN, true).log, null, 'less than a minute is not written');
});

test('clock labels', () => {
  assert.equal(clockLabel(25 * MIN), '25:00');
  assert.equal(clockLabel(61 * 1000), '1:01');
  assert.equal(clockLabel(500), '0:01', 'rounded up: never 0:00 while time is left');
  assert.equal(clockLabel(90 * MIN), '1:30:00');
});

test('service: add, edit, delete (with Undo) a Pomodoro; the window may call the methods', () => {
  const { s } = setup();
  for (const m of ['getPomodoros', 'newPomodoroDefaults', 'getPomodoroForEdit', 'savePomodoro', 'deletePomodoro', 'getPomodoroTimer', 'pomodoroAction']) {
    assert.ok(PUBLIC_METHODS.includes(m), m);
  }
  assert.deepEqual(s.newPomodoroDefaults(), { title: '', focusMinutes: 25, breakMinutes: 5, longBreak: true, longBreakMinutes: 15, longBreakEvery: 4, alert: 'fullScreen', holdAtPrayer: true });
  const { id } = s.savePomodoro({ id: null, form: form() });
  assert.equal(s.getPomodoros().items[0].title, 'Study');
  assert.equal(s.getPomodoros().items[0].todayLabel, 'Today: none yet');
  s.savePomodoro({ id, form: form({ title: 'Deep Work', focusMinutes: 50, breakMinutes: 10, longBreak: false, alert: 'notification' }) });
  const edit = s.getPomodoroForEdit({ id });
  assert.equal(edit.title, 'Deep Work');
  assert.equal(edit.focusMinutes, 50);
  assert.equal(edit.longBreak, false);
  assert.equal(edit.alert, 'notification');
  assert.throws(() => s.savePomodoro({ id: null, form: form({ focusMinutes: 0 }) }), /Focus Time/);
  const { undoId } = s.deletePomodoro({ id });
  assert.equal(s.getPomodoros().items.length, 0);
  s.undoDelete({ id: undoId });
  assert.equal(s.getPomodoros().items.length, 1, 'Undo brings it back');
  assert.doesNotThrow(() => checkRequest('pomodoroAction', [{ action: 'start', id: 'x' }]));
  assert.throws(() => checkRequest('pomodoroAction', [{ action: 'start', id: 5 }]), /Unknown request/);
  assert.throws(() => s.pomodoroAction({ action: 'format-disk' }), /Unknown request/);
});

test('service timer: a focus part ends, the person is told, and the break waits to be started', () => {
  const { s, advance, signals } = setup();
  const { id } = s.savePomodoro({ id: null, form: form() });
  let view = s.pomodoroAction({ action: 'start', id });
  assert.equal(view.status, 'running');
  assert.equal(view.part, 'focus');
  assert.equal(view.remainingLabel, '25:00');
  assert.equal(view.roundsLabel, 'Round 1 of 4');
  assert.equal(s.pomodoroDueMs(), at(DAY, '09:25').getTime());
  advance(10);
  assert.equal(s.pomodoroTick(), null, 'not yet');
  assert.equal(s.getPomodoroTimer().remainingLabel, '15:00');
  advance(15);
  const signal = s.pomodoroTick();
  assert.equal(signal.kind, 'ended');
  assert.equal(signal.alert, 'fullScreen');
  assert.equal(signal.title, 'Time for a Short Break');
  assert.equal(signals.length, 1);
  view = s.getPomodoroTimer();
  assert.equal(view.status, 'waiting');
  assert.equal(view.next.part, 'break');
  assert.equal(view.canExtend, true);
  assert.equal(s.pomodoroDueMs(), null, 'nothing runs while it waits');
  assert.match(s.getPomodoros().items[0].todayLabel, /1 session · 25m focused/);
  // The alert item for the full-screen window
  const item = s.buildPomodoroAlertItem(signal);
  assert.equal(item.kind, 'pomodoro');
  assert.equal(item.next, 'break');
  assert.equal(item.canExtend, true);
  // Start the break, let it end: back to focus, round 2
  s.pomodoroAction({ action: 'next' });
  assert.equal(s.getPomodoroTimer().part, 'break');
  advance(5);
  assert.equal(s.pomodoroTick().title, 'Break Over: Time to Focus');
  s.pomodoroAction({ action: 'next' });
  view = s.getPomodoroTimer();
  assert.equal(view.part, 'focus');
  assert.equal(view.round, 2);
  assert.equal(view.roundsLabel, 'Round 2 of 4');
});

test('service timer: pause and resume, skip, stop (the minutes done are kept), one Pomodoro at a time', () => {
  const { s, advance } = setup();
  const a = s.savePomodoro({ id: null, form: form() }).id;
  const b = s.savePomodoro({ id: null, form: form({ title: 'Read', focusMinutes: 45 }) }).id;
  s.pomodoroAction({ action: 'start', id: a });
  advance(5);
  s.pomodoroAction({ action: 'pause' });
  advance(30);
  assert.equal(s.getPomodoroTimer().remainingLabel, '20:00', 'a pause keeps the time left');
  assert.equal(s.pomodoroDueMs(), null);
  s.pomodoroAction({ action: 'resume' });
  advance(8);
  s.pomodoroAction({ action: 'skip' });
  assert.equal(s.getPomodoroTimer().status, 'waiting');
  assert.deepEqual(s.data.pomodoroLog.map((x) => [x.minutes, x.complete]), [[13, false]], 'the 13 minutes focused are written');
  s.pomodoroAction({ action: 'next' });
  s.pomodoroAction({ action: 'start', id: b });
  assert.equal(s.getPomodoroTimer().pomodoroId, b, 'starting another one ends the first');
  advance(10);
  assert.equal(s.pomodoroAction({ action: 'stop' }), null);
  assert.equal(s.getPomodoroTimer(), null);
  assert.deepEqual(s.data.pomodoroLog.map((x) => [x.pomodoroId, x.minutes]), [[a, 13], [b, 10]]);
  // Deleting the running one stops the timer
  s.pomodoroAction({ action: 'start', id: a });
  s.deletePomodoro({ id: a });
  assert.equal(s.getPomodoroTimer(), null);
});

test('service timer: "5 More Minutes" after a focus part, then the break', () => {
  const { s, advance } = setup();
  const { id } = s.savePomodoro({ id: null, form: form() });
  s.pomodoroAction({ action: 'start', id });
  advance(25);
  s.pomodoroTick();
  const view = s.pomodoroAction({ action: 'extend', minutes: 5 });
  assert.equal(view.part, 'focus');
  assert.equal(view.remainingLabel, '5:00');
  advance(5);
  assert.equal(s.pomodoroTick().next, 'break');
  assert.deepEqual(s.data.pomodoroLog.map((x) => [x.minutes, x.complete]), [[25, true], [5, false]]);
});

test('service timer: with "Stop the Timer at Prayer Time" it stops when a prayer comes, and waits', () => {
  const { s, advance, signals } = setup('11:30'); // Dhuhr at 11:48
  const { id } = s.savePomodoro({ id: null, form: form({ holdAtPrayer: true }) });
  s.pomodoroAction({ action: 'start', id });
  assert.match(s.getPomodoroTimer().prayerNote, /Dhuhr starts at 11:48 AM\. The timer will stop then\./);
  assert.equal(s.pomodoroDueMs(), at(DAY, '11:48').getTime(), 'the main process looks again at prayer time');
  advance(18);
  const signal = s.pomodoroTick();
  assert.equal(signal.kind, 'prayer');
  assert.equal(signal.alert, 'notification');
  assert.equal(signal.title, 'Pomodoro Paused for Dhuhr');
  const view = s.getPomodoroTimer();
  assert.equal(view.status, 'paused');
  assert.equal(view.heldFor, 'Dhuhr');
  assert.equal(view.remainingLabel, '7:00');
  assert.equal(signals.length, 1);
  // Resume after the prayer: the same prayer does not stop it again, and the part ends 7 minutes later
  advance(15);
  s.pomodoroAction({ action: 'resume' });
  assert.equal(s.pomodoroDueMs(), at(DAY, '12:10').getTime());
  advance(7);
  assert.equal(s.pomodoroTick().kind, 'ended');
});

test('service timer: without the prayer choice it only mentions the prayer and keeps going', () => {
  const { s, advance } = setup('11:30');
  const { id } = s.savePomodoro({ id: null, form: form({ holdAtPrayer: false }) });
  s.pomodoroAction({ action: 'start', id });
  assert.match(s.getPomodoroTimer().prayerNote, /Dhuhr starts at 11:48 AM, during this part\./);
  assert.equal(s.pomodoroDueMs(), at(DAY, '11:55').getTime());
  advance(18);
  assert.equal(s.pomodoroTick(), null);
  assert.equal(s.getPomodoroTimer().status, 'running');
});

test('the notification choice is kept on the signal; a long break comes after round 4', () => {
  const { s, advance } = setup('06:00');
  const { id } = s.savePomodoro({ id: null, form: form({ alert: 'notification', focusMinutes: 10, breakMinutes: 2, longBreakEvery: 2, longBreakMinutes: 7 }) });
  s.pomodoroAction({ action: 'start', id });
  advance(10);
  assert.equal(s.pomodoroTick().alert, 'notification');
  s.pomodoroAction({ action: 'next' });
  advance(2);
  s.pomodoroTick();
  s.pomodoroAction({ action: 'next' });
  advance(10);
  const signal = s.pomodoroTick();
  assert.equal(signal.next, 'longBreak');
  assert.equal(signal.title, 'Time for a Long Break');
  s.pomodoroAction({ action: 'next' });
  assert.equal(s.getPomodoroTimer().remainingLabel, '7:00');
});

test('statistics: the Pomodoro card adds up the focus time in the range, per day and per Pomodoro', () => {
  const log = [
    { pomodoroId: 'p1', dateKey: '2026-10-01', minutes: 25, complete: true },
    { pomodoroId: 'p1', dateKey: '2026-10-03', minutes: 25, complete: true },
    { pomodoroId: 'p2', dateKey: '2026-10-03', minutes: 12, complete: false },
    { pomodoroId: 'gone', dateKey: '2026-10-03', minutes: 5, complete: true },
    { pomodoroId: 'p1', dateKey: '2026-09-01', minutes: 50, complete: true },
  ];
  const r = computePomodoroStats([make(), make({ id: 'p2', title: 'Read' })], log, { fromKey: '2026-10-01', toKey: '2026-10-04' });
  assert.equal(r.minutes, 67);
  assert.equal(r.sessions, 3);
  assert.deepEqual(r.days.map((d) => d.minutes), [25, 0, 42, 0]);
  assert.deepEqual(r.items.map((x) => [x.title, x.minutes, x.sessions]), [['Study', 50, 2], ['Read', 12, 0], ['Deleted Pomodoro', 5, 1]]);
  assert.ok(STATS_CHART_IDS.includes('pomodoro'));
  assert.ok(DEFAULT_SETTINGS.statsCharts.includes('pomodoro'), 'new installs show the card');
  // The service adds it only while the card is shown
  const { s } = setup();
  s.saveSettings({ statsCharts: ['kpi-rate'] });
  assert.equal(s.getStats({ range: 'week' }).pomodoroStats, undefined);
  s.saveSettings({ statsCharts: ['kpi-rate', 'pomodoro'] });
  assert.equal(s.getStats({ range: 'week' }).pomodoroStats.minutes, 0);
});

test('saving: Pomodoros and their log are in the data file and the export, and older files load with none', () => {
  assert.deepEqual(emptyData().pomodoros, []);
  assert.deepEqual(normalizeData({}).data.pomodoros, [], 'a file from an older version');
  const data = normalizeData({
    pomodoros: [raw(), raw({ id: 'p1' }), raw({ id: 'bad', focusMinutes: 0 })],
    pomodoroLog: [{ pomodoroId: 'p1', dateKey: '2026-10-03', minutes: 25, complete: true }, { pomodoroId: 'p1', dateKey: 'nope', minutes: 25 }, { pomodoroId: 'p1', dateKey: '2026-10-03', minutes: -4 }],
  });
  assert.equal(data.data.pomodoros.length, 1);
  assert.equal(data.warnings.length, 2, 'the double id and the bad one are reported');
  assert.equal(data.data.pomodoroLog.length, 1, 'damaged log entries are dropped');
  const exported = buildExport({ ...emptyData(), pomodoros: data.data.pomodoros, pomodoroLog: data.data.pomodoroLog });
  const back = parseImport(JSON.stringify(exported));
  assert.equal(back.data.pomodoros[0].title, 'Study');
  assert.equal(back.data.pomodoroLog[0].minutes, 25);
  const old = normalizePomodoroLog([{ pomodoroId: 'p1', dateKey: '2025-01-01', minutes: 25 }], at(DAY, '10:00'));
  assert.equal(old.length, 0, 'only the last 400 days are kept');
});
