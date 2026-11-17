"use strict";
// Плавающая панель DOMEO на странице (вызывается кликом по иконке расширения).
// Внутри — iframe с нашим интерфейсом (app.html), который и делает всю работу.

(function () {
  if (window.__domeoPanelReady) { return; }
  window.__domeoPanelReady = true;

  const Z = 2147483647;
  let wrap = null, iframe = null, minimized = false;

  function build() {
    wrap = document.createElement("div");
    wrap.id = "domeo-podbor-panel";
    wrap.style.cssText =
      "position:fixed;top:72px;right:20px;width:460px;height:640px;z-index:" + Z + ";" +
      "background:#fff;border:1px solid #d9d9d4;border-radius:12px;overflow:hidden;" +
      "box-shadow:0 10px 36px rgba(0,0,0,.28);display:flex;flex-direction:column;" +
      "font-family:system-ui,'Segoe UI',Arial,sans-serif;";

    const header = document.createElement("div");
    header.style.cssText =
      "flex:0 0 auto;height:36px;background:#17171a;color:#fff;display:flex;align-items:center;" +
      "gap:8px;padding:0 6px 0 10px;cursor:move;user-select:none;";
    header.innerHTML =
      '<span style="background:#ffcb05;color:#1a1a1a;font-weight:700;font-size:11px;padding:2px 7px;border-radius:5px">DOMEO</span>' +
      '<span style="font-size:13px;font-weight:600;flex:1 1 auto">Подбор по корзине</span>' +
      '<span id="dmp-win" title="Открыть в отдельном окне" style="cursor:pointer;font-size:15px;line-height:1;padding:4px 8px">⤢</span>' +
      '<span id="dmp-min" title="Свернуть" style="cursor:pointer;font-size:18px;line-height:1;padding:4px 8px">—</span>' +
      '<span id="dmp-close" title="Закрыть (иконкой — снова открыть)" style="cursor:pointer;font-size:18px;line-height:1;padding:2px 8px">×</span>';

    iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("app.html");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.cssText = "flex:1 1 auto;border:0;width:100%;height:100%;display:block;background:#fff;";

    const grip = document.createElement("div");
    grip.title = "Потяните, чтобы изменить размер";
    grip.style.cssText =
      "position:absolute;right:2px;bottom:2px;width:16px;height:16px;cursor:nwse-resize;z-index:1;" +
      "background:linear-gradient(135deg,transparent 50%,#bbb 50%,#bbb 60%,transparent 60%,transparent 72%,#bbb 72%,#bbb 82%,transparent 82%);";

    wrap.appendChild(header);
    wrap.appendChild(iframe);
    wrap.appendChild(grip);
    document.documentElement.appendChild(wrap);

    // перетаскивание за шапку
    let drag = false, dx = 0, dy = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "dmp-min" || e.target.id === "dmp-close") return;
      drag = true; dx = e.clientX - wrap.offsetLeft; dy = e.clientY - wrap.offsetTop;
      iframe.style.pointerEvents = "none"; e.preventDefault();
    });
    // изменение размера
    let rez = false, rw = 0, rh = 0, rx = 0, ry = 0;
    grip.addEventListener("mousedown", (e) => {
      rez = true; rw = wrap.offsetWidth; rh = wrap.offsetHeight; rx = e.clientX; ry = e.clientY;
      iframe.style.pointerEvents = "none"; e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (drag) {
        wrap.style.left = Math.max(0, e.clientX - dx) + "px";
        wrap.style.top = Math.max(0, e.clientY - dy) + "px";
        wrap.style.right = "auto";
      } else if (rez) {
        wrap.style.width = Math.max(340, rw + (e.clientX - rx)) + "px";
        if (!minimized) wrap.style.height = Math.max(360, rh + (e.clientY - ry)) + "px";
      }
    });
    window.addEventListener("mouseup", () => {
      if (drag || rez) iframe.style.pointerEvents = "auto";
      drag = false; rez = false;
    });

    header.querySelector("#dmp-win").addEventListener("click", () => {
      // просим панель сохранить состояние и открыть отдельное окно с теми же данными
      try { iframe.contentWindow.postMessage({ domeoSaveAndDetach: true }, "*"); } catch (e) {}
    });
    header.querySelector("#dmp-close").addEventListener("click", () => { wrap.style.display = "none"; });
    header.querySelector("#dmp-min").addEventListener("click", () => {
      minimized = !minimized;
      iframe.style.display = minimized ? "none" : "block";
      grip.style.display = minimized ? "none" : "block";
      wrap.dataset.fullH = wrap.dataset.fullH || "640";
      if (minimized) { wrap.dataset.fullH = wrap.offsetHeight; wrap.style.height = "36px"; }
      else { wrap.style.height = (wrap.dataset.fullH || 640) + "px"; }
    });
  }

  function toggle() {
    if (!wrap) { build(); return; }
    wrap.style.display = (wrap.style.display === "none") ? "flex" : "none";
  }

  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.domeoToggle) toggle(); });
})();
