'use strict';

// The only bridge for the full-screen reminder page: receive what to show, say which button was pressed.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertApi', {
  onRender: (callback) => ipcRenderer.on('alert-render', (event, state) => callback(state)),
  ready: () => ipcRenderer.send('alert-ready'),
  // The bytes of one of the person's own sounds (1.7.0); null when it is not there.
  getSound: (id) => ipcRenderer.invoke('alert-sound', String(id)),
  action: (type, itemId, option) => ipcRenderer.send('alert-action', option === undefined ? { type, itemId } : { type, itemId, option }),
});
