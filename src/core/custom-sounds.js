'use strict';

// Sounds the person adds for the full-screen alert (1.7.0), and the sound choice of each task.
//
// settings.customSounds = [{ id, name }]   the library; the files are copies kept in the app's data folder
//                                          (sounds/, see src/main/sound-files.js)
// task.reminders.sound = 'default'         follow Settings -> Sounds -> Full-Screen Alert
//                      | a built-in id     one of TASK_BUILTIN_SOUNDS, or 'off' (silent)
//                      | a custom id       one of the sounds in the library
// A sound that is no longer in the library falls back to the Settings sound, so an alert never breaks.

const { t } = require('./i18n');

const MAX_CUSTOM_SOUNDS = 20;
const SOUND_ID = /^[a-f0-9]{16,40}$/;
// Every sound made inside the app can be given to a task, so tasks are easy to tell apart by ear.
const TASK_BUILTIN_SOUNDS = ['bell', 'alarm', 'rising', 'pulse', 'chime', 'pop', 'ding', 'sparkle', 'off'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validSound = (x) => isPlainObject(x) && typeof x.id === 'string' && SOUND_ID.test(x.id) && typeof x.name === 'string' && x.name.length <= 200;

// A sound id in the format of a library sound (it may or may not be in the library).
const isCustomSoundId = (v) => typeof v === 'string' && SOUND_ID.test(v);

function validateCustomSounds(list) {
  if (!Array.isArray(list) || list.length > MAX_CUSTOM_SOUNDS || !list.every(validSound) || new Set(list.map((x) => x.id)).size !== list.length) {
    return [t('The list of your own sounds is not valid')];
  }
  return [];
}

function sanitizeCustomSounds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    if (!validSound(x) || seen.has(x.id) || out.length >= MAX_CUSTOM_SOUNDS) continue;
    seen.add(x.id);
    out.push({ id: x.id, name: x.name });
  }
  return out;
}

// The task's own choice is valid when it is 'default', a built-in sound or the id of a library sound.
function isValidTaskSound(value) {
  return value === 'default' || TASK_BUILTIN_SOUNDS.includes(value) || isCustomSoundId(value);
}

// What to play for an alert. taskChoice: the task's own choice; settingsSound: Settings -> Full-Screen Alert.
// Returns a built-in id, 'off' or the id of a sound that is in the library.
function resolveAlertSound(taskChoice, settingsSound, library) {
  const known = (id) => TASK_BUILTIN_SOUNDS.includes(id) || (isCustomSoundId(id) && Array.isArray(library) && library.some((x) => x.id === id));
  if (taskChoice && taskChoice !== 'default' && known(taskChoice)) return taskChoice;
  return known(settingsSound) ? settingsSound : 'bell';
}

module.exports = {
  MAX_CUSTOM_SOUNDS,
  SOUND_ID,
  TASK_BUILTIN_SOUNDS,
  isCustomSoundId,
  validateCustomSounds,
  sanitizeCustomSounds,
  isValidTaskSound,
  resolveAlertSound,
};
