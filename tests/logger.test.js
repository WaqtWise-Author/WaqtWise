'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger } = require('../src/main/logger');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ww-log-'));
}

test('The log file gets timestamped lines, errors with a short stack, and objects as JSON', () => {
  const dir = tmp();
  const log = createLogger({ fs, dir: path.join(dir, 'logs'), context: { version: '9.9.9' }, now: () => new Date('2026-11-08T10:00:00Z') });
  log.header();
  log.info('Page loaded', { code: 1 });
  log.error('Failed', new Error('boom'));
  const text = fs.readFileSync(log.file, 'utf8');
  assert.match(text, /^2026-11-08T10:00:00.000Z INFO Session start \{"version":"9.9.9"\}/);
  assert.match(text, /INFO Page loaded \{"code":1\}/);
  assert.match(text, /ERROR Failed Error: boom/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('The log is rotated and capped, so it cannot grow without end', () => {
  const dir = tmp();
  const log = createLogger({ fs, dir, maxBytes: 300, maxFiles: 3 });
  for (let i = 0; i < 60; i += 1) log.info(`line ${i} ${'x'.repeat(30)}`);
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, ['waqtwise.log', 'waqtwise.log.1', 'waqtwise.log.2']);
  for (const f of files) assert.ok(fs.statSync(path.join(dir, f)).size <= 300);
  assert.match(fs.readFileSync(path.join(dir, 'waqtwise.log'), 'utf8'), /line 59/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Long texts are cut, and a log that cannot be written never throws', () => {
  const dir = tmp();
  const log = createLogger({ fs, dir });
  log.info('y'.repeat(5000));
  assert.ok(fs.readFileSync(log.file, 'utf8').length < 700);
  const blocked = path.join(dir, 'file');
  fs.writeFileSync(blocked, 'not a folder');
  const broken = createLogger({ fs, dir: path.join(blocked, 'logs') });
  assert.doesNotThrow(() => broken.error('nothing can be written here'));
  fs.rmSync(dir, { recursive: true, force: true });
});
