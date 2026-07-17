# Fiyat Karşılaştırma — Epey

Türkiye'deki büyük e-ticaret sitelerinde gezerken, baktığınız ürünün diğer
mağazalardaki fiyatlarını ürün başlığının yanında küçük bir rozetle gösteren
Chrome uzantısı. Veriler [Epey.com](https://www.epey.com) üzerinden okunur.

## Desteklenen siteler

Hepsiburada · Trendyol · Amazon TR · n11 · Teknosa · Vatan Bilgisayar

## Nasıl çalışır?

1. Bir ürün sayfası açtığınızda uzantı, sayfadaki yapılandırılmış veriden
   (JSON-LD) veya başlıktan ürünü tanır.
2. Arka planda Epey'de arama yapıp en iyi eşleşen ürünün mağaza/fiyat
   listesini çeker (sonuçlar 45 dakika önbelleklenir).
3. Başlığın yanında "N mağazada karşılaştır" rozeti belirir; tıklayınca
   mağaza-fiyat listesi açılır, en ucuz sıfır ürün vurgulanır, 2. el/outlet
   teklifler ayrı gösterilir.

Eşleşme birebir değilse rozette "≈" işareti görürsünüz — bu, gösterilen
fiyatların ürünün farklı bir varyantına (kapasite/renk) ait olabileceği
anlamına gelir.

## Önemli: veri kaynağı hakkında

Epey **resmi bir API sağlamaz**; bu uzantı Epey'in herkese açık HTML
sayfalarını okuyarak çalışır. Epey sayfa yapısını değiştirirse uzantı
**herhangi bir anda çalışmayı durdurabilir**. Böyle bir durumda rozet
sessizce görünmez olur — sayfanızı asla bozmaz.

Bu araç Epey ile bağlantılı/onaylı değildir. Epey'e gereksiz yük
bindirmemek için istekler seyreltilir (throttle) ve önbelleklenir.

## Gizlilik

Hiçbir kullanıcı verisi toplanmaz, hiçbir analytics/izleme kodu yoktur.
Ayrıntılar: [docs/PRIVACY.md](docs/PRIVACY.md)

## Geliştirme

```bash
npm install
npm test          # parser/adapter/cache testleri (Node, ağ erişimi gerektirmez)
```

Uzantıyı denemek için: `chrome://extensions` → Geliştirici modu →
"Paketlenmemiş öğe yükle" → `extension/` klasörü.

Not: Epey, tarayıcı dışı istemcilere (ör. Node/curl) Cloudflare doğrulaması
gösterir; bu yüzden canlı istekler yalnızca uzantı bağlamında çalışır,
testler `tests/fixtures/` altındaki kayıtlı gerçek HTML ile koşar.
