'use strict';

// The Pomodoro list and its running timer. These methods are added to PlannerService (see ../service.js).
//
// The timer lives here (in memory, not saved), so the window, the tray and the full-screen alert all see the same one.
// The service has no clock of its own: the main process calls pomodoroTick() at the moment pomodoroDueMs() gives
// (and after the computer wakes up). When a part ends the service calls onPomodoroSignal(signal); every change of the
// timer calls onPomodoroChanged(view).

const { t, tp } = require('../../core/i18n');
const core = require('../../core');
const { copy } = require('./util');

const {
  normalizePomodoro, newPomodoroForm, normalizePomodoroLog, MAX_POMODOROS, startTimer, remainingOf, pauseTimer, resumeTimer, finishPart,
  startNextPart, extendFocus, stopLog, partName, partMinutes, clockLabel, EXTEND_MINUTES, dateKey, addDaysToKey, formatTime12, formatDuration,
} = core;

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
const TIMER_ACTIONS = ['start', 'pause', 'resume', 'next', 'skip', 'stop', 'extend'];

function minutesLabel(m) {
  return formatDuration(m);
}

class PomodoroMethods {
  findPomodoro(id) {
    const item = (this.data.pomodoros || []).find((x) => x.id === id);
    if (!item) throw new Error(t('This Pomodoro no longer exists.'));
    return item;
  }

  // The next prayer after `ms` (today or tomorrow): { ms, name }.
  nextPrayerAfter(ms) {
    const provider = this.provider();
    const today = dateKey(new Date(ms));
    let best = null;
    for (const key of [addDaysToKey(today, -1), today, addDaysToKey(today, 1)]) {
      const times = provider(key);
      for (const name of PRAYERS) {
        const at = times[name] && times[name].getTime();
        if (at > ms && (!best || at < best.ms)) best = { ms: at, name: t(PRAYER_NAMES[name]) };
      }
    }
    return best;
  }

  // ---- the list -------------------------------------------------------------------------------------------------------

  // Each Pomodoro with what was focused today, and the timer.
  getPomodoros() {
    const today = dateKey(this.now());
    const log = this.data.pomodoroLog || [];
    const items = (this.data.pomodoros || []).map((p) => {
      const mine = log.filter((x) => x.pomodoroId === p.id && x.dateKey === today);
      const minutes = mine.reduce((sum, x) => sum + x.minutes, 0);
      const sessions = mine.filter((x) => x.complete).length;
      return {
        ...copy(p),
        focusLabel: minutesLabel(p.focusMinutes),
        breakLabel: minutesLabel(p.breakMinutes),
        longBreakLabel: p.longBreak.enabled ? minutesLabel(p.longBreak.minutes) : '',
        todayMinutes: minutes,
        todaySessions: sessions,
        todayLabel: minutes === 0 ? t('Today: none yet')
          : sessions === 0 ? t('Today: {time} focused', { time: minutesLabel(minutes) })
            : `${tp(sessions, 'Today: {n} session', 'Today: {n} sessions')} · ${t('{time} focused', { time: minutesLabel(minutes) })}`,
      };
    });
    return { items, timer: this.getPomodoroTimer() };
  }

  newPomodoroDefaults() {
    return newPomodoroForm();
  }

  getPomodoroForEdit({ id }) {
    const p = this.findPomodoro(id);
    return {
      title: p.title, focusMinutes: p.focusMinutes, breakMinutes: p.breakMinutes,
      longBreak: p.longBreak.enabled, longBreakMinutes: p.longBreak.minutes, longBreakEvery: p.longBreak.every,
      alert: p.alert, holdAtPrayer: p.holdAtPrayer,
    };
  }

  // form: { title, focusMinutes, breakMinutes, longBreak, longBreakMinutes, longBreakEvery, alert, holdAtPrayer }.
  savePomodoro({ id, form }) {
    const list = this.data.pomodoros || (this.data.pomodoros = []);
    const old = id ? this.findPomodoro(id) : null;
    if (!old && list.length >= MAX_POMODOROS) throw new Error(t('The Pomodoro list is full (at most {max})', { max: MAX_POMODOROS }));
    const f = form && typeof form === 'object' ? form : {};
    const { pomodoro, error } = normalizePomodoro({
      id: old ? old.id : this.newId(),
      createdAt: old ? old.createdAt : undefined,
      title: f.title,
      focusMinutes: f.focusMinutes,
      breakMinutes: f.breakMinutes,
      longBreak: { enabled: f.longBreak === true, minutes: f.longBreakMinutes, every: f.longBreakEvery },
      alert: f.alert,
      holdAtPrayer: f.holdAtPrayer === true,
    }, this.now());
    if (error) throw new Error(error);
    this.data.pomodoros = old ? list.map((x) => (x.id === old.id ? pomodoro : x)) : [...list, pomodoro];
    this.changed();
    return { ok: true, id: pomodoro.id };
  }

