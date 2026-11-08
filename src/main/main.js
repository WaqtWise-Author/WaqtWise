'use strict';

// WaqtWise - Electron main process.
//
// The app is a background task manager, not just a window:
//   Windows start-up -> background operation -> system tray -> reminder engine -> Windows notifications
//
//   - Closing (X) or minimizing the window hides it to the tray; the app keeps running.
//   - "Exit" in the tray menu is the only way to stop it (after a confirmation).
//   - "Start with Windows" launches it at login, hidden in the tray.
//   - Only one copy runs; launching it again brings the running copy forward.
//   - Reminders come from the engine in this process, so they do not depend on the window.

const { t } = require('../core/i18n');
require('../core/i18n-ar');
const path = require('path');
const { fileURLToPath } = require('url');
const fs = require('fs');
const os = require('os');
const {
  app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage, powerMonitor, screen, nativeTheme, session, shell,
} = require('electron');

const { PlannerService, checkRequest } = require('./service');
const { FileStore } = require('./store');
const { ReminderEngine } = require('../core/reminder-engine');
const { RoutineEngine } = require('../core/routine-engine');
const { formatTime12 } = require('../core/time');
const { isValidSnoozeOption } = require('../core/snooze');
const { createElectronNotifier, findActionUrlInArgv, APP_ID, PROTOCOL } = require('./toast');
const { createTray } = require('./tray');
const { createAlertManager, isValidAction } = require('./alert-window');
const { MAX_IMPORT_BYTES } = require('../core/limits');
const { MAX_ALERT_IMAGES } = require('../core/alert-background');
const { createBackgrounds } = require('./backgrounds');
const { createLogger } = require('./logger');
const { createRecovery } = require('./recovery');

const ICON = path.join(__dirname, 'icon.ico'); // window / taskbar icon (the .ico holds the small bold version Windows needs at 16-32 px)
// Tray icon: tray-icon.png is 16x16; Electron also picks up tray-icon@1.5x / @2x / @3x for sharper icons on scaled screens.
const TRAY_ICON = path.join(__dirname, 'tray-icon.png');
const STARTUP_ARG = '--hidden'; // given to the app when Windows starts it at login
const WATCHDOG_MS = 60000;

let mainWindow = null;
let service = null;
let engine = null;
let routineEngine = null;
let notify = null;
let trayController = null;
let alertManager = null;
let watchdog = null;
let rendererReady = false;
let quitting = false; // true only when the app is really being closed
let showOnReady = true;
let lastLoginSetting = null;
let lastOffset = null;
const pendingEvents = []; // events waiting for the window to be ready
const MAX_PENDING_EVENTS = 20;
let showAfterReload = false; // a reload (not a new window) must show the window once the page is ready
// What is known about the current window's page; it starts again with every window and every reload.
const winState = { createdAt: 0, loadFinishedAt: 0, loadFailed: false, crashed: false };

// ---- Log file ---------------------------------------------------------------------------------------------------
// Diagnostics for problems nobody was watching (see logger.js): %APPDATA%\WaqtWise\logs\waqtwise.log. No planner data.
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = createLogger({
        fs,
        dir: path.join(app.getPath('userData'), 'logs'),
        context: {
          version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
          platform: process.platform, arch: process.arch, os: os.release(),
        },
      });
      logger.header();
    } catch (error) {
      logger = { info() {}, warn() {}, error() {}, dir: '' };
    }
  }
  return logger;
}
const diag = {
  info: (...args) => getLogger().info(...args),
  warn: (...args) => getLogger().warn(...args),
  error: (...args) => getLogger().error(...args),
};

function log(...args) {
  // Console (visible when started from a terminal) and the log file.
  console.error('[waqtwise]', ...args);
  getLogger().error(...args);
}

// ---- Talking to the window ---------------------------------------------------------------------------------

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    try {
      mainWindow.webContents.send(channel, payload);
    } catch (error) {
      // The page went away at this very moment: the recovery handles it.
      diag.warn('Could not send to the window', channel);
    }
  } else if (channel !== 'data-changed' && channel !== 'pause-changed' && channel !== 'pomodoro-changed') {
    // While the page is not ready the same event is kept once, and only the newest ones are kept.
    let key = channel;
    try { key = JSON.stringify([channel, payload]); } catch (error) { /* keep the channel as the key */ }
    if (pendingEvents.some((event) => event.key === key)) return;
    pendingEvents.push({ channel, payload, key });
    while (pendingEvents.length > MAX_PENDING_EVENTS) pendingEvents.shift();
  }
}

function flushPendingEvents() {
  while (pendingEvents.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    const { channel, payload } = pendingEvents.shift();
    try { mainWindow.webContents.send(channel, payload); } catch (error) { diag.warn('Could not send to the window', channel); }
  }
}

// ---- The window --------------------------------------------------------------------------------------------------

// The title bar takes the colours of the page, so the window looks like one piece in light and dark.
const TITLE_BAR_HEIGHT = 32;
const TITLE_COLORS = {
  light: { color: '#edf4f6', symbolColor: '#0b2a44' },
  dark: { color: '#071a2e', symbolColor: '#eaf3f8' },
};

