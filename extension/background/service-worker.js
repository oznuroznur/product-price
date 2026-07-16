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
