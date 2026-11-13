'use strict';

// Recovery of the main window's page (the "renderer").
//
// WaqtWise lives in the tray, so its main process can run for days while the window's page has crashed, hung or
// failed to load (for example after Windows sleep, a graphics-driver reset, or a start with Windows). The reminders
// do not depend on the page, but the person sees an empty window. This controller decides when the page is
// really broken and repairs only the page: it reloads it, or builds a new window if reloading does not help. The
// service, the reminder engines, the tray and the alerts are never touched.
//
// It knows nothing about Electron: main.js gives it small functions (inspect / reload / recreate / ping), so the
// rules below can be tested with a fake clock.
//
// The rules:
//   - one recovery at a time; a request that arrives while one is running (or waiting) is ignored;
//   - attempt 1 reloads the page, later attempts build a new window; at most `maxAttempts` in a row, with a wait
//     between attempts (`backoffMs`); a page that comes back ("renderer-ready") resets the count;
//   - a hang ("unresponsive") is repaired only if it lasts `unresponsiveGraceMs`; "responsive" cancels it;
//   - after wake / unlock the page is checked once things have settled (`settleMs`), and repaired only if it is
//     really broken. A healthy page is never reloaded just because the PC woke up.

const DEFAULTS = {
  unresponsiveGraceMs: 15000, // a hang shorter than this is left alone
  unresponsiveStartupGraceMs: 60000, // the same while the page has not finished starting (a slow disk at login)
  settleMs: 3000, // after wake / unlock, wait for Windows and Chromium to settle before looking
  notReadyAfterMs: 20000, // a loaded page that never said "ready" for this long is stuck
  readyTimeoutMs: 20000, // a recovery that is not "ready" after this long counts as failed
  paintWatchMs: 20000, // a window the person wants to see must have drawn its page within this time
  pingTimeoutMs: 8000, // the page must answer a trivial question within this time
  maxAttempts: 3,
  backoffMs: [0, 5000, 30000], // wait before attempt 1, 2, 3
  resetAfterMs: 10 * 60 * 1000, // the count starts again after this long without attempts
};

function defaultTimers() {
  return {
    setTimeout: (fn, ms) => {
      const id = setTimeout(fn, ms);
      if (id && id.unref) id.unref();
      return id;
    },
    clearTimeout: (id) => clearTimeout(id),
    now: () => Date.now(),
  };
}

// What is wrong with the page, or null when it looks fine. `state` comes from main.js (see inspect there).
function diagnose(state, notReadyAfterMs = DEFAULTS.notReadyAfterMs) {
  if (!state || !state.exists) return null; // no window yet: showing it creates a new one
  if (state.crashed) return 'crashed';
  if (state.loadFailed) return 'load-failed';
  if (!state.ready && !state.loading && state.sinceLoadMs > notReadyAfterMs) return 'never-ready';
  return null;
}

