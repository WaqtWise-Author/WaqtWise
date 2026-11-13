'use strict';

// Checks the Electron main process wiring without Electron: a stand-in "electron" (and a stand-in
// prayer library) are supplied, so window, tray, background running, start with Windows, saved data,
// IPC, export/import and the notification-button links can all be exercised here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

const { at } = require('./helpers');

const MAIN_PATH = require.resolve('../src/main/main.js');

// A message from a full-screen reminder window (the top of the page, showing alert.html).
function alertEvent(win) {
  return { sender: win.webContents, senderFrame: { url: pathToFileURL(win.file).href, parent: null } };
}

// The pause lengths in the tray: after Isha (until Fajr) there is no "Until the Next Prayer".
function pauseLabels(app) {
  const service = app.main.getService();
  const prayer = service.nextPrayerMs() === service.nextFajrMs() ? [] : ['Until the Next Prayer'];
  return ['For 30 Minutes', 'For 1 Hour', 'For 2 Hours', ...prayer, 'Until the Next Fajr'];
}

// ---- Stand-ins ------------------------------------------------------------------------------------------

function makeFakeElectron({ userData, lock = true, saveTo, openFrom, packaged = false, displays, loadFileError = null }) {
  const fake = {
    loadFileError,
    appId: null,
    quitCalled: false,
    appEvents: {},
    ipc: {},
    ipcOn: {},
    windows: [],
    notifications: [],
    trays: [],
    messageBoxes: [],
    nextBox: { response: 0, checkboxChecked: false },
    loginSettings: [],
    powerEvents: {},
    dialogs: { saveTo, openFrom },
    displays: displays || [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
  };

  fake.app = {
    getVersion: () => require('../package.json').version,
    isPackaged: packaged,
    setAppUserModelId: (id) => { fake.appId = id; },
    requestSingleInstanceLock: () => lock,
    quit: () => { fake.quitCalled = true; },
    on: (event, fn) => { (fake.appEvents[event] = fake.appEvents[event] || []).push(fn); },
    whenReady: () => Promise.resolve(),
    getPath: () => userData,
    setAsDefaultProtocolClient: () => {},
    setLoginItemSettings: (settings) => fake.loginSettings.push(settings),
  };

  fake.BrowserWindow = class {
    constructor(options) {
      this.options = options;
      this.sent = [];
      this.handlers = {};
      this.visible = false;
      this.shownCount = 0;
      this.hiddenCount = 0;
      this.destroyed = false;
      this.webContents = {
        send: (channel, payload) => this.sent.push([channel, payload]),
        setWindowOpenHandler: () => {},
        on: (event, fn) => { (this.pageHandlers[event] = this.pageHandlers[event] || []).push(fn); },
        isDestroyed: () => this.destroyed,
        isCrashed: () => this.crashed,
        isLoading: () => this.loading,
        reload: () => { this.reloads += 1; this.crashed = false; },
        executeJavaScript: () => (this.pingFails ? new Promise(() => {}) : Promise.resolve('complete')),
      };
      this.pageHandlers = {};
      this.crashed = false;
      this.loading = false;
      this.reloads = 0;
      this.pingFails = false;
      fake.windows.push(this);
    }
    setMenuBarVisibility() {}
    setTitleBarOverlay(overlay) { this.overlay = overlay; }
    setBackgroundColor(color) { this.background = color; }
    setAlwaysOnTop(flag, level) { this.alwaysOnTop = [flag, level]; }
    destroy() {
      this.destroyed = true;
      this.visible = false;
      (this.handlers.closed || []).forEach((fn) => fn({}));
    }
    loadFile(file) { this.file = file; return fake.loadFileError ? Promise.reject(fake.loadFileError) : undefined; }
    on(event, fn) { (this.handlers[event] = this.handlers[event] || []).push(fn); }
    once(event, fn) { this.on(event, fn); }
    // Pretend Windows/Electron raised an event. Returns an event object that records preventDefault().
    emit(event) {
      const e = { prevented: false, preventDefault() { this.prevented = true; } };
      (this.handlers[event] || []).forEach((fn) => fn(e));
      return e;
    }
    // Pretend the page (webContents) raised an event: crash, hang, load failure ...
    page(event, ...args) { (this.pageHandlers[event] || []).forEach((fn) => fn({}, ...args)); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isMinimized() { return false; }
    restore() {}
    maximize() { this.maximized = true; this.maximizeCount = (this.maximizeCount || 0) + 1; }
    isMaximized() { return Boolean(this.maximized); }
    show() { this.visible = true; this.shownCount += 1; }
    hide() { this.visible = false; this.hiddenCount += 1; }
    focus() { this.focusCount = (this.focusCount || 0) + 1; }
    moveTop() { this.movedTop = true; }
  };

  fake.Tray = class {
    constructor(image) { this.image = image; this.images = [image]; this.handlers = {}; this.destroyed = false; fake.trays.push(this); }
    setImage(image) { this.image = image; this.images.push(image); }
    setToolTip(text) { this.tooltip = text; }
    setContextMenu(menu) { this.menu = menu; }
    popUpContextMenu(menu) { this.menu = menu; }
    on(event, fn) { this.handlers[event] = fn; }
    destroy() { this.destroyed = true; }
    isDestroyed() { return this.destroyed; }
  };
  fake.screen = {
    getAllDisplays: () => fake.displays,
    getPrimaryDisplay: () => fake.displays[0],
  };
  fake.Menu = { buildFromTemplate: (template) => ({ template }) };
  // A picture stand-in: any file whose text starts with "IMG" is a 4000 x 2000 picture; toJPEG gives its size as text.
  const picture = (p, w, h) => ({
    path: p, isEmpty: () => !(fs.existsSync(p) && fs.readFileSync(p, 'utf8').startsWith('IMG')), getSize: () => ({ width: w, height: h }),
    resize: (size) => ({ ...picture(p, size.width || w, size.height || h), size }), toJPEG: () => Buffer.from(`JPEG ${w}x${h}`),
  });
  fake.nativeImage = { createFromPath: (p) => picture(p, 4000, 2000) };
  fake.themeEvents = [];
  fake.nativeTheme = { shouldUseDarkColors: false, on: (event, fn) => { if (event === 'updated') fake.themeEvents.push(fn); } };
  fake.powerMonitor = { on: (event, fn) => { fake.powerEvents[event] = fn; } };
  fake.openedPaths = [];
  fake.shell = { openPath: async (dir) => { fake.openedPaths.push(dir); return ''; } };

  // A call from the app's own window: the tests leave the event out (or pass {}) and get this one.
  fake.mainEvent = () => {
    const win = fake.windows.filter((w) => !w.destroyed && /index\.html$/.test(String(w.file))).pop();
    return { sender: win && win.webContents, senderFrame: { url: win ? pathToFileURL(win.file).href : 'file:///none', parent: null } };
  };
  const asMainWindow = (fn) => (event, ...rest) => fn(event && event.sender ? event : fake.mainEvent(), ...rest);
  fake.ipcMain = {
    handle: (channel, fn) => { fake.ipc[channel] = asMainWindow(fn); },
    on: (channel, fn) => { fake.ipcOn[channel] = asMainWindow(fn); },
  };

  fake.dialog = {
    showSaveDialog: async () => (fake.dialogs.saveTo ? { canceled: false, filePath: fake.dialogs.saveTo } : { canceled: true }),
    showOpenDialog: async () => (fake.dialogs.openFrom ? { canceled: false, filePaths: [].concat(fake.dialogs.openFrom) } : { canceled: true }),
    showMessageBox: async (options) => {
      fake.messageBoxes.push(options);
      return fake.nextBox;
    },
  };

  fake.Notification = class {
    constructor(options) { this.options = options; this.shown = false; fake.notifications.push(this); }
    on() {}
    show() { this.shown = true; }
    static isSupported() { return true; }
  };
  return fake;
}

// A stand-in for the "adhan" library: same shape, fixed times (5:05, 11:48, 3:14, 6:00, 7:20) every day.
function makeFakeAdhan() {
  class PrayerTimes {
    constructor(coordinates, date) {
      const time = (h, m) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
      this.fajr = time(5, 5);
      this.dhuhr = time(11, 48);
      this.asr = time(15, 14);
      this.maghrib = time(18, 0);
      this.isha = time(19, 20);
    }
  }
  const method = () => ({ adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, madhab: null });
  const names = ['Egyptian', 'MuslimWorldLeague', 'Karachi', 'UmmAlQura', 'Dubai', 'Qatar', 'Kuwait', 'Singapore', 'Turkey', 'Tehran', 'NorthAmerica', 'MoonsightingCommittee'];
  return {
    Coordinates: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } },
    CalculationMethod: Object.fromEntries(names.map((n) => [n, method])),
    Madhab: { Shafi: 'shafi', Hanafi: 'hanafi' },
    PrayerTimes,
  };
}

// "electron" and "adhan" are replaced for the whole file (the prayer library is loaded later, on first use).
const stand = { electron: null, adhan: makeFakeAdhan() };
const originalLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === 'electron' && stand.electron) return stand.electron;
  if (request === 'adhan') return stand.adhan;
  return originalLoad.call(this, request, ...rest);
};
test.after(() => {
  Module._load = originalLoad;
});

