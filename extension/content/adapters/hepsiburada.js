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
