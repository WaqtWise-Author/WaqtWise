'use strict';

// The routine engine: rings the times of the routines (see routines.js). Like the task reminder engine it has no
// window, no Windows code and no timers of its own; everything is handed in, so it runs in the background and
// the tests run it with a fake clock.
//
// Every "tick" (about every 15 seconds, and at the exact moment of the next time) it looks at (last tick, now] and
// finds every routine time inside it. Each routine chooses what happens: a notification, a full-screen alert, or both.
// A time that is missed because the computer was off is simply skipped: a routine is a regular nudge, not a deadline.

const { ringsInWindow, occurrencesOn, taskRunningAt } = require('./routines');
const { t } = require('./i18n');
const { formatTime12, formatDuration } = require('./time');

const MS_PER_MINUTE = 60000;
const DAY_MS = 24 * 60 * MS_PER_MINUTE;

const DEFAULTS = {
  tickMs: 15000,
  graceMs: 2 * MS_PER_MINUTE, // a notification up to this late is still shown
  alertGraceMs: 15000, // a full-screen alert is only shown if it is at most this late
  lookbackMs: 6 * 60 * MS_PER_MINUTE,
  keepDeliveredMs: 2 * DAY_MS,
};

function emptyRoutineState() {
  return { delivered: {}, lastTickAt: null, snoozed: [] };
}

// Makes the saved state safe to use, whatever a data file contains. Returns { state, dropped }.
function normalizeRoutineState(raw) {
  const state = emptyRoutineState();
  let dropped = 0;
  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (raw === undefined || raw === null) return { state, dropped };
  if (!isObject(raw)) return { state, dropped: 1 };
  if (isObject(raw.delivered)) {
    for (const [key, value] of Object.entries(raw.delivered)) {
      if (Number.isFinite(value)) state.delivered[key] = value;
      else dropped += 1;
    }
  }
  if (Array.isArray(raw.snoozed)) {
    for (const s of raw.snoozed) {
      if (isObject(s) && typeof s.routineId === 'string' && typeof s.dateKey === 'string' && Number.isInteger(s.slot) && Number.isFinite(s.until)) {
        state.snoozed.push({ routineId: s.routineId, dateKey: s.dateKey, slot: s.slot, until: s.until, ...(s.fullScreen === true ? { fullScreen: true } : {}) });
      } else {
        dropped += 1;
      }
    }
  }
  if (Number.isFinite(raw.lastTickAt)) state.lastTickAt = raw.lastTickAt;
  return { state, dropped };
}

function formatRoutineNotification(item, settings) {
  const line = item.leadMinutes > 0
    ? t('Starts in {time} · {at}', { time: item.leadMinutes < 60 ? t('{n} min', { n: item.leadMinutes }) : formatDuration(item.leadMinutes), at: formatTime12(item.at) })
    : t('Routine time · {at}', { at: formatTime12(item.at) });
  const lines = item.snoozed ? [t('Snoozed reminder'), line] : [line];
  return {
    kind: 'routine',
    id: item.id,
    title: item.title,
    lines,
    body: lines.join('\n'),
    silent: settings.soundEnabled === false,
    taskId: null,
    dateKey: item.dateKey,
    actions: [],
  };
}

class RoutineEngine {
  // deps: getRoutines(), getSettings(), notify(payload), showAlert(items, settings), markDone(routineId, dateKey, slot),
  //       initialState, saveState(state), now(), setInterval/clearInterval/setTimeout/clearTimeout, onError(error), options
  constructor(deps) {
    this.deps = deps;
    this.options = { ...DEFAULTS, ...(deps.options || {}) };
    this.state = normalizeRoutineState(deps.initialState).state;
    this.timer = null;
    this.alertTimer = null;
  }

  now() {
    return this.deps.now ? this.deps.now() : new Date();
  }

  settings() {
    return this.deps.getSettings ? this.deps.getSettings() : {};
  }

  // Is one of the tasks the routine should stay silent for running at this moment?
  busy(routine, ms) {
    const ids = routine && routine.skipDuringTasks;
    if (!ids || ids.length === 0 || !this.deps.getTasks) return false;
    const s = this.settings();
    const options = {};
    if (s.workingDays) options.workingDays = s.workingDays;
    if ([6, 0, 1].includes(s.weekStart)) options.weekStartsOn = s.weekStart;
    return taskRunningAt(this.provider(), this.deps.getTasks(), ids, ms, options);
  }

