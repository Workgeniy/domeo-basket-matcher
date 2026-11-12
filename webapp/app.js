"use strict";
// DOMEO · Подбор по корзине — логика приложения.
// Вынесено в отдельный файл, чтобы работал строгий CSP (script-src 'self'):
// любой вставленный встроенный скрипт не выполнится. Весь вывод экранируется.

const API = "https://autocomplete.diginetica.net/autocomplete";
const APIKEY = "R14U9ZT7MH";          // публичный ключ проекта Diginetica для store.domeo.ru
const SITE = "https://store.domeo.ru";
const TOP = 4, GOOD = 160, WARN = 70;

const SAMPLE = [
  "Звукоизоляция для канализационных труб StP NoiseBlock Pipe 110х6,7х3000 мм\t1 упак.\t602357\t3 349",
  "Соединитель одноуровневый краб Knauf 60х27 0,9 мм\t20 шт.\t150807\t720",
  "Коробка установочная Systeme Electric для бетона d68х61 мм IP30\t15 шт.\t128016\t345",
  "Лист алюминиевый Квинтет 1,5х600х1200 мм рифленый\t2 л.\t132152\t8 220",
  "Кронштейн сантехнический 110 мм пластик для крепления фановых труб\t6 шт.\t503445\t306",
  "Ведро Gigant 20л усиленное\t3 шт.\t34209217\t",
  "пена монтажная\t3 шт\t\t",
].join("\n");

// ---------- разбор ввода ----------
const QTY = /(\d+(?:[.,]\d+)?)\s*(штук[аи]?|шт\.?|мешок|мешк[аи]|мешков|меш\.?|ведро|ведра|вёдер|ведер|уп(?:ак)?|компл(?:ект)?|набор(?:ов|а)?|рулон(?:ов|а)?|м2|м3|м²|м³|м|л|кг|т)?\s*$/i;
const DIM = /^[\d\s.,xх×*/()\-]+$/i;
const CYR = /[а-яА-ЯёЁ]{3,}/;
const SKIP = /^(LEMANA|PETROVICH|VSEINSTRUMENTI|PAGE|НАИМЕНОВАНИЕ)\b|^https?:\/\//i;

function parse(text) {
  const out = [];
  let last = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[\u{1F000}-\u{1FAFF}☀-➿️‍]/gu, "").trim();
    if (!line || SKIP.test(line)) continue;
    if (line.includes("\t")) {
      const c = line.split("\t");
      let name = (c[0] || "").trim();
      const qty = (c[1] || "").trim();
      if (!name) continue;
      out.push({ name, qty });
      continue;
    }
    let s = line.replace(/^\s*\d{1,3}[.)]?\s+(?=\D)/, "");
    let name = s, qty = "";
    const m = s.match(QTY);
    if (m && m.index > 0) { qty = (m[1] + " " + (m[2] || "")).trim(); name = s.slice(0, m.index).trim(); }
    if (!name) name = s;
    if (DIM.test(name)) { if (last) name = last + " " + name; }
    else { const w = name.match(CYR); if (w) last = w[0]; }
    out.push({ name, qty });
  }
  return out;
}

// ---------- подбор ----------
async function search(term) {
  const u = API + "?apiKey=" + APIKEY + "&st=" + encodeURIComponent(term);
  const j = await (await fetch(u)).json();
  return (j.products || []).slice(0, TOP).map(p => ({
    name: p.name, brand: p.brand || "", price: parseFloat(p.price) || 0,
    score: Math.round(p.score || 0), avail: !!p.available, link: SITE + (p.link_url || "")
  }));
}

// ---------- утилиты + экранирование ----------
const qtyNum = s => { const m = String(s).match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : 1; };
const money = n => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
// ссылку в href пускаем только если это адрес store.domeo.ru (иначе — пусто)
const safeLink = u => /^https:\/\/store\.domeo\.ru\//.test(u) ? u : "";
function status(score) {
  if (score >= GOOD) return ["good", "Совпадение"];
  if (score >= WARN) return ["warn", "Проверить"];
  return ["crit", "Не найдено"];
}

const $ = s => document.querySelector(s);
let state = [];

function render() {
  const rows = $("#rows"); rows.innerHTML = "";
  state.forEach((it, i) => {
    const sel = it.cands[it.pick];
    const candCell = it.loading
      ? '<span class="chip load">подбираю…</span>'
      : it.cands.length ? candSelect(it, i) : '<span class="hint">нет кандидатов</span>';
    const price = sel ? '<span class="price">' + money(sel.price) + " ₽</span>" : "—";
    const [cls, label] = sel ? status(sel.score) : ["crit", "Не найдено"];
    const chip = it.loading ? '<span class="chip load">…</span>' : '<span class="chip ' + cls + '">' + label + "</span>";
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><div class="pos-name">' + esc(it.name) + '</div><div class="pos-meta">' + esc(it.qty || "") + "</div></td>" +
      "<td>" + candCell + "</td><td>" + price + "</td><td>" + chip + "</td>";
    rows.appendChild(tr);
  });
  summary();
}

