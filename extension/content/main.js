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
  try {
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
  } catch {
    // uzantı yeniden yüklendi/güncellendi → "Extension context invalidated" senkron hatası, sessiz (spec §7)
  }
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