function titleBarColors() {
  const choice = service ? service.getSettings().theme : 'system';
  const dark = choice === 'dark' || (choice !== 'light' && nativeTheme.shouldUseDarkColors);
  return dark ? TITLE_COLORS.dark : TITLE_COLORS.light;
}

function applyTitleBarTheme() {
  if (!mainWindow || mainWindow.isDestroyed() || typeof mainWindow.setTitleBarOverlay !== 'function') return;
  try {
    mainWindow.setTitleBarOverlay({ ...titleBarColors(), height: TITLE_BAR_HEIGHT });
    mainWindow.setBackgroundColor(titleBarColors().color);
  } catch (error) {
    // Not every platform can change it; the window still works.
  }
}

nativeTheme.on('updated', applyTitleBarTheme);

function createWindow({ visible }) {
  rendererReady = false;
  showOnReady = visible;
  showAfterReload = false;
  Object.assign(winState, { createdAt: Date.now(), loadFinishedAt: 0, loadFailed: false, crashed: false });
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 640,
    minHeight: 520,
    show: false, // shown when ready (or kept hidden for a start with Windows)
    title: 'WaqtWise',
    icon: ICON,
    backgroundColor: titleBarColors().color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...titleBarColors(), height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  const win = mainWindow; // events of an older window must never act on the current one
  diag.info('Window created', { visible });
  watchPage(win);
  Promise.resolve(win.loadFile(PAGES.main)).catch((error) => {
    if (error && (error.code === 'ERR_ABORTED' || error.errno === -3)) return; // a load replaced by another one
    diag.error('loadFile failed', error);
    if (win === mainWindow && !winState.loadFailed) {
      winState.loadFailed = true;
      rendererReady = false;
      recovery.request('loadFile-rejected');
    }
  });

  mainWindow.once('ready-to-show', () => {
    diag.info('Window ready to show', { show: showOnReady });
    if (win === mainWindow && showOnReady && !mainWindow.isDestroyed()) {
      mainWindow.maximize(); // always opens full size
      mainWindow.show();
      bringToFront();
    }
  });

  // The window only ever shows our own page.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // Closing or minimizing hides the window to the tray instead of ending the app.
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    hideToTray(true);
  });
  // "minimize" cannot be cancelled on Windows (preventDefault does nothing there), so the window is simply hidden
  // after it has been minimized; showWindow() restores it first.
  mainWindow.on('minimize', () => {
    if (quitting) return;
    hideToTray(false);
  });
  // Windows is shutting down or logging off: never get in its way.
  mainWindow.on('session-end', () => {
    quitting = true;
  });

  mainWindow.on('closed', () => {
    if (win !== mainWindow) return; // an old window that was replaced by a recovery
    mainWindow = null;
    rendererReady = false;
  });
}

// ---- Watching the page, and repairing it ---------------------------------------------------------------------------------
// The tray keeps the app (and its reminders) alive while the window's page may have crashed, hung or failed to load.
// These events are logged, and a confirmed failure goes to the recovery controller (recovery.js).

function watchPage(win) {
  const wc = win.webContents;
  const current = () => win === mainWindow;
  wc.on('render-process-gone', (event, details) => {
    diag.error('Renderer process gone', { reason: details && details.reason, exitCode: details && details.exitCode });
    if (!current()) return;
    winState.crashed = true;
    rendererReady = false; // nothing more is sent to a page that is gone
    recovery.request('render-process-gone');
  });
  wc.on('unresponsive', () => {
    diag.warn('Renderer unresponsive');
    if (current()) recovery.unresponsive();
  });
  wc.on('responsive', () => {
    diag.info('Renderer responsive');
    if (current()) recovery.responsive();
  });
  wc.on('did-start-loading', () => diag.info('Page loading'));
  wc.on('did-finish-load', () => {
    diag.info('Page loaded');
    if (!current()) return;
    winState.loadFinishedAt = Date.now();
    winState.loadFailed = false;
  });
  wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      diag.warn('A part of the page failed to load', { errorCode, errorDescription });
      return;
    }
    if (errorCode === -3) { // ERR_ABORTED: a load replaced by another one (a reload); not a failure
      diag.info('Page load was replaced by another load');
      return;
    }
    diag.error('Page failed to load', { errorCode, errorDescription });
    if (!current()) return;
    winState.loadFailed = true;
    rendererReady = false;
    recovery.request('did-fail-load');
  });
}

// What recovery.js needs to know about the window right now.
function inspectWindow() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return { exists: false };
  const wc = win.webContents;
  if (wc.isDestroyed && wc.isDestroyed()) return { exists: true, crashed: true, ready: false, loading: false, loadFailed: false, sinceLoadMs: Infinity };
  return {
    exists: true,
    crashed: winState.crashed || Boolean(wc.isCrashed && wc.isCrashed()),
    loadFailed: winState.loadFailed,
    loading: Boolean(wc.isLoading && wc.isLoading()),
    ready: rendererReady,
    sinceLoadMs: Date.now() - (winState.loadFinishedAt || winState.createdAt),
  };
}

