"use strict";
// DOMEO · Подбор по корзине — рендер (десктоп).
// Логика подбора перенесена из расширения; вместо chrome.tabs/scripting — встроенный webview,
// вместо chrome.storage — api.store (JSON в userData), поиск — через api.search (главный процесс).

const SITE = "https://store.domeo.ru";
const GOOD = 160, WARN = 70;
const DICT_KEY = "dict", HIST_KEY = "history", HIST_MAX = 50;

const $ = s => document.querySelector(s);
let state = [];

const wv = $("#wv");
const progress = t => { $("#progress").textContent = t; };
const srcText = t => { $("#src").textContent = t; };

// ---------- хранилище ----------
async function getLS(key, def) { try { return await window.api.store.get(key, def); } catch (e) { return def; } }
async function setLS(key, val) { try { await window.api.store.set(key, val); } catch (e) {} }
const keyOf = (source, code) => source + "::" + code;
const idFromLink = link => (String(link).match(/(\d+)\/?$/) || [])[1] || "";

// ---------- функции, выполняемые ВНУТРИ webview ----------
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

async function pageGetShareLink() {
  for (let i = 0; i < 12; i++) {
    const el = document.querySelector(".basket-share__input");
    const v = el && (el.value || el.getAttribute("value") || el.textContent || "").trim();
    if (v && /\/basket\/share\/\?code=[A-Za-z0-9]{6,}/.test(v)) return v;
    await new Promise(r => setTimeout(r, 400));
  }
  return "";
}

// запустить функцию внутри webview
function runInPage(fn, arg) {
  const call = arg === undefined ? "(" + fn.toString() + ")()" : "(" + fn.toString() + ")(" + JSON.stringify(arg) + ")";
  return wv.executeJavaScript(call, true);
}

// навигация webview с ожиданием загрузки
function navigate(url) {
  return new Promise(resolve => {
    let done = false;
    const fin = () => { if (done) return; done = true; wv.removeEventListener("did-stop-loading", fin); resolve(); };
    wv.addEventListener("did-stop-loading", fin);
    try { wv.loadURL(url); } catch (e) { wv.src = url; }
    setTimeout(fin, 15000);
  });
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
async function search(term) { try { return await window.api.search(term); } catch (e) { return []; } }

// ---------- утилиты ----------
const qtyNum = s => { const m = String(s).match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : 1; };
const money = n => (n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
function matchStatus(score) { if (score >= GOOD) return ["good", "Совпадение"]; if (score >= WARN) return ["warn", "Проверить"]; return ["crit", "Не найдено"]; }
function statusOf(sel) { return sel ? (sel.fromDict ? ["good", "Из словаря"] : matchStatus(sel.score)) : ["crit", "Не найдено"]; }

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
      '<div class="meta"><span>' + (sel ? '<a class="link" href="' + esc(sel.link) + '" target="_blank">' + (sel.fromDict ? "из словаря" : esc(sel.brand || "карточка") + " · score " + sel.score) + "</a>" : "") + "</span>" +
      "<span>" + price + " " + chip + "</span></div>";
    list.appendChild(el);
  });
  summary();
}
const tile = (n, l) => '<div class="tile"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>";
function summary() {
  const done = state.filter(s => !s.loading);
  let good = 0, warn = 0, sum = 0;
  done.forEach(s => { const sel = s.cands[s.pick]; if (!sel) return; const [cls] = statusOf(sel); if (cls === "good") good++; else if (cls === "warn") warn++; sum += sel.price * qtyNum(s.qty); });
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
    progress("Подбор " + (i + 1) + " / " + state.length + "…");
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
  progress("Готово.");
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

// ---------- чтение корзины из окна ----------
async function readActive() {
  progress("Читаю корзину из окна…");
  let res;
  try { res = await runInPage(pageExtract); }
  catch (e) { progress("Не удалось прочитать окно: " + (e && e.message || e)); return; }
  if (!res || !res.items.length) { srcText("—"); progress("В окне корзина не найдена. Откройте корзину Петрович/ВИ/Lemana или вставьте список вручную."); return; }
  srcText("Источник: " + res.source + " · " + res.items.length + " поз.");
  await matchAll(res.items, res.source);
}

// ---------- сборка корзины в DOMEO ----------
async function assemble() {
  const items = [];
  for (const s of state) {
    const c = s.cands[s.pick]; if (!c) continue;
    let path, id;
    try { const u = new URL(c.link); path = u.pathname; id = idFromLink(u.pathname); } catch (e) { continue; }
    if (id) items.push({ path, id, qty: qtyNum(s.qty) });
  }
  if (!items.length) { progress("Нет подобранных товаров."); return; }
  $("#cart").disabled = true;
  progress("Открываю store.domeo.ru…");
  await navigate(SITE + "/");
  progress("Добавляю " + items.length + " товаров…");
  let added = 0;
  try { added = (await runInPage(pageAddToCart, items)) || 0; }
  catch (e) { progress("Ошибка добавления: " + (e && e.message || e)); $("#cart").disabled = false; return; }
  const saved = await saveMatches();
  await logHistory();
  progress("Открываю корзину…");
  await navigate(SITE + "/basket/");
  let link = "";
  try { link = (await runInPage(pageGetShareLink)) || ""; } catch (e) {}
  showCartLink(link);
  progress("Добавлено " + added + " из " + items.length + ". В словарь: " + saved + ".");
  $("#cart").disabled = false;
}

function showCartLink(link) {
  const el = $("#cartlink");
  if (!link) { el.hidden = true; return; }
  el.innerHTML = "<div>Ссылка на собранную корзину:</div><div class=\"u\" id=\"cl\">" + esc(link) + "</div>" +
    "<div class=\"r\"><button id=\"clcopy\">Скопировать ссылку</button><a class=\"link\" href=\"" + esc(link) + "\" target=\"_blank\">Открыть ↗</a></div>";
  el.hidden = false;
  $("#clcopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link); } catch (e) {}
    $("#clcopy").textContent = "Скопировано ✓";
  });
}

