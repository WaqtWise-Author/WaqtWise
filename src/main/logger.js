'use strict';

// A small diagnostic log written to a file, so a problem that happened while nobody was watching (for example a
// blank window after Windows woke up) can be looked at afterwards. It is made for the app's own events only:
// start-up, window loading, sleep / wake, renderer crashes and recovery attempts. It never receives task titles,
// notes or other planner data, and long texts are cut. The file is capped: when it grows past `maxBytes` it is
// rotated (waqtwise.log -> waqtwise.log.1 -> ...), and only `maxFiles` files are kept.
//
// Everything is wrapped so that logging can never throw into the app.

const path = require('path');

const FILE_NAME = 'waqtwise.log';
const MAX_TEXT = 500;

function cut(text) {
  const s = String(text);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
}

// One value as one short piece of text: errors become message + first stack lines, objects become compact JSON.
function describe(value) {
  if (value instanceof Error) {
    const stack = String(value.stack || '').split('\n').slice(0, 6).join(' | ');
    return cut(stack || value.message);
  }
  if (value && typeof value === 'object') {
    try { return cut(JSON.stringify(value)); } catch (error) { return '[object]'; }
  }
  return cut(value);
}

function createLogger({ fs, dir, context = {}, maxBytes = 256 * 1024, maxFiles = 3, now = () => new Date() }) {
  const file = path.join(dir, FILE_NAME);
  let ready = false;
  let size = 0;

  function open() {
    if (ready) return true;
    try {
      fs.mkdirSync(dir, { recursive: true });
      size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      ready = true;
    } catch (error) {
      return false;
    }
    return true;
  }

  function rotate() {
    try {
      for (let i = maxFiles - 1; i >= 1; i -= 1) {
        const from = i === 1 ? file : `${file}.${i - 1}`;
        const to = `${file}.${i}`;
        if (fs.existsSync(from)) {
          if (fs.existsSync(to)) fs.rmSync(to, { force: true });
          fs.renameSync(from, to);
        }
      }
      size = 0;
    } catch (error) {
      // If rotation fails the file is simply started again below.
      try { fs.rmSync(file, { force: true }); } catch (inner) { /* nothing more to do */ }
      size = 0;
    }
  }

  function write(level, args) {
    try {
      if (!open()) return;
      const line = `${now().toISOString()} ${level} ${args.map(describe).join(' ')}\n`;
      if (size + Buffer.byteLength(line) > maxBytes) rotate();
      fs.appendFileSync(file, line, 'utf8');
      size += Buffer.byteLength(line);
    } catch (error) {
      // A full disk or a locked file must not break the app.
    }
  }

  const logger = {
    file,
    dir,
    info: (...args) => write('INFO', args),
    warn: (...args) => write('WARN', args),
    error: (...args) => write('ERROR', args),
    header: () => write('INFO', ['Session start', context]),
  };
  return logger;
}

module.exports = { createLogger, FILE_NAME };