// First repair: load the same page again in the same window.
function reloadMainWindow() {
  const win = mainWindow;
  Object.assign(winState, { createdAt: Date.now(), loadFinishedAt: 0, loadFailed: false, crashed: false });
  rendererReady = false;
  showAfterReload = showOnReady; // a window that should be on screen is shown once the page is ready
  win.webContents.reload();
}

// Next repairs: replace the window (keeping it hidden if it was hidden). The old one is destroyed without the
// "hide to the tray" step.
function recreateMainWindow() {
  const old = mainWindow;
  const visible = showOnReady || Boolean(old && !old.isDestroyed() && old.isVisible && old.isVisible());
  mainWindow = null;
  if (old && !old.isDestroyed()) {
    try { old.destroy(); } catch (error) { diag.error('Could not close the old window', error); }
  }
  createWindow({ visible });
}

function pingRenderer() {
  return mainWindow.webContents.executeJavaScript('document.readyState');
}

const recovery = createRecovery({
  log: diag,
  inspect: inspectWindow,
  reload: reloadMainWindow,
  recreate: recreateMainWindow,
  ping: pingRenderer,
  isQuitting: () => quitting,
});

// Windows does not let a program that is running in the background take the screen: the window only flashes in the
// taskbar. This is the case after a start with Windows, when the person later opens the app from its shortcut or the
// tray. Asking for the focus, and putting the window on top for a moment, makes it come to the front.
let frontTimer = null;
function bringToFront() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  try {
    if (typeof app.focus === 'function') app.focus({ steal: true });
    if (typeof win.setAlwaysOnTop === 'function') {
      win.setAlwaysOnTop(true);
      if (typeof win.moveTop === 'function') win.moveTop();
      win.focus();
      clearTimeout(frontTimer);
      frontTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
      }, 400);
      if (frontTimer.unref) frontTimer.unref();
    } else {
      win.focus();
    }
  } catch (error) {
    log('Could not bring the window to the front:', error);
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ visible: true });
    return;
  }
  showOnReady = true;
  // A page that is known to be broken is not shown again: it is repaired first, and shown once it works.
  const failure = recovery.diagnose();
  if (failure || recovery.isBusy()) {
    diag.warn('The window was opened while its page is not working', { failure });
    const result = recovery.isBusy() && !failure ? 'busy' : recovery.request(`show-window:${failure}`, { userAction: true });
    if (result === 'started' || result === 'deferred' || result === 'busy') {
      showAfterReload = true;
      return;
    }
    // Recovery refused (gave up): show the window as before rather than nothing.
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isMaximized()) mainWindow.maximize(); // opening from the tray brings it back full size
  mainWindow.show();
  bringToFront();
}

function hideWindow() {
  showOnReady = false; // a window the person sent to the tray stays there, also after a recovery
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

function hideToTray(announce) {
  hideWindow();
  if (announce) announceBackgroundRunning().catch((error) => log('Message failed:', error));
}

// The first time the window is closed: "still running in the background", with "Don't show again".
async function announceBackgroundRunning() {
  const settings = service.getSettings();
  if (!settings.showBackgroundMessage || settings.backgroundMessageShown) return;
  service.saveSettings({ backgroundMessageShown: true });
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'WaqtWise',
    message: t('WaqtWise is still running in the background.'),
    detail: t('It stays in the system tray (the icons near the clock) so your reminders keep working. To close it completely, right-click its tray icon and choose Exit.'),
    buttons: [t('OK')],
    defaultId: 0,
    noLink: true,
    checkboxLabel: t("Don't Show This Again"),
    checkboxChecked: false,
  });
  if (result.checkboxChecked) service.saveSettings({ showBackgroundMessage: false });
}

// ---- Exit ---------------------------------------------------------------------------------------------------------------

async function confirmExit() {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: t('Exit WaqtWise'),
    message: t('Exit WaqtWise?'),
    detail: t('Reminders and notifications will stop until you start WaqtWise again.'),
    buttons: [t('Exit'), t('Cancel')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response === 0) {
    quitting = true;
    app.quit();
  }
}

// ---- Pause reminders and routines ---------------------------------------------------------------------------------------
// Two separate pauses. "Reminders" covers the tasks in the zones (notifications, full-screen alerts, zone-start
// notifications); "routines" covers the routines. Whatever falls inside a pause is simply dropped (it is not put in the
// missed list). A pause is not saved: it ends when the app is closed.

const pauses = {
  reminders: { until: 0, timer: null },
  routines: { until: 0, timer: null },
};

function isPaused(kind) {
  return pauses[kind].until > service.now().getTime();
}

// The settings each engine sees: with its pause on, every kind of reminder of that engine is switched off.
function engineSettings(kind) {
  const settings = service.getReminderSettings();
  if (!isPaused(kind)) return settings;
  return { ...settings, notificationsEnabled: false, fullScreenAlerts: false, zoneStartNotifications: false };
}

function pausedLabel(kind) {
  const forRoutines = kind === 'routines';
  return t(forRoutines ? 'Routines Paused Until {time}' : 'Reminders Paused Until {time}', { time: formatTime12(new Date(pauses[kind].until)) });
}