function createRecovery({ log, inspect, reload, recreate, ping, isQuitting = () => false, config = {}, timers = defaultTimers() }) {
  const cfg = { ...DEFAULTS, ...config };
  let attempts = 0;
  let lastAttemptAt = -Infinity;
  let busy = false; // an attempt was started and the page has not said "ready" yet
  let readyTimer = null;
  let deferTimer = null; // the next attempt waits for its backoff
  let graceTimer = null; // an unresponsive page is being given time
  let settleTimer = null; // after wake / unlock
  let disposed = false;

  const clear = (id) => { if (id) timers.clearTimeout(id); return null; };

  function diagnoseNow() {
    return diagnose(inspect(), cfg.notReadyAfterMs);
  }

  function run(reason, details) {
    deferTimer = clear(deferTimer);
    if (disposed || isQuitting()) return 'quit';
    attempts += 1;
    lastAttemptAt = timers.now();
    busy = true;
    const state = inspect();
    const method = attempts === 1 && state.exists ? 'reload' : 'recreate';
    log.warn('Recovery attempt', { attempt: attempts, method, reason, ...(details || {}) });
    try {
      if (method === 'reload') {
        try {
          reload();
        } catch (error) {
          log.error('Reload failed, building a new window', error);
          recreate();
        }
      } else {
        recreate();
      }
    } catch (error) {
      log.error('Recovery attempt failed', error);
      busy = false;
      return 'failed';
    }
    readyTimer = clear(readyTimer);
    readyTimer = timers.setTimeout(() => {
      readyTimer = null;
      if (!busy) return;
      busy = false;
      log.error('The page was not ready in time after recovery', { attempt: attempts });
      request('recovery-timeout');
    }, cfg.readyTimeoutMs);
    return 'started';
  }

  // Ask for a recovery. Returns 'started', 'deferred' (waiting for its backoff), 'busy' (one is already running or
  // waiting), 'gave-up' (too many attempts in a row), or 'quit'. `userAction` (the person opened the window) skips the
  // wait and gives a fresh set of attempts.
  function request(reason, options = {}) {
    if (disposed || isQuitting()) {
      log.info('Recovery not started: the app is closing', { reason });
      return 'quit';
    }
    if (busy || deferTimer) {
      log.info('Recovery already in progress; request ignored', { reason });
      return 'busy';
    }
    const now = timers.now();
    if (now - lastAttemptAt > cfg.resetAfterMs) attempts = 0;
    if (options.userAction && attempts >= cfg.maxAttempts) attempts = 0;
    if (attempts >= cfg.maxAttempts) {
      log.error('Recovery gave up: too many attempts in a row', { reason, attempts });
      return 'gave-up';
    }
    const wait = options.userAction ? 0 : Math.max(0, (cfg.backoffMs[Math.min(attempts, cfg.backoffMs.length - 1)] || 0) - (now - lastAttemptAt));
    if (wait > 0) {
      log.info('Recovery waits before the next attempt', { reason, waitMs: wait });
      deferTimer = timers.setTimeout(() => { deferTimer = null; run(reason, { deferred: true }); }, wait);
      return 'deferred';
    }
    return run(reason, options.details);
  }

  // The page said "ready": it works.
  function onReady() {
    readyTimer = clear(readyTimer);
    if (busy) log.info('Recovery succeeded', { attempt: attempts });
    busy = false;
    attempts = 0;
  }

  // A hang is repaired only if it lasts.
  function unresponsive() {
    if (graceTimer) return;
    const state = inspect();
    const graceMs = state && state.exists && !state.ready ? cfg.unresponsiveStartupGraceMs : cfg.unresponsiveGraceMs;
    graceTimer = timers.setTimeout(() => {
      graceTimer = null;
      log.warn('The page is still unresponsive after the grace period', { graceMs });
      request('unresponsive');
    }, graceMs);
  }

  function responsive() {
    if (graceTimer) {
      graceTimer = clear(graceTimer);
      log.info('The page became responsive by itself; no recovery needed');
    }
  }

  async function pingOk() {
    if (typeof ping !== 'function') return true;
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; timers.clearTimeout(timeout); resolve(ok); } };
      const timeout = timers.setTimeout(() => finish(false), cfg.pingTimeoutMs);
      try {
        Promise.resolve(ping()).then(() => finish(true), () => finish(false));
      } catch (error) {
        finish(false);
      }
    });
  }

  async function check(name) {
    if (disposed || isQuitting() || busy || deferTimer) return;
    const state = inspect();
    const failure = diagnoseNow();
    if (failure) {
      log.warn('The page is not healthy after the system event', { event: name, failure });
      request(`${name}:${failure}`);
      return;
    }
    if (state.exists && state.ready && !(await pingOk())) {
      if (disposed || isQuitting() || busy) return;
      log.warn('The page did not answer after the system event', { event: name });
      request(`${name}:no-answer`);
      return;
    }
    log.info('The page is healthy after the system event', { event: name });
  }

  // Wake / unlock: look at the page once things have settled.
  function systemEvent(name) {
    settleTimer = clear(settleTimer);
    settleTimer = timers.setTimeout(() => { settleTimer = null; check(name); }, cfg.settleMs);
  }

  function dispose() {
    disposed = true;
    readyTimer = clear(readyTimer);
    deferTimer = clear(deferTimer);
    graceTimer = clear(graceTimer);
    settleTimer = clear(settleTimer);
  }

  return {
    config: cfg,
    diagnose: diagnoseNow,
    request,
    onReady,
    unresponsive,
    responsive,
    systemEvent,
    check,
    dispose,
    isBusy: () => busy || Boolean(deferTimer),
    attempts: () => attempts,
  };
}

module.exports = { createRecovery, diagnose, DEFAULTS };
