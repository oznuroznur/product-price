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
