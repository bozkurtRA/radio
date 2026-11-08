// rAdio Main Application Controller
class RadioApp {
  constructor() {
    this.audioEngine = new RadioAudioEngine();
    this.authManager = new RadioAuthManager();
    this.theme = RadioStorage.getTheme(); // 'modern' | 'minimal' | 'directory'
    this.activeTab = 'home'; // 'home' | 'categories' | 'favorites' | 'settings'

    this.stations = [];
    this.categories = [];
    this.popularIds = [];
    this.cities = [];

    this.searchQuery = '';
    this.selectedCategory = null;
    this.selectedCity = 'Tümü';

    this.sleepTimerMinutes = 0;
    this.sleepTimerInterval = null;
    this.sleepRemainingSeconds = 0;

    this.dom = {};
  }

  async init() {
    this._cacheDom();
    this._registerServiceWorker();
    this._setupAudioEngineListeners();
    this._setupGlobalKeyboardShortcuts();

    await this.loadData();
    this.applyTheme(this.theme, false);
    this.renderActiveTab();
    this._checkA2HSPrompt();
  }

  _cacheDom() {
    this.dom.viewport = document.getElementById('mainViewport');
    this.dom.modernNav = document.getElementById('modernTabNav');
    this.dom.miniPlayer = document.getElementById('modernMiniPlayer');
    this.dom.playerModal = document.getElementById('playerSheetModal');
    this.dom.authModal = document.getElementById('authModal');
    this.dom.adminModal = document.getElementById('adminModal');
    this.dom.toastContainer = document.getElementById('toastContainer');
    this.dom.a2hsBanner = document.getElementById('a2hsBanner');

    // Mini Player elements
    this.dom.miniLogo = document.getElementById('miniLogo');
    this.dom.miniTitle = document.getElementById('miniTitle');
    this.dom.miniSubtitle = document.getElementById('miniSubtitle');
    this.dom.miniPlayBtn = document.getElementById('miniPlayBtn');

    // Modal Player elements
    this.dom.modalLogo = document.getElementById('modalLogo');
    this.dom.modalTitle = document.getElementById('modalTitle');
    this.dom.modalGenre = document.getElementById('modalGenre');
    this.dom.modalCodec = document.getElementById('modalCodec');
    this.dom.modalPlayBtn = document.getElementById('modalPlayBtn');
    this.dom.modalFavBtn = document.getElementById('modalFavBtn');
    this.dom.modalVolSlider = document.getElementById('modalVolSlider');
    this.dom.sleepTimerText = document.getElementById('sleepTimerText');
    this.dom.vizBars = document.querySelectorAll('.viz-bar');
  }

  // Load JSON datasets
  async loadData() {
    try {
      const [catsRes, popRes, citiesRes, stationsRes] = await Promise.all([
        fetch('./data/categories.json').then(r => r.json()),
        fetch('./data/popular.json').then(r => r.json()),
        fetch('./data/cities.json').then(r => r.json()),
        fetch('./data/stations.json').then(r => r.json())
      ]);

      this.categories = catsRes;
      this.popularIds = popRes;
      this.cities = citiesRes;
      this.stations = stationsRes;

      // Set default station to first popular (Power Türk)
      if (this.stations.length > 0) {
        this.audioEngine.currentStation = this.stations[0];
        this._updatePlayerDisplays(this.stations[0]);
      }
    } catch (err) {
      console.error('[rAdio] Error loading data JSONs:', err);
      this.showToast('İstasyon verileri yüklenirken bir sorun oluştu.', '⚠️');
    }
  }

  // Audio Engine Event Hookups
  _setupAudioEngineListeners() {
    this.audioEngine.on('play', (station) => {
      this._updatePlaybackState(true, station);
    });

    this.audioEngine.on('pause', (station) => {
      this._updatePlaybackState(false, station);
    });

    this.audioEngine.on('loading', (station) => {
      if (this.dom.miniSubtitle) this.dom.miniSubtitle.textContent = 'Bağlanıyor...';
      if (this.dom.modalGenre) this.dom.modalGenre.textContent = 'Bağlantı kuruluyor...';
    });

    this.audioEngine.on('stationChange', (station) => {
      this._updatePlayerDisplays(station);
      this._refreshListActiveStates(station.id);
    });

    this.audioEngine.on('error', (msg) => {
      this.showToast(msg, '⚠️');
      this._updatePlaybackState(false, this.audioEngine.currentStation);
    });

    this.audioEngine.on('volumeChange', (vol) => {
      if (this.dom.modalVolSlider) this.dom.modalVolSlider.value = vol;
    });
  }

