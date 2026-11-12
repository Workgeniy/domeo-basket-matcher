// Букмарклет «Собрать корзину в DOMEO».
// Запускается НА store.domeo.ru (под логином менеджера — корзина привязана к его сессии).
// Берёт список подобранных товаров из буфера обмена (кнопка «Собрать корзину в DOMEO»
// в приложении копирует его: ссылка_товара ⇥ количество, по строке) и добавляет каждый
// в корзину через штатное действие Bitrix action=ADD2BASKET (количество учитывается).
// После сборки достаёт «Ссылку на данную корзину», копирует её и показывает.
// Однострочная версия для закладки — в cart.txt.

(function () {
    if (!/(^|\.)store\.domeo\.ru$/.test(location.host)) {
        alert("Откройте store.domeo.ru (под своим логином) и запустите закладку там.");
        return;
    }

    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(
            function (t) { (t && t.indexOf("\t") >= 0) ? run(t) : ask(); },
            ask
        );
    } else {
        ask();
    }

    function ask() {
        var t = prompt("Вставьте список из приложения (ссылка ⇥ количество, по строке):");
        if (t) run(t);
    }

    function run(payload) {
        var items = payload.split(/\r?\n/).map(function (line) {
            var p = line.trim().split("\t");
            if (!p[0]) return null;
            try {
                var u = new URL(p[0], location.origin);
                var id = (u.pathname.match(/(\d+)\/?$/) || [])[1];
                var qty = parseInt(p[1] || "1", 10) || 1;
                return id ? { path: u.pathname, id: id, qty: qty } : null;
            } catch (e) { return null; }
        }).filter(Boolean);

        if (!items.length) { alert("В данных нет товаров со ссылками. Скопируйте список кнопкой в приложении."); return; }
        if (!confirm("Добавить в корзину DOMEO товаров: " + items.length + "?")) return;

        var ok = 0, i = 0;
        (function next() {
            if (i >= items.length) {
                fetch("/basket/", { credentials: "include" }).then(function (r) { return r.text(); }).then(function (html) {
                    var m = html.match(/basket-share__input[^>]*value=["']([^"']+)["']/i) || html.match(/(https?:\/\/[^"'<> ]*\/basket\/share\/\?code=[A-Za-z0-9]+)/);
                    var link = m ? (m[1] || m[0]) : "";
                    if (link && link.indexOf("http") !== 0) link = location.origin + link;
                    if (link && !/\/basket\/share\/\?code=[A-Za-z0-9]{6,}/.test(link)) link = "";
                    finishCart(link);
                }).catch(function () { finishCart(""); });
                return;
            }
            var it = items[i++];
            fetch(it.path + "?action=ADD2BASKET&id=" + it.id + "&quantity=" + it.qty, { credentials: "include" })
                .then(function (r) { if (r.ok) ok++; })
                .catch(function () {})
                .then(next);
        })();

        function finishCart(link) {
            if (link) {
                copyText(link);
                if (confirm("Корзина DOMEO собрана: " + ok + " из " + items.length + ".\nСсылка на корзину (скопирована в буфер):\n\n" + link + "\n\nОткрыть корзину?")) {
                    location.href = "/basket/";
                }
            } else {
                alert("Добавлено " + ok + " из " + items.length + ". Открываю корзину.");
                location.href = "/basket/";
            }
        }
    }

    function copyText(t) {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(function () {}); return; }
        try { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } catch (e) {}
    }
})();
