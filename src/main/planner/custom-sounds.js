'use strict';

// The person's own alert sounds, and the sound of each task (1.7.0). These methods are added to PlannerService (see ../service.js).
// The service keeps the list in the settings and decides which sound an alert rings with; the files themselves
// (copies kept in the app's data folder) are handled by the main process (src/main/sound-files.js).

const { t } = require('../../core/i18n');
const { MAX_CUSTOM_SOUNDS, SOUND_ID, resolveAlertSound } = require('../../core/custom-sounds');

class CustomSoundMethods {
  // The sound an alert rings with: the task's own choice, else the one in Settings (a built-in id, a library id, or 'off').
  alertSoundFor(taskChoice) {
    return resolveAlertSound(taskChoice, this.settings.alertSound, this.settings.customSounds);
  }

  // Sounds copied by the main process: [{ id, name }]. Returns { added, full } (full: some did not fit).
  addCustomSounds(list) {
    const sounds = this.settings.customSounds.slice();
    let added = 0;
    for (const x of Array.isArray(list) ? list : []) {
      if (!x || typeof x.id !== 'string' || !SOUND_ID.test(x.id) || sounds.some((y) => y.id === x.id)) continue;
      if (sounds.length >= MAX_CUSTOM_SOUNDS) break;
      sounds.push({ id: x.id, name: String(x.name || '').slice(0, 200) });
      added += 1;
    }
    if (added > 0) this.saveSettings({ customSounds: sounds });
    return { added, full: added < (Array.isArray(list) ? list.length : 0) };
  }

  // How many tasks use this sound (for the question before it is removed).
  getSoundUsage(arg) {
    const id = arg && typeof arg === 'object' ? arg.id : arg;
    const tasks = this.data.tasks.filter((task) => task.reminders && task.reminders.sound === id).length;
    return { tasks, settings: this.settings.alertSound === id };
  }

  // Takes the sound out of the list. Tasks that used it ring with the Settings sound from now on.
  removeCustomSound(id) {
    if (!this.settings.customSounds.some((x) => x.id === id)) throw new Error(t('That sound is no longer in the list.'));
    const patch = { customSounds: this.settings.customSounds.filter((x) => x.id !== id) };
    if (this.settings.alertSound === id) patch.alertSound = 'bell';
    this.saveSettings(patch);
    return { ok: true };
  }
}

module.exports = { CustomSoundMethods };
