'use strict';

// Countries and cities of the world (cities of 15,000 people or more, from GeoNames; see tools/build-world-cities.py).
// The big file is read the first time it is needed, and only in the main process: the window asks for short answers.

const { t } = require('./i18n');

let data = null;
function load() {
  if (!data) data = require('./world-cities.json');
  return data;
}

// The calculation method that fits a country best. It is only a starting point: Settings lets the person change it.
const METHOD_BY_COUNTRY = {
  EG: 'egyptian', SD: 'egyptian', SY: 'egyptian', LB: 'egyptian',
  SA: 'ummAlQura', YE: 'ummAlQura',
  AE: 'dubai', QA: 'qatar', KW: 'kuwait', BH: 'kuwait', OM: 'dubai',
  TR: 'turkey', AZ: 'turkey',
  IR: 'tehran',
  PK: 'karachi', IN: 'karachi', BD: 'karachi', AF: 'karachi', LK: 'karachi', NP: 'karachi',
  ID: 'singapore', MY: 'singapore', SG: 'singapore', BN: 'singapore',
  US: 'northAmerica', CA: 'northAmerica',
};
const DEFAULT_METHOD = 'muslimWorldLeague';

function methodForCountry(code) {
  return METHOD_BY_COUNTRY[code] || DEFAULT_METHOD;
}

function isCountryCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(load().countries, code);
}

// "Mecca" and "Meccá" should find each other: lower case, no accents.
function fold(text) {
  return String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const displayNames = new Map();
function countryName(code, language) {
  const lang = language === 'ar' ? 'ar' : 'en';
  if (!displayNames.has(lang)) {
    try {
      displayNames.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
    } catch (error) {
      displayNames.set(lang, null);
    }
  }
  const names = displayNames.get(lang);
  try {
    return (names && names.of(code)) || code;
  } catch (error) {
    return code;
  }
}

// [{ code, name, cities }] in the order of the name in the chosen language.
function countryList(language) {
  const lang = language === 'ar' ? 'ar' : 'en';
  const { countries } = load();
  return Object.keys(countries)
    .map((code) => ({ code, name: countryName(code, lang), cities: countries[code].length }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

const foldedNames = new Map();
function foldedOf(code) {
  if (!foldedNames.has(code)) foldedNames.set(code, load().countries[code].map((row) => fold(row[0])));
  return foldedNames.get(code);
}

const MAX_RESULTS = 60;

// Cities of one country whose name contains the text (names that start with it first). With no text: the biggest cities.
function searchCities(code, query, limit = MAX_RESULTS) {
  if (!isCountryCode(code)) throw new Error(t('Please choose a country from the list'));
  const rows = load().countries[code];
  const names = foldedOf(code);
  const text = fold(typeof query === 'string' ? query.slice(0, 60) : '');
  const max = Math.max(1, Math.min(limit, 200));
  const starts = [];
  const inside = [];
  for (let i = 0; i < rows.length; i++) {
    if (text === '') {
      starts.push(i);
    } else {
      const at = names[i].indexOf(text);
      if (at === 0) starts.push(i);
      else if (at > 0) inside.push(i);
    }
    if (starts.length >= max && text === '') break;
  }
  const picked = starts.concat(inside).slice(0, max);
  return {
    total: text === '' ? rows.length : starts.length + inside.length,
    cities: picked.map((i) => ({ id: i, name: rows[i][0], region: rows[i][4], population: rows[i][3] })),
  };
}

// The city behind an id from searchCities, as the settings keep it.
function worldCity(code, id) {
  if (!isCountryCode(code) || !Number.isInteger(id)) throw new Error(t('Please choose a city from the list'));
  const row = load().countries[code][id];
  if (!row) throw new Error(t('Please choose a city from the list'));
  return { name: row[0].slice(0, 40), latitude: row[1], longitude: row[2], timeZone: load().zones[row[5]], region: row[4] };
}

module.exports = { METHOD_BY_COUNTRY, methodForCountry, isCountryCode, countryName, countryList, searchCities, worldCity, fold };
