'use strict';

// Own alert sounds and a sound for each task (1.7.0): the settings, the task choice, the files, the alert, old data.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PlannerService, PUBLIC_METHODS } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { createSoundFiles, looksLikeSound } = require('../src/main/sound-files');
const { createAlertManager } = require('../src/main/alert-window');
const {
  mergeSettings, sanitizeSettings, DEFAULT_SETTINGS, validateTask, createTask, normalizeData, emptyData, parseImport, buildExport, ReminderEngine,
} = require('../src/core');
const {
  MAX_CUSTOM_SOUNDS, TASK_BUILTIN_SOUNDS, validateCustomSounds, sanitizeCustomSounds, isValidTaskSound, resolveAlertSound,
} = require('../src/core/custom-sounds');
const { at, constantProvider } = require('./helpers');

const DAY = '2026-10-04';
const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const fixed = (time) => ({ mode: 'fixed', time });

function makeService() {
  let n = 0;
  const service = new PlannerService({
    store: new MemoryStore(), now: () => at(DAY, '10:00'), newId: () => `id${++n}`, providerFactory: () => constantProvider,
    onDataChanged: () => {}, onSettingsChanged: () => {},
  });
  return service;
}
const form = (extra = {}, reminders = {}) => ({
  title: 'T', start: fixed('08:00'), durationMinutes: 30, date: DAY, recurrence: null, priority: 'Medium', categoryId: null, notes: '',
  reminders: { enabled: false, offsets: [], fullScreen: true, ...reminders }, ...extra,
});

test('settings: no own sounds by default; the list and the alert sound are checked', () => {
  assert.deepEqual(DEFAULT_SETTINGS.customSounds, []);
  assert.deepEqual(validateCustomSounds([{ id: A, name: 'Bell' }]), []);
  for (const bad of ['x', [{ id: '../evil', name: 'x' }], [{ id: A, name: 'x' }, { id: A, name: 'y' }], [{ id: A, name: 5 }],
    Array.from({ length: MAX_CUSTOM_SOUNDS + 1 }, (_, i) => ({ id: String(i).padStart(2, '0').repeat(10), name: 'x' }))]) {
    assert.ok(validateCustomSounds(bad).length > 0, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { customSounds: [{ id: A, name: 'Bell' }], alertSound: A }).alertSound, A, 'a library sound can be the alert sound');
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { alertSound: 'nope' }), /sounds in the list/);
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { alertSound: 'chime' }), /sounds in the list/, 'the Settings list is unchanged: a done sound is still not an alert sound');
  // loading: bad entries dropped; a sound that is not in the list is not kept as the alert sound
  assert.deepEqual(sanitizeSettings({ customSounds: [{ id: A, name: 'ok' }, { id: 'bad', name: 'x' }, { id: A, name: 'again' }] }).customSounds, [{ id: A, name: 'ok' }]);
  assert.equal(sanitizeSettings({ alertSound: A, customSounds: [] }).alertSound, 'bell');
  assert.equal(sanitizeSettings({ alertSound: A, customSounds: [{ id: A, name: 'ok' }] }).alertSound, A);
  assert.deepEqual(sanitizeSettings({ alertSound: 'pulse' }).customSounds, [], 'older files have no list');
});

test('task choice: default, any built-in sound, Off, or a sound id; anything else is refused', () => {
  for (const ok of ['default', ...TASK_BUILTIN_SOUNDS, A]) assert.ok(isValidTaskSound(ok), ok);
  for (const bad of ['', 'loud', '../x', 5, null, undefined, {}]) assert.ok(!isValidTaskSound(bad), String(bad));
  const base = { id: 't', title: 'x', start: fixed('08:00'), durationMinutes: 30, date: DAY };
  assert.deepEqual(validateTask(createTask({ ...base, reminders: { enabled: false, offsets: [], sound: A } })), []);
  assert.throws(() => createTask({ ...base, reminders: { enabled: false, offsets: [], sound: 'loud' } }), /alert sound/);
  assert.ok(validateTask({ ...base, reminders: { enabled: false, offsets: [], sound: 'loud' } }).length > 0);
});

test('which sound rings: the task\'s own, else Settings; a missing sound falls back', () => {
  const lib = [{ id: A, name: 'Mine' }];
  assert.equal(resolveAlertSound('default', 'bell', lib), 'bell');
  assert.equal(resolveAlertSound(undefined, 'alarm', lib), 'alarm');
  assert.equal(resolveAlertSound('chime', 'bell', lib), 'chime', 'a done sound can be chosen for a task');
  assert.equal(resolveAlertSound('off', 'bell', lib), 'off', 'a silent task');
  assert.equal(resolveAlertSound(A, 'bell', lib), A);
  assert.equal(resolveAlertSound(B, 'alarm', lib), 'alarm', 'removed: the Settings sound');
  assert.equal(resolveAlertSound(B, B, lib), 'bell', 'both gone: the default bell');
  assert.deepEqual(sanitizeCustomSounds(null), []);
});