// What the window shows in its "paused" bar: { reminders: { until, label } | null, routines: { until, label } | null }.
function pauseState() {
  const one = (kind) => (isPaused(kind) ? { until: pauses[kind].until, label: formatTime12(new Date(pauses[kind].until)) } : null);
  return { reminders: one('reminders'), routines: one('routines') };
}

function refreshTrayTooltip() {
  sendToWindow('pause-changed', pauseState());
  if (!trayController) return;
  const parts = ['reminders', 'routines'].filter(isPaused).map(pausedLabel);
  const timer = service ? service.getPomodoroTimer() : null;
  // (The tooltip is not redrawn every second, so it names the part without the time left.)
  if (timer) parts.push(timer.status === 'running' ? t('Pomodoro: {part}', { part: timer.partName }) : pomodoroLine(timer));
  trayController.setTooltip(['WaqtWise', ...parts].join(' · '));
}

function pauseFor(kind, until) {
  // A pause that would already be over (the chosen moment is not in the future) is not started.
  if (!(until > service.now().getTime())) {
    log(`Pause of ${kind} not started: the end time is not in the future`);
    return;
  }
  const p = pauses[kind];
  p.until = until;
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => resumeFor(kind), Math.max(0, until - service.now().getTime()) + 500);
  if (p.timer.unref) p.timer.unref();
  refreshTrayTooltip();
}

function resumeFor(kind) {
  const p = pauses[kind];
  p.until = 0;
  if (p.timer) clearTimeout(p.timer);
  p.timer = null;
  refreshTrayTooltip();
}

// ---- Pictures behind the full-screen alert (1.4.0) --------------------------------------------------------------------------

let backgrounds = null;

// The look of the picture with the picture itself (as a data: address), or null for the solid color.
function alertPicture(imageId, thumb) {
  if (!service || !backgrounds) return null;
  const look = service.alertBackgroundLook(imageId);
  if (!look) return null;
  const url = backgrounds.dataUrl(look.imageId, thumb);
  return url ? { ...look, url } : null;
}

// The pictures for the Settings screen, each with its small copy.
function alertImageList() {
  const bg = service.getSettings().alertBackground;
  return bg.images.map((x) => ({ id: x.id, name: x.name, thumb: backgrounds ? backgrounds.dataUrl(x.id, true) : null }));
}

// ---- Pomodoro ----------------------------------------------------------------------------------------------------------------
// The timer itself is in the service (see planner/pomodoros.js); here it gets a clock: one timeout aimed at the moment
// the service asks for (the end of the part, or the next prayer when the Pomodoro stops for prayer).

let pomodoroTimeout = null;

function schedulePomodoro() {
  if (pomodoroTimeout) clearTimeout(pomodoroTimeout);
  pomodoroTimeout = null;
  if (!service) return;
  const due = service.pomodoroDueMs();
  if (due === null) return;
  pomodoroTimeout = setTimeout(() => {
    pomodoroTimeout = null;
    try {
      service.pomodoroTick();
    } catch (error) {
      log('Pomodoro:', error);
    }
    schedulePomodoro();
  }, Math.min(Math.max(0, due - service.now().getTime()) + 50, 2 ** 31 - 1));
  if (pomodoroTimeout.unref) pomodoroTimeout.unref();
}

// A part ended (or the timer stopped for prayer): a full-screen alert or a notification, as the Pomodoro asks.
function signalPomodoro(signal) {
  if (signal.alert === 'fullScreen' && alertManager) {
    alertManager.show([service.buildPomodoroAlertItem(signal)]);
    return;
  }
  if (!notify) return;
  notify({
    kind: 'pomodoro',
    id: `pomodoro-${Date.now()}`,
    title: signal.title,
    body: signal.lines.join('\n'),
    lines: signal.lines,
    silent: !service.getSettings().soundEnabled,
    taskId: null,
    dateKey: null,
    actions: [],
  });
}

function onPomodoroChanged(view) {
  schedulePomodoro();
  sendToWindow('pomodoro-changed', view);
  refreshTrayTooltip();
}

// "Pomodoro: Focus 18:42" (or "Paused", or what comes next while it waits).
function pomodoroLine(timer) {
  if (timer.status === 'waiting') return t('Pomodoro: {part} Next', { part: timer.next ? timer.next.name : '' });
  if (timer.status === 'paused') return t('Pomodoro: {part} Paused at {time}', { part: timer.partName, time: timer.remainingLabel });
  return t('Pomodoro: {part} {time}', { part: timer.partName, time: timer.remainingLabel });
}

function pomodoroDo(action, extra) {
  try {
    service.pomodoroAction({ action, ...extra });
  } catch (error) {
    log('Pomodoro:', error);
  }
}

// The Pomodoro lines of the tray menu: only while one is running (or waiting for its next part).
function pomodoroItems() {
  const timer = service.getPomodoroTimer();
  if (!timer) return [];
  const items = [{ id: 'pomodoro-now', label: pomodoroLine(timer), enabled: false, separatorBefore: true }];
  if (timer.status === 'running') items.push({ id: 'pomodoro-pause', label: t('Pause Pomodoro'), click: () => pomodoroDo('pause') });
  if (timer.status === 'paused') items.push({ id: 'pomodoro-resume', label: t('Resume Pomodoro'), click: () => pomodoroDo('resume') });
  if (timer.status === 'waiting' && timer.next) {
    items.push({ id: 'pomodoro-next', label: timer.next.part === 'focus' ? t('Start Focus') : t('Start Break'), click: () => pomodoroDo('next') });
  }
  items.push({ id: 'pomodoro-stop', label: t('Stop Pomodoro'), click: () => pomodoroDo('stop') });
  return items;
}