async function launch(options = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-main-'));
  const fake = makeFakeElectron({ userData, ...options });
  stand.electron = fake;
  delete require.cache[MAIN_PATH];
  if (options.hidden) process.argv.push('--hidden');
  let mainModule;
  try {
    mainModule = require(MAIN_PATH);
    await new Promise((resolve) => setImmediate(resolve)); // let app.whenReady().then(...) run
  } finally {
    if (options.hidden) process.argv.pop();
  }
  fake.userData = userData;
  fake.main = mainModule;
  fake.win = () => fake.windows.find((w) => w.options.title === 'WaqtWise');
  fake.alertWindows = () => fake.windows.filter((w) => w.options.title === 'WaqtWise reminder' && !w.destroyed);
  fake.fire = (h, m, sec = 0) => tickEngineAt(fake, h, m, sec);
  fake.svc = (method, ...args) => fake.ipc.svc(undefined, method, args);
  // The data file as the next start would read it: the newest reminder bookkeeping lives in state.json.
  fake.dataFile = () => {
    const mainFile = path.join(userData, 'data.json');
    const data = fs.existsSync(mainFile) ? JSON.parse(fs.readFileSync(mainFile, 'utf8')) : { tasks: [] }; // nothing but the small state file may have been written yet
    const stateFile = path.join(userData, 'state.json');
    if (fs.existsSync(stateFile)) data.reminderState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return data;
  };
  fake.settleDialogs = () => new Promise((resolve) => setImmediate(resolve));
  fake.cleanup = () => {
    // stop the reminder engine's timer, otherwise the test process would never finish
    if (fake.appEvents['before-quit']) fake.appEvents['before-quit'][0]();
    fs.rmSync(userData, { recursive: true, force: true });
  };
  return fake;
}

function form(extra = {}) {
  return {
    title: 'Study', start: { mode: 'fixed', time: '23:00' }, durationMinutes: 30, date: '2030-01-10',
    recurrence: null, reminders: { enabled: true, offsets: [0] }, priority: 'Medium', categoryId: null, notes: '', ...extra,
  };
}

function tickEngineAt(fake, h, m, sec) {
  const engine = fake.main.getEngine();
  return engine.tick(new Date(2030, 0, 10, h, m, sec, 0));
}

// Opens the tray menu the way a right click does (it is built fresh each time) and finds an item in it.
const trayMenu = (app) => { app.trays[0].handlers['right-click'](); return app.trays[0].menu.template; };
const trayItem = (app, label) => trayMenu(app).find((item) => item.label === label);

// ---- Start-up -----------------------------------------------------------------------------------------------

test('Start-up: app id, one secure window showing our page, shown when ready', async () => {
  const app = await launch();
  assert.equal(app.appId, 'com.waqtwise.app');
  assert.equal(app.windows.length, 1);
  const win = app.win();
  assert.equal(win.options.show, false, 'created hidden, shown once ready (no white flash)');
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.ok(fs.existsSync(win.file), 'the page exists');
  assert.ok(fs.existsSync(win.options.webPreferences.preload), 'the preload script exists');
  assert.ok(fs.existsSync(win.options.icon), 'the icon exists');
  assert.equal(win.options.titleBarStyle, 'hidden', 'the title bar is drawn by the page');
  assert.equal(win.options.titleBarOverlay.color, win.options.backgroundColor, 'title bar and page share one colour');
  assert.equal(win.visible, false);
  win.emit('ready-to-show');
  assert.equal(win.visible, true);
  assert.equal(win.maximized, true, 'the window opens maximized');
  app.cleanup();
});

test('22. Started by Windows at login (--hidden): stays hidden in the tray', async () => {
  const app = await launch({ hidden: true });
  assert.equal(app.windows.length, 0, 'no window is even created at login: nothing competes with Windows starting up');
  assert.equal(app.trays.length, 1, 'but the tray icon is there');
  assert.ok(app.main.getEngine(), 'and the reminder engine is running');
  assert.ok(app.ipcOn['renderer-ready'], 'the app is ready to be opened');
  trayItem(app, 'Open / Show').click();
  assert.equal(app.windows.length, 1, 'the window is created when it is first opened');
  const win = app.win();
  assert.equal(win.visible, false, 'and it is shown when its page has drawn, not before');
  win.emit('ready-to-show');
  assert.equal(win.visible, true, 'it opens from the tray');
  assert.equal(win.maximized, true, 'and comes up maximized');
  app.cleanup();
});

test('22b. "Start with Windows" registers the app to start at login, hidden in the tray', async () => {
  const app = await launch({ packaged: true });
  assert.deepEqual(app.loginSettings.pop(), { openAtLogin: false, args: ['--hidden'] });
  await app.svc('saveSettings', { startWithWindows: true });
  assert.deepEqual(app.loginSettings.pop(), { openAtLogin: true, args: ['--hidden'] });
  await app.svc('saveSettings', { theme: 'dark' });
  assert.equal(app.loginSettings.length, 0, 'unrelated changes do not touch the registration');
  await app.svc('saveSettings', { startWithWindows: false });
  assert.deepEqual(app.loginSettings.pop(), { openAtLogin: false, args: ['--hidden'] });
  app.cleanup();
});

test('22c. A development run never registers itself with Windows', async () => {
  const app = await launch({ packaged: false });
  await app.svc('saveSettings', { startWithWindows: true });
  assert.equal(app.loginSettings.length, 0);
  app.cleanup();
});

// ---- Closing, minimizing, the tray ------------------------------------------------------------------------------

test('Closing the window hides it to the tray; the app keeps running', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('ready-to-show');
  const event = win.emit('close');
  assert.equal(event.prevented, true, 'the window is not destroyed');
  assert.equal(win.visible, false);
  assert.equal(app.quitCalled, false);
  assert.equal(app.trays[0].destroyed, false);
  app.appEvents['window-all-closed'][0](); // the app does not quit when there are no windows
  assert.equal(app.quitCalled, false);
  app.cleanup();
});

test('Minimizing hides to the tray without any message', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('ready-to-show');
  const event = win.emit('minimize');
  assert.equal(event.prevented, false, 'Windows cannot cancel a minimize, so the app does not try');
  assert.equal(win.visible, false);
  await app.settleDialogs();
  assert.equal(app.messageBoxes.length, 0);
  app.cleanup();
});

test('Opening the window brings it to the front, not only a flashing taskbar button', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('ready-to-show');
  win.hide();
  win.alwaysOnTop = null;
  win.focusCount = 0;
  app.appEvents['second-instance'][0]({}, ['WaqtWise.exe']);
  assert.equal(win.visible, true);
  assert.deepEqual(win.alwaysOnTop && win.alwaysOnTop[0], true, 'put on top for a moment so Windows lets it through');
  assert.equal(win.movedTop, true);
  assert.ok(win.focusCount >= 1);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(win.alwaysOnTop[0], false, 'and released again');
  app.cleanup();
});

test('First close: "still running in the background" message, once', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('ready-to-show');
  win.emit('close');
  await app.settleDialogs();
  assert.equal(app.messageBoxes.length, 1);
  const box = app.messageBoxes[0];
  assert.match(box.message, /still running in the background/);
  assert.match(box.detail, /Exit/);
  assert.equal(box.checkboxLabel, "Don't Show This Again");
  assert.equal(app.dataFile().settings.backgroundMessageShown, true);
  assert.equal(app.dataFile().settings.showBackgroundMessage, true, 'not switched off unless the user asks');

  trayItem(app, 'Open / Show').click();
  win.emit('close');
  await app.settleDialogs();
  assert.equal(app.messageBoxes.length, 1, 'not shown a second time');
  app.cleanup();
});

test('"Don\'t show again" turns the message off; Settings can turn it back on', async () => {
  const app = await launch();
  app.nextBox = { response: 0, checkboxChecked: true };
  const win = app.win();
  win.emit('close');
  await app.settleDialogs();
  assert.equal(app.dataFile().settings.showBackgroundMessage, false);

  await app.svc('saveSettings', { showBackgroundMessage: true });
  assert.equal(app.dataFile().settings.backgroundMessageShown, false, 'will be shown at the next close');
  app.nextBox = { response: 0, checkboxChecked: false };
  win.emit('close');
  await app.settleDialogs();
  assert.equal(app.messageBoxes.length, 2);
  app.cleanup();
});

test('Tray: tooltip, icon, and the menu (next prayer, pause, open, hide, exit)', async () => {
  const app = await launch();
  const tray = app.trays[0];
  assert.equal(tray.tooltip, 'WaqtWise');
  assert.ok(tray.image.path.endsWith('tray-icon.png'), 'the tray uses its own icon');
  for (const f of ['tray-icon.png', 'tray-icon@1.5x.png', 'tray-icon@2x.png', 'tray-icon@3x.png']) {
    assert.ok(fs.existsSync(path.join(path.dirname(tray.image.path), f)), `${f} exists`);
  }
  // The 16x16 size of the file itself is checked in packaging.test.js.
  const labels = trayMenu(app).map((i) => i.label || i.type);
  assert.match(labels[0], /^Next Prayer: (Fajr|Dhuhr|Asr|Maghrib|Isha) in (\d+h )?\d+m$/, 'the top line is the next prayer and the time until it');
  assert.deepEqual(labels.slice(1), ['separator', 'Pause Reminders', 'Pause Routines', 'Pause All', 'separator', 'Open / Show', 'Hide / Minimize', 'separator', 'Exit']);

  const win = app.win();
  win.emit('ready-to-show');
  trayItem(app, 'Hide / Minimize').click();
  assert.equal(win.visible, false);
  tray.handlers['double-click']();
  assert.equal(win.visible, true, 'double-click opens the window');
  trayItem(app, 'Hide / Minimize').click();
  tray.handlers.click();
  assert.equal(win.visible, true, 'a single click opens it too');
  app.cleanup();
});

