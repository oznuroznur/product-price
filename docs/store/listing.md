# Chrome Web Store listeleme içeriği

## Ad
Fiyat Karşılaştırma — Epey

## Kısa açıklama (≤132 karakter)
Baktığın ürünün diğer mağazalardaki fiyatlarını ürün sayfasında anında gör. Veri toplamaz, hesap istemez.

## Kategori
Alışveriş

## Uzun açıklama
Alışveriş yaparken sekme değiştirmeden fiyat karşılaştır. Desteklenen bir
e-ticaret sitesinde ürün sayfası açtığında, başlığın yanında "N mağazada
karşılaştır" rozeti belirir; tıklayınca aynı ürünün diğer mağazalardaki
fiyat listesi açılır — en ucuz sıfır ürün vurgulanır, 2. el/outlet
teklifler ayrı gösterilir. Fiyat verisi Epey.com'dan alınır.

Desteklenen siteler: Hepsiburada, Trendyol, Amazon TR, n11, Teknosa,
Vatan Bilgisayar.

• Hiçbir kullanıcı verisi toplanmaz — analytics yok, hesap yok, kayıt yok.
• Sonuçlar 45 dakika cihazında önbellenir; gereksiz istek atılmaz.
• Eşleşme birebir değilse rozet "≈" ile işaretlenir.
• Sonuç yoksa hiçbir şey gösterilmez — sayfayı asla bozmaz.

Not: Bu uzantı Epey.com ile bağlantılı/onaylı değildir. Fiyatlar Epey'in
herkese açık sayfalarından okunur; kaynak yapısı değişirse gösterim geçici
olarak durabilir.

## Tek amaç (single purpose) beyanı
Kullanıcının görüntülediği ürünün diğer mağazalardaki fiyatlarını göstermek.

## İzin gerekçeleri (inceleme formu)
- storage: fiyat sonuçlarının cihazda 45 dk önbelleklenmesi.
- host permission (epey.com): fiyat verisinin okunması.
- content script'ler (6 alışveriş sitesi): ürün başlığını okumak ve
  karşılaştırma rozetini göstermek.

## Veri kullanımı beyanları
"Hiçbir kullanıcı verisi toplanmıyor" — tüm veri toplama sorularına Hayır.

## Ekran görüntüleri (1280×800, çekilecekler)
1. Hepsiburada ürün sayfası — rozet görünür halde.
2. Aynı sayfa — kart açık, en ucuz vurgulu.
3. Trendyol ürün sayfası — kart açık.
4. (Opsiyonel) Vatan sayfası — "≈ yaklaşık eşleşme" örneği.

## Gizlilik politikası URL'i
Depo herkese açık yapıldığında GitHub'daki docs/PRIVACY.md linki; ya da
GitHub Pages/Gist. (Store, herkese erişilebilir bir URL zorunlu kılar.)
