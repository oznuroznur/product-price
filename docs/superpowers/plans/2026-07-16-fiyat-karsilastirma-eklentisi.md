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

---

### Task 6: DOM yardımcıları + adapter grubu A (Hepsiburada, Trendyol, Amazon TR)

**Files:**
- Create: `extension/content/adapters/dom-utils.js`, `extension/content/adapters/hepsiburada.js`, `extension/content/adapters/trendyol.js`, `extension/content/adapters/amazon.js`
- Create: `tests/adapters.test.mjs`, `tests/fixtures/adapters/hepsiburada.html`, `tests/fixtures/adapters/trendyol.html`, `tests/fixtures/adapters/amazon.html`

**Interfaces:**
- Consumes: —
- Produces: Adapter arayüzü (tüm adapter'lar aynı): `{ hosts: string[], extractProduct(document, location): { title: string, sku: string|null, approximate: boolean, titleEl: Element } | null }`. `location` yalnızca `pathname` alanı kullanılan URL benzeri nesne (testte `new URL(...)`). Ürün sayfası değilse veya başlık bulunamazsa `null`.
- dom-utils: `cleanText(s): string`, `decodeHtmlEntities(s): string`, `jsonLdProducts(document): object[]`.

- [ ] **Step 1: Fixture'ları yaz** (2026-07-16 canlı doğrulamasındaki gerçek yapılara göre)

`tests/fixtures/adapters/hepsiburada.html` — HB'de Product JSON-LD YOK, h1 + URL SKU'su kullanılır:

```html
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">{"@type":"WebPage","name":"Apple iPhone 15 128 GB Siyah"}</script>
</head><body>
<h1 id="product-name">Apple iPhone 15 128 GB Siyah</h1>
</body></html>
```

`tests/fixtures/adapters/trendyol.html` — temiz Product JSON-LD var:

```html
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">{"@type":"Product","name":"Apple iPhone 15 128 GB Siyah","sku":"762254878","brand":{"@type":"Brand","name":"Apple"}}</script>
</head><body>
<h1 class="pr-new-br">Apple iPhone 15 128 GB Siyah - Fiyatı, Yorumları</h1>
</body></html>
```

`tests/fixtures/adapters/amazon.html` — JSON-LD yok, `#productTitle` var:

```html
<!DOCTYPE html>
<html><body>
<div id="title"><span id="productTitle">
        Apple iPhone 15 (128 GB) - Siyah
      </span></div>
</body></html>
```

- [ ] **Step 2: Başarısız testleri yaz** — `tests/adapters.test.mjs`

```js
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
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module .../adapters/dom-utils.js`

- [ ] **Step 4: dom-utils.js yaz** — `extension/content/adapters/dom-utils.js`

```js
export function cleanText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(s) {
  return (s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Sayfadaki tüm JSON-LD bloklarından @type: Product olanları toplar (@graph dahil).
export function jsonLdProducts(document) {
  const out = [];
  const collect = (item) => {
    if (!item || typeof item !== "object") return;
    const types = [].concat(item["@type"] || []);
    if (types.includes("Product")) out.push(item);
    if (Array.isArray(item["@graph"])) item["@graph"].forEach(collect);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      (Array.isArray(parsed) ? parsed : [parsed]).forEach(collect);
    } catch {
      /* bozuk JSON-LD yok sayılır */
    }
  }
  return out;
}
```

- [ ] **Step 5: Üç adapter'ı yaz**

`extension/content/adapters/hepsiburada.js`:

```js
import { cleanText } from "./dom-utils.js";

// Hepsiburada'da Product JSON-LD yok (yalnız WebPage+Review — 2026-07-16 doğrulandı).
// Sinyal: h1 metni + URL sonundaki "-p-<SKU>".
export const hepsiburada = {
  hosts: ["hepsiburada.com"],
  extractProduct(document, location) {
    const sku = (location.pathname.match(/-p-([A-Za-z0-9]+)$/) || [])[1] || null;
    if (!sku) return null;
    const h1 = document.querySelector("h1");
    const title = h1 && cleanText(h1.textContent);
    if (!title) return null;
    return { title, sku, approximate: false, titleEl: h1 };
  },
};
```

`extension/content/adapters/trendyol.js`:

```js
import { cleanText, jsonLdProducts } from "./dom-utils.js";

// Trendyol'da temiz Product JSON-LD var (name, sku — 2026-07-16 doğrulandı).
export const trendyol = {
  hosts: ["trendyol.com"],
  extractProduct(document, location) {
    if (!/-p-\d+/.test(location.pathname)) return null;
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const ld = jsonLdProducts(document)[0];
    const title = cleanText((ld && ld.name) || h1.textContent);
    if (!title) return null;
    const sku = (ld && ld.sku && String(ld.sku)) || (location.pathname.match(/-p-(\d+)/) || [])[1] || null;
    return { title, sku, approximate: !ld, titleEl: h1 };
  },
};
```

`extension/content/adapters/amazon.js`:

```js
import { cleanText } from "./dom-utils.js";

// Amazon TR'de JSON-LD yok (2026-07-16 doğrulandı). Sinyal: #productTitle + /dp/<ASIN>.
export const amazon = {
  hosts: ["amazon.com.tr"],
  extractProduct(document, location) {
    const asin = (location.pathname.match(/\/dp\/([A-Z0-9]{10})/i) || [])[1] || null;
    if (!asin) return null;
    const titleSpan = document.querySelector("#productTitle") || document.querySelector("h1");
    const title = titleSpan && cleanText(titleSpan.textContent);
    if (!title) return null;
    const titleEl = document.querySelector("#title") || titleSpan;
    return { title, sku: asin, approximate: false, titleEl };
  },
};
```

- [ ] **Step 6: Testleri çalıştır**

Run: `npm test`
Expected: adapters.test.mjs 8 test PASS.

- [ ] **Step 7: Commit**

```bash
git add extension/content/adapters/ tests/adapters.test.mjs tests/fixtures/adapters/
git commit -m "feat: DOM yardımcıları + Hepsiburada/Trendyol/Amazon adapter'ları"
```

---

### Task 7: Adapter grubu B (n11, Teknosa, Vatan) + adapter kaydı

**Files:**
- Create: `extension/content/adapters/n11.js`, `extension/content/adapters/teknosa.js`, `extension/content/adapters/vatan.js`, `extension/content/adapters/index.js`
- Create: `tests/fixtures/adapters/n11.html`, `tests/fixtures/adapters/teknosa.html`, `tests/fixtures/adapters/vatan.html`
- Modify: `tests/adapters.test.mjs` (testler eklenir)

**Interfaces:**
- Consumes: Task 6'daki adapter arayüzü ve dom-utils.
- Produces: `adapterFor(hostname: string): Adapter | null` (index.js) — content/main.js bunu kullanır.

- [ ] **Step 1: Fixture'ları yaz**

`tests/fixtures/adapters/n11.html` — JSON-LD sku sağlam, `name` SEO kirli → başlık h1'den:

```html
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">{"@type":"Product","name":"Apple iPhone 15 128 GB (Apple Türkiye Garantili) Siyah 128 GB Fiyatları ve Özellikleri","sku":"127272069922","brand":"Apple"}</script>
</head><body>
<h1 class="proName">Apple iPhone 15 128 GB (Apple Türkiye Garantili)</h1>
</body></html>
```

`tests/fixtures/adapters/teknosa.html` — JSON-LD yok; h1 içinde satır sonu/tab kirliliği (gerçek sayfadaki gibi):

```html
<!DOCTYPE html>
<html><body>
<h1>Apple
					 iPhone 17 256GB Beyaz Akıllı Telefon</h1>
</body></html>
```

`tests/fixtures/adapters/vatan.html` — JSON-LD var ama `name` HTML entity'li (script içi entity decode edilmez):

```html
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"iPhone 17 256 GB Ak&#x131;ll&#x131; Telefon Siyah","mpn":"MG6J4TU/A","sku":"153221","brand":"APPLE"}</script>
</head><body>
<h1>iPhone 17 256 GB Akıllı Telefon Siyah</h1>
</body></html>
```

- [ ] **Step 2: Başarısız testleri ekle** — `tests/adapters.test.mjs` dosyasının sonuna:

```js
import { n11 } from "../extension/content/adapters/n11.js";
import { teknosa } from "../extension/content/adapters/teknosa.js";
import { vatan } from "../extension/content/adapters/vatan.js";
import { adapterFor } from "../extension/content/adapters/index.js";

test("n11: başlık h1'den (SEO'lu JSON-LD name'den değil), sku JSON-LD'den", () => {
  const { document, location } = load(
    "n11.html",
    "https://www.n11.com/urun/apple-iphone-15-128-gb-apple-turkiye-garantili-43821353"
  );
  const p = n11.extractProduct(document, location);
  assert.equal(p.title, "Apple iPhone 15 128 GB (Apple Türkiye Garantili)");
  assert.equal(p.sku, "127272069922");
});

test("n11: /urun/ dışı sayfada null", () => {
  const { document, location } = load("n11.html", "https://www.n11.com/arama?q=iphone");
  assert.equal(n11.extractProduct(document, location), null);
});

test("teknosa: h1'deki whitespace kirliliği temizlenir, sku URL'den", () => {
  const { document, location } = load(
    "teknosa.html",
    "https://www.teknosa.com/apple-iphone-17-256gb-beyaz-akilli-telefon-p-100000058783"
  );
  const p = teknosa.extractProduct(document, location);
  assert.equal(p.title, "Apple iPhone 17 256GB Beyaz Akıllı Telefon");
  assert.equal(p.sku, "100000058783");
});

test("vatan: JSON-LD name'deki HTML entity'ler çözülür", () => {
  const { document, location } = load(
    "vatan.html",
    "https://www.vatanbilgisayar.com/iphone-17-akilli-telefon.html"
  );
  const p = vatan.extractProduct(document, location);
  assert.equal(p.title, "iPhone 17 256 GB Akıllı Telefon Siyah");
  assert.equal(p.sku, "153221");
  assert.equal(p.approximate, false);
});

test("adapterFor hostname'i doğru adapter'a eşler", () => {
  assert.equal(adapterFor("www.hepsiburada.com"), hepsiburada);
  assert.equal(adapterFor("www.trendyol.com"), trendyol);
  assert.equal(adapterFor("www.amazon.com.tr"), amazon);
  assert.equal(adapterFor("www.n11.com"), n11);
  assert.equal(adapterFor("www.teknosa.com"), teknosa);
  assert.equal(adapterFor("www.vatanbilgisayar.com"), vatan);
  assert.equal(adapterFor("www.baskasite.com"), null);
});
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module .../adapters/n11.js`

- [ ] **Step 4: Üç adapter + index'i yaz**

`extension/content/adapters/n11.js`:

```js
import { cleanText, jsonLdProducts } from "./dom-utils.js";

// n11: JSON-LD sku sağlam ama name SEO metni içeriyor ("... Fiyatları ve Özellikleri"
// — 2026-07-16 doğrulandı). Başlık h1'den alınır.
export const n11 = {
  hosts: ["n11.com"],
  extractProduct(document, location) {
    if (!location.pathname.startsWith("/urun/")) return null;
    const h1 = document.querySelector("h1");
    const title = h1 && cleanText(h1.textContent);
    if (!title) return null;
    const ld = jsonLdProducts(document)[0];
    const sku = (ld && ld.sku && String(ld.sku)) || (location.pathname.match(/-(\d+)$/) || [])[1] || null;
    return { title, sku, approximate: false, titleEl: h1 };
  },
};
```

`extension/content/adapters/teknosa.js`:

```js
import { cleanText } from "./dom-utils.js";

// Teknosa'da Product JSON-LD yok (2026-07-16 doğrulandı). h1 + URL "-p-<sayı>".
export const teknosa = {
  hosts: ["teknosa.com"],
  extractProduct(document, location) {
    const sku = (location.pathname.match(/-p-(\d+)$/) || [])[1] || null;
    if (!sku) return null;
    const h1 = document.querySelector("h1");
    const title = h1 && cleanText(h1.textContent);
    if (!title) return null;
    return { title, sku, approximate: false, titleEl: h1 };
  },
};
```

`extension/content/adapters/vatan.js`:

```js
import { cleanText, decodeHtmlEntities, jsonLdProducts } from "./dom-utils.js";

// Vatan: tam Product JSON-LD (name+mpn+sku) ama name HTML entity'li gelir
// (2026-07-16 doğrulandı). JSON-LD yoksa ürün sayfası değildir → null.
export const vatan = {
  hosts: ["vatanbilgisayar.com"],
  extractProduct(document, location) {
    if (!location.pathname.endsWith(".html")) return null;
    const ld = jsonLdProducts(document)[0];
    if (!ld || !ld.name) return null;
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const title = cleanText(decodeHtmlEntities(ld.name));
    if (!title) return null;
    const sku = (ld.sku && String(ld.sku)) || (ld.mpn && String(ld.mpn)) || null;
    return { title, sku, approximate: false, titleEl: h1 };
  },
};
```

`extension/content/adapters/index.js`:

```js
import { hepsiburada } from "./hepsiburada.js";
import { trendyol } from "./trendyol.js";
import { amazon } from "./amazon.js";
import { n11 } from "./n11.js";
import { teknosa } from "./teknosa.js";
import { vatan } from "./vatan.js";

const ADAPTERS = [hepsiburada, trendyol, amazon, n11, teknosa, vatan];

export function adapterFor(hostname) {
  const h = (hostname || "").replace(/^www\./, "");
  return ADAPTERS.find((a) => a.hosts.some((host) => h === host || h.endsWith("." + host))) || null;
}
```

- [ ] **Step 5: Testleri çalıştır**

Run: `npm test`
Expected: adapters.test.mjs 13 test PASS (8 + 5 yeni).

- [ ] **Step 6: Commit**

```bash
git add extension/content/adapters/ tests/adapters.test.mjs tests/fixtures/adapters/
git commit -m "feat: n11/Teknosa/Vatan adapter'ları + hostname kaydı"
```

---

### Task 8: format.js — fiyat/zaman formatı, gruplama, kart HTML'i (saf)

**Files:**
- Create: `extension/content/format.js`, `tests/format.test.mjs`

**Interfaces:**
- Consumes: Task 2'deki `Offer` şekli (`{merchant, merchantDomain, seller, price, secondHand, freeShipping, updated, merchantUrl}`).
- Produces (badge.js kullanır):
  - `formatTL(n: number): string` — "67.953,90 TL"
  - `updatedText(fetchedAt: number, now?: number): string` — "az önce güncellendi" / "X dakika önce güncellendi" / "X saat önce güncellendi" (spec §7 metni)
  - `groupOffers(offers): { newOffers, usedOffers, siteCount, cheapest }` — siteCount = benzersiz `merchantDomain` sayısı; `cheapest` = en ucuz sıfır teklif (sıfır yoksa en ucuz 2.el)
  - `escapeHtml(s): string`
  - `renderCard(data, groups, now?): string` — kartın iç HTML'i (tamamı escape'li)