test('Opening from the tray after the window was destroyed creates a new window', async () => {
  const app = await launch();
  const first = app.win();
  first.emit('closed');
  trayItem(app, 'Open / Show').click();
  assert.equal(app.windows.length, 2);
  app.windows[1].emit('ready-to-show');
  assert.equal(app.windows[1].visible, true);
  app.cleanup();
});

test('Exit asks for confirmation; Cancel keeps running; Exit really quits', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('ready-to-show');

  app.nextBox = { response: 1 }; // Cancel
  await trayItem(app, 'Exit').click();
  assert.equal(app.quitCalled, false);
  const box = app.messageBoxes[0];
  assert.match(box.message, /Exit WaqtWise/);
  assert.match(box.detail, /Reminders and notifications will stop/);
  assert.deepEqual(box.buttons, ['Exit', 'Cancel']);
  assert.equal(win.emit('close').prevented, true, 'still hides instead of closing');

  app.nextBox = { response: 0 }; // Exit
  await trayItem(app, 'Exit').click();
  assert.equal(app.quitCalled, true);
  assert.equal(win.emit('close').prevented, false, 'now the window is allowed to close');
  app.appEvents['will-quit'][0]();
  assert.equal(app.trays[0].destroyed, true, 'the tray icon is removed');
  app.cleanup();
});

test('Windows shutting down or logging off is never blocked', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('session-end');
  assert.equal(win.emit('close').prevented, false);
  app.cleanup();
});

// ---- Single instance, links ---------------------------------------------------------------------------------------------

test('21. A second copy quits immediately; the first brings its (hidden) window forward', async () => {
  const second = await launch({ lock: false });
  assert.equal(second.quitCalled, true);
  assert.equal(second.windows.length, 0);
  assert.equal(second.trays.length, 0);
  second.cleanup();

  const first = await launch();
  const win = first.win();
  win.emit('ready-to-show');
  trayItem(first, 'Hide / Minimize').click();
  assert.equal(win.visible, false);
  first.appEvents['second-instance'][0]({}, ['WaqtWise.exe']);
  assert.equal(win.visible, true, 'the existing window is shown');
  assert.equal(first.windows.length, 1, 'no second window');
  first.cleanup();
});

test('Links cannot change anything: old Snooze / Done links are ignored', async () => {
  const app = await launch();
  const { taskId } = await app.svc('saveTask', { mode: 'create', form: form() });
  const win = app.win();
  win.emit('ready-to-show');
  trayItem(app, 'Hide / Minimize').click();

  app.appEvents['second-instance'][0]({}, ['WaqtWise.exe', `waqtwise://snooze?task=${taskId}&date=2030-01-10`]);
  app.appEvents['second-instance'][0]({}, ['WaqtWise.exe', `waqtwise://done?task=${taskId}&date=2030-01-10`]);
  const saved = app.dataFile();
  assert.deepEqual(saved.tasks[0].completions || {}, {}, 'the task was not marked done');
  assert.equal(saved.reminderState.snoozed.length, 0, 'nothing was snoozed');
  app.cleanup();
});

test('Clicking a notification opens the main window on the Daily View', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: form() });
  const win = app.win();
  win.emit('ready-to-show');
  trayItem(app, 'Hide / Minimize').click();

  // The window page is not ready yet: the request waits
  app.appEvents['second-instance'][0]({}, ['x.exe', 'waqtwise://open']);
  assert.equal(win.visible, true);
  assert.ok(!win.sent.some(([c]) => c === 'show-daily'));

  app.ipcOn['renderer-ready']();
  assert.ok(win.sent.some(([c]) => c === 'show-daily'), 'the page is told to show the Daily View');
  assert.ok(!win.sent.some(([c]) => c === 'open-task'), 'no task is opened');
  app.cleanup();
});

// ---- Reminders keep working in the background ---------------------------------------------------------------------------

test('19. With the window hidden in the tray, reminders still produce Windows notifications', async () => {
  const app = await launch();
  const win = app.win();
  win.emit('ready-to-show');
  win.emit('close'); // hidden in the tray
  assert.equal(win.visible, false);

  await app.svc('saveTask', { mode: 'create', form: form({ title: 'Background reminder' }) });
  const engine = app.main.getEngine();
  engine.tick(at('2030-01-10', '22:59'));
  assert.equal(app.notifications.length, 0);
  engine.tick(at('2030-01-10', '23:00'));
  assert.equal(app.notifications.length, 1);
  const toast = app.notifications[0];
  assert.equal(toast.shown, true);
  assert.ok(toast.options.toastXml.includes('Background reminder'));
  assert.ok(!toast.options.toastXml.includes('<actions>'), 'the notification has no buttons');
  assert.equal(win.visible, false, 'the window stayed hidden');
  app.cleanup();
});

test('Wake from sleep runs a check at once and refreshes the window', async () => {
  const app = await launch();
  app.ipcOn['renderer-ready']();
  const win = app.win();
  const before = app.main.getEngine().state.lastTickAt;
  assert.ok(app.powerEvents.resume && app.powerEvents['unlock-screen']);
  await new Promise((resolve) => setTimeout(resolve, 5));
  app.powerEvents.resume();
  assert.ok(app.main.getEngine().state.lastTickAt >= before);
  assert.ok(win.sent.some(([channel]) => channel === 'data-changed'));
  app.cleanup();
});

test('Quitting stops the reminder engine and saves its state', async () => {
  const app = await launch();
  app.appEvents['before-quit'][0]();
  assert.ok(app.dataFile().reminderState.lastTickAt > 0);
  app.cleanup();
});

// ---- Window <-> service ------------------------------------------------------------------------------------------------------

test('The window can call planner actions, but only the allowed ones', async () => {
  const app = await launch();
  const boot = await app.svc('bootstrap');
  assert.equal(boot.settings.cityName, 'Cairo');
  assert.ok(boot.cities.length >= 28);
  assert.match(boot.currentPlanningDayKey, /^\d{4}-\d{2}-\d{2}$/);

  await assert.rejects(() => app.svc('importData', {}), /Unknown request/);
  await assert.rejects(() => app.svc('persist'), /Unknown request/);
  await assert.rejects(() => app.ipc.svc(undefined, 'constructor', []), /Unknown request/);
  app.cleanup();
});

test('Requests from anything other than the app window are refused', async () => {
  const app = await launch();
  const other = { sender: { id: 'some other page' }, senderFrame: { url: 'file:///app/src/renderer/index.html' } };
  const wrongPage = { sender: app.win().webContents, senderFrame: { url: 'https://example.com/index.html' } };
  const noFrame = { sender: app.win().webContents };
  // The right window, but a frame inside the page, or a local file elsewhere with the same name
  const subFrame = { sender: app.win().webContents, senderFrame: { url: pathToFileURL(app.win().file).href, parent: {} } };
  const lookAlike = { sender: app.win().webContents, senderFrame: { url: 'file:///tmp/renderer/index.html', parent: null } };
  for (const event of [other, wrongPage, noFrame, subFrame, lookAlike]) {
    await assert.rejects(() => app.ipc.svc(event, 'bootstrap', []), /Unknown request/);
    await assert.rejects(() => app.ipc['export-data'](event), /Unknown request/);
    await assert.rejects(() => app.ipc['import-data'](event), /Unknown request/);
    await assert.rejects(() => app.ipc['test-notification'](event), /Unknown request/);
    await assert.rejects(() => app.ipc['preview-alert'](event), /Unknown request/);
  }
  assert.equal(app.notifications.length, 0, 'no test notification was shown');
  // "renderer-ready" from outside does nothing; from the window it does
  app.ipcOn['renderer-ready'](other);
  assert.ok(await app.svc('bootstrap'), 'the real window still works');
  app.cleanup();
});

test('Saving a task writes the data file in the user data folder, and tells the window', async () => {
  const app = await launch();
  app.ipcOn['renderer-ready']();
  await app.svc('saveTask', { mode: 'create', form: form() });
  const saved = app.dataFile();
  assert.equal(saved.tasks.length, 1);
  assert.equal(saved.tasks[0].title, 'Study');
  assert.ok(app.win().sent.some(([channel]) => channel === 'data-changed'));
  app.cleanup();
});

