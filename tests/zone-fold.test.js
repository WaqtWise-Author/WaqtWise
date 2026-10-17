'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PlannerService } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { DEFAULT_SETTINGS, mergeSettings, sanitizeSettings } = require('../src/core');
const { at, constantProvider } = require('./helpers');

function make(nowText) {
  let n = 0;
  return new PlannerService({ store: new MemoryStore(), now: () => at('2026-10-10', nowText), newId: () => `t${++n}`, providerFactory: () => constantProvider });
}

test('zones that are over are marked on today only', () => {
  const service = make('15:30');
  const today = service.getDay('2026-10-10');
  const past = today.zones.map((z) => z.isPast);
  assert.deepEqual(past.slice(0, 2), [true, true], 'Fajr and Dhuhr zones are over');
  assert.equal(today.zones.find((z) => z.isCurrent).isPast, false);
  assert.ok(service.getDay('2026-10-09').zones.every((z) => z.isPast === false), 'another day has no past zones');
  assert.ok(service.getDay('2026-10-11').zones.every((z) => z.isPast === false));
});

test('Collapse empty and finished zones is on by default, can be switched off, and must be on or off', () => {
  assert.equal(DEFAULT_SETTINGS.collapseZones, true);
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { collapseZones: false }).collapseZones, false);
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { collapseZones: 'full' }));
  assert.equal(sanitizeSettings({ collapseZones: 'x' }).collapseZones, true, 'a bad saved value falls back to the default');
  assert.equal(sanitizeSettings({ collapseZones: false }).collapseZones, false);
});
