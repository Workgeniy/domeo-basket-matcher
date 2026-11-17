"use strict";
// Клик по иконке расширения -> показать/скрыть плавающую панель на текущей странице.
// Панель внедряется content-скриптом (на сайтах поставщиков и store.domeo.ru).

const HOSTS = /:\/\/([^/]*\.)?(petrovich\.ru|vseinstrumenti\.ru|lemanapro\.ru|store\.domeo\.ru)\b/i;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { domeoToggle: true });
  } catch (e) {
    // content-скрипт ещё не загрузился — попробуем внедрить (только на наших сайтах)
    if (tab.url && HOSTS.test(tab.url)) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        await chrome.tabs.sendMessage(tab.id, { domeoToggle: true });
      } catch (e2) {}
    } else {
      // не наш сайт — короткий значок-подсказка
      try {
        chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b4281f" });
        chrome.action.setBadgeText({ tabId: tab.id, text: "—" });
        setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 2000);
      } catch (_) {}
    }
  }
});
