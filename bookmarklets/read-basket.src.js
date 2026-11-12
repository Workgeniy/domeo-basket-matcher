// Букмарклет «Корзина → DOMEO».
// Запускается на открытой корзине поставщика в браузере менеджера (антибот уже пройден).
// Читает позиции прямо из DOM и копирует их в буфер (TSV: наименование / кол-во / код / цена).
// Поддержка: Lemana (из ссылки), Петрович (смета), ВсеИнструменты (расшаренная корзина).
// Селекторы проверены на реальных сохранённых страницах.
// Однострочная версия для закладки — в bookmarklet.txt.

(function () {
    try {
        var host = location.host;
        var rows;

        // --- Lemana Pro: данные в ссылке /basket/?products=артикул:кол-во,... ---
        var products = new URLSearchParams(location.search).get("products");
        if (products) {
            rows = products.split(",").map(function (pair) {
                var kv = pair.split(":");
                return kv.length === 2 ? ["", kv[1].trim(), kv[0].trim(), ""].join("\t") : null;
            }).filter(Boolean);
            return finish("LEMANA", rows);
        }

        // --- Петрович: смета /estimate/{id}/ ---
        if (/petrovich\.ru$/.test(host) && document.querySelector('[data-test="estimate-products"]')) {
            rows = [];
            document.querySelectorAll('[data-test="estimate-products"]').forEach(function (c) {
                rows.push([
                    txt(c.querySelector('[data-test="product-title"]')),
                    txt(c.querySelector(".qty-wrapper")),
                    txt(c.querySelector('[data-test="product-code"]')),
                    txt(c.querySelector('[data-test="product-gold-price"] .price-r__text')),
                ].join("\t"));
            });
            return finish("PETROVICH", rows);
        }

        // --- ВсеИнструменты: расшаренная корзина /cart/?sharingHash=... ---
        var viNames = document.querySelectorAll('[data-behavior="cart-product-name"]');
        if (/vseinstrumenti\.ru$/.test(host) && viNames.length) {
            rows = [];
            viNames.forEach(function (n) {
                // поднимаемся до блока позиции (минимальный предок с итоговой ценой)
                var item = n;
                while (item && !(item.querySelector && item.querySelector('[data-qa="cart-product-price-total"]'))) {
                    item = item.parentElement;
                }
                item = item || n.parentElement;
                rows.push([
                    txt(n),
                    txt(item.querySelector('[class*="badge"]')),             // «30 шт.»
                    txt(item.querySelector('[data-qa="product-code"]')).replace(/^Код:\s*/i, ""),
                    txt(item.querySelector('[data-qa="cart-product-price-total"]')),
                ].join("\t"));
            });
            return finish("VSEINSTRUMENTI", rows);
        }

        // --- Прочее: диагностика — отдаём видимый текст ---
        var root = document.querySelector("main") || document.body;
        copy("PAGE\t" + host + "\t" + location.href + "\n\n" + root.innerText.trim());
    } catch (e) {
        alert("Ошибка букмарклета: " + e.message);
    }

    function txt(el) {
        return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
    }

    function finish(source, rows) {
        var header = source + "\t" + location.href + "\nНАИМЕНОВАНИЕ\tКОЛ-ВО\tКОД\tЦЕНА";
        copy(header + "\n" + rows.join("\n"));
    }

    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
        function done() {
            alert("Корзина скопирована (" + (text.split("\n").length - 2) + " строк). Вставьте в инструмент или чат.");
        }
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand("copy");
                alert("Скопировано. Вставьте в инструмент или чат.");
            } catch (e) {
                prompt("Скопируйте вручную (Ctrl+C):", text);
            }
            ta.remove();
        }
    }
})();