// ---- Tray ----------------------------------------------------------------------------------------------------------------

// The line at the top of the menu: the next prayer and how long until it ("Next Prayer: Fajr in 5h 12m").
function nextPrayerLine() {
  const next = service.getNextPrayer();
  if (!next) return t('Prayer Times Are Not Available');
  return t('Next Prayer: {prayer} in {time}', { prayer: next.name, time: next.inLabel });
}

// After Isha has begun the next prayer is Fajr, so "Until the Next Prayer" would only repeat "Until the Next Fajr".
function afterIsha() {
  return service.nextPrayerMs() === service.nextFajrMs();
}

// `kind` is 'reminders', 'routines' or 'all' (both at once).
function pauseChoices(kind) {
  const kinds = kind === 'all' ? ['reminders', 'routines'] : [kind];
  const pause = (until) => () => kinds.forEach((k) => pauseFor(k, until()));
  const minutes = (n) => pause(() => service.now().getTime() + n * 60000);
  return [
    { id: `pause-${kind}-30`, label: t('For 30 Minutes'), click: minutes(30) },
    { id: `pause-${kind}-60`, label: t('For 1 Hour'), click: minutes(60) },
    { id: `pause-${kind}-120`, label: t('For 2 Hours'), click: minutes(120) },
    afterIsha() ? null : { id: `pause-${kind}-prayer`, label: t('Until the Next Prayer'), click: pause(() => service.nextPrayerMs()) },
    { id: `pause-${kind}-fajr`, label: t('Until the Next Fajr'), click: pause(() => service.nextFajrMs()) },
  ].filter(Boolean);
}

// "Pause All" pauses reminders and routines together; once both are paused it becomes "Resume All".
function pauseAllItem() {
  if (isPaused('reminders') && isPaused('routines')) {
    return { id: 'resume-all', label: t('Resume All'), click: () => { resumeFor('reminders'); resumeFor('routines'); } };
  }
  return { id: 'pause-all', label: t('Pause All'), submenu: pauseChoices('all') };
}

// While paused the item turns into "paused until ..." and "Resume"; otherwise it is the list of pause lengths.
function pauseItems(kind) {
  const forRoutines = kind === 'routines';
  if (isPaused(kind)) {
    return [
      { id: `paused-${kind}`, label: pausedLabel(kind), enabled: false, separatorBefore: kind === 'reminders' },
      { id: `resume-${kind}`, label: t(forRoutines ? 'Resume Routines' : 'Resume Reminders'), click: () => resumeFor(kind) },
    ];
  }
  return [{ id: `pause-${kind}`, label: t(forRoutines ? 'Pause Routines' : 'Pause Reminders'), separatorBefore: kind === 'reminders', submenu: pauseChoices(kind) }];
}

// To add a tray menu item later, add one line here. It is built again every time the menu opens.
function trayActions() {
  return [
    { id: 'next-prayer', label: nextPrayerLine(), enabled: false },
    ...pomodoroItems(),
    ...pauseItems('reminders'),
    ...pauseItems('routines'),
    pauseAllItem(),
    { id: 'open', label: t('Open / Show'), separatorBefore: true, click: showWindow },
    { id: 'hide', label: t('Hide / Minimize'), click: hideWindow },
    { id: 'exit', label: t('Exit'), separatorBefore: true, click: confirmExit },
  ];
}

function startTray() {
  trayController = createTray(
    { Tray, Menu, nativeImage },
    { iconPath: TRAY_ICON, tooltip: 'WaqtWise', getActions: trayActions, onOpen: showWindow }
  );
}

// ---- Notification clicks and links ---------------------------------------------------------------------------------------

// action: { type: 'open' | 'missed' | 'routines' } from a click on a notification (or a waqtwise:// link): show the main
// window. { type: 'open-task', taskId, dateKey } comes from the "Open Task" button of the full-screen alert.
function handleAction(action) {
  if (!action) return;
  showWindow();
  if (action.type === 'open') sendToWindow('show-daily', {});
  if (action.type === 'open-routines' || action.type === 'routines') sendToWindow('show-routines', {});
  if (action.type === 'pomodoro') sendToWindow('show-pomodoro', {});
  if (action.type === 'open-task' && action.taskId && action.dateKey) {
    sendToWindow('open-task', { taskId: action.taskId, dateKey: action.dateKey });
  }
}

// ---- Full-screen alert ---------------------------------------------------------------------------------------

