'use strict';

// The pictures behind the full-screen alert (1.4.0). These methods are added to PlannerService (see ../service.js).
// The service only keeps the list in the settings and decides which picture an alert shows; the files themselves
// (copies made smaller, kept in the app's data folder) are handled by the main process (src/main/backgrounds.js).

const { t } = require('../../core/i18n');
const { pickAlertImage, MAX_ALERT_IMAGES, IMAGE_ID } = require('../../core/alert-background');

class AlertBackgroundMethods {
  // The id of the picture for an alert ('' = the solid color). choice: the task's own choice, or 'default'.
  pickAlertImageFor(choice) {
    const random = this.random || Math.random;
    const id = pickAlertImage(this.settings.alertBackground, choice, random, this.lastAlertImageId || '');
    if (id) this.lastAlertImageId = id;
    return id;
  }

  // What the alert page needs to draw the picture (null: the solid color).
  alertBackgroundLook(imageId) {
    const bg = this.settings.alertBackground;
    if (!imageId || bg.mode !== 'images' || !bg.images.some((x) => x.id === imageId)) return null;
    return { imageId, blur: bg.blur, dim: bg.dim, panel: bg.panel, glassBlur: bg.glassBlur, glassDim: bg.glassDim, position: bg.position };
  }

  // Pictures copied by the main process: [{ id, name }]. Returns { added, full } (full: some did not fit).
  addAlertImages(list) {
    const bg = this.settings.alertBackground;
    const images = bg.images.slice();
    let added = 0;
    for (const x of Array.isArray(list) ? list : []) {
      if (!x || typeof x.id !== 'string' || !IMAGE_ID.test(x.id) || images.some((y) => y.id === x.id)) continue;
      if (images.length >= MAX_ALERT_IMAGES) break;
      images.push({ id: x.id, name: String(x.name || '').slice(0, 200) });
      added += 1;
    }
    if (added > 0) this.saveSettings({ alertBackground: { images, fixedId: bg.fixedId || images[0].id } });
    return { added, full: added < (Array.isArray(list) ? list.length : 0) };
  }

  removeAlertImage(id) {
    const bg = this.settings.alertBackground;
    if (!bg.images.some((x) => x.id === id)) throw new Error(t('That picture is no longer in the list.'));
    const images = bg.images.filter((x) => x.id !== id);
    this.saveSettings({ alertBackground: { images, fixedId: bg.fixedId === id ? (images[0] ? images[0].id : '') : bg.fixedId } });
    return { ok: true };
  }
}

module.exports = { AlertBackgroundMethods };