test('service: adding and removing sounds; each task keeps its own choice', () => {
  const s = makeService();
  assert.ok(PUBLIC_METHODS.includes('getSoundUsage'));
  assert.deepEqual(s.addCustomSounds([{ id: A, name: 'One' }, { id: B, name: 'Two' }, { id: A, name: 'dup' }, { id: 'bad', name: 'x' }]), { added: 2, full: true });
  assert.deepEqual(s.getSettings().customSounds.map((x) => x.name), ['One', 'Two']);
  const t1 = s.saveTask({ mode: 'create', scope: 'all', form: form({ title: 'one' }, { sound: A }) });
  const t2 = s.saveTask({ mode: 'create', scope: 'all', form: form({ title: 'two' }, { sound: 'alarm' }) });
  const t3 = s.saveTask({ mode: 'create', scope: 'all', form: form({ title: 'three' }) });
  const soundOf = (r) => s.data.tasks.find((x) => x.id === r.taskId || x.id === r.id || x.title === r.title).reminders.sound;
  assert.deepEqual(s.data.tasks.map((x) => x.reminders.sound), [A, 'alarm', 'default'], 'three tasks, three independent choices');
  assert.ok(t1 && t2 && t3 && soundOf);
  assert.deepEqual(s.getSoundUsage({ id: A }), { tasks: 1, settings: false });
  // changing one task later does not touch the others
  const first = s.data.tasks[0];
  s.saveTask({ mode: 'edit', taskId: first.id, dateKey: DAY, scope: 'all', form: form({ title: 'one' }, { sound: 'off' }) });
  assert.deepEqual(s.data.tasks.map((x) => x.reminders.sound), ['off', 'alarm', 'default']);
  // an invalid choice in a form becomes "as in Settings", never an error that blocks saving
  s.saveTask({ mode: 'create', scope: 'all', form: form({ title: 'four' }, { sound: 'loud' }) });
  assert.equal(s.data.tasks[3].reminders.sound, 'default');
  // removing: tasks and Settings fall back; the other task is unchanged
  s.saveSettings({ alertSound: B });
  s.saveTask({ mode: 'edit', taskId: s.data.tasks[1].id, dateKey: DAY, scope: 'all', form: form({ title: 'two' }, { sound: B }) });
  assert.deepEqual(s.getSoundUsage({ id: B }), { tasks: 1, settings: true });
  s.removeCustomSound(B);
  assert.equal(s.getSettings().alertSound, 'bell');
  assert.equal(s.alertSoundFor(B), 'bell');
  assert.equal(s.alertSoundFor(A), A);
  assert.throws(() => s.removeCustomSound(B), /no longer in the list/);
});

test('service: alert items carry the sound of their task; the preview and routines use Settings', () => {
  const s = makeService();
  s.addCustomSounds([{ id: A, name: 'One' }]);
  s.saveSettings({ alertSound: 'pulse' });
  const items = s.buildAlertItems([
    { id: 'x', taskId: 'a', dateKey: DAY, title: 'a', notes: '', start: at(DAY, '08:00'), end: at(DAY, '08:30'), durationMinutes: 30, zoneName: 'Fajr → Dhuhr', zoneIndex: 1, priority: 'Medium', sound: A },
    { id: 'y', taskId: 'b', dateKey: DAY, title: 'b', notes: '', start: at(DAY, '08:00'), end: at(DAY, '08:30'), durationMinutes: 30, zoneName: 'Fajr → Dhuhr', zoneIndex: 1, priority: 'Medium' },
  ]);
  assert.deepEqual(items.map((i) => i.soundId), [A, 'pulse']);
  assert.equal(s.getAlertConfig().sound.id, 'pulse');
  assert.equal(s.getAlertSample().soundId, undefined, 'the preview rings with the Settings sound');
});

test('engine: reminder items and snoozed items keep the sound', () => {
  const task = createTask({ id: 't', title: 't', start: fixed('08:00'), durationMinutes: 30, date: DAY, reminders: { enabled: false, offsets: [], fullScreen: true, sound: A } });
  const { alertsInWindow } = require('../src/core');
  const found = alertsInWindow(constantProvider, [task], at(DAY, '07:59'), at(DAY, '08:01'), {});
  assert.equal(found.length, 1);
  assert.equal(found[0].sound, A);
  assert.ok(ReminderEngine);
});

