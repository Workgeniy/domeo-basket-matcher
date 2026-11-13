"use strict";
// DOMEO · Подбор по корзине — десктоп (Electron).
// Главный процесс: окно, встроенный браузер (webview), подбор через Diginetica,
// хранилище словаря/истории, автообновление через GitHub Releases.

const { app, BrowserWindow, ipcMain, shell, Menu, session } = require("electron");
const path = require("path");
const fs = require("fs");

let autoUpdater = null;
try { autoUpdater = require("electron-updater").autoUpdater; } catch (e) { autoUpdater = null; }

const API = "https://autocomplete.diginetica.net/autocomplete";
const APIKEY = "R14U9ZT7MH";
const SITE = "https://store.domeo.ru";
const TOP = 4;

// Обычная подпись Chrome — чтобы встроенный браузер не воспринимался как автоматизация
// (по умолчанию в UA есть "Electron" и имя приложения, что ловит анти-бот поставщиков).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
app.userAgentFallback = UA;

// Запуск из кода (dev) — отдельный профиль, чтобы не конфликтовать с установленной версией
// (иначе обе лезут в один кэш и получаем "Unable to move the cache / access denied").
if (!app.isPackaged) {
  try { app.setPath("userData", app.getPath("userData") + "-dev"); } catch (e) {}
}

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
    title: app.isPackaged ? "DOMEO · Подбор по корзине" : "DOMEO · Подбор по корзине (dev)",
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
  win.maximize();
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

// ---------- IPC: открыть ссылку в системном браузере ----------
ipcMain.handle("shell:open", (e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });

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

  // Встроенному браузеру (partition persist:domeo) — обычный Chrome-UA
  // и правдоподобный заголовок Accept-Language, чтобы меньше ловить анти-бот.
  try {
    const ses = session.fromPartition("persist:domeo");
    ses.setUserAgent(UA);
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      details.requestHeaders["Accept-Language"] = "ru-RU,ru;q=0.9,en;q=0.8";
      cb({ requestHeaders: details.requestHeaders });
    });
  } catch (e) {}

  wireUpdater();
  createWindow();

  // проверка обновлений на старте (только в установленной версии)
  if (autoUpdater && app.isPackaged) {
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch (e) {} }, 4000);
  }

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
