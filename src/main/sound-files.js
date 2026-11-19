'use strict';

// The person's own alert sounds, as files (1.7.0).
//
// When the person adds sounds, each file is checked and copied into the app's data folder (sounds/), so the sound
// stays even if the original file is moved or deleted. Only files in that folder are ever read back, by id.
// The page decodes the bytes itself (Web Audio), so a file that cannot be decoded just rings with the Settings sound.
//
// The file pieces are passed in, so this can be tested without Electron.

const path = require('path');
const crypto = require('crypto');
const { SOUND_ID } = require('../core/custom-sounds');

const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // bigger files are skipped
const EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];

// Looks at the first bytes, so a renamed file of another kind is not accepted.
function looksLikeSound(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const text = (from, to) => bytes.toString('latin1', from, to);
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return true; // wav
  if (text(0, 4) === 'OggS' || text(0, 4) === 'fLaC') return true; // ogg, flac
  if (text(4, 8) === 'ftyp') return true; // m4a
  if (text(0, 3) === 'ID3') return true; // mp3 with tags
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // mp3 frame
}

function createSoundFiles({ dir, fs, newId = () => crypto.randomBytes(12).toString('hex'), log = () => {} }) {
  const fileOf = (id) => path.join(dir, `${id}.snd`);

  return {
    EXTENSIONS,

    // Copies the chosen files. Returns { sounds: [{ id, name }], skipped: [names] }.
    add(paths) {
      const sounds = [];
      const skipped = [];
      fs.mkdirSync(dir, { recursive: true });
      for (const file of Array.isArray(paths) ? paths : []) {
        const name = path.basename(String(file));
        try {
          const ext = path.extname(name).slice(1).toLowerCase();
          if (!EXTENSIONS.includes(ext) || fs.statSync(file).size > MAX_SOURCE_BYTES) { skipped.push(name); continue; }
          const bytes = fs.readFileSync(file);
          if (!looksLikeSound(bytes)) { skipped.push(name); continue; }
          const id = newId();
          fs.writeFileSync(fileOf(id), bytes);
          sounds.push({ id, name: path.basename(name, path.extname(name)).slice(0, 200) });
        } catch (error) {
          log('Custom sound:', error);
          skipped.push(name);
        }
      }
      return { sounds, skipped };
    },

    // The bytes of a sound (null when the id is not valid or the file is gone).
    read(id) {
      if (typeof id !== 'string' || !SOUND_ID.test(id)) return null;
      try {
        return fs.readFileSync(fileOf(id));
      } catch (error) {
        return null;
      }
    },

    remove(id) {
      if (typeof id !== 'string' || !SOUND_ID.test(id)) return;
      try { fs.unlinkSync(fileOf(id)); } catch (error) { /* already gone */ }
    },
  };
}

module.exports = { createSoundFiles, looksLikeSound, MAX_SOURCE_BYTES, EXTENSIONS };