function startAlerts() {
  alertManager = createAlertManager({
    BrowserWindow,
    screen,
    preloadPath: path.join(__dirname, 'alert-preload.js'),
    pagePath: PAGES.alert,
    getConfig: () => service.getAlertConfig(),
    getBackground: (item) => alertPicture(item.backgroundId, false),
    onAbandoned: (left) => {
      const real = left.filter((i) => i.taskId !== '__sample__' && i.kind !== 'routine' && i.kind !== 'pomodoro'); // a routine time (or a Pomodoro alert) that was not answered is just skipped
      if (real.length === 0) return;
      service.addMissed(real.map((i) => ({ ...i, start: new Date(i.startMs), alreadyStarted: true })));
      sendToWindow('missed', real.map((i) => ({
        taskId: i.taskId, dateKey: i.dateKey, title: i.title, startLabel: i.startLabel, zoneName: t(i.zoneName), alreadyStarted: true,
      })));
    },
    log,
  });
}

// A button on the full-screen reminder was pressed.
function handleAlertAction(sender, { type, itemId, option }) {
  if (!alertManager || !alertManager.owns(sender) || !isValidAction(type) || !isValidSnoozeOption(option)) return;
  const item = alertManager.find(itemId);
  if (!item) return;
  alertManager.remove(itemId); // closes the screens when it was the last one

  const sample = item.taskId === '__sample__'; // the preview from Settings does nothing for real
  if (item.kind === 'pomodoro') {
    if (type === 'next') pomodoroDo('next');
    else if (type === 'snooze') pomodoroDo('extend', { minutes: Number.isInteger(option) ? option : undefined });
    else if (type === 'stop') pomodoroDo('stop');
    else if (type === 'open') handleAction({ type: 'pomodoro' });
    return;
  }
  if (type === 'next' || type === 'stop') return; // only the Pomodoro alert has these
  if (item.kind === 'routine') {
    const target = { routineId: item.routineId, dateKey: item.dateKey, slot: item.slot };
    if (type === 'snooze') routineEngine.handleAction({ type: 'snooze', ...target, fullScreen: true, option });
    else if (type === 'done') routineEngine.handleAction({ type: 'done', ...target });
    else if (type === 'open') handleAction({ type: 'open-routines' });
    return;
  }
  if (type === 'snooze' && !sample) {
    engine.handleAction({ type: 'snooze', taskId: item.taskId, dateKey: item.dateKey, fullScreen: true, option });
  } else if (type === 'done' && !sample) {
    engine.handleAction({ type: 'done', taskId: item.taskId, dateKey: item.dateKey });
  } else if (type === 'open' && !sample) {
    handleAction({ type: 'open-task', taskId: item.taskId, dateKey: item.dateKey });
  }
}

// ---- Reminder engine ---------------------------------------------------------------------------------------------------------

function startEngine() {
  notify = createElectronNotifier({ Notification, onError: (error) => log('Notification failed:', error) });
  engine = new ReminderEngine({
    getTasks: () => service.getTasks(),
    getProvider: () => service.provider(),
    getSettings: () => engineSettings('reminders'),
    notify,
    onMissed: (items, payload) => {
      notify(payload);
      service.addMissed(items);
      sendToWindow('missed', items.map((i) => ({
        taskId: i.taskId,
        dateKey: i.dateKey,
        title: i.title,
        startLabel: formatTime12(i.start),
        zoneName: t(i.zoneName),
        alreadyStarted: i.alreadyStarted,
      })));
    },
    showAlert: (items) => alertManager.show(service.buildAlertItems(items)),
    updateTask: (task, dateKey) => service.updateTaskFromEngine(task, dateKey),
    initialState: service.getReminderState(),
    saveState: (state) => service.saveReminderState(state),
    onError: (error) => log('Reminder engine:', error),
  });
  engine.start();

  routineEngine = new RoutineEngine({
    getRoutines: () => service.getRoutineList(),
    getSettings: () => engineSettings('routines'),
    getProvider: () => service.provider(),
    getTasks: () => service.getTasks(),
    notify,
    showAlert: (items) => alertManager.show(service.buildRoutineAlertItems(items)),
    markDone: (id, key, slot, done) => service.markRoutineDone(id, key, slot, done),
    initialState: service.getRoutineState(),
    saveState: (state) => service.saveRoutineState(state),
    onError: (error) => log('Routine engine:', error),
  });
  routineEngine.start();
}

// After wake from sleep, unlock, or a clock / time zone change: recalculate and check at once.
function onSystemChange() {
  if (service) {
    try { service.pomodoroTick(); } catch (error) { log('Pomodoro:', error); }
    schedulePomodoro();
  }
  if (engine) engine.onSystemChange();
  if (routineEngine) routineEngine.onSystemChange();
  sendToWindow('data-changed');
}

function startSystemWatch() {
  // Wake and unlock refresh the data at once; the page itself is checked a few seconds later, once Windows has settled.
  const onWake = (name) => () => {
    diag.info('System event', name);
    recovery.systemEvent(name);
    onSystemChange();
  };
  powerMonitor.on('resume', onWake('resume'));
  powerMonitor.on('unlock-screen', onWake('unlock-screen'));
  powerMonitor.on('suspend', () => diag.info('System event', 'suspend'));
  powerMonitor.on('lock-screen', () => diag.info('System event', 'lock-screen'));

  // A change of the PC's time zone (or a daylight saving change) changes the UTC offset.
  lastOffset = new Date().getTimezoneOffset();
  watchdog = setInterval(() => {
    const offset = new Date().getTimezoneOffset();
    if (offset !== lastOffset) {
      lastOffset = offset;
      onSystemChange();
    }
  }, WATCHDOG_MS);
  if (watchdog && typeof watchdog.unref === 'function') watchdog.unref();
}

