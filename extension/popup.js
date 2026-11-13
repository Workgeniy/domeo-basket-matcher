"use strict";
// Расширение DOMEO · Подбор по корзине.
// Читает корзину поставщика → подбирает в store.domeo.ru (Diginetica) → собирает корзину (ADD2BASKET).
// Словарь соответствий и история — в chrome.storage.local (прототип; в проде — таблицы на .NET-бэкенде).

const API = "https://autocomplete.diginetica.net/autocomplete";
const APIKEY = "R14U9ZT7MH";
const SITE = "https://store.domeo.ru";
const TOP = 4, GOOD = 160, WARN = 70;
const DICT_KEY = "dict", HIST_KEY = "history", HIST_MAX = 50;

const $ = s => document.querySelector(s);
let state = [];

// ---------- хранилище ----------
async function getLS(key, def) { try { const o = await chrome.storage.local.get(key); return o[key] ?? def; } catch (e) { return def; } }
async function setLS(key, val) { try { await chrome.storage.local.set({ [key]: val }); } catch (e) {} }
const keyOf = (source, code) => source + "::" + code;
const idFromLink = link => (String(link).match(/(\d+)\/?$/) || [])[1] || "";

// ---------- функции, выполняемые В СТРАНИЦЕ ----------
function pageExtract() {
  const host = location.host, out = { source: "", items: [] };
  const txt = el => el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  const products = new URLSearchParams(location.search).get("products");
  if (products) {
    out.source = "Lemana";
    out.items = products.split(",").map(p => { const k = p.split(":"); return k.length === 2 ? { name: "", code: k[0].trim(), qty: k[1].trim() } : null; }).filter(Boolean);
    return out;
  }
  if (/petrovich\.ru$/.test(host) && document.querySelector('[data-test="estimate-products"]')) {
    out.source = "Петрович";
    document.querySelectorAll('[data-test="estimate-products"]').forEach(c => {
      out.items.push({ name: txt(c.querySelector('[data-test="product-title"]')), qty: txt(c.querySelector(".qty-wrapper")), code: txt(c.querySelector('[data-test="product-code"]')) });
    });
    return out;
  }
  const vi = document.querySelectorAll('[data-behavior="cart-product-name"]');
  if (/vseinstrumenti\.ru$/.test(host) && vi.length) {
    out.source = "ВсеИнструменты";
    vi.forEach(n => {
      let item = n;
      while (item && !(item.querySelector && item.querySelector('[data-qa="cart-product-price-total"]'))) item = item.parentElement;
      item = item || n.parentElement;
      out.items.push({ name: txt(n), qty: txt(item.querySelector('[class*="badge"]')), code: txt(item.querySelector('[data-qa="product-code"]')).replace(/^Код:\s*/i, "") });
    });
    return out;
  }
  return out;
}

async function pageAddToCart(items) {
  let ok = 0;
  for (const it of items) {
    try { const r = await fetch(it.path + "?action=ADD2BASKET&id=" + it.id + "&quantity=" + it.qty, { credentials: "include" }); if (r.ok) ok++; } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  return ok;
}

// получить «ссылку на данную корзину» со страницы /basket/
async function pageGetShareLink() {
  for (let i = 0; i < 12; i++) {
    const el = document.querySelector(".basket-share__input");
    const v = el && (el.value || el.getAttribute("value") || el.textContent || "").trim();
    if (v && /\/basket\/share\/\?code=[A-Za-z0-9]{6,}/.test(v)) return v;
    await new Promise(r => setTimeout(r, 400));
  }
  return "";
}

// ---------- разбор ручного ввода ----------
const QTY = /(\d+(?:[.,]\d+)?)\s*(штук[аи]?|шт\.?|мешок|мешк[аи]|мешков|меш\.?|ведро|ведра|вёдер|ведер|уп(?:ак)?|компл(?:ект)?|набор(?:ов|а)?|рулон(?:ов|а)?|м2|м3|м²|м³|м|л|кг|т)?\s*$/i;
const DIM = /^[\d\s.,xх×*/()\-]+$/i, CYR = /[а-яА-ЯёЁ]{3,}/;
const SKIP = /^(LEMANA|PETROVICH|VSEINSTRUMENTI|PAGE|НАИМЕНОВАНИЕ)\b|^https?:\/\//i;
function parseText(text) {
  const out = []; let last = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[\u{1F000}-\u{1FAFF}☀-➿️‍]/gu, "").trim();
    if (!line || SKIP.test(line)) continue;
    if (line.includes("\t")) { const c = line.split("\t"); if (!(c[0] || "").trim()) continue; out.push({ name: c[0].trim(), qty: (c[1] || "").trim(), code: (c[2] || "").trim() }); continue; }
    let s = line.replace(/^\s*\d{1,3}[.)]?\s+(?=\D)/, ""), name = s, qty = "";
    const m = s.match(QTY);
    if (m && m.index > 0) { qty = (m[1] + " " + (m[2] || "")).trim(); name = s.slice(0, m.index).trim(); }
    if (!name) name = s;
    if (DIM.test(name)) { if (last) name = last + " " + name; }
    else { const w = name.match(CYR); if (w) last = w[0]; }
    out.push({ name, qty, code: "" });
  }
  return out;
}

