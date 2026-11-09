# rAdio – Mobil ve Masaüstü Canlı Radyo Platformu

<img src="./assets/brand/readme-logo.svg" alt="rAdio – Mobil ve Masaüstü Canlı Radyo" width="374">

---

## 1. Proje Hakkında

**rAdio**, tek bir web adresi üzerinden hem iOS Safari / Android Chrome mobil cihazlara hem de geniş ekran masaüstü (PC) bilgisayarlara özel iki bağımsız arayüz sunan **Progressive Web App (PWA)** canlı radyo platformudur.

🌐 **Canlı Uygulama Adresi:** [https://bozkurtra.github.io/radio/](https://bozkurtra.github.io/radio/)

Uygulamanın adı kesin ve değişmez şekilde **rAdio**'dur.

---

## 2. Çift Arayüz ve Ortak Yayın Mimarisi (v2.3.0)

### 💻 Özel Masaüstü (PC) Stüdyo Arayüzü (`>= 960px`)
- **Üç Panelli Geniş Ekran Çalışma Alanı:** Sol tarafta kitaplık ve müzik/haber/bölgesel kategoriler, ortada kart/liste görünüm seçenekli çok sütunlu istasyon kataloğu, sağda canlı şarkı bilgisi, spektrum görselleştirici ve ses mikserine sahip sabit oynatıcı konsolu.
- **Format ve Kategori Filtreleme:** Pop, Arabesk, Yabancı, Haber & Spor, TV Kanalları, Slow, Halk Müziği, Nostalji ve Yerel istasyonlara tek tıklamayla erişim; HLS / AAC / MP3 / Canlı Akış format filtreleri ve klavye kısayolları (`Boşluk`, `←/→`, `M`, `/`, `Esc`).

### 📱 iOS Öncelikli Mobil Arayüz (`< 960px`)
- **Tek Ekranlı Rehber (Tasarım 3):** Alt navigasyon sekmesi (`Radyolar`, `Favoriler`, `Ayarlar`), kayan mini oynatıcı ve tam ekran alt sayfa oynatıcı korunmuştur.
- **iPhone Safe Area & Standalone:** `env(safe-area-inset-*)` ve dinamik yükseklik (`100dvh` + iOS standalone alt boşluk senkronizasyonu) ile kesintisiz tam ekran görünüm.

### 🔄 Kesintisiz Görünüm Geçişi ve Ortak Ses Motoru
- **Tek URL & Durmayan Yayın:** Mobil ve PC görünümleri arasında otomatik veya manuel geçiş sırasında arka plandaki tek kalıcı `<audio>` öğesi ve `RadioAudioEngine` sıfırlanmaz; çalan istasyon kesintiye uğramadan devam eder.
- **Akıllı HLS & Kodek Yönlendirmesi:** iOS ve Safari'de donanımsal yerel HLS; Chrome, Edge ve Android Chrome'da canlı yayın optimizasyonlu `hls.js` desteği; MP3, AAC ve Icecast/Shoutcast akışları için doğrudan HTML5 ses motoru.
- **Kontrollü Yeniden Bağlanma & Hata Sınıflandırma:** Yayın kopması, ağ gecikmesi veya sunucu hatasında eski bağlantılar tamamen temizlenir; ağ/CORS, HTTP durum kodu, karma içerik (Mixed Content) ve otomatik oynatma kısıtları ayırt edilerek kontrollü yeniden bağlanma uygulanır.
- **Canlı Şarkı Bilgisi & Media Session:** Desteklenen istasyonlarda anlık çalan şarkı/sanatçı bilgisi, albüm kapağı, uyku zamanlayıcısı ve favoriler her iki arayüzde eşzamanlı güncellenir.

---

## 3. Yasal Bildirim, Telif Hakları & DMCA Beyanı

- **Hizmet ve Platform Niteliği:** **rAdio**, internet üzerinde yayın kuruluşları ve bağımsız platformlar tarafından halka açık, lisanslı ve ücretsiz (**open public web stream**) olarak sunulan canlı radyo akış linklerini tek bir modern arayüzde bir araya getiren bağımsız bir medya oynatıcı ve radyo dizini hizmetidir.
- **Sıfır Medya Barındırma (0 Byte Media Hosting):** rAdio sunucularında veya altyapısında hiçbir ses dosyası, radyo yayını, şarkı veya telifli medya içeriği barındırılmaz ve depolanmaz. Uygulama, dinleyicinin doğrudan radyo istasyonunun kendi açık CDN ve streaming sunucularına bağlanmasını sağlayan bir köprü / oynatıcı istemcisi işlevi görür.
- **Fikri Mülkiyet ve Marka Hakları:** Uygulamada gösterilen tüm radyo istasyonu isimleri, logoları, ticari markaları ve radyo yayın içerikleri ilgili yayın kuruluşlarının ve telif hakkı sahiplerinin münhasır mülkiyetindedir. rAdio'nun bu kurumlarla doğrudan bir ortaklığı, mülkiyet veya sponsorluk ilişkisi bulunmamaktadır.
- **Telif Bildirimi ve İçerik Kaldırma Prosedürü (Notice & Takedown):** rAdio, fikri mülkiyet haklarına ve yasal düzenlemelere tam saygı göstermektedir. Telif hakkı sahibi veya yetkili yasal temsilcisi olduğunuz herhangi bir radyo yayınının ya da logonun uygulamadan kaldırılmasını veya güncellenmesini talep ediyorsanız, hak sahipliği teyidiyle birlikte aşağıdaki yasal iletişim masasına bildirimde bulunabilirsiniz. İlgili talep incelenerek en geç **24-48 saat** içerisinde yayın veya içerik sistemden derhal ve kalıcı olarak kaldırılacaktır:

  ![Yasal & İletişim Masası](./assets/brand/dmca-contact.png)