  deletePomodoro({ id }) {
    this.findPomodoro(id);
    if (this.pomodoroTimer && this.pomodoroTimer.pomodoroId === id) this.stopPomodoroTimer();
    const token = this.beginUndo();
    this.data.pomodoros = this.data.pomodoros.filter((x) => x.id !== id);
    this.changed();
    return { ok: true, undoId: this.endUndo(token) };
  }

  // ---- the timer ------------------------------------------------------------------------------------------------------

  // What the window and the tray show: null when no Pomodoro is running.
  getPomodoroTimer() {
    const state = this.pomodoroTimer;
    if (!state) return null;
    const p = (this.data.pomodoros || []).find((x) => x.id === state.pomodoroId);
    if (!p) return null;
    const nowMs = this.now().getTime();
    const remainingMs = remainingOf(state, nowMs);
    const roundsLabel = p.longBreak.enabled
      ? t('Round {round} of {every}', { round: ((state.round - 1) % p.longBreak.every) + 1, every: p.longBreak.every })
      : t('Round {round}', { round: state.round });
    const next = state.next ? { part: state.next.part, round: state.next.round, name: partName(state.next.part), minutes: partMinutes(p, state.next.part) } : null;
    return {
      pomodoroId: p.id,
      title: p.title,
      part: state.part,
      partName: partName(state.part),
      round: state.round,
      roundsLabel,
      status: state.status,
      remainingMs,
      partMs: state.partMs,
      remainingLabel: clockLabel(remainingMs),
      partLabel: clockLabel(state.partMs),
      heldFor: state.heldFor || '',
      finished: state.status === 'waiting' ? state.finished : '',
      next,
      canExtend: state.status === 'waiting' && state.finished === 'focus',
      prayerNote: this.pomodoroPrayerNote(p, state, nowMs),
      longBreakAfter: p.longBreak.enabled ? p.longBreak.every : 0,
    };
  }

  // "Asr starts at 3:12 PM, during this focus." when a prayer falls inside the running part.
  pomodoroPrayerNote(p, state, nowMs) {
    if (state.status !== 'running') return '';
    const prayer = this.nextPrayerAfter(nowMs);
    if (!prayer || prayer.ms >= state.endsAt) return '';
    const at = formatTime12(new Date(prayer.ms));
    if (p.holdAtPrayer) return t('{prayer} starts at {time}. The timer will stop then.', { prayer: prayer.name, time: at });
    return t('{prayer} starts at {time}, during this part.', { prayer: prayer.name, time: at });
  }

  // The moment the timer next needs a look: the end of the running part, or the next prayer when it stops for prayer.
  pomodoroDueMs() {
    const state = this.pomodoroTimer;
    if (!state || state.status !== 'running') return null;
    let due = state.endsAt;
    const p = (this.data.pomodoros || []).find((x) => x.id === state.pomodoroId);
    if (p && p.holdAtPrayer) {
      const prayer = this.nextPrayerAfter(state.runningSince || this.now().getTime() - 1);
      if (prayer && prayer.ms < due) due = prayer.ms;
    }
    return due;
  }

  setPomodoroTimer(state) {
    this.pomodoroTimer = state;
    const view = this.getPomodoroTimer();
    if (this.onPomodoroChanged) this.onPomodoroChanged(view);
    return view;
  }

  // Writes focus time to the log (only the last 400 days are kept).
  logPomodoroFocus(pomodoroId, entry, atMs) {
    if (!entry) return;
    const at = new Date(atMs);
    const list = normalizePomodoroLog([...(this.data.pomodoroLog || []), { pomodoroId, dateKey: dateKey(at), minutes: entry.minutes, complete: entry.complete, at: at.toISOString() }], at);
    this.data.pomodoroLog = list;
    try {
      this.changed();
    } catch (error) {
      // a failed save shows the banner; the timer goes on
    }
  }

  stopPomodoroTimer() {
    const state = this.pomodoroTimer;
    if (!state) return null;
    const nowMs = this.now().getTime();
    this.logPomodoroFocus(state.pomodoroId, stopLog(state, nowMs), nowMs);
    return this.setPomodoroTimer(null);
  }

