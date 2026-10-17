'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PlannerService, PUBLIC_METHODS, checkRequest } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const {
  countryList, searchCities, worldCity, methodForCountry, isCountryCode, METHOD_KEYS, validateCustomCity, mergeSettings, DEFAULT_SETTINGS,
  sanitizeSettings, fold,
} = require('../src/core');
const world = require('../src/core/world-cities.json');
const { at, constantProvider } = require('./helpers');

function service(factory) {
  return new PlannerService({ store: new MemoryStore(), now: () => at('2026-10-04', '09:00'), providerFactory: factory || (() => constantProvider) });
}

test('The world list: every country and city is complete and usable', () => {
  const codes = Object.keys(world.countries);
  assert.ok(codes.length >= 200, `${codes.length} countries`);
  let total = 0;
  for (const code of codes) {
    assert.match(code, /^[A-Z]{2}$/);
    let last = Infinity;
    for (const [id, row] of world.countries[code].entries()) {
      total++;
      const [name, lat, lon, pop, , zone] = row;
      assert.ok(name && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180, `${code} #${id}`);
      assert.ok(pop >= world.minPopulation && pop <= last, 'biggest first');
      last = pop;
      assert.ok(Number.isInteger(zone) && world.zones[zone], 'has a time zone');
    }
  }
  assert.ok(total >= 25000, `${total} cities`);
  for (const zone of world.zones) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: zone }), zone);
});

test('Every city can be saved as the city in use (name length, coordinates and time zone are accepted)', () => {
  for (const code of Object.keys(world.countries)) {
    const rows = world.countries[code];
    for (let id = 0; id < rows.length; id++) {
      const c = worldCity(code, id);
      const errors = validateCustomCity(c);
      if (errors.length) assert.fail(`${code} #${id} ${c.name}: ${errors.join('; ')}`);
    }
  }
});

test('Known cities sit in the right time zone', () => {
  const zoneOf = (cc, name) => {
    const { cities } = searchCities(cc, name, 200);
    const hit = cities.find((c) => c.name === name);
    assert.ok(hit, `${name} is listed`);
    return worldCity(cc, hit.id).timeZone;
  };
  assert.equal(zoneOf('SA', 'Riyadh'), 'Asia/Riyadh');
  assert.equal(zoneOf('US', 'Chicago'), 'America/Chicago');
  assert.equal(zoneOf('US', 'Denver'), 'America/Denver');
  assert.equal(zoneOf('US', 'Honolulu'), 'Pacific/Honolulu');
  assert.equal(zoneOf('GB', 'London'), 'Europe/London');
  assert.equal(zoneOf('RU', 'Moscow'), 'Europe/Moscow');
  assert.equal(zoneOf('RU', 'Vladivostok'), 'Asia/Vladivostok');
  assert.equal(zoneOf('AU', 'Perth'), 'Australia/Perth');
  assert.equal(zoneOf('TR', 'Istanbul'), 'Europe/Istanbul');
});

test('The country list follows the language', () => {
  const en = countryList('en');
  const ar = countryList('ar');
  assert.equal(en.length, ar.length);
  assert.equal(en.find((c) => c.code === 'SA').name, 'Saudi Arabia');
  assert.equal(ar.find((c) => c.code === 'SA').name, 'المملكة العربية السعودية');
  assert.deepEqual(en.map((c) => c.name), [...en.map((c) => c.name)].sort((a, b) => a.localeCompare(b, 'en')));
  assert.ok(en.every((c) => c.cities > 0 && isCountryCode(c.code)));
});

test('Searching: accents and capitals do not matter, names that start with the text come first, the answer is short', () => {
  assert.equal(fold('Ṭanṭā'), 'tanta');
  const top = searchCities('SA', '');
  assert.equal(top.cities[0].name, 'Jeddah');
  assert.equal(top.total, world.countries.SA.length);
  const mak = searchCities('SA', ' MAKK ');
  assert.equal(mak.cities[0].name, 'Makkah');
  const big = searchCities('IN', 'a');
  assert.ok(big.cities.length <= 60 && big.total > 60);
  const starts = searchCities('IN', 'ban').cities.map((c) => fold(c.name));
  const firstInside = starts.findIndex((n) => !n.startsWith('ban'));
  assert.ok(firstInside === -1 || starts.slice(0, firstInside).every((n) => n.startsWith('ban')));
  assert.equal(searchCities('SA', 'zzzzzzzz').cities.length, 0);
  assert.throws(() => searchCities('XX', 'a'));
  assert.equal(searchCities('SA', 'a', 0).cities.length, 1, 'a silly limit is corrected');
});

