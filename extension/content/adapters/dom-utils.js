export function cleanText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(s) {
  return (s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Sayfadaki tüm JSON-LD bloklarından @type: Product olanları toplar (@graph dahil).
export function jsonLdProducts(document) {
  const out = [];
  const collect = (item) => {
    if (!item || typeof item !== "object") return;
    const types = [].concat(item["@type"] || []);
    if (types.includes("Product")) out.push(item);
    if (Array.isArray(item["@graph"])) item["@graph"].forEach(collect);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      (Array.isArray(parsed) ? parsed : [parsed]).forEach(collect);
    } catch {
      /* bozuk JSON-LD yok sayılır */
    }
  }
  return out;
}