// ---------- webview: навигация ----------
$("#toggleSide").addEventListener("click", () => document.body.classList.toggle("side-collapsed"));
wv.addEventListener("dom-ready", () => { try { wv.setZoomFactor(1); } catch (e) {} });
wv.addEventListener("did-navigate", e => { $("#addr").textContent = e.url; });
wv.addEventListener("did-navigate-in-page", e => { $("#addr").textContent = e.url; });
$("#back").addEventListener("click", () => { if (wv.canGoBack()) wv.goBack(); });
$("#fwd").addEventListener("click", () => { if (wv.canGoForward()) wv.goForward(); });
$("#reload").addEventListener("click", () => wv.reload());
$("#go").addEventListener("click", () => {
  let u = $("#url").value.trim(); if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  navigate(u);
});
$("#url").addEventListener("keydown", e => { if (e.key === "Enter") $("#go").click(); });
document.querySelectorAll(".chipbtn").forEach(b => b.addEventListener("click", () => navigate(b.dataset.url)));

// ---------- события управления ----------
$("#read").addEventListener("click", readActive);
$("#run").addEventListener("click", () => {
  const pos = parseText($("#input").value);
  if (!pos.length) { progress("Поле пустое."); return; }
  srcText("Из поля ввода · " + pos.length + " поз.");
  matchAll(pos, "Ручной ввод");
});
$("#list").addEventListener("change", e => { const sel = e.target.closest("select"); if (!sel) return; state[+sel.dataset.i].pick = +sel.value; render(); });
$("#cart").addEventListener("click", assemble);
$("#remember").addEventListener("click", async () => { const n = await saveMatches(); progress("Запомнено соответствий: " + n + "."); });
$("#hist").addEventListener("click", showHistory);

// ---------- версия и обновления ----------
(async () => { try { $("#ver").textContent = "v" + (await window.api.version()); } catch (e) {} })();

const updbar = $("#updbar");
function showUpd(html, withInstall) {
  updbar.innerHTML = html + (withInstall ? '<button id="doInstall" class="ghost">Перезапустить и обновить</button>' : "");
  updbar.hidden = false;
  if (withInstall) $("#doInstall").addEventListener("click", () => window.api.installUpdate());
}
window.api.onUpdateStatus(m => {
  if (!m) return;
  if (m.state === "checking") showUpd("Проверяю обновления…", false);
  else if (m.state === "available") showUpd("Доступна версия " + (m.version || "") + ", скачиваю…", false);
  else if (m.state === "downloading") showUpd("Скачиваю обновление… " + (m.percent || 0) + "%", false);
  else if (m.state === "downloaded") showUpd("Обновление " + (m.version || "") + " готово. ", true);
  else if (m.state === "none") { showUpd("У вас последняя версия.", false); setTimeout(() => updbar.hidden = true, 3000); }
  else if (m.state === "dev") { showUpd("Режим разработки — обновления доступны только в установленной версии.", false); setTimeout(() => updbar.hidden = true, 3000); }
  else if (m.state === "error") { showUpd("Не удалось проверить обновления.", false); setTimeout(() => updbar.hidden = true, 4000); }
});
$("#btnUpd").addEventListener("click", () => window.api.checkUpdates());