test('The calculation method follows the country, and is always one the app knows', () => {
  for (const code of Object.keys(world.countries)) assert.ok(METHOD_KEYS.includes(methodForCountry(code)), code);
  assert.equal(methodForCountry('SA'), 'ummAlQura');
  assert.equal(methodForCountry('EG'), 'egyptian');
  assert.equal(methodForCountry('US'), 'northAmerica');
  assert.equal(methodForCountry('TR'), 'turkey');
  assert.equal(methodForCountry('ID'), 'singapore');
  assert.equal(methodForCountry('FR'), 'muslimWorldLeague');
});

test('Choosing a city: it becomes the city in use with its time zone and the country\'s method', () => {
  const s = service();
  const { cities } = searchCities('SA', 'Riyadh');
  const result = s.chooseWorldCity({ country: 'SA', id: cities[0].id });
  assert.equal(result.method, 'ummAlQura');
  const settings = s.getSettings();
  assert.equal(settings.useCustomCity, true);
  assert.equal(settings.countryCode, 'SA');
  assert.equal(settings.method, 'ummAlQura');
  assert.equal(settings.customCity.name, 'Riyadh');
  assert.equal(settings.customCity.timeZone, 'Asia/Riyadh');
  assert.equal(s.cityInfo().name, 'Riyadh');
  assert.equal(s.bootstrap().city.name, 'Riyadh');
  assert.ok(s.bootstrap().countries.some((c) => c.code === 'SA' && c.name === 'Saudi Arabia'));
  // back to Egypt's list
  s.saveSettings({ useCustomCity: false, cityName: 'Alexandria', countryCode: 'EG' });
  assert.equal(s.cityInfo().custom, false);
});

test('Choosing a city: wrong requests are refused and change nothing', () => {
  const s = service();
  for (const bad of [{ country: 'XX', id: 0 }, { country: 'SA', id: -1 }, { country: 'SA', id: 1e9 }, { country: 'SA', id: '0' }, { country: 'SA' }, {}, undefined]) {
    assert.throws(() => s.chooseWorldCity(bad));
  }
  assert.equal(s.getSettings().useCustomCity, false);
  assert.equal(s.getSettings().countryCode, 'EG');
});

test('Choosing a city where the prayers cannot be worked out is refused with a clear message and nothing changes', () => {
  const { resolveCity } = require('../src/core');
  // Like the real calculation in the middle of a polar summer: no sunset, so no usable times.
  const factory = (settings) => (key) => (resolveCity(settings).latitude > 66
    ? { fajr: new Date(NaN), dhuhr: new Date(NaN), asr: new Date(NaN), maghrib: new Date(NaN), isha: new Date(NaN) }
    : constantProvider(key));
  const s = service(factory);
  const north = searchCities('NO', 'Troms').cities.find((c) => c.name.startsWith('Troms'));
  assert.ok(north, 'Tromsø is in the list');
  assert.throws(() => s.chooseWorldCity({ country: 'NO', id: north.id }), /Tromsø.*too far north or south/);
  assert.equal(s.getSettings().useCustomCity, false);
  assert.equal(s.getSettings().countryCode, 'EG');
  const oslo = searchCities('NO', 'Oslo').cities[0];
  s.chooseWorldCity({ country: 'NO', id: oslo.id });
  assert.equal(s.getSettings().customCity.name, 'Oslo');
});

test('The window may ask for the countries and cities, and nothing else new', () => {
  for (const name of ['getCountries', 'searchCities', 'chooseWorldCity']) assert.ok(PUBLIC_METHODS.includes(name));
  assert.doesNotThrow(() => checkRequest('searchCities', [{ country: 'SA', query: 'a' }]));
});

test('Settings: country code is a known country, or empty for a city typed by hand', () => {
  assert.equal(DEFAULT_SETTINGS.countryCode, 'EG');
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { countryCode: 'SA' }).countryCode, 'SA');
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { countryCode: null }).countryCode, null);
  for (const bad of ['XX', 'sa', 5, '']) assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { countryCode: bad }));
  const RIYADH = { name: 'Riyadh', latitude: 24.7136, longitude: 46.6753, timeZone: 'Asia/Riyadh' };
  // a city typed in before this version has no country: it stays "typed by hand"
  const old = sanitizeSettings({ useCustomCity: true, customCity: RIYADH });
  assert.equal(old.countryCode, null);
  assert.equal(sanitizeSettings({ useCustomCity: true, customCity: RIYADH, countryCode: 'SA' }).countryCode, 'SA');
  assert.equal(sanitizeSettings({ countryCode: 'ZZ' }).countryCode, 'EG', 'a bad saved value falls back');
});
