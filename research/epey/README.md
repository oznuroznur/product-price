# Epey veri kaynağı — keşif notları (2026-07-16)

Yol haritası adım 2'nin çıktısı: Epey'in URL yapısı, HTML desenleri ve parser.
Tümü canlı siteden alınan ham HTML üzerinde doğrulandı (fixture'lar `fixtures/` altında).

## Erişim gerçeği (spike ile doğrulandı, bkz. `../../spike-cf-test/`)

- Epey **Cloudflare arkasında** ama gerçek Chrome ağ yığınından gelen istekleri
  challenge'sız geçiriyor — uzantı service worker fetch'i **cookie'siz bile çalışıyor** (200).
- Node.js / curl gibi tarayıcı-dışı istemciler **403 managed challenge** alıyor.
  Sonuç: canlı test yalnızca tarayıcı/uzantı bağlamında; Node'da fixture'larla test edilir.
- Cimri uzantı bağlamından bile 403 veriyor → elendi.

## URL yapısı

| Amaç | URL | Not |
|---|---|---|
| Arama | `GET https://www.epey.com/ara/?ara=<sorgu>` | `/arama/e/<base64(php-serialize)>/` adresine 302 redirect eder; `redirect: "follow"` yeterli |
| Ürün detay | `https://www.epey.com/<kategori>/<slug>.html` | örn. `/akilli-telefonlar/apple-iphone-15-pro.html` |

Depolama varyantları ayrı ürün: `apple-iphone-12-128gb.html` gibi; taban model en düşük kapasite.

## Arama sonucu HTML deseni

Her ürün `class="listele"` bloğu içinde bir `<a ... class="cell">`:

```html
<a href="https://www.epey.com/akilli-telefonlar/apple-iphone-15-pro.html" title="Apple iPhone 15 Pro" class="cell">
  <span class="kategori_adi row">Telefon</span>
  <span class="adi row">Apple iPhone 15 Pro</span>
  <span class="fiyat row">67.953,90 TL</span>          <!-- satışta değilse yok -->
  <span class="fiyatsayi row">3 site, 7 fiyat</span>   <!-- satışta değilse yok -->
</a>
```

## Ürün detay sayfası — teklif listesi deseni

`<div id="fiyatlar" class="tab">` içinde her teklif bir `<a class="git ...">`:

```html
<a rel="nofollow" id="1048237080" class="git c1048237080"
   data-link="<urlencoded mağaza ürün URL'i>"
   title="PTT AVM Apple iPhone 15 Pro fiyatı" target="_blank">
  <span class="site_logo"><img src="https://resim.epey.com/site/pttavm-com.png" alt="Apple iPhone 15 Pro PTT AVM fiyatı"></span>
  <span class="urun_adi"> mağazadaki başlık
    <span class="sifir"></span>                        <!-- veya <strong class="outlet">Outlet/2.El Fiyatı</strong> -->
    <p><strong>Satıcı:</strong> BVBMARKET | Renk: <span class="type">Titanyum</span></p>
  </span>
  <span class="urun_fiyat"> 67.953,90 TL <strong><span class='kargo'>Ücretsiz Kargo</span></strong>
    <span class="urun_fiyat_sort" style="display:none">6795390</span>   <!-- kuruş cinsinden -->
  </span>
  <span class="urun_git"><strong>Siteye Git ❯</strong> <p>7 saat önce</p></span>
</a>
```

Çıkarılabilen alanlar: mağaza adı (title attr + logo alt kesişimi), mağaza domain'i
(`data-link` decode), mağazadaki ürün başlığı, satıcı, fiyat, ücretsiz kargo,
outlet/2.el bayrağı, güncellenme zamanı ("7 saat önce").

## Parser (`epey-parser.mjs`)

- `parseSearchResults(html)` / `parseOffers(html)` — saf fonksiyonlar (uzantıya taşınacak olanlar).
- `searchEpey(name)` / `getOffers(url)` — fetch sarmalayıcıları (yalnızca uzantı bağlamında çalışır).
- `scoreMatch` — token örtüşmesi; salt sayısal model token uyuşmazlığı (15 vs 12) ağır ceza,
  sorguda olmayan varyant kelimesi (pro/max/plus/mini/ultra) ceza, satışta olmayana ceza.
- Test: `node epey-parser.mjs` (fixture'larla). Çıktı: 30 arama sonucu doğru parse,
  9 teklif mağaza/satıcı/fiyat/bayraklarla doğru çıkıyor.

## Bilinen sınırlar / uzantı aşamasına notlar

1. **Epey aramasının kendi kalitesi:** "iphone 15 128gb" sorgusu düz "Apple iPhone 15"i
   döndürmüyor (yalnızca Pro varyantları + alakasız modeller). Uzantıda çare: skor eşik
   altındaysa depolama/renk token'ları atılarak ikinci sorgu ("apple iphone 15") atılmalı.
2. Fiyat listesi outlet/2.el teklifleri de içeriyor — `secondHand` bayrağı UI'da
   ayrıştırılmalı ya da "en ucuz" vurgusu sıfır ürünlerden seçilmeli.
3. Aynı mağazanın farklı satıcıları ayrı satır (PTT AVM ×4 gibi) — UI'da mağaza bazında
   gruplamak gerekebilir; "N mağazada" sayısı için `merchantDomain` distinct sayılmalı.
4. Parser regex tabanlı (service worker'da DOMParser yok). Epey şablon değiştirirse kırılır —
   README'de (ürünün kendi README'sinde) bu kırılganlık açıkça belirtilecek.
5. HTML ~140-280 KB / sayfa; 45 dk TTL cache bu yükü makul tutar.