- [ ] **Step 1: Başarısız testleri yaz** — `tests/format.test.mjs`

```js
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
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module .../extension/content/format.js`

- [ ] **Step 3: Modülü yaz** — `extension/content/format.js`

```js
// Saf sunum yardımcıları — DOM'a dokunmaz, Node'da test edilir.

export function formatTL(n) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
}

export function updatedText(fetchedAt, now = Date.now()) {
  const dk = Math.floor((now - fetchedAt) / 60000);
  if (dk < 1) return "az önce güncellendi";
  if (dk < 60) return `${dk} dakika önce güncellendi`;
  return `${Math.floor(dk / 60)} saat önce güncellendi`;
}

// Teklifleri sıfır/2.el olarak ayırır. "N mağazada" sayısı benzersiz mağaza
// domain'i üzerinden (aynı mağazanın farklı satıcıları tek sayılır — spec §7).
// "En ucuz" vurgusu sıfır ürünler arasından seçilir.
export function groupOffers(offers) {
  const newOffers = offers.filter((o) => !o.secondHand);
  const usedOffers = offers.filter((o) => o.secondHand);
  const domains = new Set(offers.map((o) => o.merchantDomain).filter(Boolean));
  return {
    newOffers,
    usedOffers,
    siteCount: domains.size,
    cheapest: newOffers[0] || usedOffers[0] || null,
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function offerRow(o, isBest) {
  const ad = o.seller && o.seller !== o.merchant ? `${o.merchant} · ${o.seller}` : o.merchant;
  return `<li class="row${isBest ? " best" : ""}">
    <a href="${escapeHtml(o.merchantUrl)}" target="_blank" rel="noopener noreferrer">
      <span class="m">${escapeHtml(ad)}</span>
      <span class="p">${escapeHtml(formatTL(o.price))}</span>
    </a>
  </li>`;
}

const MAX_ROWS = 8;

export function renderCard(data, groups, now = Date.now()) {
  const yeni = groups.newOffers.slice(0, MAX_ROWS).map((o) => offerRow(o, o === groups.cheapest)).join("");
  const ikinciEl = groups.usedOffers
    .slice(0, 3)
    .map((o) => offerRow(o, groups.newOffers.length === 0 && o === groups.cheapest))
    .join("");
  return `
    <div class="hdr">
      <a href="${escapeHtml(data.epeyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.productName)}</a>
      ${data.approximate ? '<span class="approx" title="Yaklaşık eşleşme — varyant birebir olmayabilir">≈ yaklaşık eşleşme</span>' : ""}
    </div>
    ${yeni ? `<ul class="list">${yeni}</ul>` : ""}
    ${ikinciEl ? `<div class="sub">2. el / Outlet</div><ul class="list">${ikinciEl}</ul>` : ""}
    <div class="foot">
      <span>Epey verisiyle · ${escapeHtml(updatedText(data.fetchedAt, now))}</span>
      <a href="${escapeHtml(data.epeyUrl)}" target="_blank" rel="noopener noreferrer">Tüm fiyatlar →</a>
    </div>`;
}
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npm test`
Expected: format.test.mjs 6 test PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/content/format.js tests/format.test.mjs
git commit -m "feat: sunum yardımcıları — TL formatı, gruplama, escape'li kart HTML'i"
```

---

### Task 9: Rozet + kart UI (badge.js, main.js) ve manuel smoke

**Files:**
- Create: `extension/content/badge.js`, `extension/content/main.js`

**Interfaces:**
- Consumes: Task 7 `adapterFor`; Task 8 `renderCard, groupOffers`; Task 5 mesaj sözleşmesi (`FK_GET_OFFERS`).
- Produces: `mountBadge(titleEl, data)`, `removeBadge()`. UI dışa hiçbir şey sızdırmaz (Shadow DOM, closed).

- [ ] **Step 1: badge.js yaz** — `extension/content/badge.js`

```js
import { groupOffers, renderCard } from "./format.js";

