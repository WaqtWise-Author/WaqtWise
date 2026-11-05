'use strict';

// The background of the full-screen alert (1.4.0): the settings, which picture is shown, and the picture files.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_ALERT_BACKGROUND, validateAlertBackground, sanitizeAlertBackground, pickAlertImage, wantsImage, mergeSettings, sanitizeSettings,
  DEFAULT_SETTINGS, validateTask,
} = require('../src/core');
const { createBackgrounds } = require('../src/main/backgrounds');

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const withImages = (extra = {}) => ({ ...DEFAULT_ALERT_BACKGROUND, mode: 'images', images: [{ id: A, name: 'A' }, { id: B, name: 'B' }, { id: C, name: 'C' }], ...extra });

test('settings: the solid color by default; every option is checked', () => {
  assert.equal(DEFAULT_SETTINGS.alertBackground.mode, 'color');
  assert.deepEqual(validateAlertBackground({ blur: 30, dim: 80, glassBlur: 100, panel: 'none', position: 'bottom', useFor: 'chosen', pick: 'random' }), []);
  for (const bad of [{ blur: 35 }, { blur: 110 }, { dim: 90 }, { panel: 'frosted' }, { position: 'top' }, { mode: 'video' }, { useFor: 'some' },
    { images: [{ id: '../../evil', name: 'x' }] }, { images: [{ id: A, name: 'x' }, { id: A, name: 'y' }] }, { fixedId: 'nope' }, { other: 1 }]) {
    assert.ok(validateAlertBackground(bad).length > 0, JSON.stringify(bad));
  }
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { alertBackground: { blur: 45 } }));
  const merged = mergeSettings(DEFAULT_SETTINGS, { alertBackground: { mode: 'images', blur: 60 } });
  assert.equal(merged.alertBackground.blur, 60);
  assert.equal(merged.alertBackground.panel, 'glass', 'the other options stay');
  // Older files have none; damaged values fall back to the defaults; a fixed picture that is gone is forgotten
  assert.deepEqual(sanitizeSettings({}).alertBackground, DEFAULT_ALERT_BACKGROUND);
  const clean = sanitizeAlertBackground({ mode: 'images', blur: 33, images: [{ id: A, name: 'A' }], fixedId: B });
  assert.equal(clean.blur, 30);
  assert.equal(clean.fixedId, '');
  // A task's own choice
  const task = { id: 't', title: 'T', start: { mode: 'fixed', time: '09:00' }, durationMinutes: 30, date: '2026-10-04', recurrence: null, priority: 'Medium' };
  assert.deepEqual(validateTask({ ...task, reminders: { enabled: true, offsets: [], background: 'image' } }), []);
  assert.ok(validateTask({ ...task, reminders: { enabled: true, offsets: [], background: 'photo' } }).length > 0);
});

test('which picture: fixed or random (never the same twice in a row); the task choice and "only tasks I choose"', () => {
  assert.equal(pickAlertImage({ ...DEFAULT_ALERT_BACKGROUND }, 'image'), '', 'solid color mode: never a picture');
  assert.equal(pickAlertImage(withImages({ images: [] }), 'image'), '', 'no pictures yet');
  assert.equal(pickAlertImage(withImages({ fixedId: B }), 'default'), B);
  assert.equal(pickAlertImage(withImages({ fixedId: '' }), 'default'), A, 'no fixed picture chosen: the first one');
  assert.equal(pickAlertImage(withImages(), 'color'), '', 'the task wants the solid color');
  assert.equal(wantsImage(withImages({ useFor: 'chosen' }), 'default'), false);
  assert.equal(wantsImage(withImages({ useFor: 'chosen' }), 'image'), true);
  const random = withImages({ pick: 'random' });
  assert.equal(pickAlertImage(random, 'default', () => 0, ''), A);
  assert.equal(pickAlertImage(random, 'default', () => 0, A), B, 'not the same as last time');
  assert.equal(pickAlertImage(random, 'default', () => 0.99, A), C);
  assert.equal(pickAlertImage(withImages({ pick: 'random', images: [{ id: A, name: 'A' }] }), 'default', () => 0.5, A), A, 'one picture: that one');
});

test('picture files: copied smaller with a small copy, read back only by a valid id, cleaned up', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'src-'));
  const pic = (w, h) => ({ isEmpty: () => false, getSize: () => ({ width: w, height: h }), resize: (s) => pic(s.width, s.height), toJPEG: () => Buffer.from(`${w}x${h}`) });
  const nativeImage = { createFromPath: (p) => (fs.readFileSync(p, 'utf8') === 'big' ? pic(5120, 3200) : fs.readFileSync(p, 'utf8') === 'small' ? pic(800, 600) : { isEmpty: () => true }) };
  let n = 0;
  const bgs = createBackgrounds({ dir: path.join(dir, 'backgrounds'), fs, nativeImage, newId: () => String(++n).repeat(16).slice(0, 16).replace(/\d/g, 'a') + n.toString(16).padStart(8, '0') });
  for (const [name, text] of [['big.jpg', 'big'], ['small.webp', 'small'], ['broken.png', 'x'], ['movie.mp4', 'big']]) fs.writeFileSync(path.join(src, name), text);
  const out = bgs.add(['big.jpg', 'small.webp', 'broken.png', 'movie.mp4'].map((x) => path.join(src, x)));
  assert.deepEqual(out.images.map((x) => x.name), ['big', 'small']);
  assert.deepEqual(out.skipped, ['broken.png', 'movie.mp4']);
  const [big, small] = out.images;
  assert.equal(Buffer.from(bgs.dataUrl(big.id).split(',')[1], 'base64').toString(), '2560x1600');
  assert.equal(Buffer.from(bgs.dataUrl(small.id).split(',')[1], 'base64').toString(), '800x600', 'a small picture is not made bigger');
  assert.equal(Buffer.from(bgs.dataUrl(big.id, true).split(',')[1], 'base64').toString(), '320x200');
  assert.equal(bgs.dataUrl('../../data'), null, 'only ids, never paths');
  assert.equal(bgs.dataUrl('f'.repeat(24)), null, 'a missing file');
  bgs.keepOnly([small.id]);
  assert.equal(bgs.dataUrl(big.id, true), null, 'files nothing points to are removed');
  assert.ok(bgs.dataUrl(small.id, true));
  bgs.remove(small.id);
  assert.equal(bgs.dataUrl(small.id), null);
});
