import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parsePriceTL, buildSearchUrl, buildQueries, parseSearchResults,
  scoreMatch, searchEpeyInHtml, parseOffers, MIN_SCORE,
} from "../extension/background/epey.js";

const searchHtml = readFileSync(new URL("./fixtures/epey-search.html", import.meta.url), "utf8");
const productHtml = readFileSync(new URL("./fixtures/epey-product.html", import.meta.url), "utf8");

test("parsePriceTL Türkçe fiyat formatını çözer", () => {
  assert.equal(parsePriceTL("67.953,90 TL"), 67953.9);
  assert.equal(parsePriceTL(" 1.234,00 TL ile"), 1234);
  assert.equal(parsePriceTL("fiyat yok"), null);
});

test("buildSearchUrl sorguyu encode eder", () => {
  assert.equal(buildSearchUrl("iphone 15 128gb"), "https://www.epey.com/ara/?ara=iphone%2015%20128gb");
});

test("buildQueries: tam → renk/pazarlama süzülmüş → depolamasız", () => {
  const qs = buildQueries("Apple iPhone 15 128 GB (Apple Türkiye Garantili) Siyah");
  assert.equal(qs[0], "Apple iPhone 15 128 GB Siyah");
  assert.equal(qs[1], "apple iphone 15 128gb");
  assert.equal(qs[2], "apple iphone 15");
  assert.equal(qs.length, 3);
});

test("parseSearchResults gerçek arama HTML'inden 30 ürün çıkarır", () => {
  const results = parseSearchResults(searchHtml);
  assert.equal(results.length, 30);
  assert.equal(results[0].name, "Apple iPhone 15 Pro");
  assert.equal(results[0].url, "https://www.epey.com/akilli-telefonlar/apple-iphone-15-pro.html");
  assert.equal(results[0].price, 67953.9);
  assert.equal(results[0].siteCount, 3);
  assert.equal(results[0].offerCount, 7);
  // satışta olmayan ürünlerde fiyat null, sayılar 0
  const olmayan = results.find((r) => r.name === "Apple iPhone X");
  assert.equal(olmayan.price, null);
  assert.equal(olmayan.offerCount, 0);
});

test("scoreMatch model numarası uyuşmazlığını diskalifiye eder", () => {
  const q = "iphone 15 128gb";
  const p15pro = { name: "Apple iPhone 15 Pro", offerCount: 7 };
  const p12 = { name: "Apple iPhone 12 (128 GB)", offerCount: 22 };
  assert.ok(scoreMatch(q, p15pro) > scoreMatch(q, p12));
  assert.ok(scoreMatch(q, p12) < MIN_SCORE);
});

test("searchEpeyInHtml en iyi adayı seçer", () => {
  const found = searchEpeyInHtml("iphone 15 128gb", searchHtml);
  assert.equal(found.best.name, "Apple iPhone 15 Pro");
  assert.ok(found.best.score >= MIN_SCORE);
  assert.ok(found.candidates.length >= 3);
});

test("parseOffers gerçek ürün HTML'inden teklifleri alanlarıyla çıkarır", () => {
  const offers = parseOffers(productHtml);
  assert.equal(offers.length, 9);
  // fiyata göre artan
  for (let i = 1; i < offers.length; i++) assert.ok(offers[i].price >= offers[i - 1].price);
  const enUcuz = offers[0];
  assert.equal(enUcuz.price, 59488.05);
  assert.equal(enUcuz.merchant, "Trendyol");
  assert.equal(enUcuz.merchantDomain, "trendyol.com");
  assert.equal(enUcuz.secondHand, true);
  assert.equal(enUcuz.freeShipping, true);
  const ptt = offers.find((o) => o.price === 67953.9);
  assert.equal(ptt.merchant, "PTT AVM");
  assert.equal(ptt.seller, "BVBMARKET");
  assert.equal(ptt.secondHand, false);
  assert.ok(ptt.updated.includes("önce"));
});
