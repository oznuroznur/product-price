import { cleanText } from "./dom-utils.js";

// Amazon TR'de JSON-LD yok (2026-07-16 doğrulandı). Sinyal: #productTitle + /dp/<ASIN>.
export const amazon = {
  hosts: ["amazon.com.tr"],
  extractProduct(document, location) {
    const asin = (location.pathname.match(/\/dp\/([A-Z0-9]{10})/i) || [])[1] || null;
    if (!asin) return null;
    const titleSpan = document.querySelector("#productTitle") || document.querySelector("h1");
    const title = titleSpan && cleanText(titleSpan.textContent);
    if (!title) return null;
    const titleEl = document.querySelector("#title") || titleSpan;
    return { title, sku: asin, approximate: false, titleEl };
  },
};