// ---- Start with Windows ---------------------------------------------------------------------------------------------------------

function applyStartWithWindows(settings) {
  if (!app.isPackaged) return; // never register the development program
  if (lastLoginSetting === settings.startWithWindows) return;
  lastLoginSetting = settings.startWithWindows;
  app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, args: [STARTUP_ARG] });
}

// ---- Window <-> service connection -----------------------------------------------------------------------------------------------

// Only the app's own window may use the service, the file dialogs and the other requests below.
// (The full-screen reminder windows have their own two messages, checked by the alert manager.)
// The two pages of the app, as files. A request counts only when it comes from the top of the expected window showing
// exactly this file (not a frame inside it, and not another local file that happens to have the same name).
const PAGES = {
  main: path.join(__dirname, '..', 'renderer', 'index.html'),
  alert: path.join(__dirname, '..', 'renderer', 'alert.html'),
};
function sameFile(a, b) {
  const x = path.normalize(a);
  const y = path.normalize(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}
function fromPage(event, file) {
  const frame = event && event.senderFrame;
  if (!frame || frame.parent) return false;
  const url = frame.url;
  if (typeof url !== 'string' || !url.startsWith('file://')) return false;
  let shown;
  try {
    shown = fileURLToPath(url.split(/[?#]/)[0]);
  } catch (error) {
    return false;
  }
  return sameFile(shown, file);
}
function fromMainWindow(event) {
  if (!event || !mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
  return fromPage(event, PAGES.main);
}
function fromAlertWindow(event) {
  return Boolean(event && alertManager && alertManager.owns(event.sender) && fromPage(event, PAGES.alert));
}

function refuseOutsiders(event) {
  if (!fromMainWindow(event)) throw new Error(t('Unknown request.'));
}

function registerIpc() {
  ipcMain.handle('svc', async (event, method, args) => {
    refuseOutsiders(event);
    checkRequest(method, args);
    return service[method](...(args || []));
  });

  ipcMain.handle('export-data', async (event) => {
    refuseOutsiders(event);
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('Export Data'),
      defaultPath: `waqtwise-backup-${stamp}.json`,
      filters: [{ name: t('WaqtWise Backup'), extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(service.exportData(), null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('import-data', async (event) => {
    refuseOutsiders(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('Import Data'),
      properties: ['openFile'],
      filters: [{ name: t('WaqtWise Backup'), extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    // A backup is a small file; refuse a huge one before reading it into memory.
    if (fs.statSync(result.filePaths[0]).size > MAX_IMPORT_BYTES) throw new Error(t('This file is too big to be a WaqtWise backup.'));
    const text = fs.readFileSync(result.filePaths[0], 'utf8');
    const imported = service.importData(text);
    // Pictures the imported settings do not use any more are removed from the data folder.
    if (backgrounds) backgrounds.keepOnly(service.getSettings().alertBackground.images.map((x) => x.id));
    return imported;
  });

  // ---- Pictures behind the full-screen alert ----
  ipcMain.handle('alert-images', (event) => {
    refuseOutsiders(event);
    return alertImageList();
  });

  ipcMain.handle('add-alert-images', async (event) => {
    refuseOutsiders(event);
    const left = MAX_ALERT_IMAGES - service.getSettings().alertBackground.images.length;
    if (left <= 0) throw new Error(t('You already have {max} pictures. Remove one to add another.', { max: MAX_ALERT_IMAGES }));
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('Add Pictures'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: t('Pictures'), extensions: backgrounds.EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const copied = backgrounds.add(result.filePaths.slice(0, left));
    const { added } = service.addAlertImages(copied.images);
    // Copies that did not make it into the list are not kept.
    const kept = new Set(service.getSettings().alertBackground.images.map((x) => x.id));
    for (const x of copied.images) if (!kept.has(x.id)) backgrounds.remove(x.id);
    return { added, skipped: copied.skipped.length + Math.max(0, result.filePaths.length - left), images: alertImageList() };
  });

  ipcMain.handle('remove-alert-image', (event, id) => {
    refuseOutsiders(event);
    service.removeAlertImage(id);
    backgrounds.remove(id);
    return alertImageList();
  });

  // The picture of the Preview in Settings (the small copy is enough there).
  ipcMain.handle('alert-preview-picture', (event) => {
    refuseOutsiders(event);
    return alertPicture(service.pickAlertImageFor('image'), true);
  });

  ipcMain.handle('test-notification', async (event) => {
    refuseOutsiders(event);
    const settings = service.getSettings();
    notify({
      kind: 'task',
      id: `test-${Date.now()}`,
      title: t('WaqtWise Test Notification'),
      lines: [t('If you can see this, notifications work.'), t('Click it to open WaqtWise.')],
      silent: !settings.soundEnabled,
      taskId: null,
      dateKey: null,
      actions: [],
    });
    return { ok: true };
  });

  ipcMain.handle('pause-state', async (event) => {
    refuseOutsiders(event);
    return pauseState();
  });

  ipcMain.handle('resume-pause', async (event, kind) => {
    refuseOutsiders(event);
    if (kind !== 'reminders' && kind !== 'routines') throw new Error(t('Unknown request.'));
    resumeFor(kind);
    return pauseState();
  });

  ipcMain.handle('preview-alert', async (event) => {
    refuseOutsiders(event);
    alertManager.show([service.getAlertSample()]);
    return { ok: true };
  });

  ipcMain.on('alert-ready', (event) => {
    if (fromAlertWindow(event)) alertManager.sendTo(event.sender);
  });
  ipcMain.on('alert-action', (event, message) => {
    if (fromAlertWindow(event) && message && typeof message === 'object') handleAlertAction(event.sender, message);
  });

  ipcMain.on('renderer-ready', (event) => {
    if (!fromMainWindow(event)) return;
    rendererReady = true;
    diag.info('Renderer ready');
    recovery.onReady();
    flushPendingEvents();
    if (showAfterReload) {
      showAfterReload = false;
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.maximize();
        mainWindow.show();
        bringToFront();
      }
    }
  });

  // Settings -> Open Log Folder: the diagnostic log (no planner data) lives there.
  ipcMain.handle('open-logs-folder', async (event) => {
    refuseOutsiders(event);
    const dir = getLogger().dir || path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const problem = await shell.openPath(dir); // an empty text means it worked
    return problem ? { ok: false, error: String(problem) } : { ok: true };
  });
}

// ---- Start-up -------------------------------------------------------------------------------------------------------------------------

function start() {
  app.setAppUserModelId(APP_ID);

  // Only one copy runs. A second launch (a double-click on the shortcut, or a notification
  // button) is handed to the running copy through the "second-instance" event.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  // A second launch that arrives before the app is ready waits: nothing can be shown before the service exists.
  let pendingSecondLaunch = null;
  app.on('second-instance', (event, argv) => {
    const action = findActionUrlInArgv(argv);
    if (!service) {
      pendingSecondLaunch = { action };
      return;
    }
    if (action) handleAction(action);
    else showWindow();
  });

  app.whenReady().then(() => {
    const store = new FileStore(path.join(app.getPath('userData'), 'data.json'));
    try {
      service = new PlannerService({
        store,
        version: app.getVersion(),
        onDataChanged: () => {
          sendToWindow('data-changed');
          if (engine) engine.reschedule(); // tasks or settings changed: re-aim the exact-time timer
          if (routineEngine) routineEngine.reschedule();
        },
        onSettingsChanged: (settings) => { applyStartWithWindows(settings); applyTitleBarTheme(); refreshTrayTooltip(); },
        onPomodoroChanged,
        onPomodoroSignal: signalPomodoro,
      });
      backgrounds = createBackgrounds({ dir: path.join(app.getPath('userData'), 'backgrounds'), fs, nativeImage, log });
      backgrounds.keepOnly(service.getSettings().alertBackground.images.map((x) => x.id));
    } catch (error) {
      // The data file exists but cannot be read right now. Starting empty would overwrite it, so stop instead.
      dialog.showErrorBox('WaqtWise', error && error.message ? error.message : String(error));
      app.quit();
      return;
    }
    // The app needs no camera, microphone, location or other browser permission: refuse every request.
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
      if (session.defaultSession.setPermissionCheckHandler) session.defaultSession.setPermissionCheckHandler(() => false);
    }
    diag.info('App started', { hidden: process.argv.includes(STARTUP_ARG) });
    registerIpc();
    if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL);
    applyStartWithWindows(service.getSettings());

    startAlerts();
    startEngine();
    startTray();
    startSystemWatch();

    // Started by Windows at login: stay hidden in the tray.
    const startedHidden = process.argv.includes(STARTUP_ARG);
    createWindow({ visible: !startedHidden });

    const launchAction = findActionUrlInArgv(process.argv);
    if (launchAction) handleAction(launchAction);
    if (pendingSecondLaunch) {
      if (pendingSecondLaunch.action) handleAction(pendingSecondLaunch.action);
      else showWindow();
      pendingSecondLaunch = null;
    }
  });

  // The app keeps running when there are no windows: it lives in the tray.
  app.on('window-all-closed', () => {});

  // A helper process of Chromium (the graphics process, for example) ended: written to the log for later.
  app.on('child-process-gone', (event, details) => {
    diag.error('Child process gone', {
      type: details && details.type, reason: details && details.reason, exitCode: details && details.exitCode, name: details && details.name,
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    recovery.dispose();
    if (watchdog) clearInterval(watchdog);
    if (engine) engine.stop();
    if (routineEngine) routineEngine.stop();
    if (alertManager) alertManager.closeAll();
  });
  app.on('will-quit', () => {
    for (const p of Object.values(pauses)) if (p.timer) clearTimeout(p.timer);
    if (pomodoroTimeout) clearTimeout(pomodoroTimeout);
    if (trayController) trayController.destroy();
  });
}

start();

module.exports = {
  handleAction, getEngine: () => engine, getRoutineEngine: () => routineEngine, getService: () => service, getRecovery: () => recovery,
};