test('Export writes a backup file; import restores it; cancelling does nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-files-'));
  const backupFile = path.join(dir, 'backup.json');

  const a = await launch({ saveTo: backupFile });
  await a.svc('saveTask', { mode: 'create', form: form({ title: 'Keep me' }) });
  const exported = await a.ipc['export-data']();
  assert.equal(exported.ok, true);
  const parsed = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  assert.equal(parsed.app, 'waqtwise');
  assert.equal(parsed.tasks.length, 1);
  a.cleanup();

  const b = await launch({ openFrom: backupFile });
  const imported = await b.ipc['import-data']();
  assert.equal(imported.ok, true);
  assert.equal(imported.tasks, 1);
  assert.equal(b.dataFile().tasks[0].title, 'Keep me');
  b.cleanup();

  const c = await launch();
  assert.deepEqual(await c.ipc['export-data'](), { canceled: true });
  assert.deepEqual(await c.ipc['import-data'](), { canceled: true });
  c.cleanup();

  fs.writeFileSync(backupFile, 'this is not a backup');
  const d = await launch({ openFrom: backupFile });
  await assert.rejects(() => d.ipc['import-data'](), /not a WaqtWise backup/);
  d.cleanup();

  // a file far bigger than any backup is refused before it is read
  fs.writeFileSync(backupFile, '');
  fs.truncateSync(backupFile, 21 * 1024 * 1024);
  const e = await launch({ openFrom: backupFile });
  await assert.rejects(() => e.ipc['import-data'](), /too big/);
  e.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('The test notification works and has no buttons; clicking it opens the app', async () => {
  const app = await launch();
  const result = await app.ipc['test-notification']();
  assert.equal(result.ok, true);
  assert.equal(app.notifications.length, 1);
  const xml = app.notifications[0].options.toastXml;
  assert.ok(xml.includes('WaqtWise Test Notification'));
  assert.ok(!xml.includes('<actions>'));
  assert.ok(xml.includes('launch="waqtwise://open"'));

  // Pretend Windows opened the app with the link behind the click
  const win = app.win();
  win.emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  app.appEvents['second-instance'][0]({}, ['WaqtWise.exe', 'waqtwise://open']);
  assert.equal(win.visible, true);
  assert.ok(win.sent.some(([c]) => c === 'show-daily'));
  assert.equal(app.notifications.length, 1, 'no extra notification');
  app.cleanup();
});

// ---- The full-screen alert -----------------------------------------------------------------------------------------

function alertForm(extra = {}) {
  return form({
    title: 'Alert task', notes: 'Read these notes first', start: { mode: 'fixed', time: '12:00' },
    reminders: { enabled: false, offsets: [], fullScreen: true }, ...extra,
  });
}

const twoScreens = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 } },
];

test('Full-screen alert: at the start time one borderless window covers each screen, above everything', async () => {
  const app = await launch({ displays: twoScreens });
  await app.svc('saveTask', { mode: 'create', form: alertForm() });
  app.fire(11, 59, 50);
  assert.equal(app.alertWindows().length, 0, 'nothing before the start time');
  app.fire(12, 0, 0);

  const windows = app.alertWindows();
  assert.equal(windows.length, 2, 'one per screen');
  windows.forEach((win, i) => {
    const o = win.options;
    const b = twoScreens[i].bounds;
    assert.deepEqual([o.x, o.y, o.width, o.height], [b.x, b.y, b.width, b.height]);
    assert.equal(o.frame, false);
    assert.equal(o.fullscreen, true);
    assert.equal(o.alwaysOnTop, true);
    assert.equal(o.skipTaskbar, true);
    assert.equal(o.show, false);
    assert.equal(o.webPreferences.contextIsolation, true);
    assert.equal(o.webPreferences.nodeIntegration, false);
    assert.equal(o.webPreferences.sandbox, true);
    assert.equal(o.webPreferences.autoplayPolicy, 'no-user-gesture-required', 'the reminder sound plays without a click');
    assert.ok(o.webPreferences.preload.endsWith('alert-preload.js') && fs.existsSync(o.webPreferences.preload));
    assert.ok(win.file.endsWith('alert.html') && fs.existsSync(win.file));
    assert.deepEqual(win.alwaysOnTop, [true, 'screen-saver']);
    win.emit('ready-to-show');
    assert.equal(win.visible, true);
  });
  assert.equal(app.alertWindows().length, 2);
  app.cleanup();
});

test('Full-screen alert: the page is told what to show (title, notes, times, zone, look)', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: alertForm() });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  const [channel, state] = win.sent.find(([c]) => c === 'alert-render');
  assert.equal(channel, 'alert-render');
  assert.equal(state.items.length, 1);
  const item = state.items[0];
  assert.equal(item.title, 'Alert task');
  assert.equal(item.notes, 'Read these notes first');
  assert.equal(item.startLabel, '12:00 PM');
  assert.equal(item.endLabel, '12:30 PM');
  assert.equal(item.durationLabel, '30m');
  assert.equal(item.zoneName, 'Dhuhr → Asr');
  assert.equal(item.priority, 'Medium');
  assert.equal(state.appearance.backgroundColor, '#0f172a');
  assert.equal(state.snoozeMinutes, 5);
  assert.equal(state.guardMs, 1500);
  assert.deepEqual(state.sound, { id: 'bell', volume: 70, repeat: false, stopAfterMinutes: 0 });
  assert.equal(state.soundSeq, 1);
  assert.equal(state.soundHere, true);
  app.cleanup();
});

test('Full-screen alert: only one screen rings, and the sound comes from Settings', async () => {
  const app = await launch();
  await app.svc('saveSettings', { alertSound: 'alarm', alertSoundVolume: 40, alertSoundRepeat: true });
  await app.svc('saveTask', { mode: 'create', form: alertForm() });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const wins = app.alertWindows();
  assert.ok(wins.length >= 1);
  const states = wins.map((w) => {
    app.ipcOn['alert-ready'](alertEvent(w));
    return w.sent.find(([c]) => c === 'alert-render')[1];
  });
  assert.deepEqual(states.map((st) => st.soundHere), wins.map((_, i) => i === 0), 'only the first window rings');
  assert.deepEqual(states[0].sound, { id: 'alarm', volume: 40, repeat: true, stopAfterMinutes: 0 });
  app.cleanup();
});

test('Full-screen alert: the plain notification at the start is replaced by it', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: alertForm({ reminders: { enabled: true, offsets: [0], fullScreen: true } }) });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  assert.equal(app.alertWindows().length, 1);
  assert.equal(app.notifications.length, 0);
  app.cleanup();
});

test('Full-screen alert buttons: Got it, Mark as Done, Snooze, Open task', async () => {
  const app = await launch();
  const { taskId } = await app.svc('saveTask', { mode: 'create', form: alertForm() });
  app.win().emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  const itemId = win.sent.find(([c]) => c === 'alert-render')[1].items[0].id;

  // Someone else (the main window) cannot press the alert's buttons
  app.ipcOn['alert-action'](alertEvent(app.win()), { type: 'done', itemId });
  assert.equal(app.alertWindows().length, 1);
  // Unknown button / unknown task: ignored
  app.ipcOn['alert-action'](alertEvent(win), { type: 'format-disk', itemId });
  app.ipcOn['alert-action'](alertEvent(win), { type: 'done', itemId: 'nope' });
  app.ipcOn['alert-action'](alertEvent(win), null);
  assert.equal(app.alertWindows().length, 1);
  assert.equal(app.dataFile().tasks[0].completions['2030-01-10'], undefined);
  // The right window but not the alert page itself (a frame inside it, or another page): ignored
  app.ipcOn['alert-action']({ sender: win.webContents, senderFrame: { url: pathToFileURL(win.file).href, parent: {} } }, { type: 'done', itemId });
  app.ipcOn['alert-action']({ sender: win.webContents, senderFrame: { url: 'file:///tmp/renderer/alert.html', parent: null } }, { type: 'done', itemId });
  app.ipcOn['alert-action']({ sender: win.webContents }, { type: 'done', itemId });
  assert.equal(app.alertWindows().length, 1);
  assert.equal(app.dataFile().tasks[0].completions['2030-01-10'], undefined);

  // Snooze: the alert closes, and a snooze that will come back as an alert is stored
  app.ipcOn['alert-action'](alertEvent(win), { type: 'snooze', itemId });
  assert.equal(app.alertWindows().length, 0);
  const snoozed = app.dataFile().reminderState.snoozed;
  assert.equal(snoozed.length, 1);
  assert.equal(snoozed[0].fullScreen, true);
  assert.equal(snoozed[0].taskId, taskId);
  app.cleanup();
});

test('Full-screen alert: Mark as Done completes the task; Open task opens the app; Got it only closes', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'One' }) });
  app.win().emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  let win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  let itemId = win.sent.find(([c]) => c === 'alert-render')[1].items[0].id;
  app.ipcOn['alert-action'](alertEvent(win), { type: 'done', itemId });
  assert.equal(app.alertWindows().length, 0);
  assert.equal(app.dataFile().tasks[0].completions['2030-01-10'], true);

  // Open task
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'Two', start: { mode: 'fixed', time: '13:00' } }) });
  app.fire(12, 59, 50);
  app.fire(13, 0, 0);
  win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  itemId = win.sent.filter(([c]) => c === 'alert-render').pop()[1].items[0].id;
  const mainWin = app.win();
  mainWin.visible = false;
  app.ipcOn['alert-action'](alertEvent(win), { type: 'open', itemId });
  assert.equal(mainWin.visible, true, 'the main window is brought up');
  const open = mainWin.sent.filter(([c]) => c === 'open-task').pop();
  assert.equal(open[1].dateKey, '2030-01-10');
  assert.equal(app.alertWindows().length, 0);

  // Got it
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'Three', start: { mode: 'fixed', time: '14:00' } }) });
  app.fire(13, 59, 50);
  app.fire(14, 0, 0);
  win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  itemId = win.sent.filter(([c]) => c === 'alert-render').pop()[1].items[0].id;
  app.ipcOn['alert-action'](alertEvent(win), { type: 'dismiss', itemId });
  assert.equal(app.alertWindows().length, 0);
  assert.equal(app.dataFile().tasks.find((t) => t.title === 'Three').completions['2030-01-10'], undefined);
  app.cleanup();
});

