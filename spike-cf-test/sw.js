// Spike: Epey/Cimri'ye service worker'dan fetch geçiyor mu?
// Her hedef iki kez denenir: credentials 'include' (tarayıcı cookie'leri ile)
// ve 'omit' (cookie'siz) — Cloudflare geçişinin cookie'ye bağlı olup olmadığını ayırt etmek için.

const CHALLENGE_RE = /just a moment|cf_chl|challenges\.cloudflare|__cf_chl/i;
const DELAY_MS = 800;

const TESTS = [
  {
    id: "epey-ana-sayfa",
    method: "GET",
    url: "https://www.epey.com/",
  },
  {
    id: "epey-marka-sayfasi",
    method: "GET",
    url: "https://www.epey.com/samsung/",
  },
  {
    id: "cimri-arama-api",
    method: "POST",
    url: "https://www.cimri.com/api/cimri",
    body: {
      queryName: "suggestionV2Query",
      variables: { keyword: "iphone 15 128gb" },
      platform: "CIMRI_DESKTOP_V2",
    },
  },
  {
    id: "cimri-urun-sayfasi",
    method: "GET",
    url: "https://www.cimri.com/cep-telefonlari/en-ucuz-apple-iphone-15-pro-5g-128gb-fiyatlari,a2237890819",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkContent(testId, text) {
  if (testId === "cimri-arama-api") {
    try {
      const j = JSON.parse(text);
      const prods = (j.data && j.data.suggestionV2 && j.data.suggestionV2.products) || [];
      return `JSON geldi, products: ${prods.length}${prods[0] ? ` (ilk: ${prods[0].title})` : ""}`;
    } catch {
      return "200 döndü ama JSON parse edilemedi";
    }
  }
  if (testId === "cimri-urun-sayfasi") {
    const m = text.match(/<script id="(?:__OCTOPUS_DATA__|__NEXT_DATA__)" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return "200 döndü ama gömülü veri script'i bulunamadı";
    try {
      const j = JSON.parse(m[1]);
      const offers = j.props.pageProps.data.product.offers || [];
      const first = offers[0];
      return `gömülü veri OK, ${offers.length} teklif${first ? ` (ilk: ${first.merchant.name} ${first.price} TL)` : ""}`;
    } catch {
      return "gömülü veri script'i var ama parse edilemedi";
    }
  }
  // epey sayfaları: challenge değilse ve sayfa gövdesi doluysa gerçek içerik say
  if (CHALLENGE_RE.test(text.slice(0, 5000))) return "challenge içeriği";
  return text.length > 20000 ? `gerçek sayfa içeriği görünüyor (${Math.round(text.length / 1024)} KB)` : `kısa/şüpheli içerik (${text.length} B)`;
}

async function probe(test, credentials) {
  const started = Date.now();
  const result = {
    id: test.id,
    credentials,
    url: test.url,
    status: null,
    verdict: null,
    challenge: false,
    dataCheck: null,
    ms: null,
  };
  try {
    const res = await fetch(test.url, {
      method: test.method,
      credentials,
      headers: test.body
        ? { "content-type": "application/json", accept: "*/*" }
        : { accept: "text/html" },
      body: test.body ? JSON.stringify(test.body) : undefined,
    });
    const text = await res.text();
    result.status = res.status;
    result.ms = Date.now() - started;
    result.challenge = !res.ok && CHALLENGE_RE.test(text.slice(0, 5000));
    if (res.ok) {
      result.dataCheck = checkContent(test.id, text);
      result.verdict = "GEÇTİ";
    } else {
      result.verdict = result.challenge ? "CLOUDFLARE CHALLENGE" : `HTTP ${res.status}`;
    }
  } catch (e) {
    result.verdict = "FETCH HATASI";
    result.dataCheck = String(e);
  }
  return result;
}

async function runAll() {
  const results = [];
  for (const test of TESTS) {
    for (const credentials of ["include", "omit"]) {
      results.push(await probe(test, credentials));
      await sleep(DELAY_MS);
    }
  }
  return {
    ranAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    results,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "RUN_TESTS") {
    runAll().then(sendResponse);
    return true; // async cevap
  }
});
