// Epey HTML parser — arama sonuçları ve ürün detay sayfasındaki fiyat listesi.
//
// Önemli: Epey, tarayıcı-dışı istemcilere (Node fetch dahil) Cloudflare challenge
// gösterir; canlı fetch yalnızca uzantı (service worker) bağlamında çalışır.
// Bu yüzden parse fonksiyonları saf (html string → veri) tutuldu; Node'da
// fixtures/ altındaki kaydedilmiş HTML ile test edilir:
//
//   node epey-parser.mjs                 → fixture'larla test
//   node epey-parser.mjs --live          → canlı fetch dener (403 beklenir, teyit amaçlı)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.epey.com";

// ---------------------------------------------------------------- yardımcılar

const decodeEntities = (s) =>
  s
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

// ------------------------------------------------------------- arama sayfası

// Arama URL'i: GET https://www.epey.com/ara/?ara=<sorgu>
// (sunucu /arama/e/<base64>/ adresine redirect eder; redirect: "follow" yeterli)
export function buildSearchUrl(query) {
  return `${BASE}/ara/?ara=${encodeURIComponent(query)}`;
}

// Arama sonucu HTML'inden ürün listesi çıkarır.
// Her ürün: <a href="https://www.epey.com/<kategori>/<slug>.html" title="..." class="cell">
//   <span class="adi row">Apple iPhone 15 Pro</span>
//   <span class="fiyat row">67.953,90 TL</span>          (opsiyonel)
//   <span class="fiyatsayi row">3 site, 7 fiyat</span>   (opsiyonel)
export function parseSearchResults(html) {
  const re = /<a href="(https:\/\/www\.epey\.com\/[^"]+\.html)" title="[^"]*" class="cell">([\s\S]*?)<\/a>/g;
  const results = [];
  let m;
  while ((m = re.exec(html))) {
    const block = m[2];
    const name = (block.match(/class="adi row">([^<]*)</) || [])[1];
    if (!name) continue; // reklam/boş hücreler
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

// Basit alakalılık skoru: sorgudaki token'ların ürün adında geçme oranı.
// Model numarası uyuşmazlığı (örn. sorgu "15", ürün "12") diskalifiye edici;
// fiyatı olmayan (satılmayan) ürünler ve fazladan varyant kelimeleri cezalı.
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
  // sorguda geçmeyen fazladan model kelimeleri (pro, max, plus, mini) ceza
  for (const extra of ["pro", "max", "plus", "mini", "ultra"]) {
    if (nTokens.has(extra) && !qTokens.includes(extra)) score -= 0.2;
  }
  // salt sayısal token'lar model numarasıdır ("15", "12", "2020"; "128gb" değil):
  // iki yönde de uyuşmazlık ağır ceza — yanlış modele fiyat göstermekten kaçın.
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

// -------------------------------------------------------- ürün detay sayfası

// Ürün sayfasındaki teklif listesi: <div id="fiyatlar"> içinde her teklif bir
// <a class="git ..." data-link="<urlencoded mağaza URL'i>" title="<Mağaza> <Ürün> fiyatı">
//   <span class="urun_adi">mağazadaki başlık [+ <strong class="outlet">Outlet/2.El Fiyatı</strong>]</span>
//   <span class="urun_fiyat"> 59.488,05 TL ... </span>
//   <span class="urun_git"> ... <p>2 saat önce</p></span>
export function parseOffers(html) {
  const tabStart = html.indexOf('id="fiyatlar"');
  if (tabStart < 0) return [];
  // sonraki tab'a kadar olan bölüm (yoksa dosya sonu)
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
    // title formatı: "<Mağaza adı> <Ürün adı> fiyatı" — mağaza adını logo alt'ından almak
    // daha sağlam: alt="<Ürün> <Mağaza> fiyatı" ... en güvenilir kaynak domain.
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
  // aynı sırayla, en ucuzdan pahalıya
  return offers.sort((a, b) => a.price - b.price);
}

// title "Trendyol Apple iPhone 15 Pro fiyatı", logo alt "Apple iPhone 15 Pro Trendyol fiyatı":
// mağaza adı title'ın başında, alt'ın sonunda — ikisinin kesişiminden kelime sayısını bul.
function guessMerchantWordCount(title, logoAlt) {
  if (!logoAlt) return 1;
  const t = title.replace(/\s+fiyatı\s*$/, "").split(/\s+/);
  const a = logoAlt.replace(/\s+fiyatı\s*$/, "").split(/\s+/);
  for (let n = Math.min(4, t.length); n >= 1; n--) {
    const head = t.slice(0, n).join(" ");
    if (a.slice(-n).join(" ") === head) return n;
  }
  return 1;
}

// ------------------------------------------------------------------ fetch katmanı
// (yalnızca uzantı/tarayıcı bağlamında çalışır; Node'dan 403 beklenir)

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: "follow", headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

export async function searchEpey(productName) {
  const html = await fetchHtml(buildSearchUrl(productName));
  const found = searchEpeyInHtml(productName, html);
  return found && found.best.score >= 0.5 ? found.best.url : null;
}

export async function getOffers(productUrl) {
  const html = await fetchHtml(productUrl);
  return parseOffers(html);
}

// ------------------------------------------------------------------------ test

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
if (isMain) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const query = "iphone 15 128gb";

  if (process.argv.includes("--live")) {
    try {
      const url = await searchEpey(query);
      console.log("canlı arama sonucu:", url);
      if (url) console.log(JSON.stringify(await getOffers(url), null, 2));
    } catch (e) {
      console.error("Canlı istek başarısız (Node'dan bekleniyordu):", e.message);
    }
  } else {
    const searchHtml = readFileSync(join(dir, "fixtures", "search-iphone-15-128gb.html"), "utf8");
    const found = searchEpeyInHtml(query, searchHtml);
    console.log("== searchEpey (fixture) ==");
    console.log("en iyi eşleşme:", found.best);
    console.log("diğer adaylar:", found.candidates.slice(1).map((c) => `${c.name} (${c.score.toFixed(2)})`).join(" | "));

    const productHtml = readFileSync(join(dir, "fixtures", "product-apple-iphone-15-pro.html"), "utf8");
    const offers = parseOffers(productHtml);
    console.log(`\n== getOffers (fixture) — ${offers.length} teklif ==`);
    for (const o of offers) {
      console.log(
        `${(o.merchant + (o.seller ? " / " + o.seller : "")).padEnd(35)} ${String(o.price).padStart(10)} TL  ` +
        `${o.secondHand ? "[2.el/outlet] " : ""}${o.freeShipping ? "[ücretsiz kargo] " : ""}(${o.updated || "?"})`
      );
    }
  }
}