test('Full-screen alert: tasks starting together queue up on the same screens', async () => {
  const app = await launch({ displays: twoScreens });
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'First' }) });
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'Second' }) });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  assert.equal(app.alertWindows().length, 2, 'still just one window per screen');
  const [a, b] = app.alertWindows();
  app.ipcOn['alert-ready'](alertEvent(a));
  const queue = a.sent.filter(([c]) => c === 'alert-render').pop()[1].items;
  assert.equal(queue.length, 2);

  app.ipcOn['alert-action'](alertEvent(b), { type: 'dismiss', itemId: queue[0].id }); // pressed on the other screen
  assert.equal(app.alertWindows().length, 2, 'the next task appears');
  const next = a.sent.filter(([c]) => c === 'alert-render').pop()[1];
  assert.deepEqual(next.items.map((i) => i.title), [queue[1].title]);
  assert.equal(next.guardMs, 700, 'a short pause before the next one can be pressed');

  app.ipcOn['alert-action'](alertEvent(a), { type: 'dismiss', itemId: queue[1].id });
  assert.equal(app.alertWindows().length, 0);
  app.cleanup();
});

test('Full-screen alert: a task that starts while the alert is open joins the queue', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'First' }) });
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'Later', start: { mode: 'fixed', time: '12:05' } }) });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const win = app.alertWindows()[0];
  app.fire(12, 5, 0);
  assert.equal(app.alertWindows().length, 1);
  const state = win.sent.filter(([c]) => c === 'alert-render').pop()[1];
  assert.deepEqual(state.items.map((i) => i.title), ['First', 'Later']);
  app.cleanup();
});

test('Full-screen alert: "Main Screen Only" uses just the primary screen', async () => {
  const app = await launch({ displays: twoScreens });
  await app.svc('saveSettings', { alertScreens: 'main' });
  await app.svc('saveTask', { mode: 'create', form: alertForm() });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  assert.equal(app.alertWindows().length, 1);
  assert.equal(app.alertWindows()[0].options.x, 0);
  app.cleanup();
});

test('Full-screen alert: the look chosen in Settings is what the page receives', async () => {
  const app = await launch();
  await app.svc('saveSettings', { alertAppearance: { backgroundColor: '#112233', name: { size: 120, uppercase: true }, notes: { show: false } } });
  await app.svc('saveTask', { mode: 'create', form: alertForm() });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const win = app.alertWindows()[0];
  assert.equal(win.options.backgroundColor, '#112233', 'no white flash before the page loads');
  app.ipcOn['alert-ready'](alertEvent(win));
  const { appearance } = win.sent.find(([c]) => c === 'alert-render')[1];
  assert.equal(appearance.backgroundColor, '#112233');
  assert.equal(appearance.name.size, 120);
  assert.equal(appearance.name.uppercase, true);
  assert.equal(appearance.name.bold, true, 'what was not changed stays');
  assert.equal(appearance.notes.show, false);
  app.cleanup();
});

test('Full-screen alert: the Preview button shows the real thing with an example, and does nothing real', async () => {
  const app = await launch();
  const result = await app.ipc['preview-alert']();
  assert.equal(result.ok, true);
  const win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  const item = win.sent.find(([c]) => c === 'alert-render')[1].items[0];
  assert.equal(item.taskId, '__sample__');
  app.ipcOn['alert-action'](alertEvent(win), { type: 'done', itemId: item.id });
  assert.equal(app.alertWindows().length, 0);
  assert.equal(app.dataFile().tasks.length, 0);
  assert.equal(app.dataFile().reminderState.snoozed.length, 0);
  app.cleanup();
});

test('Full-screen alert: switched off in Settings, nothing appears; quitting closes any open alert', async () => {
  const off = await launch();
  await off.svc('saveSettings', { fullScreenAlerts: false });
  await off.svc('saveTask', { mode: 'create', form: alertForm() });
  off.fire(11, 59, 50);
  off.fire(12, 0, 0);
  assert.equal(off.alertWindows().length, 0);
  off.cleanup();

  const on = await launch();
  await on.svc('saveTask', { mode: 'create', form: alertForm() });
  on.fire(11, 59, 50);
  on.fire(12, 0, 0);
  assert.equal(on.alertWindows().length, 1);
  on.appEvents['before-quit'][0]();
  assert.equal(on.alertWindows().length, 0);
  on.cleanup();
});

test('New tasks follow the "switch on for new tasks" setting', async () => {
  const app = await launch();
  const before = await app.svc('newTaskDefaults', '2030-01-10');
  assert.equal(before.reminders.fullScreen, false);
  await app.svc('saveSettings', { fullScreenDefaultForNewTasks: true });
  const after = await app.svc('newTaskDefaults', '2030-01-10');
  assert.equal(after.reminders.fullScreen, true);
  app.cleanup();
});

test('The alert page preload exposes only what it needs', () => {
  const sent = [];
  const exposed = {};
  stand.electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } },
    ipcRenderer: { send: (...args) => sent.push(args), on: () => {} },
  };
  delete require.cache[require.resolve('../src/main/alert-preload.js')];
  require('../src/main/alert-preload.js');
  assert.deepEqual(Object.keys(exposed.alertApi).sort(), ['action', 'onRender', 'ready']);
  exposed.alertApi.action('done', 'abc');
  assert.deepEqual(sent[0], ['alert-action', { type: 'done', itemId: 'abc' }]);
});

test('The preload script exposes only the expected functions', () => {
  const sent = [];
  const exposed = {};
  stand.electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } },
    ipcRenderer: { invoke: (...args) => { sent.push(args); return Promise.resolve(); }, send: () => {}, on: () => {} },
  };
  delete require.cache[require.resolve('../src/main/preload.js')];
  require('../src/main/preload.js');
  assert.deepEqual(Object.keys(exposed.api).sort(), ['addAlertImages', 'call', 'exportData', 'getAlertImages', 'getAlertPreviewPicture', 'getPauseState', 'importData', 'on', 'openLogsFolder', 'previewAlert', 'ready', 'removeAlertImage', 'resumePause', 'testNotification']);
  exposed.api.call('getDay', '2030-01-10');
  assert.deepEqual(sent[0], ['svc', 'getDay', ['2030-01-10']]);
});

test('The title bar follows the theme chosen in Settings', async () => {
  const app = await launch();
  const win = app.win();
  await app.svc('saveSettings', { theme: 'dark' });
  assert.equal(win.overlay.color, '#071a2e');
  assert.equal(win.background, '#071a2e');
  await app.svc('saveSettings', { theme: 'light' });
  assert.equal(win.overlay.color, '#edf4f6');
  app.cleanup();
});

test('Full-screen alert closed without a button (Alt+F4) is kept in the bell', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'Closed by Alt+F4' }) });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const windows = app.alertWindows();
  assert.equal(windows.length, 1);
  assert.equal((await app.svc('getMissed')).length, 0);

  windows[0].emit('closed'); // closed some other way than a button
  const missed = await app.svc('getMissed');
  assert.equal(missed.length, 1, 'the task is kept in the bell');
  assert.equal(missed[0].title, 'Closed by Alt+F4');
  app.cleanup();
});

test('Full-screen alert: a button, or the app closing it itself, adds nothing to the bell', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: alertForm({ title: 'Got It' }) });
  app.fire(11, 59, 50);
  app.fire(12, 0, 0);
  const win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  const itemId = win.sent.find(([c]) => c === 'alert-render')[1].items[0].id;
  app.ipcOn['alert-action'](alertEvent(win), { type: 'done', itemId });
  assert.equal((await app.svc('getMissed')).length, 0, 'a button press is an answer');
  app.cleanup();
});

test('Tray: Pause Reminders silences the tasks until it is resumed, and leaves routines alone', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: form({ title: 'First', start: { mode: 'fixed', time: '23:00' } }) });
  await app.svc('saveTask', { mode: 'create', form: form({ title: 'Second', start: { mode: 'fixed', time: '23:30' } }) });
  const pause = trayItem(app, 'Pause Reminders');
  assert.deepEqual(pause.submenu.map((i) => i.label), pauseLabels(app));
  pause.submenu[1].click();
  assert.match(app.trays[0].tooltip, /^WaqtWise · Reminders Paused Until /);
  const labels = trayMenu(app).map((i) => i.label || i.type);
  assert.ok(labels.some((l) => /^Reminders Paused Until /.test(l)) && labels.includes('Resume Reminders') && !labels.includes('Pause Reminders'));

  const engine = app.main.getEngine();
  engine.tick(at('2030-01-10', '22:59'));
  engine.tick(at('2030-01-10', '23:00'));
  assert.equal(app.notifications.length, 0, 'nothing rings while paused');

  trayItem(app, 'Resume Reminders').click();
  assert.equal(app.trays[0].tooltip, 'WaqtWise');
  assert.ok(trayMenu(app).some((i) => i.label === 'Pause Reminders'));
  engine.tick(at('2030-01-10', '23:29'));
  engine.tick(at('2030-01-10', '23:30'));
  assert.equal(app.notifications.length, 1, 'the next reminder rings again');
  assert.ok(app.notifications[0].options.toastXml.includes('Second'));
  engine.tick(at('2030-01-10', '23:45'));
  assert.equal(app.dataFile().tasks.length, 2);
  assert.equal(app.notifications.length, 1, 'the one that fell inside the pause does not come back later');
  app.cleanup();
});