  // The prayer times (a function of a date key); routines that stay quiet while praying need it.
  provider() {
    return this.deps.getProvider ? this.deps.getProvider() : null;
  }

  start() {
    this.tick();
    this.timer = (this.deps.setInterval || setInterval)(() => this.tick(), this.options.tickMs);
  }

  stop() {
    if (this.timer !== null) (this.deps.clearInterval || clearInterval)(this.timer);
    this.timer = null;
    this.clearTimer();
    this.save();
  }

  onSystemChange() {
    return this.tick();
  }

  clearTimer() {
    if (this.alertTimer !== null) {
      (this.deps.clearTimeout || clearTimeout)(this.alertTimer);
      this.alertTimer = null;
    }
  }

  save() {
    if (this.deps.saveState) this.deps.saveState(JSON.parse(JSON.stringify(this.state)));
  }

  tick(nowDate = this.now()) {
    const result = { notifications: [], alerts: [] };
    try {
      this.process(nowDate, result);
      this.reschedule(nowDate);
    } catch (error) {
      if (this.deps.onError) this.deps.onError(error);
      else throw error;
    }
    return result;
  }

  // The next moment (within 24 hours) a routine or a snoozed reminder is due, so it rings at the exact second.
  nextMoment(nowMs) {
    const routines = this.deps.getRoutines().filter((r) => r.enabled);
    const s = this.settings();
    const wants = (r) => (r.alerts.notification && s.notificationsEnabled !== false) || (r.alerts.fullScreen && s.fullScreenAlerts !== false);
    const usable = routines.filter(wants);
    let next = null;
    const consider = (ms) => { if (next === null || ms < next) next = ms; };
    for (const o of ringsInWindow(usable.filter((r) => r.alerts.fullScreen && s.fullScreenAlerts !== false), nowMs, nowMs + DAY_MS, this.provider())) {
      if (!o.done && !this.state.delivered[o.id]) { consider(o.ringAt.getTime()); break; }
    }
    for (const o of ringsInWindow(usable.filter((r) => r.alerts.notification && s.notificationsEnabled !== false), nowMs, nowMs + DAY_MS, this.provider(), 'notifyAt')) {
      if (!o.done && !this.state.delivered[`${o.id}#n`]) { consider(o.notifyAt.getTime()); break; }
    }
    for (const sn of this.state.snoozed) if (sn.until > nowMs && (next === null || sn.until < next)) next = sn.until;
    return next;
  }

  reschedule(nowDate = this.now()) {
    this.clearTimer();
    const nowMs = nowDate.getTime();
    const target = this.nextMoment(nowMs);
    if (target === null) return;
    this.alertTimer = (this.deps.setTimeout || setTimeout)(() => {
      this.alertTimer = null;
      this.tick(new Date(Math.max(this.now().getTime(), target)));
    }, Math.max(0, target - nowMs));
  }

