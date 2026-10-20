'use strict';

// Takes the pictures used by the README, the user guide and the website, from the REAL screens with made-up example
// tasks. Not part of the installed app. Needs Playwright (see tools/ui-check.js for how it is found).
//
//   export PLAYWRIGHT_PATH=$(ls -d $(npm root -g)/playwright* | head -1)
//   OUT=/tmp/shots node tools/make-screenshots.js      (then tools/shots-to-webp.py turns them into docs/images)

const fs = require('fs');
const path = require('path');
const { createService, openApp, openAlertPage, at } = require('./ui-harness');

const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const OUT = process.env.OUT || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const DAY = '2026-10-10'; // a Saturday
const fixed = (time) => ({ mode: 'fixed', time });
const daily = (startDate = '2026-09-01') => ({ startDate, frequency: 'daily', interval: 1 });

function makeTask(service, extra) {
  return service.saveTask({
    mode: 'create',
    form: {
      start: fixed('09:00'), durationMinutes: 30, date: DAY, recurrence: null, reminders: { enabled: true, offsets: [] },
      priority: 'Medium', categoryId: null, notes: '', ...extra,
    },
  }).taskId;
}

// A normal Saturday for an English-speaking user.
function seedEnglish(service) {
  service.saveSettings({ taskInfo: { repeat: true, startRule: true, reminders: false } });
  const done = [];
  done.push(makeTask(service, { title: 'Morning walk', start: fixed('06:00'), durationMinutes: 30, categoryId: 'cat-health', recurrence: daily() }));
  done.push(makeTask(service, { title: 'Read Quran', start: { mode: 'prayer', prayer: 'fajr', direction: 'after', minutes: 15 }, durationMinutes: 20, categoryId: 'cat-worship', recurrence: daily() }));
  done.push(makeTask(service, { title: 'Plan the day', start: fixed('07:30'), durationMinutes: 15, categoryId: 'cat-personal' }));
  done.push(makeTask(service, { title: 'Team stand-up', start: fixed('09:30'), durationMinutes: 20, categoryId: 'cat-work' }));
  done.push(makeTask(service, { title: 'Write the project report', start: fixed('10:00'), durationMinutes: 90, priority: 'High', categoryId: 'cat-work', notes: 'Numbers from the Q3 sheet' }));
  done.push(makeTask(service, { title: 'Lunch and a short rest', start: fixed('12:30'), durationMinutes: 40, categoryId: 'cat-personal' }));
  makeTask(service, { title: 'Study SQL', start: fixed('13:30'), durationMinutes: 60, priority: 'High', categoryId: 'cat-study', recurrence: { startDate: '2026-09-01', frequency: 'weekly', interval: 1, weekdays: [1, 3, 6] }, reminders: { enabled: true, offsets: [15, 0] } });
  makeTask(service, { title: 'Dentist appointment', start: fixed('14:00'), durationMinutes: 30, priority: 'High', categoryId: 'cat-health' });
  makeTask(service, { title: 'Read after Asr', start: { mode: 'prayer', prayer: 'asr', direction: 'after', minutes: 10 }, durationMinutes: 20, categoryId: 'cat-worship', recurrence: daily() });
  makeTask(service, { title: 'Gym', start: fixed('16:30'), durationMinutes: 60, priority: 'Low', categoryId: 'cat-health', recurrence: { startDate: '2026-09-01', frequency: 'weekly', interval: 1, weekdays: [0, 2, 4, 6] } });
  makeTask(service, { title: 'Buy groceries', start: fixed('17:30'), durationMinutes: 25, categoryId: 'cat-personal' });
  const dinner = makeTask(service, { title: 'Family dinner', start: fixed('20:00'), durationMinutes: 60, categoryId: 'cat-personal', reminders: { enabled: true, offsets: [0], fullScreen: true } });
  makeTask(service, { title: 'Review tomorrow', start: { mode: 'task', taskId: dinner, direction: 'after', point: 'end', minutes: 15, fallbackTime: '21:30' }, durationMinutes: 15, categoryId: 'cat-study' });
  for (const taskId of done) service.setDone({ taskId, dateKey: DAY, done: true });
}

