'use strict';

// What the Daily View shows on each task row. Every piece of information can be switched on or off in Settings.
// The title and the done tick are always shown.

const { t } = require('./i18n');
const { formatDuration } = require('./time');

// id, name (also the Settings label), what it shows, shown by default
const TASK_INFO = [
  { id: 'time', title: 'Start Time', about: 'The Time the Task Starts', on: true },
  { id: 'endTime', title: 'End Time', about: 'The Time the Task Ends', on: false },
  { id: 'duration', title: 'Duration', about: 'How Long the Task Takes', on: true },
  { id: 'priority', title: 'Priority', about: 'The Coloured Diamond: Low, Medium or High', on: true },
  { id: 'category', title: 'Category', about: 'The Category Name and Colour', on: true },
  { id: 'status', title: 'Status', about: '"Not Done" and "In Progress"', on: true },
  { id: 'conflicts', title: 'Conflicts', about: 'Which Tasks Overlap This One', on: true },
  { id: 'repeat', title: 'Repeat', about: 'How Often the Task Repeats', on: false },
  { id: 'startRule', title: 'What the Start Follows', about: 'A prayer or another task the start time is based on', on: false },
  { id: 'reminders', title: 'Reminders', about: 'When the Reminders Go Off', on: false },
  { id: 'fullScreen', title: 'Full-Screen Alert', about: 'That a full-screen alert is on', on: false },
  { id: 'notes', title: 'Notes', about: 'The First Line of the Notes', on: false },
  { id: 'continues', title: 'Continues into Next Zone', about: 'When the task runs past the end of its zone', on: true },
  { id: 'backupStart', title: 'Backup Start Time Warning', about: 'When the prayer time was not available and a backup time is used', on: true },
];
const TASK_INFO_IDS = TASK_INFO.map((x) => x.id);
const DEFAULT_TASK_INFO = Object.fromEntries(TASK_INFO.map((x) => [x.id, x.on]));

function validateTaskInfo(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [t('Choose which details are shown on each task')];
  for (const [key, on] of Object.entries(value)) {
    if (!TASK_INFO_IDS.includes(key)) errors.push(t('Choose which details are shown on each task'));
    else if (typeof on !== 'boolean') errors.push(t('Choose which details are shown on each task'));
  }
  return Array.from(new Set(errors));
}

// "10 min after Asr", "when “Gym” ends": a short sentence about what a start time is based on. '' for a fixed time.
function describeStart(def, followsTitle) {
  if (!def) return '';
  const minutes = Number(def.minutes) || 0;
  const time = formatDuration(minutes);
  if (def.mode === 'prayer') {
    const prayer = t(String(def.prayer || '').replace(/^./, (c) => c.toUpperCase()));
    if (minutes === 0) return t('Starts at {prayer}', { prayer });
    return def.direction === 'before' ? t('Starts {time} before {prayer}', { time, prayer }) : t('Starts {time} after {prayer}', { time, prayer });
  }
  if (def.mode === 'task') {
    const title = followsTitle || t('a deleted task');
    const end = def.point === 'end';
    if (minutes === 0) return end ? t('Starts when “{title}” ends', { title }) : t('Starts when “{title}” starts', { title });
    if (def.direction === 'before') return end ? t('Starts {time} before “{title}” ends', { time, title }) : t('Starts {time} before “{title}” starts', { time, title });
    return end ? t('Starts {time} after “{title}” ends', { time, title }) : t('Starts {time} after “{title}” starts', { time, title });
  }
  return '';
}

module.exports = { TASK_INFO, TASK_INFO_IDS, DEFAULT_TASK_INFO, validateTaskInfo, describeStart };