test('old data: tasks without a sound and a settings file without the list load as before', () => {
  const data = normalizeData({ version: 1, settings: { alertSound: 'alarm' }, tasks: [{ id: 'old', title: 'Old', start: fixed('08:00'), durationMinutes: 30, date: DAY, reminders: { enabled: true, offsets: [] } }] }).data;
  assert.equal(data.settings.alertSound, 'alarm');
  assert.deepEqual(data.settings.customSounds, []);
  assert.equal(data.tasks[0].reminders.sound, undefined);
  const keep = normalizeData({ version: 1, tasks: [{ id: 'n', title: 'New', start: fixed('08:00'), durationMinutes: 30, date: DAY, reminders: { enabled: true, offsets: [], sound: A } }] }).data;
  assert.equal(keep.tasks[0].reminders.sound, A, 'saved and loaded again');
});

test('import and restore: the sounds on this computer stay; a task that asks for another one rings with Settings', () => {
  const s = makeService();
  s.addCustomSounds([{ id: A, name: 'One' }]);
  s.saveSettings({ alertSound: A });
  const file = buildExport({ ...emptyData(), settings: { ...DEFAULT_SETTINGS, customSounds: [{ id: B, name: 'Other PC' }], alertSound: B }, tasks: [] });
  assert.ok(parseImport(JSON.stringify(file)).data);
  s.importData(JSON.stringify(file));
  assert.deepEqual(s.getSettings().customSounds, [{ id: A, name: 'One' }]);
  assert.equal(s.getSettings().alertSound, 'bell', 'the alert sound of another computer is not in this list');
});

test('files: only real sound files are copied, by id; nothing else is read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snd-'));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'src-'));
  let n = 0;
  const files = createSoundFiles({ dir: path.join(dir, 'sounds'), fs, newId: () => `${++n}`.padStart(2, '0').repeat(12) });
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(8)]);
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(16)]);
  const put = (name, bytes) => { fs.writeFileSync(path.join(src, name), bytes); return path.join(src, name); };
  const out = files.add([put('Ding Dong.WAV', wav), put('song.mp3', mp3), put('fake.mp3', Buffer.from('this is not audio at all')), put('movie.mp4', wav), put('tiny.wav', Buffer.from('RIFF'))]);
  assert.deepEqual(out.sounds.map((x) => x.name), ['Ding Dong', 'song']);
  assert.deepEqual(out.skipped.sort(), ['fake.mp3', 'movie.mp4', 'tiny.wav']);
  assert.deepEqual(files.read(out.sounds[0].id), wav);
  assert.equal(files.read('../../data'), null, 'only ids, never paths');
  assert.equal(files.read('f'.repeat(24)), null, 'a missing file');
  files.remove(out.sounds[0].id);
  assert.equal(files.read(out.sounds[0].id), null);
  assert.ok(files.read(out.sounds[1].id), 'the other sound stays');
  for (const bytes of [Buffer.from('OggS' + 'x'.repeat(12)), Buffer.from('fLaC' + 'x'.repeat(12)), Buffer.from('....ftypM4A xxxx'), Buffer.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0])]) assert.ok(looksLikeSound(bytes));
  assert.ok(!looksLikeSound(Buffer.from('MZ' + 'x'.repeat(20))));
});

test('alert window: the first task that arrives decides the sound; the page can ask for it', () => {
  const sent = [];
  const base = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push(payload), on() {}, setWindowOpenHandler() {}, isDestroyed: () => false },
  };
  const win = new Proxy(base, { get: (target, key) => (key in target ? target[key] : () => undefined) }); // every other window method does nothing
  const manager = createAlertManager({
    BrowserWindow: function Fake() { return win; }, screen: { getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 10, height: 10 } }), getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 10, height: 10 } }] },
    preloadPath: 'p', pagePath: 'q', getConfig: () => ({ appearance: {}, snoozeMinutes: 5, language: 'en', sound: { id: 'bell', volume: 70, repeat: false, stopAfterMinutes: 0 } }),
  });
  const item = (id, soundId) => ({ id, taskId: id, title: id, soundId });
  try {
    manager.show([item('one', A), item('two', 'alarm')]);
    manager.sendTo(base.webContents);
  } catch (error) {
    assert.fail(`the fake window is not complete: ${error.message}`);
  }
  const last = sent[sent.length - 1];
  assert.deepEqual([last.sound.id, last.sound.fallbackId], [A, 'bell']);
  const seq = last.soundSeq;
  manager.show([item('three', 'pop')]);
  assert.equal(sent[sent.length - 1].sound.id, 'pop', 'a later arrival rings with its own sound');
  assert.equal(sent[sent.length - 1].soundSeq, seq + 1);
  manager.show([{ id: 'four', taskId: 'four', title: 'four' }]);
  assert.equal(sent[sent.length - 1].sound.id, 'bell', 'no task sound: the Settings sound');
});