  // The buttons of the page, the tray and the full-screen alert. { action, id (for start), minutes (for extend) }.
  pomodoroAction({ action, id, minutes } = {}) {
    if (!TIMER_ACTIONS.includes(action)) throw new Error(t('Unknown request.'));
    const nowMs = this.now().getTime();
    const state = this.pomodoroTimer;
    const withRunStart = (next) => (next && next.status === 'running' ? { ...next, runningSince: nowMs } : next);
    if (action === 'start') {
      const p = this.findPomodoro(id);
      if (state) this.stopPomodoroTimer(); // one Pomodoro at a time: starting another one ends the first
      return this.setPomodoroTimer(withRunStart(startTimer(p, nowMs)));
    }
    if (!state) return this.getPomodoroTimer();
    if (action === 'stop') return this.stopPomodoroTimer();
    const p = (this.data.pomodoros || []).find((x) => x.id === state.pomodoroId);
    if (!p) return this.setPomodoroTimer(null);
    if (action === 'pause') return this.setPomodoroTimer(pauseTimer(state, nowMs));
    if (action === 'resume') return this.setPomodoroTimer(withRunStart(resumeTimer(state, nowMs)));
    if (action === 'next') return this.setPomodoroTimer(withRunStart(startNextPart(p, state, nowMs)));
    if (action === 'extend') {
      const m = Number.isInteger(minutes) && minutes >= 1 && minutes <= 60 ? minutes : EXTEND_MINUTES;
      return this.setPomodoroTimer(withRunStart(extendFocus(p, state, nowMs, m)));
    }
    // skip: end this part now (the focus done so far is kept)
    const { state: next, log } = finishPart(p, state, nowMs, true);
    this.logPomodoroFocus(p.id, log, nowMs);
    return this.setPomodoroTimer(next);
  }

  // Called by the main process when pomodoroDueMs() has come (or after a wake from sleep).
  // Returns the signal it sent, if any: { kind: 'ended' | 'prayer', alert: 'fullScreen' | 'notification', ... }.
  pomodoroTick() {
    const state = this.pomodoroTimer;
    if (!state || state.status !== 'running') return null;
    const p = (this.data.pomodoros || []).find((x) => x.id === state.pomodoroId);
    if (!p) {
      this.setPomodoroTimer(null);
      return null;
    }
    const nowMs = this.now().getTime();
    // Prayer time came before the end of the part: the timer stops (when this Pomodoro asks for it).
    if (p.holdAtPrayer && nowMs < state.endsAt) {
      const prayer = this.nextPrayerAfter((state.runningSince || nowMs) - 1);
      if (prayer && prayer.ms <= nowMs) {
        this.setPomodoroTimer(pauseTimer(state, nowMs, prayer.name));
        const signal = {
          kind: 'prayer', alert: 'notification', pomodoroId: p.id,
          title: t('Pomodoro Paused for {prayer}', { prayer: prayer.name }),
          lines: [t('"{title}" stopped at {time} left. Resume it when you are ready.', { title: p.title, time: clockLabel(remainingOf(state, nowMs)) })],
        };
        if (this.onPomodoroSignal) this.onPomodoroSignal(signal);
        return signal;
      }
    }
    if (nowMs < state.endsAt) return null;
    const finished = state.part;
    const { state: next, log } = finishPart(p, state, state.endsAt);
    this.logPomodoroFocus(p.id, log, nowMs);
    this.setPomodoroTimer(next);
    const signal = this.pomodoroSignal(p, finished, next);
    if (this.onPomodoroSignal) this.onPomodoroSignal(signal);
    return signal;
  }

  // What the notification or the full-screen alert says when a part is over.
  pomodoroSignal(p, finished, state) {
    const nextName = state.next.part;
    const minutes = partMinutes(p, nextName);
    const today = this.getPomodoros().items.find((x) => x.id === p.id);
    const heading = finished === 'focus'
      ? (nextName === 'longBreak' ? t('Time for a Long Break') : t('Time for a Short Break'))
      : t('Break Over: Time to Focus');
    const nextLine = t('{part}: {time}', { part: partName(nextName), time: minutesLabel(minutes) });
    const label = finished === 'focus' ? t('Focus Done · {rounds}', { rounds: this.getPomodoroTimer().roundsLabel }) : t('Break Over');
    return {
      kind: 'ended',
      alert: p.alert,
      pomodoroId: p.id,
      finished,
      next: nextName,
      canExtend: finished === 'focus',
      label,
      title: heading,
      lines: [nextLine, today ? `${p.title} · ${today.todayLabel}` : p.title],
    };
  }

  // What the full-screen alert shows for a Pomodoro signal.
  buildPomodoroAlertItem(signal) {
    const nowDate = this.now();
    return {
      id: `pomodoro:${signal.pomodoroId}:${nowDate.getTime()}`,
      kind: 'pomodoro',
      taskId: `pomodoro:${signal.pomodoroId}`,
      pomodoroId: signal.pomodoroId,
      dateKey: dateKey(nowDate),
      title: signal.title,
      label: signal.label,
      notes: signal.lines.join('\n'),
      next: signal.next,
      canExtend: signal.canExtend,
      startMs: nowDate.getTime(),
      startLabel: formatTime12(nowDate),
      endLabel: '',
      durationLabel: '',
      zoneName: '',
      zoneIndex: 0,
      categoryName: '',
      categoryColor: '',
      priority: '',
      snoozed: false,
    };
  }
}

module.exports = { PomodoroMethods, TIMER_ACTIONS };
