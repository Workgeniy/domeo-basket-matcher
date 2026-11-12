"use strict";
// DOMEO · Подбор по корзине — десктоп (Electron).
// Главный процесс: окно, встроенный браузер (webview), подбор через Diginetica,
// хранилище словаря/истории, автообновление через GitHub Releases.

const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

let autoUpdater = null;
try { autoUpdater = require("electron-updater").autoUpdater; } catch (e) { autoUpdater = null; }

const API = "https://autocomplete.diginetica.net/autocomplete";
const APIKEY = "R14U9ZT7MH";
const SITE = "https://store.domeo.ru";
const TOP = 4;

// ---------- хранилище (JSON в userData) ----------
let store = {};
function storePath() { return path.join(app.getPath("userData"), "data.json"); }
function loadStore() {
  try { store = JSON.parse(fs.readFileSync(storePath(), "utf8")) || {}; }
  catch (e) { store = {}; }
}
function saveStore() {
  try { fs.writeFileSync(storePath(), JSON.stringify(store), "utf8"); } catch (e) {}
}

// ---------- окно ----------
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    title: "DOMEO · Подбор по корзине",
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // внешние ссылки (Открыть ↗) — в системном браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
}

// ---------- IPC: хранилище ----------
ipcMain.handle("store:get", (e, key, def) => (key in store ? store[key] : def));
ipcMain.handle("store:set", (e, key, val) => { store[key] = val; saveStore(); return true; });

// ---------- IPC: версия ----------
ipcMain.handle("app:version", () => app.getVersion());

// ---------- IPC: подбор (Diginetica) ----------
ipcMain.handle("search", async (e, term) => {
  if (!term) return [];
  const u = API + "?apiKey=" + APIKEY + "&st=" + encodeURIComponent(term);
  try {
    const r = await fetch(u, { headers: { "Accept": "application/json" } });
    const j = await r.json();
    return (j.products || []).slice(0, TOP).map(p => ({
      name: p.name,
      brand: p.brand || "",
      price: parseFloat(p.price) || 0,
      score: Math.round(p.score || 0),
      avail: !!p.available,
      link: SITE + (p.link_url || ""),
      fromDict: false
    }));
  } catch (err) { return []; }
});

// ---------- IPC: обновления ----------
function sendUpd(payload) { if (win && !win.isDestroyed()) win.webContents.send("update-status", payload); }

ipcMain.handle("updates:check", async () => {
  if (!autoUpdater || !app.isPackaged) { sendUpd({ state: "dev" }); return { state: "dev" }; }
  try { await autoUpdater.checkForUpdates(); return { state: "checking" }; }
  catch (e) { sendUpd({ state: "error", message: String(e && e.message || e) }); return { state: "error" }; }
});
ipcMain.handle("updates:install", () => { if (autoUpdater) autoUpdater.quitAndInstall(); });

function wireUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.on("checking-for-update", () => sendUpd({ state: "checking" }));
  autoUpdater.on("update-available", (info) => sendUpd({ state: "available", version: info && info.version }));
  autoUpdater.on("update-not-available", () => sendUpd({ state: "none" }));
  autoUpdater.on("download-progress", (p) => sendUpd({ state: "downloading", percent: Math.round(p && p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => sendUpd({ state: "downloaded", version: info && info.version }));
  autoUpdater.on("error", (err) => sendUpd({ state: "error", message: String(err && err.message || err) }));
}

// ---------- запуск ----------
app.whenReady().then(() => {
  loadStore();
  wireUpdater();
  createWindow();

  // проверка обновлений на старте (только в установленной версии)
  if (autoUpdater && app.isPackaged) {
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch (e) {} }, 4000);
  }

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