const HOST_ID = "fk-epey-badge-host";

const CSS = `
  :host { all: initial; }
  .badge {
    all: initial; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
    font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0b57d0; background: #e8f0fe; border: 1px solid #c2d7fe;
    border-radius: 999px; padding: 5px 10px; white-space: nowrap;
  }
  .badge:hover { background: #d8e5fd; }
  .card {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 2147483647;
    min-width: 300px; max-width: 380px; max-height: 420px; overflow-y: auto;
    background: #fff; color: #1a1a1a; border: 1px solid #dadce0; border-radius: 10px;
    box-shadow: 0 4px 18px rgba(0,0,0,.15); padding: 10px 12px;
    font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .hdr { font-weight: 700; margin-bottom: 6px; }
  .hdr a { color: inherit; text-decoration: none; }
  .approx { display: inline-block; margin-left: 6px; font-weight: 400; font-size: 11px; color: #b06000; }
  .list { list-style: none; margin: 0; padding: 0; }
  .row a { display: flex; justify-content: space-between; gap: 12px; padding: 5px 6px;
           color: inherit; text-decoration: none; border-radius: 6px; }
  .row a:hover { background: #f1f3f4; }
  .row .p { font-variant-numeric: tabular-nums; font-weight: 600; }
  .row.best a { background: #e6f4ea; }
  .row.best .p { color: #137333; }
  .sub { margin: 8px 0 2px; font-size: 11px; font-weight: 700; color: #5f6368; text-transform: uppercase; }
  .foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px;
          padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #5f6368; }
  .foot a { color: #0b57d0; text-decoration: none; }
`;

