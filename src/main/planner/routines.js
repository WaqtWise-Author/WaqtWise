'use strict';

// The routines list (things that repeat several times a day inside a time window) and what the background
// routine engine needs from the service. These methods are added to PlannerService (see ../service.js).

const { t } = require('../../core/i18n');
const core = require('../../core');
const { copy } = require('./util');

const {
  normalizeRoutine, setSlotDone, pickNote, occurrencesOn, describeRoutine, routineSlots, MAX_ROUTINES, localCategoryName, formatTime12, dateKey, parseTime,
} = core;

class RoutineMethods {
  findRoutine(id) {
    const item = (this.data.routines || []).find((x) => x.id === id);
    if (!item) throw new Error(t('This routine no longer exists.'));
    return item;
  }

  // The list as the window shows it: each routine with today's times (done or not, and which one is next).
  getRoutines() {
    const nowMs = this.now().getTime();
    const today = dateKey(this.now());
    return (this.data.routines || []).map((r) => {
      const category = this.categoryOf(r.categoryId);
      const times = occurrencesOn(r, today).map((o) => ({
        slot: o.slot, label: formatTime12(o.at), done: o.done, past: o.at.getTime() <= nowMs,
      }));
      const next = times.find((x) => !x.done && !x.past) || null;
      return {
        ...copy(r),
        categoryName: category ? localCategoryName(category) : '',
        categoryColor: category ? category.color : '',
        summary: describeRoutine(r),
        timesPerDay: routineSlots(r).length,
        dateKey: today,
        onToday: times.length > 0,
        times,
        doneToday: times.filter((x) => x.done).length,
        nextLabel: next ? next.label : '',
      };
    });
  }

  // The form's starting values for a new routine.
  newRoutineDefaults() {
    return {
      title: '', notes: '', categoryId: null, from: '08:00', to: '20:00', hours: 2, minutes: 0,
      weekdays: [0, 1, 2, 3, 4, 5, 6], notification: true, fullScreen: false, randomNotes: false, enabled: true,
    };
  }

  getRoutineForEdit({ id }) {
    const r = this.findRoutine(id);
    return {
      title: r.title, notes: r.notes, categoryId: r.categoryId, from: r.from, to: r.to,
      hours: Math.floor(r.everyMinutes / 60), minutes: r.everyMinutes % 60,
      weekdays: r.weekdays.slice(), notification: r.alerts.notification, fullScreen: r.alerts.fullScreen, randomNotes: r.randomNotes === true, enabled: r.enabled,
    };
  }

  // The routine's own record made from the form (hours and minutes become minutes).
  routineFromForm(form, base) {
    const source = form && typeof form === 'object' ? form : {};
    const hours = Number.isInteger(source.hours) ? source.hours : 0;
    const minutes = Number.isInteger(source.minutes) ? source.minutes : 0;
    return {
      ...base,
      title: source.title,
      notes: source.notes,
      categoryId: source.categoryId,
      from: source.from,
      to: source.to,
      everyMinutes: hours * 60 + minutes,
      weekdays: source.weekdays,
      alerts: { notification: source.notification === true, fullScreen: source.fullScreen === true },
      randomNotes: source.randomNotes === true,
      enabled: source.enabled !== false,
    };
  }

  // form: { title, notes, categoryId, from, to, hours, minutes, weekdays, notification, fullScreen, enabled }.
  saveRoutine({ id, form }) {
    const list = this.data.routines || (this.data.routines = []);
    const old = id ? this.findRoutine(id) : null;
    if (!old && list.length >= MAX_ROUTINES) throw new Error(t('The routines list is full (at most {max} routines)', { max: MAX_ROUTINES }));
    const base = old ? { id: old.id, completions: old.completions, createdAt: old.createdAt } : { id: this.newId(), completions: {} };
    const { routine, error } = normalizeRoutine(this.routineFromForm(form, base), this.now());
    if (error) throw new Error(error);
    if (routine.categoryId !== null && !this.categoryOf(routine.categoryId)) routine.categoryId = null;
    if (!routine.alerts.notification && !routine.alerts.fullScreen && routine.enabled) {
      throw new Error(t('Choose how this routine should remind you: a notification, a full-screen alert, or both'));
    }
    // Changing the times makes the old ticks meaningless.
    if (old && (old.from !== routine.from || old.to !== routine.to || old.everyMinutes !== routine.everyMinutes)) routine.completions = {};
    this.data.routines = old ? list.map((x) => (x.id === old.id ? routine : x)) : [...list, routine];
    this.changed();
    return { ok: true, id: routine.id };
  }

