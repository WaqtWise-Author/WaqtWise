'use strict';

// The only bridge between the window and the rest of the app.
// The window can call a fixed list of planner actions and listen for a few events; nothing else.

const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['data-changed', 'missed', 'open-task', 'show-daily', 'show-routines', 'pause-changed', 'show-pomodoro', 'pomodoro-changed'];

contextBridge.exposeInMainWorld('api', {
  call: (method, ...args) => ipcRenderer.invoke('svc', method, args),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  testNotification: () => ipcRenderer.invoke('test-notification'),
  previewAlert: () => ipcRenderer.invoke('preview-alert'),
  // The pictures behind the full-screen alert (Settings): list, add (a file dialog opens in the main process), remove.
  getAlertImages: () => ipcRenderer.invoke('alert-images'),
  addAlertImages: () => ipcRenderer.invoke('add-alert-images'),
  removeAlertImage: (id) => ipcRenderer.invoke('remove-alert-image', String(id)),
  getAlertPreviewPicture: () => ipcRenderer.invoke('alert-preview-picture'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  getPauseState: () => ipcRenderer.invoke('pause-state'),
  resumePause: (kind) => ipcRenderer.invoke('resume-pause', kind),
  on: (channel, callback) => {
    if (!EVENTS.includes(channel)) return;
    ipcRenderer.on(channel, (event, payload) => callback(payload));
  },
  ready: () => ipcRenderer.send('renderer-ready'),
});