export function removeBadge() {
  const eski = document.getElementById(HOST_ID);
  if (eski) eski.remove();
}

export function mountBadge(titleEl, data) {
  removeBadge();
  const groups = groupOffers(data.offers);
  if (!groups.cheapest || groups.siteCount === 0) return; // sessiz (spec §7)

  const host = document.createElement("span");
  host.id = HOST_ID;
  host.style.cssText = "display:inline-block;position:relative;margin-left:8px;vertical-align:middle;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const badge = document.createElement("button");
  badge.className = "badge";
  badge.type = "button";
  badge.textContent = `${groups.siteCount} mağazada karşılaştır${data.approximate ? " ≈" : ""}`;
  if (data.approximate) badge.title = "Yaklaşık eşleşme — varyant birebir olmayabilir";
  shadow.appendChild(badge);

  const card = document.createElement("div");
  card.className = "card";
  card.hidden = true;
  card.innerHTML = renderCard(data, groups); // içerik format.js'te tamamen escape'lenir
  shadow.appendChild(card);

  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    card.hidden = !card.hidden;
  });
  card.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => {
    card.hidden = true;
  });

  titleEl.insertAdjacentElement("afterend", host);
}
```

- [ ] **Step 2: main.js yaz** — `extension/content/main.js`

```js
import { adapterFor } from "./adapters/index.js";
import { mountBadge, removeBadge } from "./badge.js";