// ---------- подбор ----------
async function search(term) {
  if (!term) return [];
  const u = API + "?apiKey=" + APIKEY + "&st=" + encodeURIComponent(term);
  const j = await (await fetch(u)).json();
  return (j.products || []).slice(0, TOP).map(p => ({
    name: p.name, brand: p.brand || "", price: parseFloat(p.price) || 0,
    score: Math.round(p.score || 0), avail: !!p.available, link: SITE + (p.link_url || ""), fromDict: false
  }));
}

// ---------- утилиты ----------
const qtyNum = s => { const m = String(s).match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : 1; };
const money = n => (n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
function status(score) { if (score >= GOOD) return ["good", "Совпадение"]; if (score >= WARN) return ["warn", "Проверить"]; return ["crit", "Не найдено"]; }
function statusOf(sel) { return sel ? (sel.fromDict ? ["good", "Из словаря"] : status(sel.score)) : ["crit", "Не найдено"]; }

// ---------- рендер ----------
function render() {
  const list = $("#list"); list.innerHTML = "";
  state.forEach((it, i) => {
    const sel = it.cands[it.pick];
    const [cls, label] = statusOf(sel);
    const chip = it.loading ? '<span class="chip load">…</span>' : '<span class="chip ' + cls + '">' + label + "</span>";
    const price = sel ? '<span class="price">' + money(sel.price) + " ₽</span>" : '<span class="hint">—</span>';
    let body;
    if (it.loading) body = '<span class="chip load">подбираю…</span>';
    else if (!it.cands.length) body = '<span class="hint">нет кандидатов' + (it.name ? "" : " (нет названия)") + "</span>";
    else {
      const opts = it.cands.map((c, j) => '<option value="' + j + '"' + (j === it.pick ? " selected" : "") + ">" + (c.fromDict ? "★ " : "") + esc(trim(c.name, 60)) + " — " + money(c.price) + " ₽</option>").join("");
      body = '<select data-i="' + i + '">' + opts + "</select>";
    }
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML =
      '<div class="pos">' + esc(it.name || "(без названия)") + ' <span class="q">' + esc(it.qty || "") + "</span>" +
      (it.code ? '<span class="dictbadge">' + esc(it.source || "") + " " + esc(it.code) + "</span>" : "") + "</div>" +
      body +
      '<div class="meta"><span>' + (sel ? '<a class="link" href="' + sel.link + '" target="_blank">' + (sel.fromDict ? "из словаря" : esc(sel.brand || "карточка") + " · score " + sel.score) + "</a>" : "") + "</span>" +
      "<span>" + price + " " + chip + "</span></div>";
    list.appendChild(el);
  });
  summary();
}
const tile = (n, l) => '<div class="tile"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>";
function summary() {
  const done = state.filter(s => !s.loading);
  let good = 0, warn = 0, crit = 0, sum = 0;
  done.forEach(s => { const sel = s.cands[s.pick]; if (!sel) { crit++; return; } const [cls] = statusOf(sel); if (cls === "good") good++; else if (cls === "warn") warn++; else crit++; sum += sel.price * qtyNum(s.qty); });
  $("#summary").hidden = state.length === 0;
  $("#summary").innerHTML = tile(state.length, "позиций") + tile(good, "совпад.") + tile(warn, "проверить") + tile(money(sum) + " ₽", "сумма");
  $("#cartrow").hidden = state.length === 0;
}

// ---------- подбор по списку ----------
async function matchAll(positions, source) {
  const dict = await getLS(DICT_KEY, {});
  state = positions.map(p => ({ name: p.name, qty: p.qty, code: p.code || "", source, cands: [], pick: 0, loading: true }));
  $("#histpanel").hidden = true;
  $("#cartlink").hidden = true;
  render();
  for (let i = 0; i < state.length; i++) {
    $("#progress").textContent = "Подбор " + (i + 1) + " / " + state.length + "…";
    let cands = [];
    try { cands = state[i].name ? await search(state[i].name) : []; } catch (e) { cands = []; }
    const hit = state[i].code ? dict[keyOf(source, state[i].code)] : null;
    if (hit) {
      const idx = cands.findIndex(c => idFromLink(c.link) === hit.id);
      if (idx >= 0) { cands[idx].fromDict = true; cands.unshift(cands.splice(idx, 1)[0]); }
      else cands.unshift({ name: hit.name, brand: "", price: 0, score: 99999, avail: true, link: hit.link, fromDict: true });
    }
    state[i].cands = cands;
    state[i].loading = false;
    if (cands[0] && cands[0].fromDict) state[i].pick = 0;
    else { const av = cands.findIndex(c => c.avail); state[i].pick = av >= 0 ? av : 0; }
    render();
  }
  $("#progress").textContent = "Готово.";
}

// ---------- словарь и история ----------
async function saveMatches() {
  const dict = await getLS(DICT_KEY, {});
  let n = 0;
  for (const s of state) {
    const c = s.cands[s.pick];
    if (!c || !s.code) continue;
    const id = idFromLink(c.link);
    if (!id) continue;
    dict[keyOf(s.source, s.code)] = { id, name: c.name, link: c.link, at: Date.now() };
    n++;
  }
  await setLS(DICT_KEY, dict);
  return n;
}
async function logHistory() {
  const hist = await getLS(HIST_KEY, []);
  const items = state.map(s => { const c = s.cands[s.pick]; return { name: s.name, qty: s.qty, code: s.code || "", domeo: c ? c.name : "", id: c ? idFromLink(c.link) : "", price: c ? c.price : 0, status: statusOf(c)[1] }; });
  const total = items.reduce((a, it) => a + (it.price || 0) * qtyNum(it.qty || 1), 0);
  hist.unshift({ ts: Date.now(), source: (state[0] && state[0].source) || "", count: state.length, total, items });
  await setLS(HIST_KEY, hist.slice(0, HIST_MAX));
}
async function showHistory() {
  const panel = $("#histpanel");
  if (!panel.hidden) { panel.hidden = true; return; }
  const hist = await getLS(HIST_KEY, []);
  const dict = await getLS(DICT_KEY, {});
  if (!hist.length) { panel.innerHTML = '<div class="hint">История пуста. Словарь: ' + Object.keys(dict).length + " соответствий.</div>"; panel.hidden = false; return; }
  panel.innerHTML = '<div class="hint" style="margin-bottom:6px">Словарь: ' + Object.keys(dict).length + " соответствий · История: " + hist.length + "</div>" +
    hist.slice(0, 20).map(h => {
      const d = new Date(h.ts).toLocaleString("ru-RU");
      return '<div class="histitem"><div class="h"><span>' + esc(h.source) + "</span><span>" + d + "</span></div>" +
        h.count + " поз. · " + money(h.total) + " ₽</div>";
    }).join("");
  panel.hidden = false;
}

// ---------- чтение активной вкладки ----------
async function readActive() {
  $("#progress").textContent = "Читаю корзину…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let res;
  try { const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageExtract }); res = r[0].result; }
  catch (e) { $("#progress").textContent = "Не удалось прочитать страницу: " + e.message; return; }
  if (!res || !res.items.length) { $("#src").textContent = "—"; $("#progress").textContent = "На этой вкладке корзина не найдена. Откройте корзину Петрович/ВИ/Lemana или вставьте список вручную."; return; }
  $("#src").textContent = "Источник: " + res.source + " · " + res.items.length + " поз.";
  await matchAll(res.items, res.source);
}