// The same idea, written the way an Arabic-speaking user would.
function seedArabic(service) {
  service.saveSettings({ language: 'ar', taskInfo: { repeat: true, startRule: true, reminders: false } });
  const done = [];
  done.push(makeTask(service, { title: 'مشي الصباح', start: fixed('06:00'), durationMinutes: 30, categoryId: 'cat-health', recurrence: daily() }));
  done.push(makeTask(service, { title: 'قراءة القرآن', start: { mode: 'prayer', prayer: 'fajr', direction: 'after', minutes: 15 }, durationMinutes: 20, categoryId: 'cat-worship', recurrence: daily() }));
  done.push(makeTask(service, { title: 'تخطيط اليوم', start: fixed('07:30'), durationMinutes: 15, categoryId: 'cat-personal' }));
  done.push(makeTask(service, { title: 'اجتماع الفريق', start: fixed('09:30'), durationMinutes: 20, categoryId: 'cat-work' }));
  done.push(makeTask(service, { title: 'كتابة تقرير المشروع', start: fixed('10:00'), durationMinutes: 90, priority: 'High', categoryId: 'cat-work' }));
  done.push(makeTask(service, { title: 'الغداء والراحة', start: fixed('12:30'), durationMinutes: 40, categoryId: 'cat-personal' }));
  makeTask(service, { title: 'مذاكرة قواعد البيانات', start: fixed('13:30'), durationMinutes: 60, priority: 'High', categoryId: 'cat-study', recurrence: { startDate: '2026-09-01', frequency: 'weekly', interval: 1, weekdays: [1, 3, 6] } });
  makeTask(service, { title: 'موعد الطبيب', start: fixed('14:00'), durationMinutes: 30, priority: 'High', categoryId: 'cat-health' });
  makeTask(service, { title: 'ورد بعد العصر', start: { mode: 'prayer', prayer: 'asr', direction: 'after', minutes: 10 }, durationMinutes: 20, categoryId: 'cat-worship', recurrence: daily() });
  makeTask(service, { title: 'النادي الرياضي', start: fixed('16:30'), durationMinutes: 60, priority: 'Low', categoryId: 'cat-health' });
  makeTask(service, { title: 'شراء الاحتياجات', start: fixed('17:30'), durationMinutes: 25, categoryId: 'cat-personal' });
  makeTask(service, { title: 'عشاء العائلة', start: fixed('20:00'), durationMinutes: 60, categoryId: 'cat-personal' });
  for (const taskId of done) service.setDone({ taskId, dateKey: DAY, done: true });
}

// A settings section (cut at `max` pixels), or a dialog.
async function section(page, selector, name, max = 1100) {
  const box = await page.locator(selector).boundingBox();
  const y = await page.evaluate(() => window.scrollY);
  await page.screenshot({
    path: path.join(OUT, `${name}.png`), fullPage: true,
    clip: { x: Math.max(0, box.x), y: box.y + y, width: box.width, height: Math.min(box.height, max) },
  });
  console.log('  ', name);
}

const shot = async (page, name, options = {}) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...options });
  console.log('  ', name);
};

async function openMenu(page, label) {
  await page.click('#menu-btn');
  await page.click(`#drawer .drawer-item:has-text("${label}")`);
}

