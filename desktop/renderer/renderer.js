"use strict";
// DOMEO · Подбор по корзине — рендер (десктоп, светлая тема как в веб-версии).
// Чтение корзины — закладкой в обычном браузере (вставляется в поле); сборка корзины
// DOMEO и ссылка — через встроенный браузер (webview). Поиск — через главный процесс.

const SITE = "https://store.domeo.ru";
const GOOD = 160, WARN = 70;
const DICT_KEY = "dict", HIST_KEY = "history", HIST_MAX = 50;

const SAMPLE = [
  "Звукоизоляция для канализационных труб StP NoiseBlock Pipe 110х6,7х3000 мм\t1 упак.\t602357",
  "Соединитель одноуровневый краб Knauf 60х27 0,9 мм\t20 шт.\t150807",
  "Коробка установочная Systeme Electric для бетона d68х61 мм IP30\t15 шт.\t128016",
  "Лист алюминиевый Квинтет 1,5х600х1200 мм рифленый\t2 л.\t132152",
  "Кронштейн сантехнический 110 мм пластик для крепления фановых труб\t6 шт.\t503445",
  "пена монтажная\t3 шт\t"
].join("\n");

const $ = s => document.querySelector(s);
let state = [];

const wv = $("#wv");
const progress = t => { const el = $("#progress2") || $("#progress"); if (el) el.textContent = t; };

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

function runInPage(fn, arg) {
  const call = arg === undefined ? "(" + fn.toString() + ")()" : "(" + fn.toString() + ")(" + JSON.stringify(arg) + ")";
  return wv.executeJavaScript(call, true);
}

function navigate(url) {
  return new Promise(resolve => {
    let done = false;
    const fin = () => { if (done) return; done = true; wv.removeEventListener("did-stop-loading", fin); resolve(); };
    wv.addEventListener("did-stop-loading", fin);
    try { wv.loadURL(url); } catch (e) { wv.src = url; }
    setTimeout(fin, 15000);
  });
}

// ---------- разбор ввода ----------
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
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const safeLink = u => /^https:\/\/store\.domeo\.ru\//.test(u) ? u : "";
function matchStatus(score) { if (score >= GOOD) return ["good", "Совпадение"]; if (score >= WARN) return ["warn", "Проверить"]; return ["crit", "Не найдено"]; }
function statusOf(sel) { return sel ? (sel.fromDict ? ["good", "Из словаря"] : matchStatus(sel.score)) : ["crit", "Не найдено"]; }

// ---------- рендер таблицы ----------
function render() {
  const rows = $("#rows"); rows.innerHTML = "";
  state.forEach((it, i) => {
    const sel = it.cands[it.pick];
    const candCell = it.loading ? '<span class="chip load">подбираю…</span>'
      : it.cands.length ? candSelect(it, i) : '<span class="hint">нет кандидатов' + (it.name ? "" : " (нет названия)") + "</span>";
    const price = sel ? '<span class="price">' + money(sel.price) + " ₽</span>" : "—";
    const [cls, label] = statusOf(sel);
    const chip = it.loading ? '<span class="chip load">…</span>' : '<span class="chip ' + cls + '">' + label + "</span>";
    const meta = esc(it.qty || "") + (it.code ? " · " + esc(it.source || "") + " " + esc(it.code) : "");
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><div class="pos-name">' + esc(it.name || "(без названия)") + '</div><div class="pos-meta">' + meta + "</div></td>" +
      "<td>" + candCell + "</td><td>" + price + "</td><td>" + chip + "</td>";
    rows.appendChild(tr);
  });
  summary();
}
function candSelect(it, i) {
  const opts = it.cands.map((c, j) =>
    '<option value="' + j + '"' + (j === it.pick ? " selected" : "") + ">" +
    (c.fromDict ? "★ " : "") + esc(trim(c.name, 70)) + " — " + money(c.price) + " ₽</option>").join("");
  const c = it.cands[it.pick];
  const href = safeLink(c.link);
  const linkHtml = c.fromDict ? '<span class="link">из словаря</span>'
    : (href ? '<a class="link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(c.brand || "открыть карточку") + " ↗</a>"
            : '<span class="link">' + esc(c.brand || "") + "</span>");
  const sc = c.fromDict ? "" : ' <span class="score">score ' + (c.score | 0) + (c.avail ? "" : " · под заказ") + "</span>";
  return '<div class="cand"><select class="cand-pick" data-i="' + i + '">' + opts + "</select><div>" + linkHtml + sc + "</div></div>";
}
const tile = (n, l) => '<div class="tile"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + "</div></div>";
function summary() {
  const done = state.filter(s => !s.loading);
  let good = 0, warn = 0, crit = 0, sum = 0;
  done.forEach(s => { const sel = s.cands[s.pick]; if (!sel) { crit++; return; } const [cls] = statusOf(sel); if (cls === "good") good++; else if (cls === "warn") warn++; else crit++; sum += sel.price * qtyNum(s.qty); });
  $("#summary").innerHTML = tile(state.length, "позиций") + tile(good, "совпадений") + tile(warn, "на проверку") + tile(crit, "не найдено") + tile(money(sum) + " ₽", "сумма подбора");
}

