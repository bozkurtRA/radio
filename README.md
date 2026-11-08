# rAdio – iOS Öncelikli Mobil Radyo Uygulaması

![rAdio Logo](./assets/brand/logo.svg)

---

## 1. Proje Hakkında

**rAdio**, iPhone ve iOS Safari cihazlar başta olmak üzere tüm mobil tarayıcılarda tam ekran, akıcı ve kesintisiz radyo dinleme deneyimi sunmak için sıfırdan geliştirilmiş bir **Progressive Web App (PWA)** radyo uygulamasıdır.

Eski Android APK (`RadiiGo 2.6.apk`) analiz edilerek veritabanı (AES-256) çözülmüş; çıkarılan **1.426 aktif radyo istasyonu**, **24 kategori**, **176 popüler kanal** ve **81 il listesi** modern ve temiz JSON veri mimarisine taşınmıştır.

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
- **ÖNEMLİ:** Tasarım değişikliği sırasında **radyo yayını milisaniye dahi kesilmez, çalmaya devam eder.** Kullanıcı tercihi `localStorage` ile kalıcıdır.

### 📻 Profesyonel Ses Motoru (Audio Engine)
- **HTML5 Audio & HLS.js:** iOS Safari'de yerel HLS (`.m3u8`) donanımsal oynatımı; diğer tarayıcılarda hafif Hls.js fallback'i.
- **Media Session API:** iOS Kilit Ekranı (Lock Screen) kontrolleri, Bluetooth kulaklık ileri/geri/durdur butonları ve yüksek çözünürlüklü kilit ekranı albüm kapağı.
- **Otomatik Yeniden Bağlanma (Watchdog):** Tünel veya baz istasyonu değişiminde bağlantı koptuğunda katlanarak artan gecikmeyle (exponential backoff) otomatik bağlanma.
- **Uyku Zamanlayıcısı:** 15, 30, 45, 60, 90 dakika veya kapalı seçenekleriyle süresi dolunca sesi otomatik duraklatma.
- **Favoriler ve Geçmiş:** Yerel hafızada kalıcı olarak saklanan favori istasyonlar ve son dinlenenler listesi.

### 🔐 Kullanıcı Girişi ve Yönetici Onay Sistemi (Bölüm 12)
- **Kontrollü Erişim:** Kayıt olan kullanıcılar `pending` (beklemede) durumunda başlar ve radyo akışlarına doğrudan erişemez.
- **Yönetici Onay Paneli:** Yetkili yönetici tek dokunuşla bekleyen başvuruları onaylayabilir (`approved`), reddedebilir (`rejected`) veya erişimi iptal edebilir.
- **Supabase Auth & RLS Mimarisi:** GitHub Pages statik olduğu için yetki kontrolü sunucu tarafında PostgreSQL Row-Level Security politikalarıyla korunur.

---

## 3. GitHub & GitHub Pages Yayınlama Kılavuzu

Uygulama, GitHub Pages'in alt dizin yapısı olan `https://<KULLANICIADI>.github.io/radio/` ile %100 uyumludur.

### Adım 1: GitHub Repository Oluşturma
1. GitHub üzerinde **`radio`** adında yeni bir repository oluşturun (Private veya Public).
2. Proje dosyalarını repository'ye yükleyin:
   ```bash
   git init
   git add .
   git commit -m "feat: rAdio iOS mobile PWA initial release"
   git branch -M main
   git remote add origin https://github.com/<KULLANICIADI>/radio.git
   git push -u origin main
   ```

### Adım 2: GitHub Pages Aktif Etme
1. GitHub Repository sayfanızda **Settings** sekmesine gidin.
2. Sol menüden **Pages** seçeneğine tıklayın.
3. **Build and deployment > Branch** kısmında `main` dalını ve `/ (root)` dizinini seçip **Save** butonuna tıklayın.
4. Birkaç dakika içinde uygulamanız `https://<KULLANICIADI>.github.io/radio/` adresinde canlıya geçecektir.

