import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTL, updatedText, groupOffers, escapeHtml, renderCard } from "../extension/content/format.js";

const OFFERS = [
  { merchant: "Trendyol", merchantDomain: "trendyol.com", merchantUrl: "https://www.trendyol.com/x", seller: "Getmobil", price: 59488.05, secondHand: true, freeShipping: true, updated: "2 saat önce" },
  { merchant: "PTT AVM", merchantDomain: "pttavm.com", merchantUrl: "https://www.pttavm.com/y", seller: "BVBMARKET", price: 67953.9, secondHand: false, freeShipping: true, updated: "7 saat önce" },
  { merchant: "Hepsiburada", merchantDomain: "hepsiburada.com", merchantUrl: "https://www.hepsiburada.com/z", seller: null, price: 114000, secondHand: false, freeShipping: true, updated: "25 dk önce" },
];

test("formatTL Türkçe biçimde yazar", () => {
  assert.equal(formatTL(67953.9), "67.953,90 TL");
  assert.equal(formatTL(1234), "1.234,00 TL");
});

test("updatedText spec §7 metnini üretir", () => {
  const t0 = 1_000_000_000;
  assert.equal(updatedText(t0, t0 + 20_000), "az önce güncellendi");
  assert.equal(updatedText(t0, t0 + 5 * 60_000), "5 dakika önce güncellendi");
  assert.equal(updatedText(t0, t0 + 3 * 3_600_000), "3 saat önce güncellendi");
});

test("groupOffers sıfır/2.el ayırır, siteCount benzersiz domain sayar, cheapest sıfırdan seçilir", () => {
  const g = groupOffers(OFFERS);
  assert.equal(g.newOffers.length, 2);
  assert.equal(g.usedOffers.length, 1);
  assert.equal(g.siteCount, 3);
  assert.equal(g.cheapest.price, 67953.9); // 2.el 59.488'e rağmen en ucuz SIFIR vurgulanır
});

test("escapeHtml beş özel karakteri kaçırır", () => {
  assert.equal(escapeHtml(`<a b="c">'&`), "&lt;a b=&quot;c&quot;&gt;&#39;&amp;");
});

test("renderCard: en ucuz vurgulu, 2.el ayrı bölümde, alt bilgi ve Epey linki var", () => {
  const data = {
    productName: "Apple iPhone 15 Pro",
    epeyUrl: "https://www.epey.com/akilli-telefonlar/apple-iphone-15-pro.html",
    offers: OFFERS,
    approximate: false,
    fetchedAt: 1_000_000_000,
  };
  const html = renderCard(data, groupOffers(data.offers), 1_000_000_000 + 5 * 60_000);
  assert.ok(html.includes("67.953,90 TL"));
  assert.ok(html.includes('class="row best"')); // en ucuz sıfır vurgusu
  assert.ok(html.includes("2. el / Outlet"));
  assert.ok(html.includes("Epey verisiyle · 5 dakika önce güncellendi"));
  assert.ok(html.includes(escapeHtml(data.epeyUrl)) || html.includes(data.epeyUrl));
  assert.ok(!html.includes("<script")); // içerik enjeksiyonu yok
});

test("renderCard mağaza adındaki HTML'i etkisizleştirir", () => {
  const kotu = { ...OFFERS[1], merchant: `<img src=x onerror=alert(1)>` };
  const data = { productName: "X", epeyUrl: "https://www.epey.com/x.html", offers: [kotu], approximate: false, fetchedAt: 0 };
  const html = renderCard(data, groupOffers(data.offers), 0);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
});

test("groupOffers sıralanmamış girdide de gerçek minimumu bulur", () => {
  const karisik = [
    { merchant: "A", merchantDomain: "a.com", merchantUrl: "https://a.com", seller: null, price: 114000, secondHand: false, freeShipping: true, updated: null },
    { merchant: "B", merchantDomain: "b.com", merchantUrl: "https://b.com", seller: null, price: 67953.9, secondHand: false, freeShipping: true, updated: null },
    { merchant: "C", merchantDomain: "c.com", merchantUrl: "https://c.com", seller: null, price: 59488.05, secondHand: true, freeShipping: true, updated: null },
  ];
  const g = groupOffers(karisik);
  assert.equal(g.cheapest.price, 67953.9); // sıfırlar arasında minimum, dizi sırası değil
});
