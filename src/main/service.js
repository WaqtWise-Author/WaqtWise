'use strict';

// The planner "service": every action the screens can ask for, in plain Node code.
// It has no Electron in it, so it is tested directly and used by the screenshot tool.
// Everything it returns is plain data (text, numbers, lists) that can cross into the window.

const i18n = require('../core/i18n');
require('../core/i18n-ar'); // registers the Arabic texts
const { t } = i18n;
const crypto = require('crypto');
const core = require('../core');
const { copy } = require('./planner/util');
const { isValidKey, addDaysToKey, dateKey: toDateKey } = core;
const { formatTime12InZone } = require('../core/time');

const { CITIES, localCategoryName, resolveCity, METHOD_KEYS, METHOD_LABELS, currentPlanningDayKey, createPrayerProvider } = core;

function defaultProviderFactory(settings) {
  const city = resolveCity(settings);
  return createPrayerProvider({
    latitude: city.latitude,
    longitude: city.longitude,
    method: settings.method,
    adjustments: settings.adjustments,
  });
}

// A short reason a person can understand for a failed save.
function describeSaveError(error) {
  const code = error && error.code;
  if (code === 'ENOSPC') return t('The disk is full.');
  if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') return t('The data file is locked or protected (another program, such as an antivirus, may be using it).');
  if (code === 'EROFS') return t('The disk is read-only.');
  return String((error && error.message) || error);
}

class PlannerService {
  // deps: { store, now, newId, providerFactory, onDataChanged(), onSettingsChanged(settings) }
  constructor(deps) {
    this.store = deps.store;
    this.now = deps.now || (() => new Date());
    this.newId = deps.newId || (() => crypto.randomUUID());
    this.random = deps.random || Math.random;
    this.saveProblem = null;
    this.providerFactory = deps.providerFactory || defaultProviderFactory;
    this.onDataChanged = deps.onDataChanged || (() => {});
    this.onSettingsChanged = deps.onSettingsChanged || (() => {});
    this.data = this.store.load();
    this.providerCache = null;
    this.applyLanguage();
  }

  // The texts the service writes (labels, messages) follow the language chosen in Settings.
  applyLanguage() {
    i18n.setLanguage(this.settings.language);
  }

  // Categories as the window shows them (the built-in names are translated).
  categoriesForView() {
    return this.data.categories.map((c) => ({ ...c, name: localCategoryName(c) }));
  }

  // ---- basics -----------------------------------------------------------------------------------------

  get settings() {
    return this.data.settings;
  }

  provider() {
    const s = this.settings;
    const key = JSON.stringify([s.cityName, s.useCustomCity, s.customCity, s.method, s.adjustments]);
    if (!this.providerCache || this.providerCache.key !== key) {
      this.providerCache = { key, provider: this.providerFactory(s) };
    }
    return this.providerCache.provider;
  }

  // Options used whenever occurrences are worked out. `tasks` lets tasks that follow other tasks find them.
  recurrenceOptions() {
    return { workingDays: this.settings.workingDays, weekStartsOn: this.weekStart(), tasks: this.data.tasks };
  }

  // The city in use, and whether its time zone is different from this computer's.
  cityInfo() {
    const city = resolveCity(this.settings);
    const computer = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { name: city.name, custom: city.custom, timeZone: city.timeZone, computerTimeZone: computer, differs: Boolean(city.timeZone) && city.timeZone !== computer };
  }

  getCityInfo() {
    return this.cityInfo();
  }

  // A prayer-time boundary written in the city's time zone (the computer's clock for the built-in cities).
  zoneTimeLabel(date) {
    const { timeZone } = resolveCity(this.settings);
    return timeZone ? formatTime12InZone(date, timeZone) : core.formatTime12(date);
  }

  weekStart() {
    return [6, 0, 1].includes(this.settings.weekStart) ? this.settings.weekStart : 0;
  }

  // Saves the data. If saving fails the problem is remembered (the window shows a banner until a save works) and the error is thrown.
  persist() {
    try {
      this.store.save(this.data);
      this.saveProblem = null;
    } catch (error) {
      this.saveProblem = { message: describeSaveError(error), since: this.now().toISOString() };
      throw error;
    }
  }

  // The five prayers must come in order on every day (an adjustment of +2 hours for Dhuhr and -2 for Asr would not).
  // Checked on days spread over a year, before new prayer-time settings are accepted.
  assertPrayerOrder() {
    try {
      const provider = this.provider();
      let key = toDateKey(this.now());
      for (let i = 0; i < 14; i++, key = addDaysToKey(key, 28)) {
        const day = provider(key);
        const next = provider(addDaysToKey(key, 1));
        const times = [day.fajr, day.dhuhr, day.asr, day.maghrib, day.isha, next.fajr].map((d) => (d instanceof Date ? d.getTime() : NaN));
        for (let j = 1; j < times.length; j++) if (!(times[j] > times[j - 1])) throw new Error('order');
      }
    } catch (error) {
      throw new Error(t('These prayer time settings put the prayers out of order on some days. Please change the adjustments.'));
    }
  }