---

## 4. Supabase Auth & Veritabanı Kurulumu (Yönetici Onay Sistemi)

Yönetici onay sistemini canlı sunucuda çalıştırmak için ücretsiz bir [Supabase](https://supabase.com) projesi açıp aşağıdaki SQL komutunu SQL Editör'de çalıştırmanız yeterlidir:

```sql
-- 1. Kullanıcı Profilleri ve Onay Tablosu
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user', -- 'user' | 'admin'
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Row Level Security (RLS) Aktifleştir
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Güvenlik Politikaları
-- Kullanıcı kendi profilini okuyabilir
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- Yöneticiler tüm profilleri görebilir ve güncelleyebilir
CREATE POLICY "Admins have full access" 
ON public.profiles FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- 4. Yeni Kayıtta Otomatik Profil Oluşturma Trigger'ı
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status, role)
  VALUES (new.id, new.email, 'pending', 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

> **Not:** Uygulama, Supabase kimlik bilgileri girilmediğinde de kesintisiz çalışması için dahili bir **akıllı yerel simülasyon (LocalStorage fallback)** ile donatılmıştır. `admin@radio.app` / `admin123` ile yönetici paneli anında test edilebilir.

---

## 5. Dosya ve Dizin Yapısı

```
Radio/
├── index.html                   # Ana Mobil Uygulama (Üretim PWA)
├── manifest.webmanifest         # PWA Manifest (Standalone, İkonlar)
├── sw.js                        # Service Worker (Önbellek & Canlı Akış Yönetimi)
├── README.md                    # Proje Dokümantasyonu ve Kurulum Kılavuzu
│
├── css/
│   ├── main.css                 # Temel Tasarım Sistemi, Safe Area, Reset
│   ├── modern.css               # Tasarım 1: Modern Vitrin Kartları & Alt Menü
│   ├── minimal.css              # Tasarım 2: Minimal Vinil Plak & 76px Buton
│   ├── directory.css            # Tasarım 3: Radyo Rehberi, Arama, 81 İl
│   ├── player.css               # Tam Ekran Oynatıcı Modalı & Ekolayzer
│   └── auth.css                 # Giriş, Onay Bekleme & Yönetici Paneli
│
├── js/
│   ├── app.js                   # Ana Uygulama Orkestratörü
│   ├── audio-engine.js          # HTML5 Audio & HLS & Media Session Motoru
│   ├── storage.js               # LocalStorage API Yöneticisi
│   └── auth-manager.js          # Supabase & Erişim Onay Yöneticisi
│
├── data/
│   ├── stations.json            # 1.426 Canlı Radyo İstasyonu
│   ├── categories.json          # 24 Kategori Listesi
│   ├── popular.json             # 176 Popüler İstasyon ID'si
│   └── cities.json              # 81 İl ve Bölge Listesi
│
├── assets/
│   └── brand/
│       ├── logo.svg             # Yatay Ana Logo
│       ├── icon.svg             # Vektörel Uygulama Simgesi
│       ├── icon-192.png         # PWA İkonu (192x192)
│       ├── icon-512.png         # PWA İkonu (512x512)
│       ├── apple-touch-icon.png # iOS Ana Ekran Simgesi (180x180)
│       └── favicon.svg          # Tarayıcı Sekme İkonu
│
└── preview/                     # Etkileşimli Test ve Önizleme Vitrini
    ├── index.html               # iPhone Çerçeveli Canlı Test Ekranı
    ├── preview.css
    ├── preview.js
    └── data-sample.js
```

---

## 6. Yerel Test ve Önizleme

Projeyi yerel bilgisayarınızda test etmek için terminalde şu komutu çalıştırabilirsiniz:

```bash
python -m http.server 8080
```

- **Canlı Üretim Uygulaması:** `http://localhost:8080/index.html`
- **iPhone Çerçeveli Karşılaştırma Vitrini:** `http://localhost:8080/preview/index.html`