// ---------- сборка корзины ----------
async function assemble() {
  const items = [];
  for (const s of state) {
    const c = s.cands[s.pick]; if (!c) continue;
    let path, id;
    try { const u = new URL(c.link); path = u.pathname; id = idFromLink(u.pathname); } catch (e) { continue; }
    if (id) items.push({ path, id, qty: qtyNum(s.qty) });
  }
  if (!items.length) { $("#progress").textContent = "Нет подобранных товаров."; return; }
  $("#cart").disabled = true;
  $("#progress").textContent = "Открываю store.domeo.ru…";
  let [tab] = await chrome.tabs.query({ url: "https://store.domeo.ru/*" });
  if (!tab) tab = await waitLoaded(await chrome.tabs.create({ url: SITE + "/", active: false }));
  $("#progress").textContent = "Добавляю " + items.length + " товаров…";
  let added = 0;
  try { const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageAddToCart, args: [items] }); added = r[0].result; }
  catch (e) { $("#progress").textContent = "Ошибка добавления: " + e.message; $("#cart").disabled = false; return; }
  const saved = await saveMatches();
  await logHistory();
  await chrome.tabs.update(tab.id, { url: SITE + "/basket/", active: true });
  await waitComplete(tab.id);
  let link = "";
  try { const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageGetShareLink }); link = r[0].result || ""; } catch (e) {}
  showCartLink(link);
  $("#progress").textContent = "Добавлено " + added + " из " + items.length + ". В словарь: " + saved + ".";
  $("#cart").disabled = false;
}

