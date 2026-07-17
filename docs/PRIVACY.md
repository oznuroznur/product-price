# Gizlilik Politikası — Fiyat Karşılaştırma (Epey)

Son güncelleme: 2026-07-16

## Toplanan veri: YOK

Bu uzantı hiçbir kişisel veri, gezinme geçmişi, tanımlayıcı veya istatistik
**toplamaz, saklamaz, iletmez**. Analytics/izleme kodu içermez. Uzantının
geliştiricisine hiçbir veri gönderilmez.

## Uzantı ne yapar?

- Yalnızca desteklenen alışveriş sitelerinin **ürün sayfalarında**, sayfada
  zaten görünen ürün başlığını okur.
- Bu başlığı arama sorgusu olarak **yalnızca epey.com'a** gönderir (ör.
  "apple iphone 15 128gb"). Bu istek, tarayıcınızın Epey'e normal ziyareti
  ile aynı niteliktedir ve kullanıcı kimliğinizle ilişkilendirilmez.
- Dönen mağaza/fiyat listesini **yalnızca kendi cihazınızda**
  (`chrome.storage.local`) 45 dakika önbellekler. Bu veri cihazınızdan çıkmaz.

## İzinlerin gerekçesi

| İzin | Neden |
|---|---|
| `storage` | Fiyat sonuçlarını cihazda kısa süreli önbelleklemek |
| `https://www.epey.com/*` | Fiyat verisini Epey'den okumak |
| Site content script'leri | Ürün sayfasında rozeti göstermek ve ürün başlığını okumak |

## Üçüncü taraflar

Fiyat verisi Epey.com'dan okunur; Epey'in kendi gizlilik politikası
epey.com'da yayımlanır. Bunun dışında hiçbir üçüncü taraf servisi
kullanılmaz.

## İletişim

Sorular için: <GELİŞTİRİCİ E-POSTASI — Store başvurusundan önce doldurulacak>
