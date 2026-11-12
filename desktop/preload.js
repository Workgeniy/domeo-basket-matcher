"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  store: {
    get: (key, def) => ipcRenderer.invoke("store:get", key, def),
    set: (key, val) => ipcRenderer.invoke("store:set", key, val)
  },
  search: (term) => ipcRenderer.invoke("search", term),
  version: () => ipcRenderer.invoke("app:version"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (cb) => ipcRenderer.on("update-status", (e, payload) => cb(payload))
});