test('Tray: Pause Routines silences only the routines; Pause Reminders only the tasks', async () => {
  const app = await launch();
  await app.svc('saveTask', { mode: 'create', form: form({ title: 'Zone task', start: { mode: 'fixed', time: '23:00' } }) });
  await app.svc('saveRoutine', { form: { title: 'Drink water', from: '23:00', to: '23:30', hours: 0, minutes: 30, weekdays: [0, 1, 2, 3, 4, 5, 6], notification: true, fullScreen: false } });
  const routines = app.main.getRoutineEngine();
  const engine = app.main.getEngine();
  const tick = (h, m) => { engine.tick(at('2030-01-10', `${h}:${m}`)); routines.tick(at('2030-01-10', `${h}:${m}`)); };
  const shown = () => app.notifications.map((n) => (n.options.toastXml.includes('Zone task') ? 'task' : n.options.toastXml.includes('Drink water') ? 'routine' : '?'));

  trayItem(app, 'Pause Routines').submenu[0].click();
  const labels = trayMenu(app).map((i) => i.label || i.type);
  assert.ok(labels.includes('Pause Reminders') && labels.includes('Resume Routines') && !labels.includes('Pause Routines'), 'only the routines are paused');
  assert.match(app.trays[0].tooltip, /^WaqtWise · Routines Paused Until /);
  tick(22, 59);
  tick(23, 0);
  assert.deepEqual(shown(), ['task'], 'the task rings, the routine stays silent');

  trayItem(app, 'Resume Routines').click();
  trayItem(app, 'Pause Reminders').submenu[0].click();
  assert.match(app.trays[0].tooltip, /^WaqtWise · Reminders Paused Until /);
  tick(23, 29);
  tick(23, 30);
  assert.deepEqual(shown(), ['task', 'routine'], 'now the routine rings and the task side is paused');
  assert.equal(app.notifications.length, 2);
  app.cleanup();
});

test('Tray: Pause All pauses reminders and routines together, "Until the Next Prayer" ends at the next prayer, Resume All ends both', async () => {
  const app = await launch();
  const service = app.main.getService();
  const realNow = service.now;
  const today = new Date();
  service.now = () => new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0, 0, 0); // before Maghrib
  const all = trayItem(app, 'Pause All');
  assert.deepEqual(all.submenu.map((i) => i.label), ['For 30 Minutes', 'For 1 Hour', 'For 2 Hours', 'Until the Next Prayer', 'Until the Next Fajr']);
  all.submenu[3].click();
  const labels = trayMenu(app).map((i) => i.label || i.type);
  assert.ok(labels.includes('Resume Reminders') && labels.includes('Resume Routines') && labels.includes('Resume All') && !labels.includes('Pause All'));
  assert.match(app.trays[0].tooltip, /Reminders Paused Until .*Routines Paused Until /);
  trayItem(app, 'Resume All').click();
  assert.equal(app.trays[0].tooltip, 'WaqtWise');
  assert.ok(trayMenu(app).some((i) => i.label === 'Pause All'));
  service.now = realNow;
  app.cleanup();
});

// ---- Pomodoro (1.3.0) ---------------------------------------------------------------------------------------------

const pomodoroForm = (extra = {}) => ({ title: 'Study', focusMinutes: 25, breakMinutes: 5, longBreak: false, longBreakMinutes: 15, longBreakEvery: 4, alert: 'fullScreen', holdAtPrayer: false, ...extra });

test('Pomodoro: the tray shows it while it runs (pause, resume, stop); the window is told of every change', async () => {
  const app = await launch();
  app.win().emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  const { id } = await app.svc('savePomodoro', { id: null, form: pomodoroForm() });
  assert.equal(trayMenu(app).some((i) => /^Pomodoro/.test(i.label || '')), false, 'nothing about Pomodoro while none runs');
  await app.svc('pomodoroAction', { action: 'start', id });
  assert.ok(app.win().sent.some(([c, v]) => c === 'pomodoro-changed' && v && v.status === 'running'), 'the window hears about it');
  assert.match(trayItem(app, 'Pause Pomodoro') ? 'ok' : '', /ok/);
  assert.ok(trayMenu(app).some((i) => /^Pomodoro: Focus \d+:\d\d$/.test(i.label || '')), 'a line with the part and the time left');
  assert.match(app.trays[0].tooltip, /Pomodoro: Focus$/);
  trayItem(app, 'Pause Pomodoro').click();
  assert.ok(trayMenu(app).some((i) => /^Pomodoro: Focus Paused at /.test(i.label || '')));
  trayItem(app, 'Resume Pomodoro').click();
  trayItem(app, 'Stop Pomodoro').click();
  assert.equal(await app.svc('getPomodoroTimer'), null);
  assert.equal(trayMenu(app).some((i) => /^Pomodoro/.test(i.label || '')), false);
  app.cleanup();
});

test('Pomodoro: when a part ends the full-screen alert offers Start Break, 5 more minutes, Later and Stop', async () => {
  const app = await launch();
  app.win().emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  const { id } = await app.svc('savePomodoro', { id: null, form: pomodoroForm() });
  await app.svc('pomodoroAction', { action: 'start', id });
  const service = app.main.getService();
  const realNow = service.now;
  service.now = () => new Date(realNow().getTime() + 26 * 60000);
  service.pomodoroTick();
  const win = app.alertWindows()[0];
  assert.ok(win, 'the full-screen alert opened');
  app.ipcOn['alert-ready'](alertEvent(win));
  const item = win.sent.find(([c]) => c === 'alert-render')[1].items[0];
  assert.equal(item.kind, 'pomodoro');
  assert.equal(item.title, 'Time for a Short Break');
  // "5 More Minutes of Focus" is sent as a snooze of 5
  app.ipcOn['alert-action'](alertEvent(win), { type: 'snooze', itemId: item.id, option: 5 });
  assert.equal(app.alertWindows().length, 0);
  let view = await app.svc('getPomodoroTimer');
  assert.equal(view.part, 'focus');
  assert.equal(view.partMs, 5 * 60000);
  // It ends again: this time "Start Break"
  service.now = () => new Date(realNow().getTime() + 32 * 60000);
  service.pomodoroTick();
  const again = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(again));
  const second = again.sent.find(([c]) => c === 'alert-render')[1].items[0];
  app.ipcOn['alert-action'](alertEvent(again), { type: 'next', itemId: second.id });
  view = await app.svc('getPomodoroTimer');
  assert.equal(view.part, 'break');
  assert.equal(view.status, 'running');
  // "next" and "stop" mean nothing on a task alert
  const { isValidAction } = require('../src/main/alert-window');
  assert.ok(isValidAction('next') && isValidAction('stop'));
  service.now = realNow;
  app.cleanup();
});

test('Pomodoro: with "Notification" chosen, the end of a part is a notification that opens the Pomodoro page', async () => {
  const app = await launch();
  app.win().emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  const { id } = await app.svc('savePomodoro', { id: null, form: pomodoroForm({ alert: 'notification' }) });
  await app.svc('pomodoroAction', { action: 'start', id });
  const service = app.main.getService();
  const realNow = service.now;
  service.now = () => new Date(realNow().getTime() + 26 * 60000);
  service.pomodoroTick();
  assert.equal(app.alertWindows().length, 0);
  const toast = app.notifications[app.notifications.length - 1];
  assert.equal(toast.options.title, 'Time for a Short Break');
  assert.ok(toast.options.toastXml.includes('waqtwise://pomodoro'), 'a click opens the Pomodoro page');
  app.main.handleAction({ type: 'pomodoro' });
  assert.ok(app.win().sent.some(([c]) => c === 'show-pomodoro'));
  service.now = realNow;
  app.cleanup();
});

// ---- Pictures behind the full-screen alert (1.4.0) ---------------------------------------------------------------

test('Alert pictures: add from the disk (copied, made smaller), shown behind the alert, removed again', async () => {
  const app = await launch();
  app.win().emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  const ok = app.win().webContents;
  const ev = { sender: ok, senderFrame: { url: pathToFileURL(app.win().file).href, parent: null } };
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'pictures-'));
  const a = path.join(src, 'Sunset.jpg');
  const b = path.join(src, 'Hills.png');
  const notPicture = path.join(src, 'notes.png');
  const wrongType = path.join(src, 'clip.gif');
  fs.writeFileSync(a, 'IMG a');
  fs.writeFileSync(b, 'IMG b');
  fs.writeFileSync(notPicture, 'hello');
  fs.writeFileSync(wrongType, 'IMG gif');
  app.dialogs.openFrom = [a, b, notPicture, wrongType];
  const result = await app.ipc['add-alert-images'](ev);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 2, 'a file that is not a picture and a GIF are skipped');
  assert.deepEqual(result.images.map((x) => x.name), ['Sunset', 'Hills']);
  assert.match(result.images[0].thumb, /^data:image\/jpeg;base64,/);
  const dir = path.join(app.userData, 'backgrounds');
  const id = result.images[0].id;
  assert.equal(fs.readFileSync(path.join(dir, `${id}.jpg`), 'utf8'), 'JPEG 2560x1280', 'made smaller to fit 2560 x 1600');
  assert.equal(fs.readFileSync(path.join(dir, `${id}-thumb.jpg`), 'utf8'), 'JPEG 320x160');
  fs.rmSync(a);
  assert.ok((await app.ipc['alert-images'](ev))[0].thumb, 'the copy stays when the original file is deleted');

  // With pictures switched on, the alert gets one behind it
  await app.svc('saveSettings', { alertBackground: { mode: 'images', pick: 'fixed', fixedId: result.images[1].id, blur: 50, panel: 'glass', position: 'bottom' } });
  app.ipc['preview-alert'](ev);
  const win = app.alertWindows()[0];
  app.ipcOn['alert-ready'](alertEvent(win));
  const render = win.sent.find(([c]) => c === 'alert-render')[1];
  assert.equal(render.background.imageId, result.images[1].id);
  assert.equal(render.background.blur, 50);
  assert.equal(render.background.position, 'bottom');
  assert.match(render.background.url, /^data:image\/jpeg;base64,/);
  app.ipcOn['alert-action'](alertEvent(win), { type: 'dismiss', itemId: render.items[0].id });

  // Removing a picture deletes its files
  const left = await app.ipc['remove-alert-image'](ev, id);
  assert.deepEqual(left.map((x) => x.name), ['Hills']);
  assert.equal(fs.existsSync(path.join(dir, `${id}.jpg`)), false);
  assert.equal(fs.existsSync(path.join(dir, `${id}-thumb.jpg`)), false);
  // Another page may not use these
  await assert.rejects(Promise.resolve().then(() => app.ipc['alert-images']({ sender: {} })));
  app.cleanup();
});

