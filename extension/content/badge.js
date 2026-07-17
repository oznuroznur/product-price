import { groupOffers, renderCard } from "./format.js";

const HOST_ID = "fk-epey-badge-host";

const CSS = `
  :host { all: initial; }
  .badge {
    all: initial; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
    font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0b57d0; background: #e8f0fe; border: 1px solid #c2d7fe;
    border-radius: 999px; padding: 5px 10px; white-space: nowrap;
  }
  .badge:hover { background: #d8e5fd; }
  .card {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 2147483647;
    min-width: 300px; max-width: 380px; max-height: 420px; overflow-y: auto;
    background: #fff; color: #1a1a1a; border: 1px solid #dadce0; border-radius: 10px;
    box-shadow: 0 4px 18px rgba(0,0,0,.15); padding: 10px 12px;
    font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .hdr { font-weight: 700; margin-bottom: 6px; }
  .hdr a { color: inherit; text-decoration: none; }
  .approx { display: inline-block; margin-left: 6px; font-weight: 400; font-size: 11px; color: #b06000; }
  .list { list-style: none; margin: 0; padding: 0; }
  .row a { display: flex; justify-content: space-between; gap: 12px; padding: 5px 6px;
           color: inherit; text-decoration: none; border-radius: 6px; }
  .row a:hover { background: #f1f3f4; }
  .row .p { font-variant-numeric: tabular-nums; font-weight: 600; }
  .row.best a { background: #e6f4ea; }
  .row.best .p { color: #137333; }
  .sub { margin: 8px 0 2px; font-size: 11px; font-weight: 700; color: #5f6368; text-transform: uppercase; }
  .foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px;
          padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #5f6368; }
  .foot a { color: #0b57d0; text-decoration: none; }
`;

let outsideClickListener = null;

export function removeBadge() {
  const eski = document.getElementById(HOST_ID);
  if (eski) eski.remove();
  if (outsideClickListener) {
    document.removeEventListener("click", outsideClickListener);
    outsideClickListener = null;
  }
}

export function mountBadge(titleEl, data) {
  removeBadge();
  const groups = groupOffers(data.offers);
  if (!groups.cheapest || groups.siteCount === 0) return; // sessiz (spec §7)

  const host = document.createElement("span");
  host.id = HOST_ID;
  host.style.cssText = "display:inline-block;position:relative;margin-left:8px;vertical-align:middle;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const badge = document.createElement("button");
  badge.className = "badge";
  badge.type = "button";
  badge.textContent = `${groups.siteCount} mağazada karşılaştır${data.approximate ? " ≈" : ""}`;
  if (data.approximate) badge.title = "Yaklaşık eşleşme — varyant birebir olmayabilir";
  shadow.appendChild(badge);

  const card = document.createElement("div");
  card.className = "card";
  card.hidden = true;
  card.innerHTML = renderCard(data, groups); // içerik format.js'te tamamen escape'lenir
  shadow.appendChild(card);

  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    card.hidden = !card.hidden;
  });
  card.addEventListener("click", (e) => e.stopPropagation());
  outsideClickListener = () => {
    card.hidden = true;
  };
  document.addEventListener("click", outsideClickListener);

  titleEl.insertAdjacentElement("afterend", host);
}