function waitComplete(tabId) {
  return new Promise(resolve => {
    function onUpd(id, info) { if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(onUpd); resolve(); } }
    chrome.tabs.onUpdated.addListener(onUpd);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); resolve(); }, 9000);
  });
}

function showCartLink(link) {
  const el = $("#cartlink");
  if (!link) { el.hidden = true; return; }
  el.innerHTML = "<div>Ссылка на собранную корзину:</div><div class=\"u\" id=\"cl\">" + esc(link) + "</div>" +
    "<div class=\"r\"><button id=\"clcopy\">Скопировать ссылку</button><a class=\"link\" href=\"" + esc(link) + "\" target=\"_blank\">Открыть ↗</a></div>";
  el.hidden = false;
  $("#clcopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link); }
    catch (e) { const r = document.createRange(); r.selectNode($("#cl")); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand("copy"); }
    $("#clcopy").textContent = "Скопировано ✓";
  });
}

function waitLoaded(tab) {
  return new Promise(resolve => {
    function onUpd(id, info) { if (id === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(onUpd); resolve(tab); } }
    chrome.tabs.onUpdated.addListener(onUpd);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); resolve(tab); }, 8000);
  });
}

// ---------- открыть корзину по ссылке и прочитать ----------
async function openLinkAndRead() {
  const url = ($("#link").value || "").trim();
  if (!/^https?:\/\//i.test(url)) { $("#progress").textContent = "Вставьте ссылку на корзину (начинается с http…)."; return; }
  $("#progress").textContent = "Открываю корзину по ссылке…";
  let tab;
  try { tab = await chrome.tabs.create({ url, active: false }); }
  catch (e) { $("#progress").textContent = "Не удалось открыть ссылку: " + e.message; return; }
  await waitComplete(tab.id);
  await new Promise(r => setTimeout(r, 1000)); // дать корзине дорисоваться
  let res;
  try { const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageExtract }); res = r[0].result; }
  catch (e) { $("#progress").textContent = "Не удалось прочитать страницу: " + e.message; return; }
  if (!res || !res.items.length) {
    $("#progress").textContent = "На странице корзина не найдена. Проверьте, что вы вошли у поставщика и по ссылке открывается именно корзина.";
    return; // вкладку оставляем открытой, чтобы было видно, что пришло
  }
  try { await chrome.tabs.remove(tab.id); } catch (e) {} // прочитали — временную вкладку закрываем
  $("#src").textContent = "Источник: " + res.source + " · " + res.items.length + " поз.";
  await matchAll(res.items, res.source);
}

// ---------- события ----------
$("#openlink").addEventListener("click", openLinkAndRead);
$("#link").addEventListener("keydown", e => { if (e.key === "Enter") openLinkAndRead(); });
$("#read").addEventListener("click", readActive);
$("#run").addEventListener("click", () => {
  const pos = parseText($("#input").value);
  if (!pos.length) { $("#progress").textContent = "Поле пустое."; return; }
  $("#src").textContent = "Из поля ввода · " + pos.length + " поз.";
  matchAll(pos, "Ручной ввод");
});
$("#list").addEventListener("change", e => { const sel = e.target.closest("select"); if (!sel) return; state[+sel.dataset.i].pick = +sel.value; render(); });
$("#cart").addEventListener("click", assemble);
$("#remember").addEventListener("click", async () => { const n = await saveMatches(); $("#progress").textContent = "Запомнено соответствий: " + n + "."; });
$("#hist").addEventListener("click", showHistory);

// открыть интерфейс в отдельном окне (не закрывается при клике на страницу)
const _openwin = document.querySelector("#openwin");
if (_openwin) _openwin.addEventListener("click", () => {
  try { chrome.windows.create({ url: chrome.runtime.getURL("app.html"), type: "normal", width: 1120, height: 840 }); window.close(); }
  catch (e) {}
});

// --- проверка обновлений ---
const REPO_VERSION_URL = "https://raw.githubusercontent.com/Workgeniy/domeo-basket-matcher/main/VERSION";
function cmpVer(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return 1; if ((pa[i] || 0) < (pb[i] || 0)) return -1; }
  return 0;
}
(async () => {
  try {
    const cur = chrome.runtime.getManifest().version;
    const latest = (await (await fetch(REPO_VERSION_URL, { cache: "no-store" })).text()).trim();
    if (/^\d+\.\d+\.\d+$/.test(latest) && cmpVer(latest, cur) > 0) {
      const b = $("#update");
      b.textContent = "Доступна версия " + latest + " (у вас " + cur + "). Запустите «Обновить.bat» из папки, затем нажмите «Обновить» на карточке расширения.";
      b.hidden = false;
    }
  } catch (e) {}
})();
