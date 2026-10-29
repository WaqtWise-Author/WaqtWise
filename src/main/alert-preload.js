'use strict';

// The only bridge for the full-screen reminder page: receive what to show, say which button was pressed.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertApi', {
  onRender: (callback) => ipcRenderer.on('alert-render', (event, state) => callback(state)),
  ready: () => ipcRenderer.send('alert-ready'),
  action: (type, itemId, option) => ipcRenderer.send('alert-action', option === undefined ? { type, itemId } : { type, itemId, option }),
});
