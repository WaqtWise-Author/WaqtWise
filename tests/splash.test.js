'use strict';

// The start-up splash (1.7.1): drawn in the saved theme and language from its first frame, still (no fade or slide),
// with the logo loaded with the page.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', file), 'utf8');
const I18N = require('../src/core/i18n');
require('../src/core/i18n-ar');

function runBoot(boot) {
  const el = (text, label) => {
    const attrs = { 'aria-label': label };
    return { textContent: text, dataset: {}, getAttribute: (n) => attrs[n] || null, setAttribute: (n, v) => { attrs[n] = v; }, attrs };
  };
  const slogan = el('Make every waqt count, wisely.');
  const splash = el('', 'WaqtWise');
  const root = { dataset: {}, lang: 'en', dir: 'ltr' };
  const document = {
    documentElement: root,
    querySelectorAll: (selector) => (selector === '#splash [data-t]' ? [slogan] : selector === '#splash [data-t-label]' ? [splash] : []),
  };
  vm.runInNewContext(read('splash-boot.js'), { window: { api: boot === undefined ? undefined : { boot }, WWI18n: I18N }, document });
  return { slogan, splash, root };
}

test('splash boot: the saved theme and language are applied before the first frame', () => {
  const ar = runBoot({ theme: 'dark', language: 'ar' });
  assert.equal(ar.root.dataset.theme, 'dark');
  assert.equal(ar.root.lang, 'ar');
  assert.equal(ar.root.dir, 'rtl');
  assert.notEqual(ar.slogan.textContent, 'Make every waqt count, wisely.', 'the slogan is in Arabic at once');
  assert.equal(ar.slogan.dataset.tKey, 'Make every waqt count, wisely.', 'the English text is kept for switching the language later');
  I18N.setLanguage('en');
  const en = runBoot({ theme: 'system', language: 'en' });
  assert.equal(en.root.dataset.theme, undefined, 'system: the page follows Windows by itself');
  assert.equal(en.root.dir, 'ltr');
  assert.equal(en.slogan.textContent, 'Make every waqt count, wisely.');
});

test('splash boot: without boot information nothing changes (tests, a page opened alone)', () => {
  const none = runBoot(undefined);
  assert.deepEqual(none.root, { dataset: {}, lang: 'en', dir: 'ltr' });
  assert.equal(none.slogan.dataset.tKey, undefined);
});

test('splash page: texts and the logo are in place, nothing fades or slides in', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('rel="preload" as="image" href="logo-large.png"'), 'the logo is fetched with the page');
  assert.ok(head.indexOf('i18n.js') > 0 && head.indexOf('i18n-ar.js') > head.indexOf('i18n.js'), 'the texts are there before the splash script');
  assert.ok(/<img class="splash-logo" src="logo-large.png" width="460" height="460" decoding="sync"/.test(html), 'size known, decoded with the page');
  assert.ok(html.indexOf('src="splash-boot.js"') > html.indexOf('id="splash"') && html.indexOf('src="splash-boot.js"') < html.indexOf('src="dom.js"'));
  assert.equal(html.split('i18n.js"></script>').length - 1, 1, 'loaded once');
  const css = read('styles.css');
  assert.match(css, /#splash \.splash-logo, #splash \.splash-title, #splash \.splash-slogan, #splash \.splash-strip \{ animation: none; \}/);
  assert.ok(html.includes('data-t') && html.includes('id="splash"'));
});
