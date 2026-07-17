// Saf sunum yardımcıları — DOM'a dokunmaz, Node'da test edilir.

export function formatTL(n) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
}

export function updatedText(fetchedAt, now = Date.now()) {
  const dk = Math.floor((now - fetchedAt) / 60000);
  if (dk < 1) return "az önce güncellendi";
  if (dk < 60) return `${dk} dakika önce güncellendi`;
  return `${Math.floor(dk / 60)} saat önce güncellendi`;
}

// En ucuz teklifi gerçek minimuma göre seçer.
const enUcuz = (list) => list.length ? list.reduce((a, b) => (b.price < a.price ? b : a), list[0]) : null;

// Teklifleri sıfır/2.el olarak ayırır. "N mağazada" sayısı benzersiz mağaza
// domain'i üzerinden (aynı mağazanın farklı satıcıları tek sayılır — spec §7).
// "En ucuz" vurgusu sıfır ürünler arasından seçilir.
export function groupOffers(offers) {
  const newOffers = offers.filter((o) => !o.secondHand);
  const usedOffers = offers.filter((o) => o.secondHand);
  const domains = new Set(offers.map((o) => o.merchantDomain).filter(Boolean));
  return {
    newOffers,
    usedOffers,
    siteCount: domains.size,
    cheapest: newOffers.length ? enUcuz(newOffers) : usedOffers.length ? enUcuz(usedOffers) : null,
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function offerRow(o, isBest) {
  const ad = o.seller && o.seller !== o.merchant ? `${o.merchant} · ${o.seller}` : o.merchant;
  return `<li class="row${isBest ? " best" : ""}">
    <a href="${escapeHtml(o.merchantUrl)}" target="_blank" rel="noopener noreferrer">
      <span class="m">${escapeHtml(ad)}</span>
      <span class="p">${escapeHtml(formatTL(o.price))}</span>
    </a>
  </li>`;
}

const MAX_ROWS = 8;

export function renderCard(data, groups, now = Date.now()) {
  const yeni = groups.newOffers.slice(0, MAX_ROWS).map((o) => offerRow(o, o === groups.cheapest)).join("");
  const ikinciEl = groups.usedOffers
    .slice(0, 3)
    .map((o) => offerRow(o, groups.newOffers.length === 0 && o === groups.cheapest))
    .join("");
  return `
    <div class="hdr">
      <a href="${escapeHtml(data.epeyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.productName)}</a>
      ${data.approximate ? '<span class="approx" title="Yaklaşık eşleşme — varyant birebir olmayabilir">≈ yaklaşık eşleşme</span>' : ""}
    </div>
    ${yeni ? `<ul class="list">${yeni}</ul>` : ""}
    ${ikinciEl ? `<div class="sub">2. el / Outlet</div><ul class="list">${ikinciEl}</ul>` : ""}
    <div class="foot">
      <span>Epey verisiyle · ${escapeHtml(updatedText(data.fetchedAt, now))}</span>
      <a href="${escapeHtml(data.epeyUrl)}" target="_blank" rel="noopener noreferrer">Tüm fiyatlar →</a>
    </div>`;
}