test('Alert pictures: a task set to "Solid Color" keeps the color; "Only Tasks I Choose" shows pictures only where chosen', async () => {
  const app = await launch();
  const service = app.main.getService();
  service.saveSettings({ alertBackground: { mode: 'images', images: [{ id: 'a'.repeat(24), name: 'A' }], useFor: 'chosen' } });
  const items = (choice) => service.buildAlertItems([{ id: 'x', taskId: 't', dateKey: '2030-01-10', title: 'T', start: new Date(), end: new Date(), durationMinutes: 30, zoneName: 'Fajr → Dhuhr', zoneIndex: 1, priority: 'Medium', background: choice }])[0].backgroundId;
  assert.equal(items('default'), '', 'not chosen: the solid color');
  assert.equal(items('image'), 'a'.repeat(24));
  service.saveSettings({ alertBackground: { useFor: 'all' } });
  assert.equal(items('default'), 'a'.repeat(24));
  assert.equal(items('color'), '');
  assert.equal(service.alertBackgroundLook('a'.repeat(24)).panel, 'glass');
  assert.equal(service.alertBackgroundLook('b'.repeat(24)), null, 'a picture that is not in the list is never shown');
  app.cleanup();
});


// ---- 1.5.0: the tray after Isha, the alert sound that stops by itself ---------------------------------------------

test('Tray: after Isha "Until the Next Prayer" is gone (it would be the same as Until the Next Fajr); before it, it pauses until the prayer', async () => {
  const app = await launch();
  const service = app.main.getService();
  const realNow = service.now;
  const today = new Date();
  const at = (h, m) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0, 0);
  // The stand-in prayer times: Fajr 5:05, Dhuhr 11:48, Asr 15:14, Maghrib 18:00, Isha 19:20
  service.now = () => at(21, 0);
  assert.equal(trayMenu(app)[0].label, 'Next Prayer: Fajr in 8h 5m');
  let choices = trayItem(app, 'Pause Reminders').submenu.map((i) => i.label);
  assert.deepEqual(choices, ['For 30 Minutes', 'For 1 Hour', 'For 2 Hours', 'Until the Next Fajr']);
  assert.deepEqual(trayItem(app, 'Pause All').submenu.map((i) => i.label), choices);
  trayItem(app, 'Pause Reminders').submenu[3].click();
  assert.ok(trayMenu(app).some((i) => i.label === 'Resume Reminders'), 'the pause is on');
  assert.match(trayMenu(app).find((i) => /Reminders Paused Until/.test(i.label || '')).label, /5:05 AM/);
  trayItem(app, 'Resume Reminders').click();
  // After midnight, before Fajr: still no "Until the Next Prayer"
  service.now = () => at(2, 0);
  assert.deepEqual(trayItem(app, 'Pause Routines').submenu.map((i) => i.label), choices);
  // In the afternoon it is there and ends at Maghrib
  service.now = () => at(16, 0);
  choices = trayItem(app, 'Pause Routines').submenu;
  assert.equal(choices[3].label, 'Until the Next Prayer');
  assert.equal(trayMenu(app)[0].label, 'Next Prayer: Maghrib in 2h 0m');
  choices[3].click();
  assert.match(trayMenu(app).find((i) => /Routines Paused Until/.test(i.label || '')).label, /6:00 PM/);
  service.now = realNow;
  app.cleanup();
});

test('Alert sound: "Stop the Sound After" is sent with the sound (1 to 10 minutes, 0 = until a button is pressed)', async () => {
  const app = await launch();
  const service = app.main.getService();
  assert.equal(service.getSettings().alertSoundStopMinutes, 0);
  service.saveSettings({ alertSoundRepeat: true, alertSoundStopMinutes: 2 });
  assert.equal(service.getAlertConfig().sound.stopAfterMinutes, 2);
  assert.throws(() => service.saveSettings({ alertSoundStopMinutes: 11 }));
  assert.throws(() => service.saveSettings({ alertSoundStopMinutes: 1.5 }));
  app.cleanup();
});

// ---- The window's page: crash, hang, failed load, wake from sleep -----------------------------------------------

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// An app whose window is up and whose page said "ready"; the recovery waits are made short.
async function liveApp(options = {}, config = {}) {
  const app = await launch(options);
  Object.assign(app.main.getRecovery().config, { settleMs: 5, unresponsiveGraceMs: 20, readyTimeoutMs: 40, pingTimeoutMs: 15, backoffMs: [0, 5, 5], ...config });
  const win = app.win();
  win.emit('ready-to-show');
  app.ipcOn['renderer-ready']();
  return { app, win };
}
const readLog = (app) => fs.readFileSync(path.join(app.userData, 'logs', 'waqtwise.log'), 'utf8');

test('A crashed page is reloaded once, and nothing is sent to it until it is ready again', async () => {
  const { app, win } = await liveApp();
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 });
  assert.equal(win.reloads, 1);
  assert.equal(app.main.getRecovery().isBusy(), true);
  const before = win.sent.length;
  app.powerEvents.resume(); // the data refresh must not go to a page that is gone
  assert.equal(win.sent.length, before);
  app.ipcOn['renderer-ready']();
  assert.equal(app.main.getRecovery().isBusy(), false);
  assert.equal(app.main.getRecovery().attempts(), 0);
  const text = readLog(app);
  assert.match(text, /Renderer process gone.*crashed/);
  assert.match(text, /Recovery succeeded/);
  app.cleanup();
});

test('Repeated crash and wake events during a recovery do not start more recoveries', async () => {
  const { app, win } = await liveApp();
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 });
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 });
  app.powerEvents.resume();
  app.powerEvents['unlock-screen']();
  await pause(15); // the wake checks run, and find a recovery already going
  assert.equal(win.reloads, 1);
  assert.equal(app.windows.length, 1);
  app.cleanup();
});

test('A page that stays broken gets a new window, and after the last attempt recovery stops', async () => {
  const { app, win } = await liveApp();
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 }); // attempt 1: reload; the page never says ready
  await pause(150);
  assert.equal(win.reloads, 1);
  assert.equal(win.destroyed, true, 'the first window is replaced');
  assert.equal(app.windows.length, 3, 'attempts 2 and 3 build a new window each, then it stops');
  assert.equal(app.windows.filter((w) => !w.destroyed).length, 1);
  assert.equal(app.main.getRecovery().request('again'), 'gave-up');
  assert.match(readLog(app), /Recovery gave up/);
  app.cleanup();
});

test('Opening the window shows a broken page only after it is repaired', async () => {
  const { app, win } = await liveApp();
  app.ipcOn['renderer-ready']();
  win.emit('close'); // the person closes it to the tray
  assert.equal(win.visible, false);
  win.crashed = true; // the page died without anyone noticing
  const shown = win.shownCount;
  app.appEvents['second-instance'][0]({}, ['WaqtWise.exe']);
  assert.equal(win.reloads, 1);
  assert.equal(win.shownCount, shown, 'not shown while it is broken');
  app.ipcOn['renderer-ready']();
  assert.equal(win.shownCount, shown + 1, 'shown once the page works');
  app.cleanup();
});

test('Wake from sleep with a healthy page does not reload it', async () => {
  const { app, win } = await liveApp();
  const engine = app.main.getEngine();
  app.powerEvents.resume();
  assert.ok(win.sent.some(([channel]) => channel === 'data-changed'));
  await pause(40);
  assert.equal(win.reloads, 0);
  assert.equal(app.windows.length, 1);
  assert.match(readLog(app), /healthy after the system event/);
  assert.equal(app.main.getEngine(), engine);
  app.cleanup();
});

test('Wake from sleep with a broken page repairs only the page; the engines keep running', async () => {
  const { app, win } = await liveApp();
  const engine = app.main.getEngine();
  const routines = app.main.getRoutineEngine();
  const service = app.main.getService();
  win.crashed = true;
  app.powerEvents.resume();
  await pause(25);
  assert.equal(win.reloads, 1);
  assert.equal(app.main.getEngine(), engine);
  assert.equal(app.main.getRoutineEngine(), routines);
  assert.equal(app.main.getService(), service);
  assert.equal(app.trays.length, 1);
  app.cleanup();
});

test('A page that does not answer after wake is repaired', async () => {
  const { app, win } = await liveApp();
  win.pingFails = true;
  app.powerEvents['unlock-screen']();
  await pause(50);
  assert.equal(win.reloads, 1);
  assert.match(readLog(app), /did not answer/);
  app.cleanup();
});

