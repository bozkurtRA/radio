# rAdio – iOS Öncelikli Mobil Radyo Uygulaması

![rAdio Logo](./assets/brand/logo.svg)

---

## 1. Proje Hakkında

**rAdio**, iPhone ve iOS Safari cihazlar başta olmak üzere tüm mobil tarayıcılarda tam ekran, akıcı ve kesintisiz radyo dinleme deneyimi sunmak için geliştirilmiş özel bir **Progressive Web App (PWA)** radyo uygulamasıdır.

🌐 **Canlı Uygulama Adresi:** [https://bozkurtra.github.io/radio/](https://bozkurtra.github.io/radio/)  
📱 **iPhone Çerçeveli Karşılaştırma Vitrini:** [https://bozkurtra.github.io/radio/preview/index.html](https://bozkurtra.github.io/radio/preview/index.html)

Uygulamanın adı kesin ve değişmez şekilde **rAdio**'dur.

---

## 2. Temel Özellikler

### 📱 iOS Öncelikli Mobil Tasarım
- **iPhone Safe Area:** `env(safe-area-inset-top)` ve `env(safe-area-inset-bottom)` ile çentik (Notch) ve Dynamic Island alanlarına piksel taşması olmadan tam uyum.
- **Dynamic Viewport (100dvh):** Safari adres çubuğu açılıp kapandığında arayüz kaymasını engelleyen dinamik yükseklik.
- **Tek Elle Kullanım Ergonomisi:** Büyük dokunmatik butonlar (44px – 76px), alt navigasyon menüsü, yatay taşmasız ekran akışı.
- **PWA & Ana Ekrana Ekleme (A2HS):** Safari'de `Paylaş → Ana Ekrana Ekle` yapıldığında tarayıcı çubukları gizlenir, tam ekran bağımsız (standalone) bir iOS uygulaması gibi çalışır.

### 🎨 Üç Farklı Arayüz Tasarımı (Ayarlar'dan Anında Seçilebilir)
1. **Tasarım 1 – Modern (Varsayılan):**
   - Renkli neon vitrin kartları, öne çıkan istasyon hero banner'ı.
   - Popüler radyolar kaydırma şeridi (176 popüler kanal).
   - 2 sütunlu kategori gridi.
   - Yüzen cam (Glassmorphism) Mini Oynatıcı ve alt menü.
2. **Tasarım 2 – Minimal:**
   - Dönen dev vinil plak artwork'ü.
   - 76px dev dokunmatik Oynat/Durdur butonu.
   - Oynatıcı odaklı, dikkat dağıtmayan saf dinleme deneyimi.
3. **Tasarım 3 – Radyo Rehberi (Directory):**
   - İstasyon ve frekans listeleri ön planda.
   - Anlık Türkçe karakter duyarlı arama çubuğu.
   - 81 il ve kategori filtre hapları (chips).
   - Kompakt, hızlı satırlar.
- **ÖNEMLİ:** Tasarım değişikliği sırasında **radyo yayını milisaniye dahi kesilmez, çalmaya devam eder.** Kullanıcı tercihi cihazda kalıcıdır.

### 📻 Profesyonel Ses Motoru (Audio Engine)
- **HTML5 Audio & HLS:** iOS Safari'de yerel HLS (`.m3u8`) donanımsal oynatımı; diğer tarayıcılarda hafif Hls.js desteği.
- **Media Session API:** iOS Kilit Ekranı (Lock Screen) kontrolleri, Bluetooth kulaklık ileri/geri/durdur butonları ve yüksek çözünürlüklü kilit ekranı albüm kapağı.
- **Otomatik Yeniden Bağlanma (Watchdog):** Bağlantı koptuğunda katlanarak artan gecikmeyle (exponential backoff) otomatik yeniden bağlanma.
- **Uyku Zamanlayıcısı:** 15, 30, 45, 60, 90 dakika seçenekleriyle süresi dolunca sesi otomatik duraklatma.
- **Favoriler ve Geçmiş:** Yerel hafızada kalıcı olarak saklanan favori istasyonlar ve son dinlenenler listesi.

### 🔐 Kullanıcı Girişi ve Yönetici Onay Sistemi
- **Kontrollü Erişim:** Uygulama doğrudan herkese açık değildir. İlk açılışta güvenli giriş ve başvuru ekranı karşılar.
- **Onay Süreci:** Yeni başvuran kullanıcılar yönetici onayına düşer. Onaylanmamış hesaplar radyo akışlarına erişemez.
- **Yönetici Paneli:** Yetkili yönetici bekleyen başvuruları tek dokunuşla onaylayabilir, reddedebilir veya erişimi durdurabilir.

---

## 3. Yasal Bildirim, Telif Hakları & DMCA Beyanı

- **Hizmet ve Platform Niteliği:** **rAdio**, internet üzerinde yayın kuruluşları ve bağımsız platformlar tarafından halka açık, lisanslı ve ücretsiz (**open public web stream**) olarak sunulan canlı radyo akış linklerini tek bir modern mobil arayüzde bir araya getiren bağımsız bir medya oynatıcı ve radyo dizini hizmetidir.
- **Sıfır Medya Barındırma (0 Byte Media Hosting):** rAdio sunucularında veya altyapısında hiçbir ses dosyası, radyo yayını, şarkı veya telifli medya içeriği barındırılmaz ve depolanmaz. Uygulama, dinleyicinin doğrudan radyo istasyonunun kendi açık CDN ve streaming sunucularına bağlanmasını sağlayan bir köprü / oynatıcı istemcisi işlevi görür.
- **Fikri Mülkiyet ve Marka Hakları:** Uygulamada gösterilen tüm radyo istasyonu isimleri, logoları, ticari markaları ve radyo yayın içerikleri ilgili yayın kuruluşlarının ve telif hakkı sahiplerinin münhasır mülkiyetindedir. rAdio'nun bu kurumlarla doğrudan bir ortaklığı, mülkiyet veya sponsorluk ilişkisi bulunmamaktadır.
- **Telif Bildirimi ve İçerik Kaldırma Prosedürü (Notice & Takedown):** rAdio, fikri mülkiyet haklarına ve yasal düzenlemelere tam saygı göstermektedir. Telif hakkı sahibi veya yetkili yasal temsilcisi olduğunuz herhangi bir radyo yayınının ya da logonun uygulamadan kaldırılmasını veya güncellenmesini talep ediyorsanız, hak sahipliği teyidiyle birlikte **iletisim@radio.app** adresine bildirimde bulunabilirsiniz. İlgili talep incelenerek en geç **24-48 saat** içerisinde yayın veya içerik sistemden derhal ve kalıcı olarak kaldırılacaktır.
