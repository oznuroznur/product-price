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
