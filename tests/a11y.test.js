'use strict';

// Readability rules from the review of 15 Oct 2026: contrast, smallest text, keyboard.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles.css'), 'utf8');
const domJs = fs.readFileSync(path.join(__dirname, '../src/renderer/dom.js'), 'utf8');

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('Text on the zone colors, the bell badge and the error toast has a contrast of at least 4.5', () => {
  const zones = [...css.matchAll(/\.z(\d)\s*\{\s*--zf:\s*(#[0-9a-f]{6});\s*--zon:\s*(#[0-9a-f]{6});/gi)];
  assert.ok(zones.length >= 15, 'every zone is defined for light, dark and automatic dark');
  for (const [, n, fill, on] of zones) assert.ok(ratio(fill, on) >= 4.5, `zone ${n}: ${fill} with ${on} is ${ratio(fill, on).toFixed(2)}`);
  assert.ok(ratio('#c62828', '#ffffff') >= 4.5, 'bell badge');
  assert.ok(ratio('#b3261e', '#ffffff') >= 4.5, 'error toast');
  assert.match(css, /\.toast\.error \{ background: #b3261e; color: #fff; \}/);
  assert.match(css, /\.check\.on \{[^}]*color: var\(--ok-on\)/);
  assert.ok(ratio('#137a4f', '#ffffff') >= 4.5, 'the tick on the light green');
  assert.ok(ratio('#4ed1a1', '#04202a') >= 4.5, 'the tick on the dark-theme green');
});

test('No text is smaller than 12px', () => {
  const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 12);
  assert.deepEqual(small.map((m) => m[0]), []);
});

test('Digits are equal-width only where numbers line up, not on the whole page', () => {
  const body = css.match(/\nbody\s*\{[^}]*\}/);
  assert.ok(body && !/tabular-nums/.test(body[0]));
  assert.match(css, /\.task-time[^{]*\{ font-variant-numeric: tabular-nums; \}/);
});

test('Arabic gets a taller line; padding that must mirror uses logical properties', () => {
  assert.match(css, /:root\[dir='rtl'\] body \{ line-height: 1\.65; \}/);
  assert.doesNotMatch(css, /\.stat-card \{[^}]*padding: 10px 18px 10px 12px/);
  assert.doesNotMatch(css, /\.popover \.popover-head h3 \{ margin: 6px 0 6px 8px/);
});

test('Dialogs keep Tab inside, and div buttons answer Enter and Space', () => {
  assert.match(domJs, /event\.key === 'Tab'/);
  assert.match(domJs, /div\[role="button"\]:not\(\.task\)/);
});