(async () => {
  // ---- Daily View, light, dark, Arabic -------------------------------------------------------------------
  {
    const service = createService({ now: at(DAY, '13:10') });
    seedEnglish(service);
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 1000 });
    await app.page.waitForSelector('.zone');
    await shot(app.page, 'daily-light', { fullPage: true });
    await app.page.evaluate(() => window.scrollTo(0, 0));
    await shot(app.page, 'daily-light-top');

    // task details
    await app.page.click('.task:has-text("Study SQL")');
    await app.page.waitForSelector('.details-dialog');
    await section(app.page, '.details-dialog', 'task-details');
    await app.page.keyboard.press('Escape');

    // the form: fixed time, relative to a prayer, relative to a task; repeat
    await app.page.setViewportSize({ width: 1280, height: 1800 });
    await app.page.click('#add-btn');
    await app.page.fill('#f-title', 'Read Surah Al-Kahf');
    await app.page.waitForSelector('.dialog');
    await section(app.page, '.dialog', 'task-form', 1500);
    await app.page.click('button:text-is("Relative to Prayer")');
    await app.page.waitForTimeout(150);
    await section(app.page, '.dialog', 'task-form-prayer', 520);
    await app.page.click('button:text-is("Relative to Task")');
    await app.page.waitForTimeout(150);
    await section(app.page, '.dialog', 'task-form-relative', 560);
    await app.page.click('button:text-is("Fixed Time")');
    await app.page.click('button:text-is("Repeats")');
    await app.page.selectOption('select[aria-label="Repeat unit"]', 'weekly');
    await app.page.waitForSelector('.preview-list');
    await section(app.page, '.dialog', 'task-form-repeat', 1700);
    await app.page.keyboard.press('Escape');
    await app.page.waitForSelector('.dialog', { state: 'detached' }).catch(() => {});
    await app.page.setViewportSize({ width: 1280, height: 1000 });

    // a missed reminder in the bell is shown by the real app; the menu is a drawer
    await app.page.click('#menu-btn');
    await app.page.waitForSelector('#drawer .drawer-item');
    await shot(app.page, 'menu');
    await app.page.keyboard.press('Escape');

    // Settings
    await openMenu(app.page, 'Settings');
    await app.page.waitForSelector('#settings-2');
    await app.page.selectOption('#settings-country', 'SA');
    await app.page.waitForSelector('.city-results .city-result');
    await app.page.locator('#settings-2').scrollIntoViewIfNeeded();
    await section(app.page, '#settings-2', 'settings-prayer-times');
    await app.page.locator('#settings-5').scrollIntoViewIfNeeded();
    await section(app.page, '#settings-5', 'settings-daily-view');
    await app.page.locator('#settings-6').scrollIntoViewIfNeeded();
    await section(app.page, '#settings-6', 'settings-fullscreen');
    await app.browser.close();
  }
  {
    const service = createService({ now: at(DAY, '13:10') });
    seedEnglish(service);
    service.saveSettings({ theme: 'dark' });
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 1000, colorScheme: 'dark' });
    await app.page.waitForSelector('.zone');
    await shot(app.page, 'daily-dark-top');
    await app.browser.close();
  }
  {
    const service = createService({ now: at(DAY, '13:10') });
    seedArabic(service);
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 1000 });
    await app.page.waitForSelector('.zone');
    await shot(app.page, 'daily-arabic', { fullPage: true });
    await shot(app.page, 'daily-arabic-top');
    await app.browser.close();
  }

  // ---- Free To-Do list ------------------------------------------------------------------------------------
  {
    const service = createService({ now: at(DAY, '13:10') });
    const free = (title, extra = {}) => service.saveFreeTask({ form: { title, ...extra } });
    free('Renew the car insurance', { priority: 'High', durationMinutes: 30, categoryId: 'cat-personal', notes: 'Call before the end of the month' });
    free('Fix the bike tyre', { priority: 'Medium', durationMinutes: 45, categoryId: 'cat-personal' });
    free('Read the new chapter', { priority: 'Low', durationMinutes: 40, categoryId: 'cat-study' });
    free('Send the invoice to the client', { priority: 'High', durationMinutes: 15, categoryId: 'cat-work' });
    free('Book the flight tickets', { priority: 'Medium', categoryId: 'cat-personal' });
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 900 });
    await openMenu(app.page, 'Free To-Do list');
    await app.page.waitForSelector('.free-row');
    await shot(app.page, 'free-list');
    await app.browser.close();
  }

  // ---- Routines ----------------------------------------------------------------------------------------------
  {
    const service = createService({ now: at(DAY, '13:10') });
    const routine = (form) => service.saveRoutine({ form: { notes: '', categoryId: null, weekdays: [0, 1, 2, 3, 4, 5, 6], notification: true, fullScreen: false, ...form } });
    const water = routine({ title: 'Drink a glass of water', from: '08:00', to: '20:00', hours: 2, minutes: 30, categoryId: 'cat-health' });
    routine({ title: 'Stand up and stretch', from: '09:00', to: '17:00', hours: 1, minutes: 0, weekdays: [1, 2, 3, 4, 5, 6], fullScreen: true, categoryId: 'cat-work' });
    service.setRoutineSlotDone({ id: water.id, dateKey: DAY, slot: 480, done: true });
    service.setRoutineSlotDone({ id: water.id, dateKey: DAY, slot: 630, done: true });
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 900 });
    await openMenu(app.page, 'Routines');
    await app.page.waitForSelector('.routine-card');
    await shot(app.page, 'routines');
    await app.browser.close();
  }

  // ---- Statistics ------------------------------------------------------------------------------------------
  {
    const service = createService({ now: at(DAY, '20:30') });
    const study = makeTask(service, { title: 'Study SQL', start: fixed('13:30'), durationMinutes: 60, categoryId: 'cat-study', date: null, recurrence: daily('2026-07-15') });
    const walk = makeTask(service, { title: 'Morning walk', start: fixed('06:00'), durationMinutes: 30, categoryId: 'cat-health', date: null, recurrence: daily('2026-07-15') });
    const quran = makeTask(service, { title: 'Read Quran', start: { mode: 'prayer', prayer: 'fajr', direction: 'after', minutes: 15 }, durationMinutes: 20, categoryId: 'cat-worship', date: null, recurrence: daily('2026-07-15') });
    const report = makeTask(service, { title: 'Weekly report', start: fixed('10:00'), durationMinutes: 60, categoryId: 'cat-work', date: null, recurrence: { startDate: '2026-07-15', frequency: 'weekly', interval: 1, weekdays: [4] } });
    let i = 0;
    for (const d = new Date(2026, 6, 15); d <= new Date(2026, 9, 10); d.setDate(d.getDate() + 1), i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const grow = Math.min(1, 0.55 + i / 160); // the habit gets stronger with time
      const pick = (n) => ((i * 7 + n * 13) % 100) / 100 < grow;
      if (pick(1)) service.setDone({ taskId: study, dateKey: key, done: true });
      if (pick(2)) service.setDone({ taskId: walk, dateKey: key, done: true });
      if (pick(3)) service.setDone({ taskId: quran, dateKey: key, done: true });
      if (d.getDay() === 4 && pick(4)) service.setDone({ taskId: report, dateKey: key, done: true });
    }
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 1000 });
    await openMenu(app.page, 'Statistics');
    await app.page.waitForSelector('.stats-kpis');
    await app.page.click('button[data-range="month"]');
    await app.page.waitForSelector('.stats-kpis');
    await shot(app.page, 'statistics', { fullPage: true });
    await shot(app.page, 'statistics-top');
    await app.browser.close();
  }

  // ---- Welcome screen -------------------------------------------------------------------------------------
  {
    const service = createService({ firstRun: true });
    const app = await openApp({ playwright, service, executablePath, width: 1280, height: 860 });
    await app.page.waitForSelector('.welcome');
    await app.page.selectOption('#welcome-country', 'GB');
    await app.page.fill('input[data-city-search="GB"]', 'man');
    await app.page.waitForFunction(() => /Man/.test(document.querySelector('.city-results .city-name').textContent));
    await shot(app.page, 'welcome');
    await app.browser.close();
  }

  // ---- Full-screen reminder ------------------------------------------------------------------------------
  {
    const alert = await openAlertPage({ playwright, executablePath, width: 1600, height: 900 });
    const { DEFAULT_ALERT_APPEARANCE: look } = require('../src/core');
    await alert.page.evaluate(([st]) => window.__render(st), [{
      items: [{
        id: 'x', taskId: 't', dateKey: DAY, title: 'Study SQL', notes: 'Chapter 7: joins and subqueries', startLabel: '1:30 PM', endLabel: '2:30 PM',
        durationLabel: '1h', zoneName: 'Dhuhr → Asr', zoneIndex: 2, categoryName: 'Study', categoryColor: '#8b5cf6', priority: 'High', snoozed: false,
      }],
      appearance: JSON.parse(JSON.stringify(look)), snoozeMinutes: 5, guardMs: 0,
    }]);
    await alert.page.waitForSelector('.alert-actions button');
    await alert.page.waitForTimeout(300);
    await shot(alert.page, 'fullscreen-alert');
    await alert.browser.close();
  }
  console.log('done:', OUT);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