  deleteRoutine({ id }) {
    this.findRoutine(id);
    this.data.routines = this.data.routines.filter((x) => x.id !== id);
    if (this.data.noteRotation) delete this.data.noteRotation[`routine:${id}`];
    this.changed();
    return { ok: true };
  }

  setRoutineEnabled({ id, enabled }) {
    const old = this.findRoutine(id);
    this.data.routines = this.data.routines.map((x) => (x.id === id ? { ...old, enabled: Boolean(enabled) } : x));
    this.changed();
    return { ok: true };
  }

  setRoutineSlotDone({ id, dateKey: key, slot, done }) {
    const old = this.findRoutine(id);
    this.data.routines = this.data.routines.map((x) => (x.id === id ? setSlotDone(old, key, slot, Boolean(done), this.now()) : x));
    this.changed();
    return { ok: true };
  }

  // Up to `n` times still to come today, for a small badge: how many routine times are left today.
  getRoutineLeftToday() {
    const nowMs = this.now().getTime();
    const today = dateKey(this.now());
    let left = 0;
    for (const r of this.data.routines || []) {
      for (const o of occurrencesOn(r, today)) if (!o.done && o.at.getTime() > nowMs) left += 1;
    }
    return left;
  }

  // ---- used by the background routine engine (main process) -----------------------------------------------------------

  getRoutineList() {
    return this.data.routines || [];
  }

  getRoutineState() {
    return this.data.routineState;
  }

  saveRoutineState(state) {
    this.data.routineState = state;
    try {
      this.persist();
    } catch (error) {
      // the bookkeeping is rewritten at the next change
    }
  }

  markRoutineDone(id, key, slot, done) {
    const old = (this.data.routines || []).find((x) => x.id === id);
    if (!old) return;
    this.data.routines = this.data.routines.map((x) => (x.id === id ? setSlotDone(old, key, slot, Boolean(done), this.now()) : x));
    this.changed();
  }

  // One of the routine's several notes (separated by ;), a different one each time it rings, none repeated until all were shown.
  pickRoutineNote(item) {
    const rotation = this.data.noteRotation || (this.data.noteRotation = {});
    const key = `routine:${item.routineId}`;
    const { note, record } = pickNote(item.notes, rotation[key], item.dateKey, this.random, true);
    const before = JSON.stringify(rotation[key] || null);
    if (record) rotation[key] = record;
    else delete rotation[key];
    if (JSON.stringify(record) !== before) {
      try {
        this.persist();
      } catch (error) {
        // not being able to remember the choice must never stop the alert from showing
      }
    }
    return note;
  }

  // What the full-screen alert shows for each routine time ringing now.
  buildRoutineAlertItems(items) {
    return items.map((i) => {
      const category = this.categoryOf(i.categoryId);
      return {
        id: i.id,
        kind: 'routine',
        taskId: `routine:${i.routineId}`,
        routineId: i.routineId,
        slot: i.slot,
        dateKey: i.dateKey,
        title: i.title,
        notes: i.randomNotes ? this.pickRoutineNote(i) : i.notes || '',
        startMs: i.at.getTime(),
        startLabel: formatTime12(i.at),
        endLabel: '',
        durationLabel: '',
        zoneName: '',
        zoneIndex: 0,
        categoryName: category ? localCategoryName(category) : '',
        categoryColor: category ? category.color : '',
        priority: '',
        snoozed: Boolean(i.snoozed),
      };
    });
  }
}

module.exports = { RoutineMethods };