  _updatePlaybackState(isPlaying, station) {
    if (this.dom.miniPlayBtn) this.dom.miniPlayBtn.textContent = isPlaying ? '⏸' : '▶';
    if (this.dom.modalPlayBtn) this.dom.modalPlayBtn.textContent = isPlaying ? '⏸' : '▶';

    // Spectrum Visualizer
    if (this.dom.vizBars) {
      this.dom.vizBars.forEach(b => {
        if (isPlaying) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    // Minimal Vinyl Disc
    const vinyl = document.getElementById('vinylDisc');
    const minPlay = document.getElementById('minPlayBtn');
    if (vinyl) {
      if (isPlaying) vinyl.classList.add('is-playing');
      else vinyl.classList.remove('is-playing');
    }
    if (minPlay) minPlay.textContent = isPlaying ? '⏸' : '▶';

    // Subtitle updates
    if (this.dom.miniSubtitle && station) {
      this.dom.miniSubtitle.textContent = isPlaying ? '● CANLI YAYIN' : 'Duraklatıldı';
    }
  }

  _updatePlayerDisplays(station) {
    if (!station) return;
    const logoSrc = station.logo || './assets/brand/favicon.svg';

    if (this.dom.miniLogo) this.dom.miniLogo.src = logoSrc;
    if (this.dom.miniTitle) this.dom.miniTitle.textContent = station.name;
    if (this.dom.miniSubtitle) this.dom.miniSubtitle.textContent = this.audioEngine.isPlaying ? '● CANLI YAYIN' : station.category;

    if (this.dom.modalLogo) this.dom.modalLogo.src = logoSrc;
    if (this.dom.modalTitle) this.dom.modalTitle.textContent = station.name;
    if (this.dom.modalGenre) this.dom.modalGenre.textContent = `${station.category} • Canlı Radyo`;
    if (this.dom.modalCodec) this.dom.modalCodec.textContent = `${station.format || 'HLS'} Akışı • 128 kbps • ${station.isHttps ? 'HTTPS' : 'HTTP'}`;

    if (this.dom.modalFavBtn) {
      const isFav = RadioStorage.isFavorite(station.id);
      this.dom.modalFavBtn.textContent = isFav ? '❤️' : '🤍';
    }

    // Minimal View Updates
    const minLogo = document.getElementById('minVinylArt');
    const minTitle = document.getElementById('minStationTitle');
    const minMeta = document.getElementById('minStationMeta');
    const minFav = document.getElementById('minFavBtn');

    if (minLogo) minLogo.src = logoSrc;
    if (minTitle) minTitle.textContent = station.name;
    if (minMeta) minMeta.textContent = `${station.category} • ${station.format || 'Canlı'}`;
    if (minFav) {
      const isFav = RadioStorage.isFavorite(station.id);
      minFav.textContent = isFav ? '❤️' : '🤍';
    }
  }

  _refreshListActiveStates(activeId) {
    document.querySelectorAll('[data-st-id]').forEach(el => {
      const id = parseInt(el.getAttribute('data-st-id'));
      if (id === activeId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  // Next / Previous Station
  playAdjacentStation(delta) {
    if (!this.stations.length) return;
    const currentId = this.audioEngine.currentStation ? this.audioEngine.currentStation.id : this.stations[0].id;
    const idx = this.stations.findIndex(s => s.id === currentId);
    let nextIdx = idx + delta;
    if (nextIdx < 0) nextIdx = this.stations.length - 1;
    if (nextIdx >= this.stations.length) nextIdx = 0;
    this.audioEngine.playStation(this.stations[nextIdx]);
  }

  // Design Theme Switcher (Crucial: never interrupts audio!)
  applyTheme(themeName, showToastMsg = true) {
    this.theme = themeName;
    RadioStorage.setTheme(themeName);

    // Update bottom nav and miniplayer visibility
    if (themeName === 'minimal') {
      if (this.dom.modernNav) this.dom.modernNav.style.display = 'none';
      if (this.dom.miniPlayer) this.dom.miniPlayer.style.display = 'none';
      if (this.dom.viewport) this.dom.viewport.classList.add('no-bottom-nav');
    } else {
      if (this.dom.modernNav) this.dom.modernNav.style.display = 'flex';
      if (this.dom.miniPlayer) this.dom.miniPlayer.style.display = 'flex';
      if (this.dom.viewport) this.dom.viewport.classList.remove('no-bottom-nav');
    }

    this.renderActiveTab();
    if (showToastMsg) {
      const nameMap = { modern: 'Modern Vitrin', minimal: 'Minimal Plak', directory: 'Radyo Rehberi' };
      this.showToast(`Arayüz değiştirildi: ${nameMap[themeName] || themeName}`, '🎨');
    }
  }

  // Switch Bottom Nav Tabs
  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.renderActiveTab();
  }

  // Main Render Dispatcher
  renderActiveTab() {
    if (!this.dom.viewport) return;

    if (this.activeTab === 'categories') {
      this.renderCategoriesTab();
    } else if (this.activeTab === 'favorites') {
      this.renderFavoritesTab();
    } else if (this.activeTab === 'settings') {
      this.renderSettingsTab();
    } else {
      // Home tab renders based on active theme
      if (this.theme === 'minimal') {
        this.renderMinimalHome();
      } else if (this.theme === 'directory') {
        this.renderDirectoryHome();
      } else {
        this.renderModernHome();
      }
    }
  }

  // ==========================================
  // VIEW: DESIGN 1 (MODERN HOME)
  // ==========================================
  renderModernHome() {
    const cur = this.audioEngine.currentStation || this.stations[0];
    const popularStations = this.stations.filter(s => s.isPopular).slice(0, 20);
    const recentIds = RadioStorage.getRecent();
    const recentStations = this.stations.filter(s => recentIds.includes(s.id)).slice(0, 10);

    let popChipsHtml = popularStations.map(st => `
      <div class="station-card-chip ${cur && cur.id === st.id ? 'active' : ''}" data-st-id="${st.id}" onclick="window.rApp.audioEngine.playStation(window.rApp.getStationById(${st.id}))">
        <img src="${st.logo || './assets/brand/favicon.svg'}" alt="${st.name}" loading="lazy">
        <div class="station-card-name">${st.name}</div>
        <div class="station-card-genre">${st.category}</div>
      </div>
    `).join('');

    let recentChipsHtml = recentStations.length > 0 ? `
      <div class="section-header">
        <div class="section-title"><span>🕒</span> Son Dinlenenler</div>
      </div>
      <div class="horizontal-scroll-row">
        ${recentStations.map(st => `
          <div class="station-card-chip ${cur && cur.id === st.id ? 'active' : ''}" data-st-id="${st.id}" onclick="window.rApp.audioEngine.playStation(window.rApp.getStationById(${st.id}))">
            <img src="${st.logo || './assets/brand/favicon.svg'}" alt="${st.name}">
            <div class="station-card-name">${st.name}</div>
            <div class="station-card-genre">${st.category}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    let categoriesGridHtml = this.categories.slice(0, 8).map(c => `
      <div class="modern-cat-card" onclick="window.rApp.filterByCategory(${c.id})">
        <div class="modern-cat-icon">${this._getCategoryEmoji(c.id)}</div>
        <div class="modern-cat-info">
          <div class="cat-name">${c.name}</div>
          <div class="cat-count">Radyoları Gör ›</div>
        </div>
      </div>
    `).join('');

    this.dom.viewport.innerHTML = `
      <div class="modern-container">
        
        <!-- Hero Featured Card -->
        <div class="hero-card">
          <div class="hero-glow-sphere"></div>
          <div class="hero-tag">ÖNE ÇIKAN İSTASYON</div>
          <div class="hero-title">${cur ? cur.name : 'Power Türk'}</div>
          <div class="hero-subtitle">${cur ? cur.category : 'Pop'} • Kesintisiz Canlı Yayın</div>
          <button class="hero-play-button" onclick="window.rApp.audioEngine.togglePlayPause()">
            <span>${this.audioEngine.isPlaying ? '⏸ Duraklat' : '▶ Hemen Dinle'}</span>
          </button>
        </div>

        ${recentChipsHtml}

        <!-- Popüler Radyolar -->
        <div>
          <div class="section-header">
            <div class="section-title"><span>🔥</span> Popüler Radyolar</div>
            <div class="section-action" onclick="window.rApp.applyTheme('directory')">Tümü (176) ›</div>
          </div>
          <div class="horizontal-scroll-row">
            ${popChipsHtml}
          </div>
        </div>

        <!-- Kategoriler -->
        <div>
          <div class="section-header">
            <div class="section-title"><span>🏷️</span> Kategoriler</div>
            <div class="section-action" onclick="window.rApp.switchTab('categories')">Tümünü Gör (24) ›</div>
          </div>
          <div class="modern-categories-grid">
            ${categoriesGridHtml}
          </div>
        </div>

      </div>
    `;
  }

  // ==========================================
  // VIEW: DESIGN 2 (MINIMAL HOME)
  // ==========================================
  renderMinimalHome() {
    const cur = this.audioEngine.currentStation || this.stations[0];
    const isPlaying = this.audioEngine.isPlaying;
    const isFav = cur ? RadioStorage.isFavorite(cur.id) : false;

    this.dom.viewport.innerHTML = `
      <div class="minimal-container">
        
        <div class="minimal-header">
          <div class="minimal-brand-title">r<span>A</span>dio</div>
          <div style="display:flex; gap:8px;">
            <button class="icon-btn" onclick="window.rApp.openSettingsModal()" title="Ayarlar">⚙️</button>
            <button class="icon-btn" onclick="window.rApp.applyTheme('modern')" title="Modern Tasarım">🎨</button>
          </div>
        </div>

        <!-- Vinyl Turntable Disc -->
        <div class="vinyl-deck" onclick="window.rApp.audioEngine.togglePlayPause()">
          <div class="vinyl-record ${isPlaying ? 'is-playing' : ''}" id="vinylDisc">
            <img class="vinyl-center-art" id="minVinylArt" src="${cur ? (cur.logo || './assets/brand/favicon.svg') : './assets/brand/favicon.svg'}" alt="Artwork">
            <div class="vinyl-spindle"></div>
          </div>
        </div>

        <!-- Station Info -->
        <div class="minimal-station-info">
          <div class="minimal-station-title" id="minStationTitle">${cur ? cur.name : 'Power Türk'}</div>
          <div class="minimal-station-meta" id="minStationMeta">
            <span class="badge ${isPlaying ? 'badge-live' : ''}">${isPlaying ? 'CANLI' : 'BEKLEMEDE'}</span>
            <span>${cur ? cur.category : 'Pop'}</span>
            <span>•</span>
            <span>${cur ? cur.format : 'HLS'} 128K</span>
          </div>
        </div>

        <!-- Giant Touch Controls -->
        <div class="minimal-controls-row">
          <button class="minimal-btn-side ${isFav ? 'is-fav' : ''}" id="minFavBtn" onclick="window.rApp.toggleCurrentFavorite()">
            ${isFav ? '❤️' : '🤍'}
          </button>
          <button class="minimal-btn-play" id="minPlayBtn" onclick="window.rApp.audioEngine.togglePlayPause()">
            ${isPlaying ? '⏸' : '▶'}
          </button>
          <button class="minimal-btn-side" onclick="window.rApp.applyTheme('directory')" title="Radyo Listesi">
            📋
          </button>
        </div>

        <!-- Gesture Browse Pill -->
        <div class="minimal-browse-pill" onclick="window.rApp.applyTheme('directory')">
          <span>▲</span>
          <span>1.426 İstasyon Arasında Gezin</span>
        </div>

      </div>
    `;
  }

  // ==========================================
  // VIEW: DESIGN 3 (DIRECTORY HOME)
  // ==========================================
  renderDirectoryHome() {
    let filtered = this.stations;

    // Filter by city
    if (this.selectedCity !== 'Tümü') {
      const qCity = this.selectedCity.toLowerCase();
      filtered = filtered.filter(s => (s.tags && s.tags.includes(qCity)) || (s.name.toLowerCase().includes(qCity)));
    }

    // Filter by category
    if (this.selectedCategory !== null) {
      filtered = filtered.filter(s => s.categoryId === this.selectedCategory);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q)));
    }

    const cur = this.audioEngine.currentStation;
    const isPlaying = this.audioEngine.isPlaying;

    let cityPills = ['Tümü', 'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Trabzon', 'Konya'].map(c => `
      <button class="filter-chip-btn ${this.selectedCity === c ? 'active' : ''}" onclick="window.rApp.filterByCity('${c}')">${c}</button>
    `).join('');

    let stationsRowsHtml = filtered.slice(0, 100).map(st => {
      const isCur = cur && cur.id === st.id;
      return `
        <div class="dir-station-row ${isCur ? 'active' : ''}" data-st-id="${st.id}" onclick="window.rApp.audioEngine.playStation(window.rApp.getStationById(${st.id}))">
          <div class="dir-row-left">
            <img class="dir-row-logo" src="${st.logo || './assets/brand/favicon.svg'}" alt="${st.name}" loading="lazy">
            <div class="dir-row-details">
              <div class="dir-row-name">${st.name}</div>
              <div class="dir-row-tags">
                <span class="dir-tag-badge">${st.category}</span>
                <span class="dir-tag-badge dir-tag-format">${st.format}</span>
                ${st.isPopular ? '<span class="badge badge-live" style="font-size:9px; padding:1px 5px;">POPÜLER</span>' : ''}
              </div>
            </div>
          </div>
          <div class="dir-row-right">
            <button class="dir-mini-play-btn">
              ${isCur && isPlaying ? '⏸' : '▶'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.dom.viewport.innerHTML = `
      <div class="directory-container">
        
        <div class="dir-top-meta">
          <div>
            <div class="dir-main-title">Radyo Rehberi</div>
            <div style="font-size:12px; color:var(--text-tertiary);">Frekanslar, Şehirler ve Kategoriler</div>
          </div>
          <span class="dir-stats-badge">${filtered.length} İstasyon</span>
        </div>

        <!-- Search Bar -->
        <div class="dir-search-box">
          <span class="dir-search-lens">🔍</span>
          <input type="text" placeholder="Radyo adı veya tür yazın..." value="${this.searchQuery}" oninput="window.rApp.onSearchInput(this.value)">
          ${this.searchQuery ? '<button class="dir-clear-btn" onclick="window.rApp.clearSearch()">✕</button>' : ''}
        </div>

        <!-- City Horizontal Filter Chips -->
        <div class="dir-chips-slider">
          ${cityPills}
        </div>

        <!-- Station Rows -->
        <div class="dir-stations-table">
          ${stationsRowsHtml || '<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary);">Aramanıza uygun radyo bulunamadı.</div>'}
        </div>

      </div>
    `;
  }

  // ==========================================
  // VIEW: CATEGORIES TAB
  // ==========================================
  renderCategoriesTab() {
    let catCardsHtml = this.categories.map(c => {
      const count = this.stations.filter(s => s.categoryId === c.id).length;
      return `
        <div class="modern-cat-card" style="margin-bottom:8px;" onclick="window.rApp.filterByCategory(${c.id})">
          <div class="modern-cat-icon">${this._getCategoryEmoji(c.id)}</div>
          <div class="modern-cat-info" style="flex:1;">
            <div class="cat-name">${c.name}</div>
            <div class="cat-count">${count > 0 ? count + ' Canlı İstasyon' : 'Radyoları Keşfet'}</div>
          </div>
          <span style="color:var(--text-tertiary); font-size:18px;">›</span>
        </div>
      `;
    }).join('');

    this.dom.viewport.innerHTML = `
      <div style="padding:16px;">
        <div class="section-header" style="margin-bottom:16px;">
          <div class="section-title"><span>🏷️</span> Tüm Radyo Kategorileri (24)</div>
        </div>
        <div>
          ${catCardsHtml}
        </div>
      </div>
    `;
  }

  // ==========================================
  // VIEW: FAVORITES TAB
  // ==========================================
  renderFavoritesTab() {
    const favIds = RadioStorage.getFavorites();
    const favStations = this.stations.filter(s => favIds.includes(s.id));
    const cur = this.audioEngine.currentStation;
    const isPlaying = this.audioEngine.isPlaying;

    let favRowsHtml = favStations.map(st => {
      const isCur = cur && cur.id === st.id;
      return `
        <div class="dir-station-row ${isCur ? 'active' : ''}" data-st-id="${st.id}" onclick="window.rApp.audioEngine.playStation(window.rApp.getStationById(${st.id}))">
          <div class="dir-row-left">
            <img class="dir-row-logo" src="${st.logo || './assets/brand/favicon.svg'}" alt="${st.name}">
            <div class="dir-row-details">
              <div class="dir-row-name">${st.name}</div>
              <div class="dir-row-tags">
                <span class="dir-tag-badge">${st.category}</span>
                <span class="dir-tag-badge dir-tag-format">${st.format}</span>
              </div>
            </div>
          </div>
          <div class="dir-row-right">
            <button class="icon-btn" style="width:30px; height:30px; font-size:12px; border:none;" onclick="event.stopPropagation(); window.rApp.removeFavorite(${st.id})">
              ❤️
            </button>
            <button class="dir-mini-play-btn">
              ${isCur && isPlaying ? '⏸' : '▶'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.dom.viewport.innerHTML = `
      <div style="padding:16px;">
        <div class="section-header" style="margin-bottom:16px;">
          <div class="section-title"><span>❤️</span> Favori İstasyonlarım (${favStations.length})</div>
        </div>
        <div class="dir-stations-table">
          ${favRowsHtml || `
            <div style="text-align:center; padding:60px 20px; color:var(--text-tertiary);">
              <div style="font-size:36px; margin-bottom:10px;">🤍</div>
              <div style="font-size:15px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Henüz Favori Eklenmedi</div>
              <div style="font-size:13px;">Beğendiğiniz radyoların kalp ikonuna basarak bu listeye ekleyebilirsiniz.</div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // ==========================================
  // VIEW: SETTINGS TAB (DESIGN SWITCHER & SLEEP TIMER)
  // ==========================================
  renderSettingsTab() {
    const user = RadioStorage.getUser();

    this.dom.viewport.innerHTML = `
      <div style="padding:16px; display:flex; flex-direction:column; gap:20px;">
        
        <div class="section-header">
          <div class="section-title"><span>⚙️</span> Ayarlar & Tercihler</div>
        </div>

        <!-- 3 Distinct Designs Selector Card -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border-light); border-radius:20px; padding:18px;">
          <div style="font-size:15px; font-weight:800; margin-bottom:4px;">Arayüz Tasarımı Seçimi</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;">
            Tasarım değişikliği anında uygulanır ve radyo yayını kesilmeden çalmaya devam eder.
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
            <!-- Modern Card -->
            <div style="border:2px solid ${this.theme === 'modern' ? 'var(--accent-purple)' : 'var(--glass-border)'}; background:${this.theme === 'modern' ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)'}; border-radius:16px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="window.rApp.applyTheme('modern')">
              <div>
                <div style="font-size:14px; font-weight:700;">🎨 Tasarım 1 – Modern</div>
                <div style="font-size:11px; color:var(--text-secondary);">Renkli kartlar, popüler şeridi, kategori vitrini ve mini oynatıcı</div>
              </div>
              ${this.theme === 'modern' ? '<span style="color:var(--accent-purple); font-weight:bold;">✓ Seçili</span>' : ''}
            </div>

            <!-- Minimal Card -->
            <div style="border:2px solid ${this.theme === 'minimal' ? 'var(--accent-cyan)' : 'var(--glass-border)'}; background:${this.theme === 'minimal' ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)'}; border-radius:16px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="window.rApp.applyTheme('minimal')">
              <div>
                <div style="font-size:14px; font-weight:700;">⚡ Tasarım 2 – Minimal</div>
                <div style="font-size:11px; color:var(--text-secondary);">Dönen vinil plak, 76px dev buton, sade oynatıcı odaklı ekran</div>
              </div>
              ${this.theme === 'minimal' ? '<span style="color:var(--accent-cyan); font-weight:bold;">✓ Seçili</span>' : ''}
            </div>

            <!-- Directory Card -->
            <div style="border:2px solid ${this.theme === 'directory' ? 'var(--accent-orange)' : 'var(--glass-border)'}; background:${this.theme === 'directory' ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)'}; border-radius:16px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="window.rApp.applyTheme('directory')">
              <div>
                <div style="font-size:14px; font-weight:700;">📋 Tasarım 3 – Radyo Rehberi</div>
                <div style="font-size:11px; color:var(--text-secondary);">Frekans listeleri, 81 il filtresi, hızlı arama ve kompakt satırlar</div>
              </div>
              ${this.theme === 'directory' ? '<span style="color:var(--accent-orange); font-weight:bold;">✓ Seçili</span>' : ''}
            </div>
          </div>
        </div>

        <!-- Sleep Timer Selector -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px;">
          <div style="font-size:15px; font-weight:800; margin-bottom:4px;">🌙 Uyku Zamanlayıcısı</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            ${this.sleepRemainingSeconds > 0 ? `Kalan süre: <strong>${Math.ceil(this.sleepRemainingSeconds / 60)} dakika</strong>` : 'Belirlenen süre sonunda radyo otomatik durur.'}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${[0, 15, 30, 45, 60, 90].map(mins => `
              <button class="filter-chip-btn ${this.sleepTimerMinutes === mins ? 'active' : ''}" onclick="window.rApp.setSleepTimer(${mins})">
                ${mins === 0 ? 'Kapalı' : mins + ' Dk'}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Account & Security Section -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px;">
          <div style="font-size:15px; font-weight:800; margin-bottom:4px;">🔐 Hesap ve Güvenlik</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            Oturum: <strong>${user ? user.email : 'Misafir'}</strong> • Durum: <span class="badge ${user && user.status === 'approved' ? 'badge-live' : ''}">${user ? user.status.toUpperCase() : 'YOK'}</span>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="filter-chip-btn" onclick="window.rApp.openAuthModal()">
              Hesap Değiştir / Giriş
            </button>
            <button class="filter-chip-btn" style="border-color:var(--accent-purple);" onclick="window.rApp.openAdminModal()">
              👑 Yönetici Onay Paneli
            </button>
          </div>
        </div>

        <!-- iOS PWA Install Guide Action -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px; text-align:center;">
          <div style="font-size:14px; font-weight:700; margin-bottom:6px;">📱 Ana Ekrana Ekleme Kılavuzu</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            Safari'de Paylaş düğmesine dokunup "Ana Ekrana Ekle"yi seçerek rAdio'yu tam ekran uygulama gibi kullanabilirsiniz.
          </div>
          <button class="filter-chip-btn" style="background:var(--accent-orange); color:#fff; border:none;" onclick="window.rApp.showA2HSPrompt(true)">
            Kılavuzu Göster
          </button>
        </div>

      </div>
    `;
  }

  // ==========================================
  // PLAYER MODAL BOTTOM SHEET
  // ==========================================
  openPlayerModal() {
    if (this.dom.playerModal) {
      this.dom.playerModal.classList.add('open');
      this._updatePlayerDisplays(this.audioEngine.currentStation);
    }
  }

  closePlayerModal() {
    if (this.dom.playerModal) {
      this.dom.playerModal.classList.remove('open');
    }
  }

  toggleCurrentFavorite() {
    if (!this.audioEngine.currentStation) return;
    const isNowFav = RadioStorage.toggleFavorite(this.audioEngine.currentStation.id);
    this._updatePlayerDisplays(this.audioEngine.currentStation);
    this.showToast(isNowFav ? 'Favorilere eklendi ❤️' : 'Favorilerden çıkarıldı 🤍');
    if (this.activeTab === 'favorites') this.renderFavoritesTab();
  }

  removeFavorite(stId) {
    RadioStorage.toggleFavorite(stId);
    this.renderFavoritesTab();
    this.showToast('İstasyon favorilerden kaldırıldı.');
  }

  // Volume Slider Change
  onVolumeChange(val) {
    this.audioEngine.setVolume(parseFloat(val));
  }

  // Sleep Timer
  setSleepTimer(minutes) {
    if (this.sleepTimerInterval) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }

    this.sleepTimerMinutes = minutes;
    this.sleepRemainingSeconds = minutes * 60;

    if (minutes > 0) {
      this.showToast(`Uyku zamanlayıcısı ${minutes} dakikaya ayarlandı.`, '🌙');
      this.sleepTimerInterval = setInterval(() => {
        this.sleepRemainingSeconds--;
        if (this.dom.sleepTimerText) {
          const m = Math.ceil(this.sleepRemainingSeconds / 60);
          this.dom.sleepTimerText.textContent = `Uyku: ${m} Dk`;
        }
        if (this.sleepRemainingSeconds <= 0) {
          clearInterval(this.sleepTimerInterval);
          this.sleepTimerInterval = null;
          this.sleepTimerMinutes = 0;
          this.audioEngine.pause();
          this.showToast('Uyku zamanlayıcısı doldu, radyo durduruldu.', '🌙');
          if (this.dom.sleepTimerText) this.dom.sleepTimerText.textContent = 'Uyku: Kapalı';
        }
      }, 1000);
      if (this.dom.sleepTimerText) this.dom.sleepTimerText.textContent = `Uyku: ${minutes} Dk`;
    } else {
      this.showToast('Uyku zamanlayıcısı kapatıldı.', '🌙');
      if (this.dom.sleepTimerText) this.dom.sleepTimerText.textContent = 'Uyku: Kapalı';
    }

    if (this.activeTab === 'settings') this.renderSettingsTab();
  }

  // Filter Helpers
  filterByCategory(catId) {
    this.selectedCategory = catId;
    this.activeTab = 'home';
    this.applyTheme('directory', false);
  }

  filterByCity(cityName) {
    this.selectedCity = cityName;
    this.renderDirectoryHome();
  }

  onSearchInput(val) {
    this.searchQuery = val;
    this.renderDirectoryHome();
  }

  clearSearch() {
    this.searchQuery = '';
    this.renderDirectoryHome();
  }

  getStationById(id) {
    return this.stations.find(s => s.id === id);
  }

  _getCategoryEmoji(id) {
    const map = {
      990: '🎵', 1000: '🎻', 1010: '🌍', 1030: '📰', 1040: '🌙',
      1050: '🪕', 1060: '📻', 1070: '🕌', 1080: '⚡', 1090: '🎤',
      1100: '🎷', 1105: '✨', 1110: '🏙️', 1120: '🪘', 1130: '🎹',
      1140: '🎸', 1150: '🌿', 1160: '☕', 1170: '🔀', 1180: '🎙️',
      1190: '🌊', 1200: '🧸', 1210: '🇦🇿', 1220: '🎭'
    };
    return map[id] || '📻';
  }

  // Auth & Admin Modals
  openAuthModal() {
    if (this.dom.authModal) this.dom.authModal.classList.add('open');
  }

  closeAuthModal() {
    if (this.dom.authModal) this.dom.authModal.classList.remove('open');
  }

  openAdminModal() {
    if (this.dom.adminModal) {
      this.renderAdminRequests();
      this.dom.adminModal.classList.add('open');
    }
  }

  closeAdminModal() {
    if (this.dom.adminModal) this.dom.adminModal.classList.remove('open');
  }

  openSettingsModal() {
    this.switchTab('settings');
  }

  // Handle Form Submission
  handleAuthSubmit(action) {
    const emailInput = document.getElementById('authEmailInput');
    const passInput = document.getElementById('authPasswordInput');
    if (!emailInput || !passInput) return;

    const email = emailInput.value.trim();
    const pass = passInput.value.trim();

    if (action === 'request') {
      const res = this.authManager.requestAccess(email, pass);
      if (res.success) {
        this.showToast(res.message, '✓');
        this.closeAuthModal();
      } else {
        this.showToast(res.message, '⚠️');
      }
    } else {
      const res = this.authManager.login(email, pass);
      if (res.success) {
        this.showToast(res.message, '✓');
        this.closeAuthModal();
      } else {
        this.showToast(res.message, '⚠️');
      }
    }
    if (this.activeTab === 'settings') this.renderSettingsTab();
  }

  renderAdminRequests() {
    const container = document.getElementById('adminRequestsContainer');
    if (!container) return;

    const users = this.authManager.getAllUsers();
    container.innerHTML = users.map(u => {
      let badgeColor = u.status === 'approved' ? 'var(--accent-green)' : (u.status === 'rejected' ? 'var(--accent-red)' : 'var(--accent-orange)');
      let badgeText = u.status === 'approved' ? 'ONAYLANDI' : (u.status === 'rejected' ? 'REDDEDİLDİ' : 'BEKLEMEDE');
      return `
        <div class="admin-request-card">
          <div class="admin-req-top">
            <span class="admin-req-email">${u.email}</span>
            <span class="badge" style="color:${badgeColor}; font-weight:800;">${badgeText}</span>
          </div>
          <div class="admin-req-time">Kayıt: ${u.date} • Rol: ${u.role || 'user'}</div>
          <div class="admin-action-buttons">
            <button class="btn-admin-approve" onclick="window.rApp.adminApproveUser('${u.id}')">✓ Onayla</button>
            <button class="btn-admin-reject" onclick="window.rApp.adminRejectUser('${u.id}')">✕ Reddet / İptal</button>
          </div>
        </div>
      `;
    }).join('');
  }

  adminApproveUser(id) {
    this.authManager.approveUser(id);
    this.renderAdminRequests();
    this.showToast('Kullanıcı onaylandı! Yayın erişimi açıldı.', '✓');
  }

  adminRejectUser(id) {
    this.authManager.rejectUser(id);
    this.renderAdminRequests();
    this.showToast('Kullanıcı erişimi durduruldu.', '✕');
  }

  // Toast Notification
  showToast(message, icon = 'ℹ️') {
    if (!this.dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // iOS Add to Home Screen (A2HS) Prompt
  _checkA2HSPrompt() {
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = ('standalone' in window.navigator) && window.navigator.standalone;

    if (isIos && !isStandalone && !RadioStorage.isA2HSDismissed()) {
      setTimeout(() => {
        this.showA2HSPrompt(false);
      }, 3000);
    }
  }

  showA2HSPrompt(force = false) {
    if (this.dom.a2hsBanner) {
      this.dom.a2hsBanner.style.display = 'flex';
    }
  }

  dismissA2HS() {
    RadioStorage.setA2HSDismissed();
    if (this.dom.a2hsBanner) {
      this.dom.a2hsBanner.style.display = 'none';
    }
  }

  _setupGlobalKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        this.audioEngine.togglePlayPause();
      }
    });
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          console.log('[rAdio] Service Worker registered with scope:', reg.scope);
        }).catch((err) => {
          console.log('[rAdio] SW registration notice:', err.message);
        });
      });
    }
  }
}

// Bootstrap Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.rApp = new RadioApp();
  window.rApp.init();
});
