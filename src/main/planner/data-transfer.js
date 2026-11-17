'use strict';

// Export and import.
// These methods are added to PlannerService (see ../service.js); `this` is the service.

const core = require('../../core');

const {
  buildExport, parseImport,
} = core;
const { copy } = require('./util');
const { t } = require('../../core/i18n');

class DataTransferMethods {
  // ---- export / import --------------------------------------------------------------------------------------------

  exportData() {
    return buildExport(this.data, this.now());
  }

  // Replaces tasks, categories and settings with the contents of a backup.
  importData(input) {
    const { data, warnings, hasHistory } = parseImport(input);
    this.requireSafetyBackup('before-import');
    this.freezePast();
    // A backup file must not switch on "start with Windows" by itself: that stays as this computer has it.
    data.settings = { ...data.settings, startWithWindows: this.data.settings.startWithWindows };
    // A file with saved statistics replaces the ones on this computer (they belong to the imported tasks); an older file keeps them.
    this.data = { ...data, reminderState: this.data.reminderState, routineState: this.data.routineState, statsHistory: hasHistory ? data.statsHistory : this.history() };
    this.providerCache = null;
    this.applyLanguage();
    try {
      this.persist();
    } finally {
      this.onSettingsChanged(copy(this.data.settings));
      this.onDataChanged();
    }
    return { ok: true, tasks: data.tasks.length, categories: data.categories.length, warnings };
  }

  // ---- backup copies kept by the app ----------------------------------------------------------------------------------

  // The saved copies the user can go back to: [{ id, kind: 'daily'|'before-import'|'before-restore', date, time, tasks }].
  listBackups() {
    return this.store.listBackups ? this.store.listBackups() : [];
  }

  // Replaces tasks, categories and settings with a saved copy. The current data is saved first, so this can be undone too.
  restoreBackup({ id }) {
    const { data, warnings } = this.store.readBackup(id);
    this.requireSafetyBackup('before-restore');
    this.freezePast();
    this.data = { ...data, reminderState: this.data.reminderState, routineState: this.data.routineState, statsHistory: this.history() };
    this.providerCache = null;
    this.applyLanguage();
    try {
      this.persist();
    } finally {
      this.onSettingsChanged(copy(this.data.settings));
      this.onDataChanged();
    }
    return { ok: true, tasks: data.tasks.length, categories: data.categories.length, warnings };
  }

  requireSafetyBackup(kind) {
    if (!this.store.backupNow(kind, this.data)) {
      throw new Error(t('The safety backup could not be saved. Your data was not replaced.'));
    }
  }
}

module.exports = { DataTransferMethods };
