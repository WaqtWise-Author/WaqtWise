'use strict';

// Opens the real screens in a headless browser, connected to the real planner service,
// so the screens can be tested and photographed without Windows or Electron.
// Not part of the installed app. Needs Playwright (only available where it is installed).

const path = require('path');
const { PlannerService, PUBLIC_METHODS } = require('../src/main/service');
const { MemoryStore } = require('../src/main/store');
const { parseDateKey } = require('../src/core/time');

function at(key, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseDateKey(key);
  d.setHours(h, m, 0, 0);
  return d;
}

// Prayer times of the spec's example day, for every date.
function exampleProvider(key) {
  return {
    fajr: at(key, '05:05'), dhuhr: at(key, '11:48'), asr: at(key, '15:14'), maghrib: at(key, '18:00'), isha: at(key, '19:20'),
  };
}

function createService(options = {}) {
  let counter = 0;
  const service = new PlannerService({
    store: new MemoryStore(),
    version: require('../package.json').version,
    now: () => options.now || at('2026-10-04', '10:00'),
    newId: () => `t${++counter}`,
    providerFactory: () => exampleProvider,
  });
  if (!options.firstRun) service.saveSettings({ welcomeShown: true });
  return service;
}

async function openApp({ playwright, service, colorScheme = 'light', width = 1100, height = 900, executablePath, keepSplash = false, stallFirstBootstrap = false }) {
  const browser = await playwright.chromium.launch({ executablePath });
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const calls = [];
  const stall = { first: stallFirstBootstrap };
  await page.exposeFunction('__invoke', async (method, args) => {
    if (!PUBLIC_METHODS.includes(method)) throw new Error(`Not allowed: ${method}`);
    calls.push(method);
    if (method === 'bootstrap' && stall.first) { stall.first = false; await new Promise(() => {}); } // the main process never answers
    return JSON.parse(JSON.stringify(await service[method](...args)));
  });
  // The pictures behind the full-screen alert: the main process copies files; here the list lives in the real service and
  // the pictures themselves are drawn in the page (a small landscape in two colors).
  await page.exposeFunction('__pictures', async (op, arg) => {
    if (op === 'add') service.addAlertImages(arg);
    if (op === 'remove') service.removeAlertImage(arg);
    return JSON.parse(JSON.stringify(service.getSettings().alertBackground.images));
  });
  await page.addInitScript(({ splashMs, startMs }) => {
    if (startMs) window.WW_START_TIMEOUT_MS = startMs; // the real wait for the first answer is 15 seconds
    if (splashMs !== null) window.WW_SPLASH_MS = splashMs; // the real start-up splash lasts 3 seconds; the checks do not wait for it
    window.__exports = [];
    window.api = {
      call: (method, ...args) => window.__invoke(method, args),
      exportData: async () => { window.__exports.push('export'); return { ok: true }; },
      importData: async () => ({ canceled: true }),
      testNotification: async () => { window.__exports.push('test-notification'); return { ok: true }; },
      previewAlert: async () => { window.__exports.push('preview-alert'); return { ok: true }; },
      getPauseState: async () => ({ reminders: null, routines: null }),
      openLogsFolder: async () => { (window.__calls = window.__calls || []).push('openLogsFolder'); return { ok: true }; },
      getAlertImages: async () => window.__pictureList(await window.__pictures('list')),
      addAlertImages: async () => {
        const n = (window.__pictureCount = (window.__pictureCount || 0) + 2);
        const made = [{ id: `${'a'.repeat(22)}${String(n - 1).padStart(2, '0')}`, name: 'Sunset' }, { id: `${'b'.repeat(22)}${String(n).padStart(2, '0')}`, name: 'Hills' }];
        const list = await window.__pictures('add', made);
        return { added: 2, skipped: 0, images: window.__pictureList(list) };
      },
      removeAlertImage: async (id) => window.__pictureList(await window.__pictures('remove', id)),
      getAlertPreviewPicture: async () => null,
      resumePause: async () => ({ reminders: null, routines: null }),
      on: (channel, cb) => { (window.__handlers = window.__handlers || {})[channel] = cb; },
    };
    window.__pictureList = (list) => list.map((x) => ({ ...x, thumb: window.__samplePicture(x.name === 'Hills' ? ['#0e7490', '#67e8f9'] : ['#1e3a8a', '#f59e0b']) }));
    window.__samplePicture = ([top, bottom]) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${top}'/><stop offset='1' stop-color='${bottom}'/></linearGradient></defs><rect width='320' height='200' fill='url(#g)'/><circle cx='220' cy='110' r='28' fill='#fde68a'/><path d='M0 150 L80 100 L150 140 L230 90 L320 130 L320 200 L0 200Z' fill='#1f1235'/></svg>`)}`;
  }, { splashMs: keepSplash ? null : 300, startMs: stallFirstBootstrap ? 400 : null });
  const file = path.resolve(__dirname, '../src/renderer/index.html');
  await page.goto(`file://${file}`);
  if (stallFirstBootstrap) return { browser, context, page, errors, calls };
  await page.waitForSelector('.zone');
  if (!keepSplash) await page.waitForSelector('#splash', { state: 'detached' }); // the real splash lasts 3 seconds; here it is cut to 0.3 s
  return { browser, context, page, errors, calls };
}

// Opens the full-screen reminder page on its own, with a stand-in for the main process.
// Call page.evaluate(() => window.__render(state)) to show something; button presses are collected in window.__actions.
async function openAlertPage({ playwright, executablePath, width = 1920, height = 1080 }) {
  const browser = await playwright.chromium.launch({ executablePath });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => {
    window.__actions = [];
    window.alertApi = {
      onRender: (cb) => { window.__render = cb; },
      ready: () => { window.__ready = true; },
      action: (type, itemId) => window.__actions.push([type, itemId]),
    };
  });
  await page.goto(`file://${path.resolve(__dirname, '../src/renderer/alert.html')}`);
  await page.waitForFunction(() => window.__ready === true);
  return { browser, page, errors };
}

module.exports = { createService, openApp, openAlertPage, exampleProvider, at };
