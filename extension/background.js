"use strict";
// Клик по иконке расширения -> показать/скрыть плавающую панель на текущей странице.
// Панель внедряется content-скриптом (на любом обычном сайте).

// открыть интерфейс в отдельном окне (кнопка ⤢ в шапке панели)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.domeoOpenWindow) {
    chrome.windows.create({ url: chrome.runtime.getURL("app.html"), type: "normal", width: 1100, height: 820 });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { domeoToggle: true });
  } catch (e) {
    // content-скрипт ещё не загрузился — внедряем на лету
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { domeoToggle: true });
    } catch (e2) {
      // служебные страницы (chrome://, browser://, настройки, магазин) — туда внедрить нельзя
      try {
        chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b4281f" });
        chrome.action.setBadgeText({ tabId: tab.id, text: "—" });
        setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 2000);
      } catch (_) {}
    }
  }
});
