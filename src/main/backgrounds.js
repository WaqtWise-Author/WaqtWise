'use strict';

// The pictures for the full-screen alert, as files (1.4.0).
//
// When the person adds pictures, each one is copied into the app's data folder (backgrounds/), made smaller on the way
// (at most 2560 x 1600, saved as JPEG) with a small copy for the Settings screen. So the alert opens quickly, and the
// picture stays even if the original file is moved or deleted. Only files in that folder are ever read back, by id.
//
// The Electron and file pieces are passed in, so this can be tested without Electron.

const path = require('path');
const crypto = require('crypto');
const { IMAGE_ID } = require('../core/alert-background');

const MAX_SOURCE_BYTES = 40 * 1024 * 1024; // bigger files are skipped
const FULL_SIZE = { width: 2560, height: 1600 };
const THUMB_WIDTH = 320;
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function createBackgrounds({ dir, fs, nativeImage, newId = () => crypto.randomBytes(12).toString('hex'), log = () => {} }) {
  const fileOf = (id, thumb) => path.join(dir, `${id}${thumb ? '-thumb' : ''}.jpg`);
  let cache = { id: '', url: '' }; // the last full picture read (the alert redraws often with the same one)

  function smaller(image, max) {
    const { width, height } = image.getSize();
    const scale = Math.min(1, max.width / width, (max.height || Infinity) / height);
    return scale < 1 ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' }) : image;
  }

  return {
    EXTENSIONS,

    // Copies the chosen files. Returns { images: [{ id, name }], skipped: [names] }.
    add(paths) {
      const images = [];
      const skipped = [];
      fs.mkdirSync(dir, { recursive: true });
      for (const file of Array.isArray(paths) ? paths : []) {
        const name = path.basename(String(file));
        try {
          const ext = path.extname(name).slice(1).toLowerCase();
          if (!EXTENSIONS.includes(ext) || fs.statSync(file).size > MAX_SOURCE_BYTES) { skipped.push(name); continue; }
          const image = nativeImage.createFromPath(file);
          if (!image || image.isEmpty()) { skipped.push(name); continue; }
          const id = newId();
          fs.writeFileSync(fileOf(id), smaller(image, FULL_SIZE).toJPEG(86));
          fs.writeFileSync(fileOf(id, true), smaller(image, { width: THUMB_WIDTH, height: THUMB_WIDTH }).toJPEG(80));
          images.push({ id, name: path.basename(name, path.extname(name)).slice(0, 200) });
        } catch (error) {
          log('Background picture:', error);
          skipped.push(name);
        }
      }
      return { images, skipped };
    },

    // A picture as a data: address for the page (null when the id is not valid or the file is gone).
    dataUrl(id, thumb = false) {
      if (typeof id !== 'string' || !IMAGE_ID.test(id)) return null;
      if (!thumb && cache.id === id) return cache.url;
      try {
        const url = `data:image/jpeg;base64,${fs.readFileSync(fileOf(id, thumb)).toString('base64')}`;
        if (!thumb) cache = { id, url };
        return url;
      } catch (error) {
        return null;
      }
    },

    remove(id) {
      if (typeof id !== 'string' || !IMAGE_ID.test(id)) return;
      if (cache.id === id) cache = { id: '', url: '' };
      for (const thumb of [false, true]) {
        try { fs.unlinkSync(fileOf(id, thumb)); } catch (error) { /* already gone */ }
      }
    },

    // Deletes files that no setting points to any more (left over after an import, for example).
    keepOnly(ids) {
      let names;
      try { names = fs.readdirSync(dir); } catch (error) { return; }
      const keep = new Set(ids);
      for (const name of names) {
        const match = /^([a-f0-9]{16,40})(-thumb)?\.jpg$/.exec(name);
        if (match && !keep.has(match[1])) {
          try { fs.unlinkSync(path.join(dir, name)); } catch (error) { /* ignore */ }
        }
      }
    },
  };
}

module.exports = { createBackgrounds, MAX_SOURCE_BYTES, EXTENSIONS };
