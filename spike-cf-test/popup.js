const runBtn = document.getElementById("run");
const copyBtn = document.getElementById("copy");
const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");

let lastReport = null;

function verdictClass(v) {
  if (v === "GEÇTİ") return "gecti";
  if (v === "CLOUDFLARE CHALLENGE") return "challenge";
  return "diger";
}

function render(report) {
  const rows = report.results
    .map(
      (r) => `<tr>
        <td>${r.id}</td>
        <td>${r.credentials}</td>
        <td class="${verdictClass(r.verdict)}">${r.verdict}${r.status ? ` (${r.status})` : ""}</td>
        <td>${r.dataCheck || ""}</td>
        <td>${r.ms != null ? r.ms + " ms" : ""}</td>
      </tr>`
    )
    .join("");
  outEl.innerHTML = `
    <table>
      <thead><tr><th>Test</th><th>Cookie</th><th>Sonuç</th><th>İçerik kontrolü</th><th>Süre</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <pre>${JSON.stringify(report, null, 2).replace(/</g, "&lt;")}</pre>`;
}

runBtn.addEventListener("click", () => {
  runBtn.disabled = true;
  copyBtn.hidden = true;
  statusEl.textContent = "Çalışıyor… (~10 sn)";
  outEl.innerHTML = "";
  chrome.runtime.sendMessage({ type: "RUN_TESTS" }, (report) => {
    runBtn.disabled = false;
    if (chrome.runtime.lastError || !report) {
      statusEl.textContent = "Hata: " + (chrome.runtime.lastError ? chrome.runtime.lastError.message : "boş cevap");
      return;
    }
    lastReport = report;
    statusEl.textContent = "Bitti: " + report.ranAt;
    copyBtn.hidden = false;
    render(report);
  });
});

copyBtn.addEventListener("click", async () => {
  if (!lastReport) return;
  await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
  copyBtn.textContent = "Kopyalandı ✓";
  setTimeout(() => (copyBtn.textContent = "Ham JSON'u kopyala"), 1500);
});
