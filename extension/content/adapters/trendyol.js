import { cleanText, jsonLdProducts } from "./dom-utils.js";

// Trendyol'da temiz Product JSON-LD var (name, sku — 2026-07-16 doğrulandı).
export const trendyol = {
  hosts: ["trendyol.com"],
  extractProduct(document, location) {
    if (!/-p-\d+/.test(location.pathname)) return null;
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const ld = jsonLdProducts(document)[0];
    const title = cleanText((ld && ld.name) || h1.textContent);
    if (!title) return null;
    const sku = (ld && ld.sku && String(ld.sku)) || (location.pathname.match(/-p-(\d+)/) || [])[1] || null;
    return { title, sku, approximate: !ld, titleEl: h1 };
  },
};
