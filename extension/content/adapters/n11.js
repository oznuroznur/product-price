import { cleanText, jsonLdProducts } from "./dom-utils.js";

// n11: JSON-LD sku sağlam ama name SEO metni içeriyor ("... Fiyatları ve Özellikleri"
// — 2026-07-16 doğrulandı). Başlık h1'den alınır.
export const n11 = {
  hosts: ["n11.com"],
  extractProduct(document, location) {
    if (!location.pathname.startsWith("/urun/")) return null;
    const h1 = document.querySelector("h1");
    const title = h1 && cleanText(h1.textContent);
    if (!title) return null;
    const ld = jsonLdProducts(document)[0];
    const sku = (ld && ld.sku && String(ld.sku)) || (location.pathname.match(/-(\d+)$/) || [])[1] || null;
    return { title, sku, approximate: false, titleEl: h1 };
  },
};
