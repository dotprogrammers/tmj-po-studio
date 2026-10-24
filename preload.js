'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('app:info'),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  importPaths: (paths) => ipcRenderer.invoke('import:paths', paths),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  preview: (rec, kind) => ipcRenderer.invoke('render:preview', rec, kind),
  generate: (payload) => ipcRenderer.invoke('pdf:generate', payload),
  single: (rec, kind) => ipcRenderer.invoke('pdf:single', rec, kind),
  openPath: (p) => ipcRenderer.invoke('shell:open', p),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } }
});