  process(nowDate, result) {
    const now = nowDate.getTime();
    const settings = this.settings();
    const o = this.options;
    let changed = false;

    if (this.state.lastTickAt === null || now <= this.state.lastTickAt) {
      const first = this.state.lastTickAt === null;
      this.state.lastTickAt = now;
      if (first) this.save();
      return;
    }

    const routines = this.deps.getRoutines();
    const byId = new Map(routines.map((r) => [r.id, r]));
    const toastsOn = settings.notificationsEnabled !== false;
    const alertsOn = settings.fullScreenAlerts !== false;
    const toasts = [];
    const alerts = [];
    const windowStart = Math.max(this.state.lastTickAt, now - o.lookbackMs);

    // Notifications come at their own moment (the lead time before the routine time) ...
    for (const occ of ringsInWindow(routines, windowStart, now, this.provider(), 'notifyAt')) {
      const routine = byId.get(occ.routineId);
      if (!routine.alerts.notification) continue;
      const key = `${occ.id}#n`;
      if (this.state.delivered[key]) continue;
      this.state.delivered[key] = now;
      changed = true;
      if (occ.done || this.busy(routine, occ.notifyAt.getTime())) continue;
      if (toastsOn && now - occ.notifyAt.getTime() <= o.graceMs) toasts.push(this.itemFor(routine, occ, false));
    }
    // ... full-screen alerts at the exact time of the routine.
    for (const occ of ringsInWindow(routines, windowStart, now, this.provider())) {
      const routine = byId.get(occ.routineId);
      if (!routine.alerts.fullScreen) continue;
      if (this.state.delivered[occ.id]) continue;
      this.state.delivered[occ.id] = now;
      changed = true;
      if (occ.done || this.busy(routine, occ.ringAt.getTime())) continue;
      if (alertsOn && now - occ.ringAt.getTime() <= o.alertGraceMs) alerts.push(this.itemFor(routine, occ, false));
    }

    const waiting = [];
    for (const sn of this.state.snoozed) {
      if (sn.until > now) { waiting.push(sn); continue; }
      changed = true;
      const routine = byId.get(sn.routineId);
      if (!routine || !routine.enabled || this.busy(routine, sn.until)) continue;
      const occ = occurrencesOn(routine, sn.dateKey).find((x) => x.slot === sn.slot);
      if (!occ || occ.done) continue;
      const late = now - sn.until;
      const item = this.itemFor(routine, occ, true, sn.until);
      if (sn.fullScreen) {
        if (alertsOn && late <= o.graceMs) alerts.push(item);
      } else if (toastsOn && late <= o.graceMs) {
        toasts.push(item);
      }
    }
    if (waiting.length !== this.state.snoozed.length) this.state.snoozed = waiting;

    for (const item of toasts) {
      const payload = formatRoutineNotification(item, settings);
      this.show(() => this.deps.notify(payload));
      result.notifications.push(payload);
    }
    if (alerts.length > 0) {
      result.alerts = alerts;
      if (this.deps.showAlert) this.show(() => this.deps.showAlert(alerts, settings));
    }

    const cutoff = now - o.keepDeliveredMs;
    for (const id of Object.keys(this.state.delivered)) {
      if (this.state.delivered[id] < cutoff) { delete this.state.delivered[id]; changed = true; }
    }
    this.state.lastTickAt = now;
    if (changed) this.save();
  }

  itemFor(routine, occ, snoozed, snoozeUntil) {
    return {
      kind: 'routine',
      id: snoozed ? `${occ.id}@snooze${snoozeUntil}` : occ.id,
      routineId: routine.id,
      dateKey: occ.dateKey,
      slot: occ.slot,
      title: routine.title,
      notes: routine.notes,
      randomNotes: routine.randomNotes === true && routine.alerts.fullScreen,
      categoryId: routine.categoryId,
      at: occ.ringAt || occ.at,
      leadMinutes: !snoozed && occ.notifyAt && occ.ringAt ? Math.round((occ.ringAt - occ.notifyAt) / MS_PER_MINUTE) : 0,
      snoozed,
    };
  }

  show(fn) {
    try { fn(); } catch (error) { if (this.deps.onError) this.deps.onError(error); }
  }

  // action: { type: 'snooze' | 'done', routineId, dateKey, slot, fullScreen }
  handleAction(action) {
    const now = this.now().getTime();
    const same = (s) => s.routineId === action.routineId && s.dateKey === action.dateKey && s.slot === action.slot;
    if (action.type === 'snooze') {
      const minutes = this.settings().snoozeMinutes || 5;
      const until = now + minutes * MS_PER_MINUTE;
      this.state.snoozed = this.state.snoozed.filter((s) => !same(s));
      this.state.snoozed.push({ routineId: action.routineId, dateKey: action.dateKey, slot: action.slot, until, ...(action.fullScreen ? { fullScreen: true } : {}) });
      this.save();
      this.reschedule();
      return { type: 'snooze', until: new Date(until) };
    }
    if (action.type === 'done') {
      this.deps.markDone(action.routineId, action.dateKey, action.slot, true);
      this.state.snoozed = this.state.snoozed.filter((s) => !same(s));
      this.save();
      return { type: 'done', ok: true };
    }
    throw new Error(`Unknown routine action: ${action.type}`);
  }
}

module.exports = { RoutineEngine, emptyRoutineState, normalizeRoutineState, formatRoutineNotification };
