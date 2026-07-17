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
    let domain;
    try {
      const u = new URL(merchantUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue; // güvenilmez şema → teklifi atla
      domain = u.hostname.replace(/^www\./, "");
    } catch {
      continue; // parse edilemeyen URL → teklifi atla
    }
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
  if (!url.startsWith(BASE + "/")) throw new Error(`İzin verilmeyen URL (yalnızca Epey): ${url}`);
  const res = await fetch(url, { redirect: "follow", headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}
