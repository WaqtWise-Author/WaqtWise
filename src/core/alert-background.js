'use strict';

// The background of the full-screen alert (1.4.0): one solid color (as before), or pictures the person chose.
//
// settings.alertBackground = {
//   mode: 'color' | 'images',
//   images: [{ id, name }],          the pictures (copies kept in the app's data folder, see src/main/backgrounds.js)
//   pick: 'fixed' | 'random',        always the same picture, or a different one each time
//   fixedId: '',                     the picture used when pick is 'fixed' (the first one when empty or gone)
//   blur: 0-100 (steps of 10),       how much the picture is blurred
//   dim: 0-80 (steps of 10),         how much it is darkened, so the text stays easy to read
//   panel: 'none' | 'glass',         the text sits on the picture, or on a frosted glass panel
//   glassBlur: 0-100 (steps of 10),  how frosted the glass is
//   glassDim: 0-80 (steps of 10),    how dark the glass is (1.5.0)
//   position: 'center' | 'bottom',   where the text sits
//   useFor: 'all' | 'chosen',        every reminder, or only the tasks whose form says "Image"
//   routines: 'default' | 'color',   routine alerts follow the setting above, or always keep the solid color (1.5.0)
//   pomodoro: 'default' | 'color',   the same for Pomodoro alerts (1.5.0)
// }
// Each task can choose for itself (task.reminders.background): 'default' (as in Settings), 'image' or 'color'.
// The preview follows the Settings.

const { t } = require('./i18n');

const MAX_ALERT_IMAGES = 20;
const IMAGE_ID = /^[a-f0-9]{16,40}$/;
const TASK_BACKGROUNDS = ['default', 'image', 'color'];

const DEFAULT_ALERT_BACKGROUND = {
  mode: 'color',
  images: [],
  pick: 'fixed',
  fixedId: '',
  blur: 30,
  dim: 30,
  panel: 'glass',
  glassBlur: 60,
  glassDim: 40,
  position: 'center',
  useFor: 'all',
  routines: 'default',
  pomodoro: 'default',
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const step10 = (max) => (v) => Number.isInteger(v) && v >= 0 && v <= max && v % 10 === 0;
const validImage = (x) => isPlainObject(x) && typeof x.id === 'string' && IMAGE_ID.test(x.id) && typeof x.name === 'string' && x.name.length <= 200;

const RULES = {
  mode: (v) => v === 'color' || v === 'images',
  images: (v) => Array.isArray(v) && v.length <= MAX_ALERT_IMAGES && v.every(validImage) && new Set(v.map((x) => x.id)).size === v.length,
  pick: (v) => v === 'fixed' || v === 'random',
  fixedId: (v) => v === '' || (typeof v === 'string' && IMAGE_ID.test(v)),
  blur: step10(100),
  dim: step10(80),
  panel: (v) => v === 'none' || v === 'glass',
  glassBlur: step10(100),
  glassDim: step10(80),
  routines: (v) => v === 'default' || v === 'color',
  pomodoro: (v) => v === 'default' || v === 'color',
  position: (v) => v === 'center' || v === 'bottom',
  useFor: (v) => v === 'all' || v === 'chosen',
};

// Messages for a (possibly partial) value from the Settings screen.
function validateAlertBackground(value) {
  if (!isPlainObject(value)) return [t('The alert background is not valid')];
  const errors = [];
  for (const key of Object.keys(value)) {
    if (!RULES[key]) errors.push(t('The alert background has an unknown option'));
    else if (!RULES[key](value[key])) errors.push(t('The alert background option "{key}" is not valid', { key }));
  }
  return errors;
}

// Keeps the valid values; the default for the rest (also for files from versions before 1.4.0).
function sanitizeAlertBackground(raw) {
  const out = {};
  for (const key of Object.keys(DEFAULT_ALERT_BACKGROUND)) {
    const candidate = isPlainObject(raw) ? raw[key] : undefined;
    out[key] = candidate !== undefined && RULES[key](candidate) ? candidate : DEFAULT_ALERT_BACKGROUND[key];
  }
  if (findId(out.images, out.fixedId) === null) out.fixedId = '';
  out.images = out.images.map((x) => ({ id: x.id, name: x.name }));
  return out;
}
function findId(images, id) {
  return images.find((x) => x.id === id) ? id : null;
}

// Does this alert show a picture? choice: the task's own choice ('default' | 'image' | 'color'; others use 'default').
function wantsImage(bg, choice) {
  if (!bg || bg.mode !== 'images' || bg.images.length === 0) return false;
  if (choice === 'color') return false;
  if (choice === 'image') return true;
  return bg.useFor === 'all';
}

// Which picture: the fixed one, or one at random (not the same as last time when there are several).
// Returns its id, or '' for the solid color.
function pickAlertImage(bg, choice, random = Math.random, lastId = '') {
  if (!wantsImage(bg, choice)) return '';
  if (bg.pick === 'fixed') return findId(bg.images, bg.fixedId) || bg.images[0].id;
  const others = bg.images.length > 1 ? bg.images.filter((x) => x.id !== lastId) : bg.images;
  return others[Math.min(others.length - 1, Math.floor(random() * others.length))].id;
}

module.exports = {
  MAX_ALERT_IMAGES,
  IMAGE_ID,
  TASK_BACKGROUNDS,
  DEFAULT_ALERT_BACKGROUND,
  validateAlertBackground,
  sanitizeAlertBackground,
  wantsImage,
  pickAlertImage,
};
