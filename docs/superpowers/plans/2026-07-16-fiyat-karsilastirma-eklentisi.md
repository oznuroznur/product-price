# Fiyat Karşılaştırma Chrome Eklentisi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Türkiye'deki 6 e-ticaret sitesinin ürün sayfalarına, aynı ürünün diğer mağazalardaki fiyatlarını Epey verisiyle gösteren bir rozet+kart enjekte eden, Chrome Web Store'da yayınlanabilir MV3 uzantısı.

**Architecture:** Content script (site adapter'ları ile) sayfadaki ürünü tespit eder ve background service worker'a mesaj yollar; SW Epey'i fetch edip HTML'i regex ile parse eder (SW'de DOMParser yok), sonucu `chrome.storage.local`'da 45 dk TTL ile cache'ler; content script sonucu Shadow DOM'lu rozet+kart olarak gösterir. Tüm saf mantık (parser, skorlama, cache, orkestrasyon, adapter'lar) Node `node --test` + jsdom ile test edilir; fetch yalnızca uzantı bağlamında çalışır (Epey, tarayıcı-dışı istemcilere Cloudflare challenge veriyor — spike ile doğrulandı).

**Tech Stack:** Vanilla JS (ES modules, build adımı yok), Manifest V3, `node --test` + jsdom (yalnızca devDependency), Git.

## Global Constraints

- Ağ isteği YALNIZCA `https://www.epey.com/*`'a atılır; hedef sitelere hiçbir istek atılmaz (spec §2, §8).
- Hiçbir kullanıcı verisi toplanmaz; analytics/tracking SDK yok (spec §2).
- Ücretli hiçbir servis kullanılmaz (spec §1).
- Manifest V3 (spec §3).
- Cache TTL: **45 dakika**, anahtar normalize edilmiş ürün başlığı (spec §5).
- Epey istekleri arası **en az 1500 ms** (throttle) + aynı ürün için in-flight dedup (spec §8).
- Sonuç bulunamazsa rozet hiç gösterilmez — sessiz başarısızlık, konsola hata dökülmez (spec §7).
- Yaklaşık eşleşmede rozette "≈" işareti + tooltip (spec §7).
- Hedef siteler (kullanıcı seçimi, 2026-07-16): **Hepsiburada, Trendyol, Amazon TR, n11, Teknosa, Vatan Bilgisayar**.
- README'de Epey'in resmi API sağlamadığı ve yapı değişirse aracın bozulabileceği açıkça yazılır (spec §2).
- Content script'te ana dünyaya (page window) erişilmez; yalnızca DOM okunur.

## Doğrulanmış site sinyalleri (2026-07-16 araştırması — adapter'ların dayanağı)

| Site | Product JSON-LD | Kullanılacak sinyal | Ürün URL deseni |
|---|---|---|---|
| Hepsiburada | YOK (yalnız WebPage+Review) | `h1` metni | `/<slug>-p-<SKU>` (örn. `-p-HBCV00004X9ZCH`) |
| Trendyol | VAR — name temiz, sku | JSON-LD; fallback `h1` | `/<marka>/<slug>-p-<sayı>` |
| Amazon TR | YOK | `#productTitle` | `/dp/<ASIN>` (10 karakter) |
| n11 | VAR — sku OK, name SEO kirli ("... Fiyatları ve Özellikleri") | JSON-LD sku + `h1` başlık | `/urun/<slug>-<sayı>` |
| Teknosa | YOK (yalnız WebPage) | `h1` (whitespace temizliği şart) | `/<slug>-p-<sayı>` |
| Vatan | VAR — name (HTML entity'li!), mpn, sku | JSON-LD (+entity decode) | `/<slug>.html` |

Epey tarafı (research/epey/README.md'de belgeli): arama `GET /ara/?ara=<sorgu>` (redirect'i takip et), sonuçlar `a.cell` içinde `span.adi|fiyat|fiyatsayi`; ürün sayfası teklifleri `div#fiyatlar` içinde `a.git` (`data-link`, `span.urun_adi|urun_fiyat`, güncellenme zamanı).

## Dosya yapısı

```
extension/
  manifest.json
  background/
    service-worker.js      # mesaj yönlendirme (ince katman)
    orchestrator.js        # getComparison — saf, bağımlılık enjeksiyonlu
    epey.js                # Epey parser + sorgu üretimi + fetchHtml
    cache.js               # TTL cache (storage enjekte edilebilir)
  content/
    loader.js              # klasik script → dynamic import ile main.js
    main.js                # adapter → mesaj → rozet; SPA URL izleme
    badge.js               # rozet + kart (Shadow DOM)
    format.js              # fiyat/zaman formatı, teklif gruplama (saf)
    adapters/
      index.js             # hostname → adapter
      dom-utils.js         # jsonLdProducts, decodeHtmlEntities, cleanText
      hepsiburada.js  trendyol.js  amazon.js  n11.js  teknosa.js  vatan.js
tests/
  00-altyapi.test.mjs  epey.test.mjs  cache.test.mjs  orchestrator.test.mjs
  adapters.test.mjs  format.test.mjs
  fixtures/
    epey-search.html  epey-product.html      (research'ten kopyalanır — gerçek HTML)
    adapters/*.html                          (doğrulanmış yapılara göre mini fixture'lar)
docs/
  PRIVACY.md  store/listing.md
README.md  package.json  .gitignore
```

Not — content script ESM deseni: MV3 content script'leri doğrudan modül olamaz; `loader.js` klasik script olarak `import(chrome.runtime.getURL("content/main.js"))` yapar, tüm modüller `web_accessible_resources`'ta listelenir. Böylece aynı dosyalar Node testlerinde de doğrudan import edilir.

---

### Task 1: Proje iskeleti + git + test altyapısı

**Files:**
- Create: `.gitignore`, `package.json`, `tests/00-altyapi.test.mjs`

**Interfaces:**
- Produces: `npm test` = `node --test tests/`; jsdom devDependency kurulmuş; git repo hazır.

- [ ] **Step 1: Git repo başlat ve .gitignore yaz**

```bash
cd c:/Users/oznuroznur/Desktop/projects/product-price
git init -b main
```

`.gitignore`:

```
node_modules/
.playwright-mcp/
```

- [ ] **Step 2: package.json yaz**

```json
{
  "name": "fiyat-karsilastirma-eklentisi",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  },
  "devDependencies": {
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 3: Bağımlılığı kur**

Run: `npm install`
Expected: `added ... packages`, hata yok.

- [ ] **Step 4: Altyapı testini yaz** — `tests/00-altyapi.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("jsdom kurulu ve çalışıyor", () => {
  const dom = new JSDOM("<h1>merhaba</h1>");
  assert.equal(dom.window.document.querySelector("h1").textContent, "merhaba");
});
```

- [ ] **Step 5: Testi çalıştır**

Run: `npm test`
Expected: `pass 1`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json tests/ research/ spike-cf-test/ docs/
git commit -m "chore: proje iskeleti, test altyapısı, spike ve araştırma çıktıları"
```

---

### Task 2: Epey modülü (parser + sorgu üretimi)

**Files:**
- Create: `extension/background/epey.js`, `tests/epey.test.mjs`
- Create: `tests/fixtures/epey-search.html`, `tests/fixtures/epey-product.html` (kopya)

**Interfaces:**
- Produces (sonraki task'lar bunları kullanır):
  - `buildSearchUrl(query: string): string`
  - `buildQueries(title: string): string[]` — tam → renk/pazarlama süzülmüş → depolamasız
  - `parseSearchResults(html: string): {name, url, price, siteCount, offerCount}[]`
  - `scoreMatch(query: string, item): number` ve `MIN_SCORE = 0.5`
  - `searchEpeyInHtml(query, html): { best, candidates } | null` (best alanları: name, url, price, siteCount, offerCount, score)
  - `parseOffers(html: string): Offer[]` — `Offer = {merchant, merchantDomain, merchantUrl, title, seller, price, freeShipping, secondHand, updated}` (fiyata göre artan)
  - `parsePriceTL(text: string): number | null`
  - `fetchHtml(url: string): Promise<string>` (yalnızca uzantı bağlamında çalışır)

- [ ] **Step 1: Fixture'ları kopyala**

```bash
mkdir -p tests/fixtures/adapters
cp research/epey/fixtures/search-iphone-15-128gb.html tests/fixtures/epey-search.html
cp research/epey/fixtures/product-apple-iphone-15-pro.html tests/fixtures/epey-product.html
```

- [ ] **Step 2: Başarısız testleri yaz** — `tests/epey.test.mjs`

```js
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
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module .../extension/background/epey.js`

- [ ] **Step 4: Modülü yaz** — `extension/background/epey.js`

`research/epey/epey-parser.mjs`'deki doğrulanmış kodun uyarlaması + `buildQueries`. Tam içerik:

```js
// Epey HTML parser + sorgu üretimi.
// fetchHtml yalnızca uzantı (service worker) bağlamında çalışır: Epey,
// tarayıcı-dışı istemcilere Cloudflare challenge gösterir (spike ile doğrulandı).
// Parser'lar saf (html string → veri) — Node'da fixture'larla test edilir.

const BASE = "https://www.epey.com";
export const MIN_SCORE = 0.5;

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const clean = (s) => decodeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// "67.953,90 TL" → 67953.9
export function parsePriceTL(text) {
  const m = text.match(/([\d.]+,\d{2})\s*TL/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

export function buildSearchUrl(query) {
  return `${BASE}/ara/?ara=${encodeURIComponent(query)}`;
}

// Kaynak sitedeki renk/pazarlama gürültüsü — Epey ürün adlarında bulunmaz.
const COLOR_WORDS = new Set([
  "siyah", "beyaz", "mavi", "kırmızı", "kirmizi", "yeşil", "yesil", "sarı", "sari",
  "pembe", "mor", "gri", "lacivert", "turuncu", "altın", "altin", "gümüş", "gumus",
  "titanyum", "naturel", "natural", "grafit", "bordo", "krem", "gece", "yıldız", "yildiz",
]);
const MARKETING_WORDS = new Set([
  "garantili", "garanti", "türkiye", "turkiye", "distribütör", "distributor",
  "ithalatçı", "ithalatci", "resmi", "yenilenmiş", "yenilenmis", "outlet",
  "akıllı", "akilli", "cep", "telefonu", "telefon",
]);

// Sıralı sorgu listesi: [parantezsiz tam başlık, renk/pazarlama süzülmüş, depolamasız]
export function buildQueries(title) {
  const base = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const lowered = base.toLocaleLowerCase("tr").replace(/(\d+)\s*(gb|tb)\b/g, "$1$2");
  const tokens = lowered.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((t) => !COLOR_WORDS.has(t) && !MARKETING_WORDS.has(t));
  const q2 = filtered.join(" ");
  const q3 = filtered.filter((t) => !/^\d+(gb|tb)$/.test(t)).join(" ");
  return [...new Set([base, q2, q3])].filter(Boolean);
}

// Arama sonucu: her ürün <a href="https://www.epey.com/....html" title="..." class="cell">
//   <span class="adi row">Ad</span> [<span class="fiyat row">X TL</span>
//   <span class="fiyatsayi row">N site, M fiyat</span>]
export function parseSearchResults(html) {
  const re = /<a href="(https:\/\/www\.epey\.com\/[^"]+\.html)" title="[^"]*" class="cell">([\s\S]*?)<\/a>/g;
  const results = [];
  let m;
  while ((m = re.exec(html))) {
    const block = m[2];
    const name = (block.match(/class="adi row">([^<]*)</) || [])[1];
    if (!name) continue;
    const priceText = (block.match(/class="fiyat row">([^<]*)</) || [])[1] || null;
    const countText = (block.match(/class="fiyatsayi row">([^<]*)</) || [])[1] || null;
    const counts = countText && countText.match(/(\d+)\s*site,\s*(\d+)\s*fiyat/);
    results.push({
      name: clean(name),
      url: m[1],
      price: priceText ? parsePriceTL(priceText) : null,
      siteCount: counts ? Number(counts[1]) : 0,
      offerCount: counts ? Number(counts[2]) : 0,
    });
  }
  return results;
}

// Token örtüşme skoru. Salt sayısal token'lar model numarasıdır ("15", "12";
// "128gb" değil) — iki yönlü uyuşmazlık ağır ceza: yanlış modele fiyat gösterme.
export function scoreMatch(query, item) {
  const norm = (s) =>
    s
      .toLocaleLowerCase("tr")
      .replace(/[()/]/g, " ")
      .replace(/(\d+)\s*(gb|tb)/g, "$1$2")
      .split(/\s+/)
      .filter(Boolean);
  const qTokens = norm(query);
  const nTokens = new Set(norm(item.name));
  const hit = qTokens.filter((t) => nTokens.has(t)).length;
  let score = hit / qTokens.length;
  if (item.offerCount > 0) score += 0.2;
  for (const extra of ["pro", "max", "plus", "mini", "ultra"]) {
    if (nTokens.has(extra) && !qTokens.includes(extra)) score -= 0.2;
  }
  const isNum = (t) => /^\d+$/.test(t);
  const qNums = qTokens.filter(isNum);
  const nNums = [...nTokens].filter(isNum);
  const missing = qNums.filter((n) => !nTokens.has(n)).length;
  const extraNums = nNums.filter((n) => !qNums.includes(n)).length;
  score -= 0.5 * (missing + extraNums);
  return score;
}

export function searchEpeyInHtml(query, html) {
  const results = parseSearchResults(html);
  if (results.length === 0) return null;
  const ranked = results
    .map((r) => ({ ...r, score: scoreMatch(query, r) }))
    .sort((a, b) => b.score - a.score);
  return { best: ranked[0], candidates: ranked.slice(0, 5) };
}

// Teklifler: <div id="fiyatlar"> içinde her teklif
// <a rel="nofollow" class="git ..." data-link="<urlencoded>" title="<Mağaza> <Ürün> fiyatı">
export function parseOffers(html) {
  const tabStart = html.indexOf('id="fiyatlar"');
  if (tabStart < 0) return [];
  const tabEnd = html.indexOf('<div id="fiyat_gecmisi"', tabStart);
  const section = html.slice(tabStart, tabEnd > 0 ? tabEnd : undefined);

  const re = /<a rel="nofollow"[^>]*class="git[^"]*"[^>]*data-link="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const offers = [];
  let m;
  while ((m = re.exec(section))) {
    const [, dataLink, title, block] = m;
    const merchantUrl = decodeURIComponent(dataLink);
    let domain = null;
    try {
      domain = new URL(merchantUrl).hostname.replace(/^www\./, "");
    } catch {}
    const logoAlt = (block.match(/<img src="https:\/\/resim\.epey\.com\/site\/[^"]*" alt="([^"]*)"/) || [])[1];
    const priceBlock = (block.match(/class="urun_fiyat">([\s\S]*?)<span class="urun_fiyat_sort"/) || [])[1] || "";
    const price = parsePriceTL(priceBlock);
    if (price == null) continue;
    const offerTitle = (block.match(/class="urun_adi">([\s\S]*?)<(?:p|\/span)/) || [])[1];
    const seller = (block.match(/<strong>Satıcı:<\/strong>\s*([^|<]+)/) || [])[1];
    const updated = (block.match(/class="urun_git">[\s\S]*?<p>([^<]*)<\/p>/) || [])[1];
    offers.push({
      merchant: title.replace(/\s+fiyatı\s*$/, "").split(" ").slice(0, guessMerchantWordCount(title, logoAlt)).join(" "),
      merchantDomain: domain,
      merchantUrl,
      title: offerTitle ? clean(offerTitle) : null,
      seller: seller ? seller.trim() : null,
      price,
      freeShipping: /Ücretsiz Kargo/i.test(block),
      secondHand: /class="outlet"/.test(block),
      updated: updated ? updated.trim() : null,
    });
  }
  return offers.sort((a, b) => a.price - b.price);
}

// title "Trendyol Apple iPhone 15 Pro fiyatı", logo alt "Apple iPhone 15 Pro Trendyol fiyatı":
// mağaza adı title'ın başında, alt'ın sonunda — kesişimden kelime sayısı bulunur.
function guessMerchantWordCount(title, logoAlt) {
  if (!logoAlt) return 1;
  const t = title.replace(/\s+fiyatı\s*$/, "").split(/\s+/);
  const a = logoAlt.replace(/\s+fiyatı\s*$/, "").split(/\s+/);
  for (let n = Math.min(4, t.length); n >= 1; n--) {
    if (a.slice(-n).join(" ") === t.slice(0, n).join(" ")) return n;
  }
  return 1;
}

// Yalnızca uzantı bağlamında çalışır.
export async function fetchHtml(url) {
  const res = await fetch(url, { redirect: "follow", headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}
```

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test`
Expected: epey.test.mjs içindeki 7 test PASS (toplam 8 pass).

- [ ] **Step 6: Commit**

```bash
git add extension/background/epey.js tests/epey.test.mjs tests/fixtures/
git commit -m "feat: Epey parser modülü — arama, skorlama, teklif çıkarma (gerçek HTML fixture'larıyla test)"
```

---

### Task 3: TTL cache

**Files:**
- Create: `extension/background/cache.js`, `tests/cache.test.mjs`

**Interfaces:**
- Consumes: —
- Produces: `createCache({ storage, ttlMs?, now? })` → `{ get(key): Promise<object|null>, set(key, data): Promise<object> }`. `storage` arayüzü chrome.storage.local ile birebir: `get(key)→Promise<{[key]:value}>`, `set(obj)→Promise`, `remove(key)→Promise`. `set` veriye `fetchedAt: now()` damgası basar; `get` süresi geçmiş kaydı siler ve `null` döner.

- [ ] **Step 1: Başarısız testleri yaz** — `tests/cache.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../extension/background/cache.js";

function fakeStorage() {
  const data = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (obj) => Object.assign(data, obj),
    remove: async (key) => delete data[key],
  };
}

test("set fetchedAt damgası basar, get aynı veriyi döner", async () => {
  const storage = fakeStorage();
  let t = 1000;
  const cache = createCache({ storage, ttlMs: 100, now: () => t });
  await cache.set("k", { offers: [1, 2] });
  const hit = await cache.get("k");
  assert.deepEqual(hit.offers, [1, 2]);
  assert.equal(hit.fetchedAt, 1000);
});

test("TTL dolunca get null döner ve kaydı siler", async () => {
  const storage = fakeStorage();
  let t = 1000;
  const cache = createCache({ storage, ttlMs: 100, now: () => t });
  await cache.set("k", { offers: [] });
  t = 1101; // 101 ms geçti > 100 ms TTL
  assert.equal(await cache.get("k"), null);
  assert.equal("k" in storage.data, false);
});

test("olmayan anahtar null döner", async () => {
  const cache = createCache({ storage: fakeStorage() });
  assert.equal(await cache.get("yok"), null);
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module .../extension/background/cache.js`

- [ ] **Step 3: Modülü yaz** — `extension/background/cache.js`

```js
// chrome.storage.local üzerinde TTL'li cache. Storage enjekte edilebilir → Node'da test edilir.
export const DEFAULT_TTL_MS = 45 * 60 * 1000; // spec §5: 45 dakika

export function createCache({ storage, ttlMs = DEFAULT_TTL_MS, now = Date.now }) {
  return {
    async get(key) {
      const wrapped = (await storage.get(key))[key];
      if (!wrapped) return null;
      if (now() - wrapped.fetchedAt > ttlMs) {
        await storage.remove(key);
        return null;
      }
      return wrapped;
    },
    async set(key, data) {
      const wrapped = { ...data, fetchedAt: now() };
      await storage.set({ [key]: wrapped });
      return wrapped;
    },
  };
}
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npm test`
Expected: cache.test.mjs 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/background/cache.js tests/cache.test.mjs
git commit -m "feat: 45 dk TTL'li storage cache"
```

---

### Task 4: Orchestrator (arama → eşleştirme → teklifler, throttle + dedup)

**Files:**
- Create: `extension/background/orchestrator.js`, `tests/orchestrator.test.mjs`

**Interfaces:**
- Consumes: Task 2'den `buildQueries, buildSearchUrl, searchEpeyInHtml, parseOffers, MIN_SCORE`; Task 3'ten cache nesnesi.
- Produces: `createOrchestrator({ cache, fetchHtml, minIntervalMs?, now?, sleep? })` → `{ getComparison(product): Promise<Result> }`.
  - `product = { title: string, sku?: string, approximate?: boolean }`
  - `Result = { ok: true, data: { productName, epeyUrl, offers, approximate, fetchedAt } } | { ok: false }`
  - `normalizeKey(title): string` da export edilir (test ve SW kullanır).

- [ ] **Step 1: Başarısız testleri yaz** — `tests/orchestrator.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOrchestrator, normalizeKey } from "../extension/background/orchestrator.js";
import { createCache } from "../extension/background/cache.js";
import { buildSearchUrl } from "../extension/background/epey.js";

const searchHtml = readFileSync(new URL("./fixtures/epey-search.html", import.meta.url), "utf8");
const productHtml = readFileSync(new URL("./fixtures/epey-product.html", import.meta.url), "utf8");

function fakeStorage() {
  const data = {};
  return {
    get: async (k) => (k in data ? { [k]: data[k] } : {}),
    set: async (o) => Object.assign(data, o),
    remove: async (k) => delete data[k],
  };
}

function makeOrch({ htmlByUrl, calls }) {
  const cache = createCache({ storage: fakeStorage(), now: () => 5000 });
  return createOrchestrator({
    cache,
    fetchHtml: async (url) => {
      calls.push(url);
      const html = htmlByUrl(url);
      if (!html) throw new Error("HTTP 404 — " + url);
      return html;
    },
    minIntervalMs: 0,
    now: () => 5000,
    sleep: async () => {},
  });
}

test("normalizeKey başlığı anahtara çevirir", () => {
  assert.equal(
    normalizeKey("Apple iPhone 15 128 GB (Apple Türkiye Garantili) Siyah"),
    normalizeKey("apple iphone 15 128 gb   SİYAH")
  );
});

test("mutlu yol: arama + ürün sayfası → teklifler, ikinci çağrı cache'ten", async () => {
  const calls = [];
  const orch = makeOrch({
    calls,
    htmlByUrl: (url) => {
      if (url.startsWith("https://www.epey.com/ara/")) return searchHtml;
      if (url.endsWith(".html")) return productHtml;
      return null;
    },
  });
  const product = { title: "Apple iPhone 15 Pro" };
  const r1 = await orch.getComparison(product);
  assert.equal(r1.ok, true);
  assert.equal(r1.data.productName, "Apple iPhone 15 Pro");
  assert.equal(r1.data.offers.length, 9);
  assert.equal(r1.data.epeyUrl, "https://www.epey.com/akilli-telefonlar/apple-iphone-15-pro.html");
  const callsAfterFirst = calls.length; // arama + ürün = 2
  assert.equal(callsAfterFirst, 2);

  const r2 = await orch.getComparison(product);
  assert.equal(r2.ok, true);
  assert.equal(calls.length, callsAfterFirst); // yeni fetch yok — cache
});

test("eşleşme yoksa ok:false ve negatif sonuç da cache'lenir", async () => {
  const calls = [];
  const orch = makeOrch({
    calls,
    htmlByUrl: () => "<html><body>bos sayfa</body></html>",
  });
  const r = await orch.getComparison({ title: "hiç alakasız bir ürün xyz" });
  assert.equal(r.ok, false);
  const before = calls.length;
  const r2 = await orch.getComparison({ title: "hiç alakasız bir ürün xyz" });
  assert.equal(r2.ok, false);
  assert.equal(calls.length, before); // negatif cache çalıştı
});

test("aynı ürün için eşzamanlı istekler tek fetch zinciri kullanır (dedup)", async () => {
  const calls = [];
  const orch = makeOrch({
    calls,
    htmlByUrl: (url) => (url.includes("/ara/") ? searchHtml : productHtml),
  });
  const p = { title: "Apple iPhone 15 Pro" };
  const [a, b] = await Promise.all([orch.getComparison(p), orch.getComparison(p)]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(calls.length, 2); // 4 değil
});

test("fetch hatasında ok:false döner, exception sızmaz", async () => {
  const orch = makeOrch({ calls: [], htmlByUrl: () => null });
  const r = await orch.getComparison({ title: "Apple iPhone 15 Pro" });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module .../extension/background/orchestrator.js`

- [ ] **Step 3: Modülü yaz** — `extension/background/orchestrator.js`

```js
// Ürün → Epey karşılaştırması akışı: cache → sorgu(lar) → eşleştir → teklifler → cache.
// Tüm dış bağımlılıklar enjekte edilir; Node'da fixture'larla test edilir.
import { buildQueries, buildSearchUrl, searchEpeyInHtml, parseOffers, MIN_SCORE } from "./epey.js";

export function normalizeKey(title) {
  return (
    "fk:" +
    title
      .toLocaleLowerCase("tr")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9çğıöşü]+/g, " ")
      .trim()
      .replace(/\s+/g, "-")
  );
}

export function createOrchestrator({ cache, fetchHtml, minIntervalMs = 1500, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let lastFetchAt = 0;
  const inflight = new Map();

  // spec §8: Epey'e istekler arası makul gecikme
  async function politeFetch(url) {
    const wait = lastFetchAt + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastFetchAt = now();
    return fetchHtml(url);
  }

  async function lookup(product) {
    const queries = buildQueries(product.title);
    let best = null;
    let usedFallback = false;
    for (let i = 0; i < queries.length; i++) {
      const html = await politeFetch(buildSearchUrl(queries[i]));
      const found = searchEpeyInHtml(queries[i], html);
      if (found && found.best.score >= MIN_SCORE) {
        best = found.best;
        usedFallback = i > 0;
        break;
      }
    }
    if (!best) return { ok: false };
    const offers = parseOffers(await politeFetch(best.url));
    if (offers.length === 0) return { ok: false };
    return {
      ok: true,
      data: {
        productName: best.name,
        epeyUrl: best.url,
        offers,
        approximate: Boolean(product.approximate) || usedFallback || best.score < 0.8,
      },
    };
  }

  return {
    async getComparison(product) {
      const key = normalizeKey(product.title);
      const cached = await cache.get(key);
      if (cached) {
        return cached.ok ? { ok: true, data: { ...cached.data, fetchedAt: cached.fetchedAt } } : { ok: false };
      }
      if (!inflight.has(key)) {
        const p = lookup(product)
          .catch(() => ({ ok: false })) // sessiz başarısızlık (spec §7)
          .then(async (result) => {
            const stored = await cache.set(key, result); // negatif sonuç da cache'lenir
            return result.ok ? { ok: true, data: { ...result.data, fetchedAt: stored.fetchedAt } } : { ok: false };
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      return inflight.get(key);
    },
  };
}
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npm test`
Expected: orchestrator.test.mjs 5 test PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/background/orchestrator.js tests/orchestrator.test.mjs
git commit -m "feat: orchestrator — sorgu fallback'i, throttle, in-flight dedup, negatif cache"
```

---

### Task 5: manifest.json + service worker + manuel smoke testi

**Files:**
- Create: `extension/manifest.json`, `extension/background/service-worker.js`, `extension/content/loader.js` (boş main.js import'u için stub değil — gerçek loader; main.js Task 9'da gelir, o yüzden loader var-yok kontrolü yapar)

**Interfaces:**
- Consumes: Task 3-4 modülleri.
- Produces: `chrome.runtime.sendMessage({type:"FK_GET_OFFERS", product:{title, sku?, approximate?}})` → Task 4'teki `Result` + `data.fetchedAt`. Content script'ler bu mesaj sözleşmesini kullanır.

- [ ] **Step 1: manifest.json yaz** — `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Fiyat Karşılaştırma — Epey",
  "version": "0.1.0",
  "description": "Ürün sayfasında aynı ürünün diğer mağazalardaki fiyatlarını Epey verisiyle gösterir. Hiçbir kullanıcı verisi toplamaz.",
  "default_locale": null,
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.hepsiburada.com/*",
        "https://www.trendyol.com/*",
        "https://www.amazon.com.tr/*",
        "https://www.n11.com/urun/*",
        "https://www.teknosa.com/*",
        "https://www.vatanbilgisayar.com/*"
      ],
      "js": ["content/loader.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["content/*.js", "content/adapters/*.js"],
      "matches": [
        "https://www.hepsiburada.com/*",
        "https://www.trendyol.com/*",
        "https://www.amazon.com.tr/*",
        "https://www.n11.com/*",
        "https://www.teknosa.com/*",
        "https://www.vatanbilgisayar.com/*"
      ]
    }
  ],
  "host_permissions": ["https://www.epey.com/*"],
  "permissions": ["storage"]
}
```

Not: `"default_locale": null` GEÇERSİZDİR — bu satırı manifest'e YAZMA (üstteki blok yazım hatası içermesin diye buradan uyarılıyor; final dosyada `default_locale` anahtarı hiç olmayacak).

- [ ] **Step 2: service-worker.js yaz** — `extension/background/service-worker.js`

```js
// İnce katman: chrome API'lerini saf modüllere bağlar.
import { createCache } from "./cache.js";
import { createOrchestrator } from "./orchestrator.js";
import { fetchHtml } from "./epey.js";

const cache = createCache({
  storage: {
    get: (key) => chrome.storage.local.get(key),
    set: (obj) => chrome.storage.local.set(obj),
    remove: (key) => chrome.storage.local.remove(key),
  },
});

const orchestrator = createOrchestrator({ cache, fetchHtml });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "FK_GET_OFFERS" && msg.product && typeof msg.product.title === "string") {
    orchestrator
      .getComparison(msg.product)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false }));
    return true; // async cevap
  }
});
```

- [ ] **Step 3: loader.js yaz** — `extension/content/loader.js`

```js
// MV3 content script'leri ES modülü olamaz; asıl kod dinamik import ile yüklenir.
// Herhangi bir hata sessizce yutulur (spec §7 — kullanıcı sayfası asla bozulmaz).
(async () => {
  try {
    await import(chrome.runtime.getURL("content/main.js"));
  } catch {
    /* sessiz */
  }
})();
```

- [ ] **Step 4: Manuel smoke testi**

1. `chrome://extensions` → Geliştirici modu → "Paketlenmemiş öğe yükle" → `extension/` klasörü.
2. Uzantı kartında "service worker" bağlantısına tıkla (DevTools açılır) ve konsola yapıştır:

```js
chrome.runtime.sendMessage === undefined // SW konsolundayız, doğrudan test edelim:
```

SW konsolunda mesaj handler'ı dıştan tetiklenemez; bunun yerine şunu çalıştır:

```js
import("./orchestrator.js").then(async ({ createOrchestrator }) => {
  const { createCache } = await import("./cache.js");
  const { fetchHtml } = await import("./epey.js");
  const orch = createOrchestrator({
    cache: createCache({ storage: { get: async () => ({}), set: async () => {}, remove: async () => {} } }),
    fetchHtml,
  });
  console.log(await orch.getComparison({ title: "Apple iPhone 15 Pro" }));
});
```

Expected: `{ ok: true, data: { productName: "Apple iPhone 15 Pro", offers: [...], epeyUrl: "https://www.epey.com/...", ... } }` — canlı Epey'den gerçek teklifler. (`ok:false` dönerse epey.com'a tarayıcıdan erişimi ve SW konsolundaki ağ hatasını kontrol et.)

3. Hedef sitelerden birinde (örn. hepsiburada.com) herhangi bir sayfa aç; sayfa konsolunda kırmızı uzantı hatası OLMAMALI (main.js henüz yok — loader sessizce yutar).

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/background/service-worker.js extension/content/loader.js
git commit -m "feat: MV3 manifest, service worker mesaj katmanı, content loader"
```
