# CF Erişim Testi (spike)

Amaç: Epey ve Cimri'nin Cloudflare koruması, **gerçek Chrome içinde çalışan bir
MV3 uzantısının service worker fetch'ini** engelliyor mu, öğrenmek. (Düz Node.js
fetch ile ikisi de 403 challenge veriyor — doğrulandı. Uzantı bağlamı farklı
olabilir çünkü istekler kullanıcının tarayıcısından, onun cookie'leriyle çıkar.)

Bu klasör geçici bir teşhis aracıdır; asıl ürünün parçası değildir, yayınlanmayacak.

## Kurulum

1. Chrome'da `chrome://extensions` adresini aç.
2. Sağ üstten **Geliştirici modu**'nu aç.
3. **Paketlenmemiş öğe yükle** → bu klasörü (`spike-cf-test/`) seç.

## Test protokolü (iki aşama)

### Aşama A — mevcut durum

1. Uzantı ikonuna tıkla → **Testleri çalıştır**.
2. Tablo dolunca **Ham JSON'u kopyala** ile sonucu kaydet (örn. `sonuc-A.json`).

Not: Tarayıcın Epey/Cimri'yi daha önce ziyaret ettiyse bu aşama "temiz profil"
ölçümü değildir — yine de çalıştır, karşılaştırma için değerli.

### Aşama B — siteleri ziyaret ettikten sonra

1. Normal birer sekmede `https://www.epey.com` ve `https://www.cimri.com` aç,
   sayfaların gerçekten yüklendiğini gör (challenge çıkarsa geçmesini bekle).
2. Uzantı popup'ına dön → **Testleri çalıştır** → sonucu tekrar kopyala
   (`sonuc-B.json`).

## Sonuç nasıl yorumlanır

Her hedef iki kez denenir: `include` (cookie'li) ve `omit` (cookie'siz).

| Gözlem | Anlamı |
|---|---|
| `include` GEÇTİ, `omit` CHALLENGE | Erişim `cf_clearance` cookie'sine bağlı → uzantı çalışır ama kullanıcının siteyi arada bir ziyaret etmesi gerekir |
| İkisi de GEÇTİ | Cloudflare tarayıcı içi istekleri zaten engellemiyor → en rahat senaryo |
| İkisi de CHALLENGE (Aşama B'de bile) | Uzantı bağlamından da geçmiyor → bu veri kaynağı mimarisi çalışmaz, kaynak/strateji değişmeli |

`cimri-arama-api` ve `cimri-urun-sayfasi` testlerinde "İçerik kontrolü" sütunu
gerçek veri geldiğini de doğrular (ürün sayısı / teklif sayısı + ilk fiyat).

## Rapor

İki aşamanın JSON çıktısını Claude'a ver — sonuca göre ya asıl uzantı planına
geçilecek ya da veri kaynağı stratejisi yeniden değerlendirilecek.