test('A hang that ends by itself is left alone; one that lasts is repaired', async () => {
  const { app, win } = await liveApp();
  win.page('unresponsive');
  await pause(5);
  win.page('responsive');
  await pause(40);
  assert.equal(win.reloads, 0);
  assert.match(readLog(app), /responsive by itself/);
  win.page('unresponsive');
  await pause(10);
  assert.equal(win.reloads, 0, 'not before the grace period');
  await pause(30);
  assert.equal(win.reloads, 1);
  app.cleanup();
});

test('Only a failed load of the main page is a failure', async () => {
  const { app, win } = await liveApp();
  win.page('did-fail-load', -3, 'ERR_ABORTED', 'file:///x', true); // a load replaced by another one
  win.page('did-fail-load', -2, 'ERR_FAILED', 'file:///x', false); // a part of the page
  assert.equal(win.reloads, 0);
  win.page('did-fail-load', -2, 'ERR_FAILED', 'file:///x', true);
  assert.equal(win.reloads, 1);
  assert.match(readLog(app), /Page failed to load/);
  app.cleanup();
});

test('A window the person sent to the tray stays in the tray, also when the page has to be repaired', async () => {
  const { app, win } = await liveApp();
  win.emit('close'); // sent to the tray
  const shown = win.shownCount;
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 });
  app.ipcOn['renderer-ready']();
  assert.equal(win.shownCount, shown);
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 }); // and a new window after a failed reload
  await pause(80);
  const fresh = app.windows.filter((w) => !w.destroyed).pop();
  assert.notEqual(fresh, win);
  fresh.emit('ready-to-show');
  assert.equal(fresh.shownCount, 0);
  assert.equal(fresh.options.show, false);
  app.cleanup();
});

test('Events kept while the page is not ready are not repeated when it is ready again', async () => {
  const { app, win } = await liveApp();
  win.page('render-process-gone', { reason: 'crashed', exitCode: 1 });
  app.main.handleAction({ type: 'routines' });
  app.main.handleAction({ type: 'routines' });
  app.ipcOn['renderer-ready']();
  assert.equal(win.sent.filter(([channel]) => channel === 'show-routines').length, 1);
  app.cleanup();
});

test('Settings can open the log folder, and the log has no planner data', async () => {
  const { app } = await liveApp();
  await app.svc('saveTask', { mode: 'create', form: form({ title: 'My private task title' }) });
  const result = await app.ipc['open-logs-folder']();
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(app.openedPaths, [path.join(app.userData, 'logs')]);
  assert.match(readLog(app), /App started/);
  assert.doesNotMatch(readLog(app), /private task title/);
  app.cleanup();
});

// ---- Tray icon: normal, or monochrome that follows the Windows taskbar -------------------------------------------------

// Windows' taskbar mode as Electron reports it (nativeTheme.shouldUseDarkColorsForSystemIntegratedUI), which is not the
// app mode (shouldUseDarkColors). `taskbar.dark` can be changed while the app runs; `taskbar.reads` counts the looks.
function fakeTaskbar(app, dark) {
  const taskbar = { dark, reads: 0 };
  Object.defineProperty(app.nativeTheme, 'shouldUseDarkColorsForSystemIntegratedUI', {
    configurable: true,
    get() { taskbar.reads += 1; return taskbar.dark; },
  });
  return taskbar;
}
const trayFile = (app) => path.basename(app.trays[0].image.path);

test('Tray icon: the normal colored icon is the default and the taskbar is not looked at', async () => {
  const app = await launch();
  const taskbar = fakeTaskbar(app, true);
  assert.equal(trayFile(app), 'tray-icon.png');
  assert.equal((await app.svc('getSettings')).trayIcon, 'normal');
  app.themeEvents.forEach((fn) => fn());
  await pause(400);
  assert.equal(taskbar.reads, 0);
  assert.equal(trayFile(app), 'tray-icon.png');
  app.cleanup();
});

test('Tray icon: monochrome follows the taskbar mode (not the app mode), also when Windows changes', async () => {
  const app = await launch();
  app.nativeTheme.shouldUseDarkColors = false; // the apps are light ...
  const taskbar = fakeTaskbar(app, true); // ... and the taskbar is dark: the icon must be white
  await app.svc('saveSettings', { trayIcon: 'monochrome' });
  await pause(10);
  assert.equal(trayFile(app), 'tray-icon-white.png');
  // Windows switches to the light mode: no restart needed.
  taskbar.dark = false;
  app.themeEvents.forEach((fn) => fn());
  await pause(450);
  assert.equal(trayFile(app), 'tray-icon-black.png');
  taskbar.dark = true;
  app.powerEvents.resume(); // a change that happened during sleep
  await pause(450);
  assert.equal(trayFile(app), 'tray-icon-white.png');
  // Back to the normal icon: it is colored again and the taskbar is not looked at any more.
  await app.svc('saveSettings', { trayIcon: 'normal' });
  assert.equal(trayFile(app), 'tray-icon.png');
  const reads = taskbar.reads;
  app.themeEvents.forEach((fn) => fn());
  await pause(400);
  assert.equal(taskbar.reads, reads);
  assert.match(readLog(app), /Tray icon changed/);
  app.cleanup();
});

test('Tray icon: an unchanged mode does not set the icon again, and a failing reader never breaks the app', async () => {
  const app = await launch();
  const taskbar = fakeTaskbar(app, true);
  await app.svc('saveSettings', { trayIcon: 'monochrome' });
  await pause(10);
  const images = app.trays[0].images.length;
  app.themeEvents.forEach((fn) => fn());
  await pause(400);
  assert.ok(taskbar.reads >= 2);
  assert.equal(app.trays[0].images.length, images, 'same mode: the icon is not set again');
  app.main.getTaskbarTheme().isDark = () => { throw new Error('the mode cannot be read'); };
  app.themeEvents.forEach((fn) => fn());
  await pause(400);
  assert.equal(trayFile(app), 'tray-icon-white.png');
  app.cleanup();
});

test('Tray icon: the monochrome files exist in the four sizes, as white and as black, with transparency', () => {
  for (const name of ['white', 'black']) {
    for (const [suffix, size] of [['', 16], ['@1.5x', 24], ['@2x', 32], ['@3x', 48]]) {
      const file = path.join(__dirname, '..', 'src', 'main', `tray-icon-${name}${suffix}.png`);
      assert.ok(fs.existsSync(file), `${name}${suffix} exists`);
      const buf = fs.readFileSync(file);
      assert.equal(buf.readUInt32BE(16), size);
      assert.equal(buf.readUInt32BE(20), size);
      assert.equal(buf[25], 6, 'RGBA'); // color type 6: has an alpha channel
    }
  }
});

test('A main page whose file cannot be read (loadFile rejects, as on a slow or missing drive) is repaired', async () => {
  // The error Electron gives: "ERR_FAILED (-2) loading 'file:///...index.html'", with code and errno.
  const error = Object.assign(new Error("ERR_FAILED (-2) loading 'file:///D:/WaqtWise/resources/app.asar/src/renderer/index.html'"), { code: 'ERR_FAILED', errno: -2 });
  const app = await launch({ loadFileError: error });
  Object.assign(app.main.getRecovery().config, { backoffMs: [0, 5, 5], readyTimeoutMs: 40 });
  await pause(30);
  const text = readLog(app);
  assert.match(text, /loadFile failed/);
  assert.match(text, /Recovery attempt/);
  assert.equal(app.win().reloads, 1);
  app.cleanup();
});

test('A start with Windows: a notification click before the page exists opens the window once its page has drawn, and the missed list reaches it', async () => {
  const app = await launch({ hidden: true });
  assert.equal(app.windows.length, 0);
  app.main.handleAction({ type: 'missed' }); // the click on "2 reminders were missed"
  assert.equal(app.windows.length, 1);
  const win = app.win();
  assert.equal(win.shownCount, 0, 'not shown while the page has drawn nothing');
  app.main.handleAction({ type: 'missed' }); // a second click does not stack windows or show a blank one
  assert.equal(app.windows.length, 1);
  assert.equal(win.shownCount, 0);
  win.emit('ready-to-show');
  assert.equal(win.shownCount, 1);
  assert.match(readLog(app), /Action.*missed/);
  app.cleanup();
});

test('A window that is wanted but never draws its page is repaired after the wait', async () => {
  const app = await launch();
  Object.assign(app.main.getRecovery().config, { paintWatchMs: 20, readyTimeoutMs: 400, backoffMs: [0, 5, 5] });
  const win = app.win();
  app.main.handleAction({ type: 'open' });
  assert.equal(win.shownCount, 0, 'not shown blank');
  assert.equal(win.reloads, 0);
  await pause(60);
  assert.equal(win.reloads, 1, 'repaired after the wait');
  assert.match(readLog(app), /has not drawn yet/);
  assert.match(readLog(app), /Recovery attempt.*not-painted/);
  app.cleanup();
});

test('While the page is still starting, a hang gets the longer grace period', async () => {
  const { app, win } = await launchStarting();
  Object.assign(app.main.getRecovery().config, { unresponsiveGraceMs: 10, unresponsiveStartupGraceMs: 120 });
  win.page('unresponsive');
  await pause(50);
  assert.equal(win.reloads, 0, 'a slow start is not a hang');
  await pause(120);
  assert.equal(win.reloads, 1);
  app.cleanup();
});

async function launchStarting() {
  const app = await launch();
  return { app, win: app.win() };
}