function showResults(on) {
  $("#summary").hidden = !on;
  $("#result").hidden = !on;
  $("#actionrow").hidden = !on;
}
function showBrowser(on) { $("#browserwrap").classList.toggle("collapsed", !on); if (on) setTimeout(fitWebview, 50); }

// растянуть встроенный браузер на всю оставшуюю высоту окна
function fitWebview() {
  try {
    const top = wv.getBoundingClientRect().top;
    const h = Math.max(320, Math.floor(window.innerHeight - top - 14));
    wv.style.height = h + "px";
    wv.executeJavaScript("window.dispatchEvent(new Event('resize'))", false).catch(() => {});
  } catch (e) {}
}

// подтолкнуть «ленивую» загрузку контента (скролл + события), чтобы не оставалось белое поле
function kickLazy() {
  const code = "(function(){try{var h=document.body?document.body.scrollHeight:0;" +
    "window.scrollTo(0,Math.min(1200,h));window.dispatchEvent(new Event('scroll'));" +
    "window.dispatchEvent(new Event('resize'));" +
    "setTimeout(function(){window.scrollTo(0,0);},250);}catch(e){}})()";
  try { wv.executeJavaScript(code, false).catch(() => {}); } catch (e) {}
}

// ---------- подбор по списку ----------
async function matchAll(positions, source) {
  const dict = await getLS(DICT_KEY, {});
  state = positions.map(p => ({ name: p.name, qty: p.qty, code: p.code || "", source, cands: [], pick: 0, loading: true }));
  $("#histpanel").hidden = true;
  $("#cartlink").hidden = true;
  showResults(true);
  $("#run").disabled = true;
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
  $("#run").disabled = false;
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

// ---------- чтение корзины из встроенного окна ----------
async function readActive() {
  showBrowser(true);
  progress("Читаю корзину из окна…");
  let res;
  try { res = await runInPage(pageExtract); }
  catch (e) { progress("Не удалось прочитать окно: " + (e && e.message || e)); return; }
  if (!res || !res.items.length) { progress("В окне корзина не найдена. Откройте корзину поставщика в окне ниже или вставьте список из закладки."); return; }
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
  showBrowser(true);
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
    "<div class=\"r\"><button class=\"primary\" id=\"clcopy\">Скопировать ссылку</button>" +
    "<a class=\"link\" href=\"" + esc(safeLink(link) || "#") + "\" target=\"_blank\" rel=\"noopener noreferrer\">Открыть ↗</a></div>";
  el.hidden = false;
  $("#clcopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link); } catch (e) {}
    $("#clcopy").textContent = "Скопировано ✓";
  });
}

