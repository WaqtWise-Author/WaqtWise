'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTaskbarTheme } = require('../src/main/taskbar-theme');
const { DEFAULT_SETTINGS, TRAY_ICONS, validateSettings, sanitizeSettings, mergeSettings } = require('../src/core/settings');

test('The taskbar mode is the Windows mode, not the app mode', () => {
  const theme = { shouldUseDarkColors: false, shouldUseDarkColorsForSystemIntegratedUI: true };
  const taskbar = createTaskbarTheme({ nativeTheme: theme });
  assert.equal(taskbar.isDark(), true, 'dark taskbar with light apps');
  theme.shouldUseDarkColors = true;
  theme.shouldUseDarkColorsForSystemIntegratedUI = false;
  assert.equal(taskbar.isDark(), false, 'light taskbar with dark apps');
});

test('Where Electron has no Windows mode the app mode is used', () => {
  const theme = { shouldUseDarkColors: true };
  assert.equal(createTaskbarTheme({ nativeTheme: theme }).isDark(), true);
  theme.shouldUseDarkColors = false;
  assert.equal(createTaskbarTheme({ nativeTheme: theme }).isDark(), false);
});

test('The tray icon setting: normal by default, normal or monochrome only, and older or damaged data gives normal', () => {
  assert.equal(DEFAULT_SETTINGS.trayIcon, 'normal');
  assert.deepEqual(TRAY_ICONS, ['normal', 'monochrome']);
  assert.deepEqual(validateSettings({ trayIcon: 'monochrome' }), []);
  assert.ok(validateSettings({ trayIcon: 'blue' }).length);
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { trayIcon: 'monochrome' }).trayIcon, 'monochrome');
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { trayIcon: 'red' }));
  assert.equal(sanitizeSettings({ trayIcon: 'monochrome' }).trayIcon, 'monochrome');
  assert.equal(sanitizeSettings({ trayIcon: 7 }).trayIcon, 'normal');
  assert.equal(sanitizeSettings({}).trayIcon, 'normal');
});

test('The tray icon code starts no process (the Electron fuses forbid it)', () => {
  for (const f of ['taskbar-theme.js', 'tray.js']) {
    assert.ok(!/child_process|execFile|spawn/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', f), 'utf8')), f);
  }
});
