'use strict';

// "Undo" after a delete (a task, a free task, a routine, or "Clear Done"). Just before the delete the service keeps a
// copy of the lists; the window shows an Undo button for a few seconds. The copy is only good while nothing else has
// changed the data after the delete, so an Undo can never throw away newer work. Only the latest delete can be undone.

const { t } = require('../../core/i18n');
const { copy } = require('./util');

const KEPT = ['tasks', 'freeTasks', 'routines', 'noteRotation', 'statsHistory', 'missedReminders'];

class UndoMethods {
  // Call before changing anything. Returns the token to give back to endUndo().
  beginUndo() {
    const snapshot = {};
    for (const key of KEPT) if (this.data[key] !== undefined) snapshot[key] = copy(this.data[key]);
    this.undoSlot = { id: this.newId(), snapshot, serial: null };
    return this.undoSlot.id;
  }

  // Call right after the delete has been saved. Returns the token the window sends back to undo it.
  endUndo(token) {
    if (!this.undoSlot || this.undoSlot.id !== token) return undefined;
    this.undoSlot.serial = this.changeSerial || 0;
    return token;
  }

  // The delete did nothing: nothing to undo.
  cancelUndo(token) {
    if (this.undoSlot && this.undoSlot.id === token) this.undoSlot = null;
  }

  undoDelete({ id }) {
    const slot = this.undoSlot;
    if (!slot || slot.id !== id || slot.serial !== (this.changeSerial || 0)) {
      this.undoSlot = null;
      throw new Error(t('This can no longer be undone.'));
    }
    for (const key of KEPT) if (key in slot.snapshot) this.data[key] = copy(slot.snapshot[key]);
    this.undoSlot = null;
    this.changed();
    return { ok: true };
  }
}

module.exports = { UndoMethods };