// ---------- встроенный браузер: навигация ----------
wv.addEventListener("dom-ready", () => { try { wv.setZoomFactor(1); } catch (e) {} fitWebview(); setTimeout(kickLazy, 400); });
wv.addEventListener("did-stop-loading", () => { fitWebview(); setTimeout(kickLazy, 350); setTimeout(kickLazy, 1200); });
window.addEventListener("resize", fitWebview);
wv.addEventListener("did-navigate", e => { $("#addr").textContent = e.url; });
wv.addEventListener("did-navigate-in-page", e => { $("#addr").textContent = e.url; });
$("#back").addEventListener("click", () => { if (wv.canGoBack()) wv.goBack(); });
$("#fwd").addEventListener("click", () => { if (wv.canGoForward()) wv.goForward(); });
$("#reload").addEventListener("click", () => wv.reload());
document.querySelectorAll(".chipbtn").forEach(b => b.addEventListener("click", () => { showBrowser(true); navigate(b.dataset.url); }));
$("#read").addEventListener("click", readActive);

// ---------- обработка ввода ----------
const isSingleUrl = text => /^https?:\/\/[^\s]+$/i.test(text.trim());

async function openLinkInBrowser(u) {
  showBrowser(true);
  progress("Открываю ссылку в окне «Браузер DOMEO»…");
  await navigate(u);
  progress("Ссылка открыта в окне ниже. Если корзина видна — нажмите «Прочитать корзину из окна». Если сайт просит проверку/вход — пройдите её. Либо прочитайте корзину закладкой в своём браузере и вставьте список сюда.");
}

function runInput() {
  const raw = $("#input").value;
  if (isSingleUrl(raw)) { openLinkInBrowser(raw.trim()); return; }
  const pos = parseText(raw);
  if (!pos.length) {
    progress(raw.trim()
      ? "Не распознал позиции. Сюда нужен список товаров (по строке на позицию) из закладки «DOMEO: читать корзину», а не ссылка."
      : "Поле пустое. Вставьте список из закладки или введите позиции вручную.");
    return;
  }
  matchAll(pos, "Ручной ввод");
}

// ---------- события управления ----------
$("#run").addEventListener("click", runInput);
$("#sample").addEventListener("click", () => { $("#input").value = SAMPLE; matchAll(parseText(SAMPLE), "Пример"); });
$("#clear").addEventListener("click", () => { $("#input").value = ""; state = []; showResults(false); $("#cartlink").hidden = true; $("#histpanel").hidden = true; progress(""); });
$("#rows").addEventListener("change", e => { const sel = e.target.closest("select.cand-pick"); if (!sel) return; state[+sel.dataset.i].pick = +sel.value; render(); });
$("#cart").addEventListener("click", assemble);
$("#remember").addEventListener("click", async () => { const n = await saveMatches(); progress("Запомнено соответствий: " + n + "."); });
$("#hist").addEventListener("click", showHistory);

// ---------- версия и обновления ----------
(async () => { try { $("#ver").textContent = "v" + (await window.api.version()); } catch (e) {} })();

const updbar = $("#updbar");
function showUpd(html, withInstall) {
  updbar.innerHTML = html + (withInstall ? '<button class="primary" id="doInstall">Перезапустить и обновить</button>' : "");
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

// подгон высоты браузера при старте
setTimeout(fitWebview, 300);
setTimeout(fitWebview, 900);

// dev-диагностика размеров (видно в чёрном окне запуска)
setTimeout(() => {
  fitWebview();
  try {
    const r = wv.getBoundingClientRect();
    console.log("DIAG innerW=" + window.innerWidth + " innerH=" + window.innerHeight + " wvW=" + Math.round(r.width) + " wvH=" + Math.round(r.height) + " wvTop=" + Math.round(r.top));
  } catch (e) {}
}, 1800);
