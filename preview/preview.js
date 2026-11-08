// rAdio Interactive Prototype Engine
(function() {
  // App State
  const state = {
    theme: localStorage.getItem('radio_theme') || 'modern', // 'modern' | 'minimal' | 'directory'
    screen: 'home', // 'home' | 'categories' | 'player' | 'auth' | 'admin'
    selectedCategory: null,
    currentStation: RADIO_DATA.stations[0], // Default: Power Türk
    isPlaying: false,
    volume: 0.85,
    favorites: [2, 6, 8], // IDs
    recentPlayed: [2, 3, 1],
    searchQuery: '',
    selectedCity: 'Tümü',
    adminUsers: [
      { id: 'usr_1', email: 'ahmet.kaya@gmail.com', date: 'Bugün 10:14', status: 'pending' },
      { id: 'usr_2', email: 'zeynep.demir@outlook.com', date: 'Dün 18:30', status: 'pending' },
      { id: 'usr_3', email: 'mehmet.oz@icloud.com', date: '3 gün önce', status: 'approved' },
      { id: 'usr_4', email: 'spam_user@tempmail.com', date: '5 gün önce', status: 'rejected' }
    ],
    userSession: {
      isLoggedIn: true,
      email: 'kullanici@example.com',
      status: 'approved', // 'pending' | 'approved' | 'rejected'
      isAdmin: true
    }
  };

  // HTML5 Audio Engine
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = state.volume;

  // DOM Elements
  const elIphone = document.getElementById('iphoneScreen');
  const elExternalAudioStatus = document.getElementById('externalAudioStatus');
  const elExternalPlayBtn = document.getElementById('externalPlayBtn');
  const elExternalStationName = document.getElementById('externalStationName');

  // Initialize
  function init() {
    setupControls();
    renderAllViews();
    applyTheme(state.theme);
    showScreen(state.screen);
    setupAudioListeners();
  }

  function setupAudioListeners() {
    audio.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlaybackUI();
    });
    audio.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlaybackUI();
    });
    audio.addEventListener('error', (e) => {
      console.warn("Audio error/notice:", e);
      // Fallback notification
    });
  }

  function cleanStreamUrl(rawUrl) {
    let u = (rawUrl || '').trim();
    if (u.startsWith('icy://')) u = 'https://' + u.slice(6);
    if (u.toLowerCase().includes('listen.pls')) {
      u = u.replace(/\/listen\.pls.*/i, '/;').replace(/listen\.pls.*/i, ';');
    }
    if (/:\d{2,5}$/.test(u)) u = u + '/;';
    else if (/:\d{2,5}\/$/.test(u)) u = u + ';';
    return u;
  }

  function playStation(station) {
    if (!station || !station.url) return;
    if (state.currentStation && state.currentStation.id === station.id && state.isPlaying) {
      pauseAudio();
      return;
    }
    state.currentStation = station;
    if (!state.recentPlayed.includes(station.id)) {
      state.recentPlayed.unshift(station.id);
    }

    audio.src = cleanStreamUrl(station.url);
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlaybackUI();
    }).catch(err => {
      console.log("Autoplay or stream load notice:", err);
      // Still show state in UI
      state.isPlaying = true;
      updatePlaybackUI();
    });

    // Update Media Session (iOS Lock Screen simulation)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: 'rAdio Canlı Yayın',
        album: station.category,
        artwork: [{ src: station.logo, sizes: '512x512', type: 'image/png' }]
      });
    }
  }

  function togglePlayPause() {
    if (state.isPlaying) {
      pauseAudio();
    } else {
      if (state.currentStation) {
        playStation(state.currentStation);
      }
    }
  }

  function pauseAudio() {
    audio.pause();
    state.isPlaying = false;
    updatePlaybackUI();
  }

  function updatePlaybackUI() {
    // Dynamic Island pulse
    const islandWave = document.querySelector('.island-wave');
    if (islandWave) {
      islandWave.style.opacity = state.isPlaying ? '1' : '0.2';
    }

    // External bar
    if (elExternalPlayBtn) {
      elExternalPlayBtn.innerHTML = state.isPlaying ? '⏸' : '▶';
    }
    if (elExternalStationName) {
      elExternalStationName.textContent = state.currentStation ? state.currentStation.name : 'Radyo Seçin';
    }
    if (elExternalAudioStatus) {
      elExternalAudioStatus.textContent = state.isPlaying ? 'Çalıyor (Canlı)' : 'Durduruldu';
      elExternalAudioStatus.className = state.isPlaying ? 'badge badge-live' : 'badge';
    }

    // Modern mini player
    const modernMiniName = document.getElementById('modernMiniName');
    const modernMiniCat = document.getElementById('modernMiniCat');
    const modernMiniLogo = document.getElementById('modernMiniLogo');
    const modernMiniBtn = document.getElementById('modernMiniPlayBtn');

    if (modernMiniName) modernMiniName.textContent = state.currentStation.name;
    if (modernMiniCat) modernMiniCat.textContent = state.isPlaying ? '● CANLI YAYIN' : 'Duraklatıldı';
    if (modernMiniLogo) modernMiniLogo.src = state.currentStation.logo;
    if (modernMiniBtn) modernMiniBtn.textContent = state.isPlaying ? '⏸' : '▶';

    // Minimal vinyl animation
    const vinyl = document.getElementById('minimalVinyl');
    const minimalPlayBtn = document.getElementById('minimalPlayBtn');
    const minimalTitle = document.getElementById('minimalTitle');
    const minimalLogo = document.getElementById('minimalLogo');
    const minimalMeta = document.getElementById('minimalMeta');

    if (vinyl) {
      if (state.isPlaying) {
        vinyl.classList.add('playing');
      } else {
        vinyl.classList.remove('playing');
      }
    }
    if (minimalPlayBtn) minimalPlayBtn.textContent = state.isPlaying ? '⏸' : '▶';
    if (minimalTitle) minimalTitle.textContent = state.currentStation.name;
    if (minimalLogo) minimalLogo.src = state.currentStation.logo;
    if (minimalMeta) minimalMeta.textContent = `${state.currentStation.category} • ${state.currentStation.format} 128K`;

    // Active station highlighting in lists
    document.querySelectorAll('[data-station-id]').forEach(el => {
      const id = parseInt(el.getAttribute('data-station-id'));
      if (id === state.currentStation.id) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  function applyTheme(themeName) {
    state.theme = themeName;
    localStorage.setItem('radio_theme', themeName);

    // Update Pill Buttons
    document.querySelectorAll('[data-set-theme]').forEach(btn => {
      if (btn.getAttribute('data-set-theme') === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Theme Explanation Badge
    const elThemeDesc = document.getElementById('themeDescription');
    if (elThemeDesc) {
      if (themeName === 'modern') {
        elThemeDesc.innerHTML = '<strong>Tasarım 1 – Modern:</strong> Renkli vitrin kartları, popüler radyolar kaydırma şeridi, kategori ızgarası ve altta sabit mini oynatıcı.';
      } else if (themeName === 'minimal') {
        elThemeDesc.innerHTML = '<strong>Tasarım 2 – Minimal:</strong> Oynatıcı odaklı tasarım, dönen dev vinil disk, 76px dev oynat/durdur butonu ve sade tipografi.';
      } else if (themeName === 'directory') {
        elThemeDesc.innerHTML = '<strong>Tasarım 3 – Radyo Rehberi:</strong> Hızlı istasyon listesi, şehir filtreleri (81 il), alfabetik arama ve kompakt frekans tablosu.';
      }
    }

    // Show correct view layer
    renderAllViews();
    showScreen(state.screen);
  }

  function showScreen(screenName) {
    state.screen = screenName;

    // Update Pill Buttons
    document.querySelectorAll('[data-set-screen]').forEach(btn => {
      if (btn.getAttribute('data-set-screen') === screenName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Hide all view layers
    document.querySelectorAll('.view-layer').forEach(layer => {
      layer.classList.remove('active');
    });

    // Target mapping
    let targetLayerId = '';
    if (screenName === 'home') {
      targetLayerId = state.theme === 'minimal' ? 'viewMinimalHome' : (state.theme === 'directory' ? 'viewDirectoryHome' : 'viewModernHome');
    } else if (screenName === 'categories') {
      targetLayerId = 'viewCategories';
    } else if (screenName === 'player') {
      targetLayerId = 'viewPlayerModal';
    } else if (screenName === 'auth') {
      targetLayerId = 'viewAuthScreen';
    } else if (screenName === 'admin') {
      targetLayerId = 'viewAdminScreen';
    }

    const targetEl = document.getElementById(targetLayerId);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    // Bottom bar visibility
    const modernNav = document.getElementById('modernBottomNav');
    const modernMini = document.getElementById('modernMiniPlayer');
    if (modernNav) {
      modernNav.style.display = (screenName === 'auth' || screenName === 'admin' || screenName === 'player' || state.theme === 'minimal') ? 'none' : 'flex';
    }
    if (modernMini) {
      modernMini.style.display = (screenName === 'auth' || screenName === 'admin' || screenName === 'player' || state.theme === 'minimal') ? 'none' : 'flex';
    }

    updatePlaybackUI();
  }

  // Render Functions
  function renderAllViews() {
    renderModernHome();
    renderMinimalHome();
    renderDirectoryHome();
    renderCategoriesView();
    renderPlayerModalView();
    renderAuthView();
    renderAdminView();
  }

  function renderModernHome() {
    const container = document.getElementById('viewModernHome');
    if (!container) return;

    let popHtml = RADIO_DATA.stations.map(st => `
      <div class="popular-chip ${st.id === state.currentStation.id ? 'active' : ''}" data-station-id="${st.id}">
        <img src="${st.logo}" alt="${st.name}" onerror="this.src='../assets/brand/favicon.svg'">
        <div class="chip-name">${st.name}</div>
        <div class="chip-cat">${st.category}</div>
      </div>
    `).join('');

    let catHtml = RADIO_DATA.categories.slice(0, 6).map(c => `
      <div class="category-card" data-cat-id="${c.id}">
        <div class="cat-icon">${c.icon}</div>
        <div>
          <div class="cat-name">${c.name}</div>
          <div style="font-size:11px; color:#64748b;">Radyolar</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="modern-view">
        <div class="modern-topbar">
          <img src="../assets/brand/logo.svg" style="height:32px;" alt="rAdio">
          <div style="display:flex; gap:10px;">
            <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('auth')" title="Giriş / Hesap">👤</button>
            <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('admin')" title="Yönetici Paneli">👑</button>
          </div>
        </div>

        <div class="modern-search-bar" onclick="window.protoEngine.applyTheme('directory')">
          <span style="font-size:16px;">🔍</span>
          <span>1.426 Radyo İçinde Ara...</span>
        </div>

        <div class="hero-banner">
          <div class="hero-badge">ÖNE ÇIKAN İSTASYON</div>
          <div class="hero-title">${state.currentStation.name}</div>
          <div class="hero-desc">${state.currentStation.category} • Canlı ve Kesintisiz Yayın</div>
          <button class="hero-play-btn" onclick="window.protoEngine.togglePlayPause()">
            <span>${state.isPlaying ? '⏸ Duraklat' : '▶ Hemen Dinle'}</span>
          </button>
        </div>

        <div class="section-head">
          <div class="section-title">Popüler İstasyonlar</div>
          <div class="section-link" onclick="window.protoEngine.applyTheme('directory')">Tümü (176)</div>
        </div>
        <div class="horizontal-row">
          ${popHtml}
        </div>

        <div class="section-head">
          <div class="section-title">Kategoriler</div>
          <div class="section-link" onclick="window.protoEngine.showScreen('categories')">Tümünü Gör (24)</div>
        </div>
        <div class="categories-grid">
          ${catHtml}
        </div>
      </div>
    `;

    // Attach click listeners
    container.querySelectorAll('.popular-chip').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-station-id'));
        const st = RADIO_DATA.stations.find(s => s.id === id);
        if (st) playStation(st);
      });
    });

    container.querySelectorAll('.category-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-cat-id'));
        state.selectedCategory = id;
        showScreen('categories');
      });
    });
  }

  function renderMinimalHome() {
    const container = document.getElementById('viewMinimalHome');
    if (!container) return;

    container.innerHTML = `
      <div class="minimal-view">
        <div class="minimal-top">
          <div class="minimal-brand-name">r<span style="color:var(--accent-orange)">A</span>dio</div>
          <div style="display:flex; gap:8px;">
            <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('auth')">👤</button>
            <button class="minimal-icon-btn" onclick="window.protoEngine.applyTheme('modern')">🎨</button>
          </div>
        </div>

        <div class="minimal-art-wrapper">
          <div class="minimal-vinyl-disc ${state.isPlaying ? 'playing' : ''}" id="minimalVinyl">
            <img class="minimal-art-img" id="minimalLogo" src="${state.currentStation.logo}" alt="Logo" onerror="this.src='../assets/brand/favicon.svg'">
          </div>
        </div>

        <div class="minimal-info">
          <div class="minimal-title" id="minimalTitle">${state.currentStation.name}</div>
          <div class="minimal-meta" id="minimalMeta">${state.currentStation.category} • ${state.currentStation.format} 128K</div>
        </div>

        <div class="minimal-controls">
          <button class="minimal-sec-btn" title="Favorilere Ekle">❤️</button>
          <button class="minimal-play-btn" id="minimalPlayBtn" onclick="window.protoEngine.togglePlayPause()">
            ${state.isPlaying ? '⏸' : '▶'}
          </button>
          <button class="minimal-sec-btn" onclick="window.protoEngine.applyTheme('directory')" title="Radyo Listesi">📋</button>
        </div>

        <div class="minimal-drawer-pill" onclick="window.protoEngine.applyTheme('directory')">
          <span>▲</span>
          <span>1.426 İstasyon Arasında Gezin</span>
        </div>
      </div>
    `;
  }

  function renderDirectoryHome() {
    const container = document.getElementById('viewDirectoryHome');
    if (!container) return;

    let cityChips = ['Tümü', ...RADIO_DATA.cities.slice(0, 7)].map(city => `
      <div class="dir-chip ${state.selectedCity === city ? 'active' : ''}" onclick="window.protoEngine.filterCity('${city}')">${city}</div>
    `).join('');

    let filtered = RADIO_DATA.stations;
    if (state.selectedCity !== 'Tümü') {
      filtered = filtered.filter(s => s.city === state.selectedCity);
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }

    let listHtml = filtered.map(st => `
      <div class="dir-item ${st.id === state.currentStation.id ? 'active' : ''}" data-station-id="${st.id}">
        <div class="dir-item-left">
          <img src="${st.logo}" alt="${st.name}" onerror="this.src='../assets/brand/favicon.svg'">
          <div>
            <div class="dir-item-name">${st.name}</div>
            <div class="dir-item-tags">
              <span class="dir-badge">${st.category}</span>
              <span class="dir-badge">${st.city}</span>
              <span class="dir-badge" style="color:var(--accent-cyan);">${st.format}</span>
            </div>
          </div>
        </div>
        <div class="dir-item-right">
          <button class="play-circle-btn" style="width:30px; height:30px; font-size:12px;">
            ${st.id === state.currentStation.id && state.isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="directory-view">
        <div class="dir-header">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="dir-title">Radyo Rehberi</div>
            <button class="minimal-icon-btn" onclick="window.protoEngine.applyTheme('modern')">🎨</button>
          </div>
          <div class="dir-subtitle">1.426 Onaylı Canlı İstasyon • Şehir ve Frekanslar</div>
        </div>

        <div class="dir-search-wrap">
          <span class="dir-search-icon">🔍</span>
          <input type="text" class="dir-search-input" placeholder="İstasyon adı veya tür yazın..." value="${state.searchQuery}" oninput="window.protoEngine.searchDirectory(this.value)">
        </div>

        <div class="dir-filter-chips">
          ${cityChips}
        </div>

        <div class="dir-list">
          ${listHtml}
        </div>
      </div>
    `;

    container.querySelectorAll('.dir-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-station-id'));
        const st = RADIO_DATA.stations.find(s => s.id === id);
        if (st) playStation(st);
      });
    });
  }

  function renderCategoriesView() {
    const container = document.getElementById('viewCategories');
    if (!container) return;

    let catListHtml = RADIO_DATA.categories.map(c => `
      <div class="category-card" style="margin-bottom:8px;" onclick="window.protoEngine.selectCategoryAndFilter(${c.id})">
        <div class="cat-icon">${c.icon}</div>
        <div style="flex:1;">
          <div class="cat-name">${c.name}</div>
          <div style="font-size:11px; color:#64748b;">${c.tag}</div>
        </div>
        <span style="color:#64748b;">›</span>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
          <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('home')">←</button>
          <div style="font-size:18px; font-weight:800;">Tüm Kategoriler (24)</div>
        </div>
        <div>
          ${catListHtml}
        </div>
      </div>
    `;
  }

  function renderPlayerModalView() {
    const container = document.getElementById('viewPlayerModal');
    if (!container) return;

    container.innerHTML = `
      <div style="padding:20px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; height:100%;">
        <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
          <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('home')">✕</button>
          <div style="font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">
            ŞU AN ÇALIYOR
          </div>
          <button class="minimal-icon-btn">❤️</button>
        </div>

        <div style="margin:24px 0 16px; text-align:center;">
          <img src="${state.currentStation.logo}" style="width:180px; height:180px; border-radius:28px; box-shadow:0 20px 40px rgba(0,0,0,0.6);" onerror="this.src='../assets/brand/favicon.svg'">
        </div>

        <div style="text-align:center; margin-bottom:16px;">
          <div style="font-size:24px; font-weight:800; margin-bottom:4px;">${state.currentStation.name}</div>
          <div style="font-size:13px; color:var(--accent-orange); font-weight:600;">● CANLI YAYIN • ${state.currentStation.category}</div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${state.currentStation.format} Akışı • 128 kbps</div>
        </div>

        <!-- Simulated Waveform -->
        <div style="display:flex; align-items:center; gap:4px; height:30px; margin-bottom:20px;">
          <div class="island-bar" style="height:14px; background:#8b5cf6;"></div>
          <div class="island-bar" style="height:24px; background:#3b82f6;"></div>
          <div class="island-bar" style="height:18px; background:#06b6d4;"></div>
          <div class="island-bar" style="height:28px; background:#f97316;"></div>
          <div class="island-bar" style="height:12px; background:#8b5cf6;"></div>
        </div>

        <!-- Big Controls -->
        <div style="display:flex; align-items:center; gap:32px; margin-bottom:24px;">
          <button class="minimal-sec-btn">⏮</button>
          <button class="minimal-play-btn" style="width:70px; height:70px; font-size:28px;" onclick="window.protoEngine.togglePlayPause()">
            ${state.isPlaying ? '⏸' : '▶'}
          </button>
          <button class="minimal-sec-btn">⏭</button>
        </div>

        <!-- Sleep Timer Shortcut -->
        <div style="background:rgba(255,255,255,0.06); padding:10px 18px; border-radius:14px; font-size:12px; display:flex; gap:8px; align-items:center; cursor:pointer;" onclick="alert('Uyku Zamanlayıcısı: 30 Dakika seçildi.')">
          <span>🌙</span>
          <span>Uyku Zamanlayıcısı: Kapalı</span>
        </div>
      </div>
    `;
  }

  function renderAuthView() {
    const container = document.getElementById('viewAuthScreen');
    if (!container) return;

    container.innerHTML = `
      <div class="auth-view">
        <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
          <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('home')">✕</button>
        </div>
        <div class="auth-card">
          <div class="auth-logo-box">
            <img src="../assets/brand/logo.svg" alt="rAdio">
            <div class="auth-title">rAdio Giriş & Başvuru</div>
            <div class="auth-subtitle">Uygulamaya kontrollü erişim sağlanmaktadır. Yeni kayıtlar yönetici onayından sonra aktifleşir.</div>
          </div>

          <div class="auth-form">
            <div class="auth-field">
              <label>E-posta Adresi</label>
              <input type="email" class="auth-input" placeholder="adiniz@example.com" value="yeni.kullanici@gmail.com">
            </div>
            <div class="auth-field">
              <label>Şifre</label>
              <input type="password" class="auth-input" placeholder="••••••••" value="sifre123">
            </div>
            <button class="auth-btn-primary" onclick="window.protoEngine.simulateAccessRequest()">
              Giriş Yap / Erişim Talebi Gönder
            </button>
          </div>

          <!-- Pending notice simulation -->
          <div class="pending-notice-box" id="pendingNoticeBox" style="display:${state.userSession.status === 'pending' ? 'block' : 'none'};">
            <span class="pending-badge">⏳ BEKLEMEDE</span>
            <div style="font-size:12px; font-weight:700; color:#fbbf24; margin-bottom:4px;">Başvurunuz Yönetici Onayı Bekliyor</div>
            <div style="font-size:11px; color:#cbd5e1;">Yönetici onayladığında radyo istasyonlarına erişiminiz otomatik açılacaktır.</div>
          </div>

          <div class="auth-switch-link" onclick="window.protoEngine.showScreen('admin')">
            👑 Yönetici Onay Paneline Geç (Demo) →
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminView() {
    const container = document.getElementById('viewAdminScreen');
    if (!container) return;

    let usersHtml = state.adminUsers.map(u => {
      let badgeColor = u.status === 'approved' ? '#10b981' : (u.status === 'rejected' ? '#ef4444' : '#f59e0b');
      let badgeText = u.status === 'approved' ? 'ONAYLANDI' : (u.status === 'rejected' ? 'REDDEDİLDİ' : 'BEKLEMEDE');
      return `
        <div class="admin-user-card">
          <div class="admin-user-top">
            <span class="admin-user-email">${u.email}</span>
            <span style="font-size:10px; font-weight:800; color:${badgeColor}; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:6px;">
              ${badgeText}
            </span>
          </div>
          <div style="font-size:11px; color:var(--text-dim); display:flex; justify-content:space-between;">
            <span>Kayıt: ${u.date}</span>
            <span>ID: ${u.id}</span>
          </div>
          <div class="admin-actions-row">
            <button class="btn-approve" onclick="window.protoEngine.setAdminUserStatus('${u.id}', 'approved')">✓ Onayla</button>
            <button class="btn-reject" onclick="window.protoEngine.setAdminUserStatus('${u.id}', 'rejected')">✕ Reddet / İptal</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="admin-view">
        <div class="admin-header">
          <div style="font-size:17px; font-weight:800;">👑 Yönetici Onay Paneli</div>
          <button class="minimal-icon-btn" onclick="window.protoEngine.showScreen('home')">✕</button>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">
          Kullanıcı kayıt ve yetkilendirme istekleri Supabase Auth RLS ile denetlenir.
        </div>
        <div>
          ${usersHtml}
        </div>
      </div>
    `;
  }

  // Public API exposed to prototype
  window.protoEngine = {
    applyTheme,
    showScreen,
    togglePlayPause,
    playStation,
    filterCity(city) {
      state.selectedCity = city;
      renderDirectoryHome();
    },
    searchDirectory(q) {
      state.searchQuery = q;
      renderDirectoryHome();
    },
    selectCategoryAndFilter(catId) {
      const cat = RADIO_DATA.categories.find(c => c.id === catId);
      if (cat) {
        state.searchQuery = cat.name;
        applyTheme('directory');
      }
    },
    simulateAccessRequest() {
      state.userSession.status = 'pending';
      const box = document.getElementById('pendingNoticeBox');
      if (box) box.style.display = 'block';
      alert('Erişim başvurunuz başarıyla alındı! Yönetici onayı bekleniyor.');
    },
    setAdminUserStatus(userId, newStatus) {
      const u = state.adminUsers.find(x => x.id === userId);
      if (u) {
        u.status = newStatus;
        renderAdminView();
      }
    }
  };

  // Run on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
