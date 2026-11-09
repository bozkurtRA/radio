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

### 🎨 Tek Ekranlı Modern Rehber Tasarımı
- **Tüm Radyolar Tek Ekranda:** Giriş engeli veya karmaşık kategori/il sayfaları olmadan 1.400+ canlı radyo istasyonunun tamamı tek bir hızlı, kesintisiz kaydırılabilir liste halinde sunulur.
- **Anlık Arama:** Türkçe karakter uyumlu anında arama çubuğu ile istasyon adı yazıldığı anda filtrelenir.
- **Yüzen Mini Oynatıcı & Tam Ekran Oynatıcı:** Çalan şarkı/sanatçı bilgisi, albüm kapağı ve tek dokunuşla favoriye ekleme desteği.

### 📻 Profesyonel Ses Motoru (Audio Engine)
- **HTML5 Audio & HLS:** iOS Safari'de yerel HLS (`.m3u8`) donanımsal oynatımı; diğer tarayıcılarda hafif Hls.js desteği.
- **Media Session API:** iOS Kilit Ekranı (Lock Screen) kontrolleri, Bluetooth kulaklık ileri/geri/durdur butonları ve yüksek çözünürlüklü kilit ekranı albüm kapağı.
- **Otomatik Yeniden Bağlanma (Watchdog):** Bağlantı koptuğunda katlanarak artan gecikmeyle (exponential backoff) otomatik yeniden bağlanma.
- **Uyku Zamanlayıcısı:** 15, 30, 45, 60, 90 dakika seçenekleriyle süresi dolunca sesi otomatik duraklatma.
- **Favoriler:** Yerel hafızada kalıcı olarak saklanan favori istasyonlar.

---

## 3. Yasal Bildirim, Telif Hakları & DMCA Beyanı

- **Hizmet ve Platform Niteliği:** **rAdio**, internet üzerinde yayın kuruluşları ve bağımsız platformlar tarafından halka açık, lisanslı ve ücretsiz (**open public web stream**) olarak sunulan canlı radyo akış linklerini tek bir modern mobil arayüzde bir araya getiren bağımsız bir medya oynatıcı ve radyo dizini hizmetidir.
- **Sıfır Medya Barındırma (0 Byte Media Hosting):** rAdio sunucularında veya altyapısında hiçbir ses dosyası, radyo yayını, şarkı veya telifli medya içeriği barındırılmaz ve depolanmaz. Uygulama, dinleyicinin doğrudan radyo istasyonunun kendi açık CDN ve streaming sunucularına bağlanmasını sağlayan bir köprü / oynatıcı istemcisi işlevi görür.
- **Fikri Mülkiyet ve Marka Hakları:** Uygulamada gösterilen tüm radyo istasyonu isimleri, logoları, ticari markaları ve radyo yayın içerikleri ilgili yayın kuruluşlarının ve telif hakkı sahiplerinin münhasır mülkiyetindedir. rAdio'nun bu kurumlarla doğrudan bir ortaklığı, mülkiyet veya sponsorluk ilişkisi bulunmamaktadır.
- **Telif Bildirimi ve İçerik Kaldırma Prosedürü (Notice & Takedown):** rAdio, fikri mülkiyet haklarına ve yasal düzenlemelere tam saygı göstermektedir. Telif hakkı sahibi veya yetkili yasal temsilcisi olduğunuz herhangi bir radyo yayınının ya da logonun uygulamadan kaldırılmasını veya güncellenmesini talep ediyorsanız, hak sahipliği teyidiyle birlikte aşağıdaki yasal iletişim masasına bildirimde bulunabilirsiniz. İlgili talep incelenerek en geç **24-48 saat** içerisinde yayın veya içerik sistemden derhal ve kalıcı olarak kaldırılacaktır:
  
  ![Yasal & İletişim Masası](./assets/brand/dmca-contact.png)
