'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `the rule ${selector} exists`);
  return css.slice(start, css.indexOf('}', start));
};

test('The shared size scale is defined once and the shared components use it', () => {
  for (const token of ['--r-card', '--r-ctl-lg', '--r-ctl', '--r-sm', '--ctl-h', '--ctl-h-lg', '--gap-card']) {
    assert.match(css, new RegExp(`${token}:`), `${token} is defined`);
  }
  assert.match(rule('.dialog'), /var\(--r-card\)/);
  assert.match(rule('.settings-section'), /var\(--r-card\)/);
  assert.match(rule('.btn'), /var\(--r-ctl\)/);
  assert.match(rule('.segmented'), /var\(--r-ctl\)/);
  assert.match(rule('.daytoggle button'), /var\(--r-ctl\)/);
  assert.match(css, /input\[type='text'\], input\[type='number'\][^{]*\{[^}]*var\(--r-ctl\)/, 'fields use the control corner');
});

test('Controls have hover, disabled and reduced-motion rules', () => {
  assert.match(css, /select:hover/);
  assert.match(css, /input:disabled, select:disabled/);
  assert.match(css, /\.btn:active/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before/);
});

test('Settings screen uses the shared row, switch and index components', () => {
  const settings = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'settings.js'), 'utf8');
  assert.match(settings, /WW\.onOffSwitch/);
  assert.match(settings, /settings-row/);
  assert.match(settings, /settings-nav/);
  assert.doesNotMatch(settings, /class: 'switch' },\n\s+h\('input', \{ type: 'checkbox', checked, onchange/, 'single yes/no settings are not plain checkboxes');
});