function candSelect(it, i) {
  const opts = it.cands.map((c, j) =>
    '<option value="' + j + '"' + (j === it.pick ? " selected" : "") + ">" +
    esc(trim(c.name, 70)) + " — " + money(c.price) + " ₽</option>").join("");
  const c = it.cands[it.pick];
  const href = safeLink(c.link);
  const linkHtml = href
    ? '<a class="link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(c.brand || "открыть карточку") + " ↗</a>"
    : '<span class="link">' + esc(c.brand || "") + "</span>";
  return '<div class="cand"><select class="cand-pick" data-i="' + i + '">' + opts + "</select>" +
    "<div>" + linkHtml + ' <span class="score">score ' + (c.score | 0) + (c.avail ? "" : " · под заказ") + "</span></div></div>";
}

function summary() {
  const done = state.filter(s => !s.loading);
  let good = 0, warn = 0, crit = 0, sum = 0;
  done.forEach(s => {
    const sel = s.cands[s.pick];
    if (!sel) { crit++; return; }
    const [cls] = status(sel.score);
    if (cls === "good") good++; else if (cls === "warn") warn++; else crit++;
    sum += sel.price * qtyNum(s.qty);
  });
  $("#summary").innerHTML =
    tile(state.length, "позиций") + tile(good, "совпадений") + tile(warn, "на проверку") +
    tile(crit, "не найдено") + tile(money(sum) + " ₽", "сумма подбора");
}
const tile = (n, l) => '<div class="tile"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + "</div></div>";

// ---------- запуск ----------
async function run() {
  const positions = parse($("#input").value);
  if (!positions.length) { $("#progress").textContent = "Нет позиций для разбора."; return; }
  state = positions.map(p => ({ ...p, cands: [], pick: 0, loading: true }));
  $("#summary").hidden = false; $("#result").hidden = false; $("#copy").hidden = false; $("#cart").hidden = false;
  $("#run").disabled = true;
  render();
  for (let i = 0; i < state.length; i++) {
    $("#progress").textContent = "Подбор " + (i + 1) + " / " + state.length + "…";
    try { state[i].cands = await search(state[i].name); }
    catch (e) { state[i].cands = []; }
    state[i].loading = false;
    const avIdx = state[i].cands.findIndex(c => c.avail);
    state[i].pick = avIdx >= 0 ? avIdx : 0;
    render();
  }
  $("#progress").textContent = "Готово.";
  $("#run").disabled = false;
}

// ---------- CSV / список для закладки ----------
function csv() {
  const head = ["Позиция", "Кол-во", "Подобрано DOMEO", "Цена", "Статус", "Ссылка"];
  const lines = [head.join(";")];
  state.forEach(s => {
    const c = s.cands[s.pick];
    const st = c ? status(c.score)[1] : "Не найдено";
    lines.push([s.name, s.qty, c ? c.name : "", c ? c.price : "", st, c ? c.link : ""]
      .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(";"));
  });
  return lines.join("\n");
}
function cartPayload() {
  return state.map(s => { const c = s.cands[s.pick]; return c ? c.link + "\t" + qtyNum(s.qty) : null; }).filter(Boolean).join("\n");
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  $("#progress").textContent = okMsg;
}

// ---------- события ----------
$("#run").addEventListener("click", run);
$("#sample").addEventListener("click", () => { $("#input").value = SAMPLE; run(); });
$("#clear").addEventListener("click", () => {
  $("#input").value = ""; state = [];
  $("#summary").hidden = true; $("#result").hidden = true; $("#copy").hidden = true; $("#cart").hidden = true; $("#progress").textContent = "";
});
$("#rows").addEventListener("change", e => {
  const sel = e.target.closest("select.cand-pick"); if (!sel) return;
  state[+sel.dataset.i].pick = +sel.value; render();
});
$("#copy").addEventListener("click", () => copyText(csv(), "Таблица скопирована (CSV)."));
$("#cart").addEventListener("click", () => {
  const text = cartPayload();
  const n = text ? text.split("\n").length : 0;
  if (!n) { $("#progress").textContent = "Нет подобранных товаров."; return; }
  copyText(text, "Скопирован список из " + n + " товаров (это НЕ ссылка — в адресную строку не вставлять). Откройте store.domeo.ru → нажмите закладку «Собрать корзину»: она соберёт корзину и покажет ссылку.");
});

// первый запуск — на примере
$("#input").value = SAMPLE;
run();
