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

test("farklı ürünlerin eşzamanlı istekleri de throttle aralığına uyar", async () => {
  let t = 0;
  const fetchTimes = [];
  const cache = createCache({ storage: fakeStorage(), now: () => t });
  const orch = createOrchestrator({
    cache,
    fetchHtml: async (url) => {
      fetchTimes.push(t);
      return url.includes("/ara/") ? searchHtml : productHtml;
    },
    minIntervalMs: 1000,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  await Promise.all([
    orch.getComparison({ title: "Apple iPhone 15 Pro" }),
    orch.getComparison({ title: "Apple iPhone 13" }),
  ]);
  assert.ok(fetchTimes.length >= 4); // her ürün: arama + ürün sayfası
  for (let i = 1; i < fetchTimes.length; i++) {
    assert.ok(
      fetchTimes[i] - fetchTimes[i - 1] >= 1000,
      `fetch ${i} çok erken: ${fetchTimes[i] - fetchTimes[i - 1]}ms`
    );
  }
});
