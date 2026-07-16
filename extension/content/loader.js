// MV3 content script'leri ES modülü olamaz; asıl kod dinamik import ile yüklenir.
// Herhangi bir hata sessizce yutulur (spec §7 — kullanıcı sayfası asla bozulmaz).
(async () => {
  try {
    await import(chrome.runtime.getURL("content/main.js"));
  } catch {
    /* sessiz */
  }
})();