const adapter = adapterFor(location.hostname);
let requestSeq = 0;

function run() {
  removeBadge();
  if (!adapter) return;
  let product;
  try {
    product = adapter.extractProduct(document, location);
  } catch {
    return; // sessiz (spec §7)
  }
  if (!product || !product.titleEl || !product.titleEl.isConnected) return;

  const seq = ++requestSeq;
  chrome.runtime.sendMessage(
    {
      type: "FK_GET_OFFERS",
      product: { title: product.title, sku: product.sku, approximate: product.approximate },
    },
    (resp) => {
      if (chrome.runtime.lastError) return;         // SW yok/uyandırılamadı → sessiz
      if (seq !== requestSeq) return;               // bu arada sayfa değişti
      if (!resp || !resp.ok || !resp.data || !Array.isArray(resp.data.offers) || resp.data.offers.length === 0) return;
      if (!product.titleEl.isConnected) return;     // başlık DOM'dan gitmiş
      try {
        mountBadge(product.titleEl, resp.data);
      } catch {
        /* sessiz */
      }
    }
  );
}

// SPA gezinmeleri (Trendyol, n11 ürün→ürün geçişleri): URL'i hafifçe izle.
let lastHref = location.href;
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    requestSeq++; // bekleyen cevapları geçersiz kıl
    removeBadge();
    setTimeout(run, 1200); // yeni sayfanın DOM'u otursun
  }
}, 1000);

run();
```

- [ ] **Step 3: Tüm testlerin hâlâ geçtiğini doğrula**

Run: `npm test`
Expected: tüm testler PASS (UI dosyaları test kapsamı dışında ama import zinciri kırılmamalı — adapters/format testleri geçiyor olmalı).

- [ ] **Step 4: Manuel smoke (2 sitede)**

1. `chrome://extensions` → uzantıda "Yeniden yükle".
2. `https://www.hepsiburada.com` → herhangi bir ürün sayfası aç.
   - Expected: başlığın yanında ≤4 sn içinde "N mağazada karşılaştır" rozeti; tıklayınca kart; en ucuz sıfır teklif yeşil vurgulu; altta "Epey verisiyle · az önce güncellendi"; sayfa konsolunda uzantı hatası yok.
3. Sayfayı yenile.
   - Expected: rozet bu kez ~anında (cache).
