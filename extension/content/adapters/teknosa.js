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
