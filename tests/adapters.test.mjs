import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { cleanText, decodeHtmlEntities, jsonLdProducts } from "../extension/content/adapters/dom-utils.js";
import { hepsiburada } from "../extension/content/adapters/hepsiburada.js";
import { trendyol } from "../extension/content/adapters/trendyol.js";
import { amazon } from "../extension/content/adapters/amazon.js";

function load(fixture, url) {
  const html = readFileSync(new URL(`./fixtures/adapters/${fixture}`, import.meta.url), "utf8");
  const dom = new JSDOM(html, { url });
  return { document: dom.window.document, location: new URL(url) };
}

test("cleanText whitespace yığınlarını teke indirir", () => {
  assert.equal(cleanText("  Apple\n\t\t iPhone  17 "), "Apple iPhone 17");
});

test("decodeHtmlEntities sayısal/hex entity'leri çözer", () => {
  assert.equal(decodeHtmlEntities("Ak&#x131;ll&#x131; &amp; h&#252;zme"), "Akıllı & hüzme");
});

test("jsonLdProducts yalnızca Product tipini döner, bozuk JSON'u yok sayar", () => {
  const dom = new JSDOM(`
    <script type="application/ld+json">{"@type":"WebPage","name":"x"}</script>
    <script type="application/ld+json">BOZUK{{{</script>
    <script type="application/ld+json">[{"@type":"Product","name":"P1","sku":"1"}]</script>
  `);
  const prods = jsonLdProducts(dom.window.document);
  assert.equal(prods.length, 1);
  assert.equal(prods[0].name, "P1");
});

test("hepsiburada: h1 + URL'den SKU", () => {
  const { document, location } = load(
    "hepsiburada.html",
    "https://www.hepsiburada.com/apple-iphone-15-128-gb-siyah-p-HBCV00004X9ZCH"
  );
  const p = hepsiburada.extractProduct(document, location);
  assert.equal(p.title, "Apple iPhone 15 128 GB Siyah");
  assert.equal(p.sku, "HBCV00004X9ZCH");
  assert.equal(p.approximate, false);
  assert.equal(p.titleEl.tagName, "H1");
});

test("hepsiburada: ürün olmayan sayfada null", () => {
  const { document, location } = load("hepsiburada.html", "https://www.hepsiburada.com/telefonlar-c-371965");
  assert.equal(hepsiburada.extractProduct(document, location), null);
});

test("trendyol: başlık JSON-LD'den (SEO'lu h1'den değil), sku JSON-LD'den", () => {
  const { document, location } = load(
    "trendyol.html",
    "https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-762254878"
  );
  const p = trendyol.extractProduct(document, location);
  assert.equal(p.title, "Apple iPhone 15 128 GB Siyah");
  assert.equal(p.sku, "762254878");
  assert.equal(p.approximate, false);
});

test("amazon: #productTitle + /dp/ ASIN", () => {
  const { document, location } = load(
    "amazon.html",
    "https://www.amazon.com.tr/Apple-iPhone-15-128-GB/dp/B0CHXCFS1J?th=1"
  );
  const p = amazon.extractProduct(document, location);
  assert.equal(p.title, "Apple iPhone 15 (128 GB) - Siyah");
  assert.equal(p.sku, "B0CHXCFS1J");
  assert.equal(p.titleEl.id, "title");
});

test("amazon: dp olmayan sayfada null", () => {
  const { document, location } = load("amazon.html", "https://www.amazon.com.tr/s?k=iphone");
  assert.equal(amazon.extractProduct(document, location), null);
});