4. Aynısını bir Trendyol ürün sayfasında doğrula (JSON-LD'li yol).
5. Epey'de olmayacak bir üründe (örn. çok niş bir aksesuar) rozetin HİÇ görünmediğini ve konsolda hata olmadığını doğrula.

- [ ] **Step 5: Commit**

```bash
git add extension/content/badge.js extension/content/main.js
git commit -m "feat: rozet + kart UI (Shadow DOM), SPA URL izleme, sessiz hata yolu"
```

---

### Task 10: 6 sitede uçtan uca doğrulama

**Files:** — (kod yok; bulgular `docs/e2e-notlar.md`'ye yazılır)

**Interfaces:**
- Consumes: tamamlanmış uzantı.
- Produces: her site için GEÇTİ/KALDI kaydı; KALDI varsa ilgili adapter task'ına dönülür.

- [ ] **Step 1: Test matrisini çalıştır**

Uzantıyı yeniden yükle; her sitede bir **telefon** ürün sayfası aç (Epey kapsamı en güçlü kategori) ve tabloyu doldur:

| # | Site | Kontroller |
|---|---|---|
| 1 | hepsiburada.com | rozet ≤4 sn; kart açılır/kapanır; fiyatlar makul; en ucuz vurgusu sıfır üründe |
| 2 | trendyol.com | aynı + ürün→ürün SPA geçişinde rozet yenileniyor |
| 3 | amazon.com.tr | aynı + başlık `#productTitle`'dan doğru alınmış |
| 4 | n11.com | aynı + `/urun/` dışında (arama, kategori) rozet YOK |
| 5 | teknosa.com | aynı + başlıkta whitespace artığı yok |
| 6 | vatanbilgisayar.com | aynı + Türkçe karakterler doğru (entity çözümü) |

Ortak negatif kontroller:
- Hedef sitelerin ana sayfa/kategori/arama sayfalarında rozet asla görünmez.
- Sayfa konsolunda ve SW konsolunda uzantı kaynaklı hata yok.
- `chrome://extensions` → uzantı detayında "Hatalar" bölümü boş.
- Aynı ürüne 45 dk içinde tekrar girildiğinde SW ağ sekmesinde yeni Epey isteği YOK (cache).
- Yanlış model eşleşmesi kontrolü: bir iPhone 15 sayfasında karttaki ürün adının "iPhone 15" ailesinden olduğu (12/11 değil) gözle doğrulanır.

- [ ] **Step 2: Bulguları kaydet ve commit**

`docs/e2e-notlar.md`'ye tarih + tablo sonuçları + görülen tuhaflıklar yazılır.

```bash
git add docs/e2e-notlar.md
git commit -m "test: 6 site uçtan uca doğrulama notları"
```

---

### Task 11: README + Gizlilik Politikası

**Files:**
- Create: `README.md` (kök), `docs/PRIVACY.md`

**Interfaces:** — (metin; spec §1-2'nin zorunlu kıldığı içerik)

- [ ] **Step 1: README.md yaz** — kök dizine:

```markdown
# Fiyat Karşılaştırma — Epey

Türkiye'deki büyük e-ticaret sitelerinde gezerken, baktığınız ürünün diğer
mağazalardaki fiyatlarını ürün başlığının yanında küçük bir rozetle gösteren
Chrome uzantısı. Veriler [Epey.com](https://www.epey.com) üzerinden okunur.

## Desteklenen siteler

Hepsiburada · Trendyol · Amazon TR · n11 · Teknosa · Vatan Bilgisayar

## Nasıl çalışır?

1. Bir ürün sayfası açtığınızda uzantı, sayfadaki yapılandırılmış veriden
   (JSON-LD) veya başlıktan ürünü tanır.
2. Arka planda Epey'de arama yapıp en iyi eşleşen ürünün mağaza/fiyat
   listesini çeker (sonuçlar 45 dakika önbelleklenir).
3. Başlığın yanında "N mağazada karşılaştır" rozeti belirir; tıklayınca
   mağaza-fiyat listesi açılır, en ucuz sıfır ürün vurgulanır, 2. el/outlet
   teklifler ayrı gösterilir.

Eşleşme birebir değilse rozette "≈" işareti görürsünüz — bu, gösterilen
fiyatların ürünün farklı bir varyantına (kapasite/renk) ait olabileceği
anlamına gelir.

## Önemli: veri kaynağı hakkında

Epey **resmi bir API sağlamaz**; bu uzantı Epey'in herkese açık HTML
sayfalarını okuyarak çalışır. Epey sayfa yapısını değiştirirse uzantı
**herhangi bir anda çalışmayı durdurabilir**. Böyle bir durumda rozet
sessizce görünmez olur — sayfanızı asla bozmaz.

Bu araç Epey ile bağlantılı/onaylı değildir. Epey'e gereksiz yük
bindirmemek için istekler seyreltilir (throttle) ve önbelleklenir.

## Gizlilik

Hiçbir kullanıcı verisi toplanmaz, hiçbir analytics/izleme kodu yoktur.
Ayrıntılar: [docs/PRIVACY.md](docs/PRIVACY.md)

## Geliştirme

```bash
npm install
npm test          # parser/adapter/cache testleri (Node, ağ erişimi gerektirmez)
```

Uzantıyı denemek için: `chrome://extensions` → Geliştirici modu →
"Paketlenmemiş öğe yükle" → `extension/` klasörü.

Not: Epey, tarayıcı dışı istemcilere (ör. Node/curl) Cloudflare doğrulaması
gösterir; bu yüzden canlı istekler yalnızca uzantı bağlamında çalışır,
testler `tests/fixtures/` altındaki kayıtlı gerçek HTML ile koşar.
```

- [ ] **Step 2: docs/PRIVACY.md yaz**

```markdown
# Gizlilik Politikası — Fiyat Karşılaştırma (Epey)

Son güncelleme: 2026-07-16

## Toplanan veri: YOK

Bu uzantı hiçbir kişisel veri, gezinme geçmişi, tanımlayıcı veya istatistik
**toplamaz, saklamaz, iletmez**. Analytics/izleme kodu içermez. Uzantının
geliştiricisine hiçbir veri gönderilmez.

## Uzantı ne yapar?

- Yalnızca desteklenen alışveriş sitelerinin **ürün sayfalarında**, sayfada
  zaten görünen ürün başlığını okur.
- Bu başlığı arama sorgusu olarak **yalnızca epey.com'a** gönderir (ör.
  "apple iphone 15 128gb"). Bu istek, tarayıcınızın Epey'e normal ziyareti
  ile aynı niteliktedir ve kullanıcı kimliğinizle ilişkilendirilmez.
- Dönen mağaza/fiyat listesini **yalnızca kendi cihazınızda**
  (`chrome.storage.local`) 45 dakika önbellekler. Bu veri cihazınızdan çıkmaz.

## İzinlerin gerekçesi

| İzin | Neden |
|---|---|
| `storage` | Fiyat sonuçlarını cihazda kısa süreli önbelleklemek |
| `https://www.epey.com/*` | Fiyat verisini Epey'den okumak |
| Site content script'leri | Ürün sayfasında rozeti göstermek ve ürün başlığını okumak |

## Üçüncü taraflar

Fiyat verisi Epey.com'dan okunur; Epey'in kendi gizlilik politikası
epey.com'da yayımlanır. Bunun dışında hiçbir üçüncü taraf servisi
kullanılmaz.

## İletişim

Sorular için: <GELİŞTİRİCİ E-POSTASI — Store başvurusundan önce doldurulacak>
```

- [ ] **Step 3: İletişim e-postasını doldur**

`docs/PRIVACY.md` son satırındaki placeholder'a Store geliştirici hesabında
kullanılacak e-posta adresi yazılır (kullanıcıya sorulur — Store'da herkese açık
görünür, kişisel adres yerine ayrı bir adres tercih edilebilir).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/PRIVACY.md
git commit -m "docs: README ve gizlilik politikası"
```

---

### Task 12: Store materyalleri (ikon, listeleme metni, paket)

**Files:**
- Create: `extension/icons/make-icons.html`, `extension/icons/icon16.png`, `extension/icons/icon48.png`, `extension/icons/icon128.png`
- Create: `docs/store/listing.md`
- Modify: `extension/manifest.json` (icons + action)

**Interfaces:** — (yayın materyali)

- [ ] **Step 1: İkon üreticiyi yaz** — `extension/icons/make-icons.html`

```html
<!DOCTYPE html>
<meta charset="utf-8">
<title>ikon üret</title>
<body>
<p>Bağlantılara tıklayınca PNG iner. Üçünü de <code>extension/icons/</code> içine kaydet.</p>
<script>
for (const size of [16, 48, 128]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#0b57d0";
  g.beginPath();
  g.roundRect(0, 0, size, size, size * 0.22);
  g.fill();
  g.fillStyle = "#fff";
  g.font = `bold ${Math.round(size * 0.62)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("₺", size / 2, size / 2 + size * 0.04);
  const a = document.createElement("a");
  a.download = `icon${size}.png`;
  a.href = c.toDataURL("image/png");
  a.textContent = `icon${size}.png indir`;
  a.style.display = "block";
  document.body.appendChild(a);
}
</script>
```

Bu dosya Chrome'da açılır, üç PNG indirilip `extension/icons/` içine konur.

- [ ] **Step 2: manifest.json'a ikonları ekle**

`extension/manifest.json` köküne şu iki anahtar eklenir (mevcut anahtarlar korunur):

```json
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "action": {
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" },
    "default_title": "Fiyat Karşılaştırma — Epey"
  }
```

Uzantıyı yeniden yükleyip ikonun araç çubuğunda göründüğü doğrulanır.

- [ ] **Step 3: Listeleme metnini yaz** — `docs/store/listing.md`

```markdown
# Chrome Web Store listeleme içeriği

## Ad
Fiyat Karşılaştırma — Epey

## Kısa açıklama (≤132 karakter)
Baktığın ürünün diğer mağazalardaki fiyatlarını ürün sayfasında anında gör. Veri toplamaz, hesap istemez.

## Kategori
Alışveriş

## Uzun açıklama
Alışveriş yaparken sekme değiştirmeden fiyat karşılaştır. Desteklenen bir
e-ticaret sitesinde ürün sayfası açtığında, başlığın yanında "N mağazada
karşılaştır" rozeti belirir; tıklayınca aynı ürünün diğer mağazalardaki
fiyat listesi açılır — en ucuz sıfır ürün vurgulanır, 2. el/outlet
teklifler ayrı gösterilir. Fiyat verisi Epey.com'dan alınır.

Desteklenen siteler: Hepsiburada, Trendyol, Amazon TR, n11, Teknosa,
Vatan Bilgisayar.

• Hiçbir kullanıcı verisi toplanmaz — analytics yok, hesap yok, kayıt yok.
• Sonuçlar 45 dakika cihazında önbellenir; gereksiz istek atılmaz.
• Eşleşme birebir değilse rozet "≈" ile işaretlenir.
• Sonuç yoksa hiçbir şey gösterilmez — sayfanı asla bozmaz.

Not: Bu uzantı Epey.com ile bağlantılı/onaylı değildir. Fiyatlar Epey'in
herkese açık sayfalarından okunur; kaynak yapısı değişirse gösterim geçici
olarak durabilir.

## Tek amaç (single purpose) beyanı
Kullanıcının görüntülediği ürünün diğer mağazalardaki fiyatlarını göstermek.

## İzin gerekçeleri (inceleme formu)
- storage: fiyat sonuçlarının cihazda 45 dk önbelleklenmesi.
- host permission (epey.com): fiyat verisinin okunması.
- content script'ler (6 alışveriş sitesi): ürün başlığını okumak ve
  karşılaştırma rozetini göstermek.

## Veri kullanımı beyanları
"Hiçbir kullanıcı verisi toplanmıyor" — tüm veri toplama sorularına Hayır.

## Ekran görüntüleri (1280×800, çekilecekler)
1. Hepsiburada ürün sayfası — rozet görünür halde.
2. Aynı sayfa — kart açık, en ucuz vurgulu.
3. Trendyol ürün sayfası — kart açık.
4. (Opsiyonel) Vatan sayfası — "≈ yaklaşık eşleşme" örneği.

## Gizlilik politikası URL'i
Depo herkese açık yapıldığında GitHub'daki docs/PRIVACY.md linki; ya da
GitHub Pages/Gist. (Store, herkese erişilebilir bir URL zorunlu kılar.)
```

- [ ] **Step 4: Paket oluşturmayı doğrula**

PowerShell:

```powershell
Compress-Archive -Path extension\* -DestinationPath fiyat-karsilastirma-0.1.0.zip -Force
```

Expected: zip içinde `manifest.json` kökte (klasör sarmalamadan). Zip `.gitignore`'a eklenir (`*.zip`).

- [ ] **Step 5: Commit**

```bash
git add extension/icons/ extension/manifest.json docs/store/listing.md .gitignore
git commit -m "chore: ikonlar, store listeleme metni, paketleme"
```

---

## Plan sonu notları

- **Task sırası bağımlılıkları:** 1 → 2 → (3,) → 4 → 5 → (6 → 7) → 8 → 9 → 10 → 11 → 12. Task 3 ile 6-8 arası bağımsızdır; paralel yürütülebilir.
- **Kapsam dışı (spec §10):** fiyat alarmı, hesap, ücretli servis, mobil — bu planda yoktur ve eklenmez.
- **Bilinen risk:** Epey şablon değişikliği parser'ı kırar. Tüm parse yolları sessiz `null/[]` döndürür; kullanıcı sayfası hiçbir durumda bozulmaz. Kırılırsa `research/epey/` süreci tekrarlanıp yalnızca `epey.js` regex'leri güncellenir.
- **Store inceleme notu:** başvuru formunda veri toplanmadığı beyan edilir (doğrudur); veri kaynağının iç tekniği form sorularının kapsamı dışındadır (spec §1).
- **Spec §4 sapması (bilinçli):** Spec'teki genel öncelik listesi (JSON-LD → og → h1) 2026-07-16 canlı araştırmasıyla site-özel stratejilere somutlaştırıldı: 6 sitenin hiçbirinde og product meta'sı kullanılabilir değil (Amazon/Teknosa og:title SEO ekli), bu yüzden og katmanı atlandı. Spec'in "h1 ile bulunan ürün 'yaklaşık' işaretlensin" kuralı da şu şekilde iyileştirildi: h1'in ürün başlığının birebir kendisi olduğu doğrulanan sitelerde (HB, Amazon, Teknosa) adapter `approximate:false` der; "≈" işareti asıl belirsizlik kaynağına — Epey eşleştirme skoruna (skor < 0.8 veya fallback sorgu) — bağlanır (Task 4 orchestrator).