  getSaveStatus() {
    return this.saveProblem ? { ok: false, ...this.saveProblem } : { ok: true };
  }

  // "Try Again" on the banner.
  retrySave() {
    try {
      this.persist();
    } catch (error) {
      // the status says why
    }
    return this.getSaveStatus();
  }

  // Even when saving fails, the change is kept in memory (the banner offers "Try Again"), so the window must still redraw.
  changed() {
    this.changeSerial = (this.changeSerial || 0) + 1;
    try {
      this.persist();
    } finally {
      this.onDataChanged();
    }
  }

  findTask(taskId) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(t('This task no longer exists.'));
    return task;
  }

  categoryOf(categoryId) {
    return this.data.categories.find((c) => c.id === categoryId) || null;
  }

  // ---- start-up information ----------------------------------------------------------------------------

  bootstrap() {
    this.freezePast();
    return {
      settings: copy(this.settings),
      categories: this.categoriesForView(),
      cities: CITIES.map((c) => c.name),
      countries: this.getCountries().map((c) => ({ code: c.code, name: c.name })),
      methods: METHOD_KEYS.map((key) => ({ key, label: t(METHOD_LABELS[key]) })),
      currentPlanningDayKey: currentPlanningDayKey(this.provider(), this.now()),
      city: this.cityInfo(),
      loadNotes: copy(this.store.loadNotes || []),
    };
  }

  // ---- used by the background reminder engine (main process) ------------------------------------------------------------

  getTasks() {
    return this.data.tasks;
  }

  getReminderSettings() {
    return this.data.settings;
  }

  updateTaskFromEngine(task, dateKey) {
    this.freezePast();
    this.data.tasks = this.data.tasks.map((t) => (t.id === task.id ? task : t));
    if (dateKey) this.refreshFrozenOccurrence(task.id, dateKey); // "Mark as Done" from an alert counts in the statistics
    this.changed();
  }

  getReminderState() {
    return this.data.reminderState;
  }

  // Called about once a minute by the reminder engine: only the small bookkeeping file is written, not all the data.
  saveReminderState(state) {
    this.data.reminderState = state;
    if (typeof this.store.saveState === 'function') {
      try {
        this.store.saveState(state);
        return;
      } catch (error) {
        // fall back to a full save below
      }
    }
    this.persist();
  }
}

// The service is built from several files, one per area; their methods are added here.
const MIXINS = [
  require('./planner/day-view').DayViewMethods,
  require('./planner/missed-alerts').MissedAlertMethods,
  require('./planner/task-form').TaskFormMethods,
  require('./planner/settings-categories').SettingsMethods,
  require('./planner/data-transfer').DataTransferMethods,
  require('./planner/history').HistoryMethods,
  require('./planner/free-tasks').FreeTaskMethods,
  require('./planner/routines').RoutineMethods,
  require('./planner/undo').UndoMethods,
];
for (const mixin of MIXINS) {
  for (const name of Object.getOwnPropertyNames(mixin.prototype)) {
    if (name !== 'constructor') Object.defineProperty(PlannerService.prototype, name, Object.getOwnPropertyDescriptor(mixin.prototype, name));
  }
}

// The names the window is allowed to call.
const PUBLIC_METHODS = [
  'bootstrap', 'getDay', 'getStats', 'getUpcoming', 'getMissed', 'dismissMissed', 'clearMissed', 'newTaskDefaults', 'getTaskForEdit', 'previewForm', 'saveTask',
  'getReferenceChoices', 'getDeleteImpact', 'getAlertPreset', 'deleteTask', 'setDone', 'duplicateTask', 'getSettings', 'saveSettings', 'addCategory', 'updateCategory',
  'deleteCategory', 'listBackups', 'restoreBackup', 'getCityInfo', 'getCountries', 'searchCities', 'chooseWorldCity',
  'getFreeTasks', 'getFreeTaskCount', 'saveFreeTask', 'deleteFreeTask', 'setFreeDone', 'clearFreeDone', 'moveFreeTask', 'getFreeTaskForSchedule', 'getRoutines', 'newRoutineDefaults', 'getRoutineForEdit', 'saveRoutine', 'deleteRoutine', 'setRoutineEnabled', 'setRoutineSlotDone', 'undoDelete',
  'getTaskDetails', 'getSaveStatus', 'retrySave',
];

// A light check of what the window sends, before it reaches the service: ids must be text and dates must be real dates.
function checkRequest(method, args) {
  const bad = () => new Error(t('Unknown request.'));
  if (!PUBLIC_METHODS.includes(method)) throw bad();
  if (args !== undefined && !Array.isArray(args)) throw bad();
  for (const arg of args || []) {
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      for (const name of ['taskId', 'id']) if (name in arg && arg[name] !== null && arg[name] !== undefined && typeof arg[name] !== 'string') throw bad();
      for (const name of ['dateKey', 'defaultKey']) if (name in arg && arg[name] !== null && arg[name] !== undefined && !isValidKey(arg[name])) throw bad();
    }
  }
}

module.exports = { PlannerService, PUBLIC_METHODS, defaultProviderFactory, checkRequest };
