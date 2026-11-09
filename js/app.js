// rAdio Main Application Controller
class RadioApp {
  constructor() {
    this.audioEngine = new RadioAudioEngine();
    this.theme = 'directory';
    this.activeTab = 'home'; // 'home' | 'favorites' | 'settings'

    this.stations = [];
    this.searchQuery = '';
    this.renderedLimit = 120;
    this._dirObserver = null;

    this.sleepTimerMinutes = 0;
    this.sleepTimerInterval = null;
    this.sleepRemainingSeconds = 0;

    this.dom = {};
  }

  async init() {
    this._cacheDom();
    this._setupAntiCopyProtections();

    this._registerServiceWorker();
    this._setupAudioEngineListeners();
    this._setupGlobalKeyboardShortcuts();

    await this.loadData();
    this.renderActiveTab();
    this._checkA2HSPrompt();
  }

  _cacheDom() {
    this.dom.viewport = document.getElementById('mainViewport');
    this.dom.modernNav = document.getElementById('modernTabNav');
    this.dom.miniPlayer = document.getElementById('modernMiniPlayer');
    this.dom.playerModal = document.getElementById('playerSheetModal');
    this.dom.aboutModal = document.getElementById('aboutModal');
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

  // Turkish-friendly search normalization
  _normalizeText(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .trim();
  }

  // Load stations dataset
  async loadData() {
    try {
      const stationsRes = await fetch('./data/stations.json').then(r => r.json());
      this.stations = (stationsRes || []).map(st => ({
        ...st,
        _normName: this._normalizeText(st.name),
        _normTags: Array.isArray(st.tags) ? st.tags.map(t => this._normalizeText(t)).join(' ') : ''
      }));

      // Set default station to first popular (Power Türk)
      if (this.stations.length > 0) {
        this.audioEngine.currentStation = this.stations[0];
        this._updatePlayerDisplays(this.stations[0]);
      }
    } catch (err) {
      console.error('[rAdio] Error loading stations:', err);
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
      if (this.dom.miniSubtitle) this.dom.miniSubtitle.textContent = 'Yayın Kapalı';
      if (this.dom.modalGenre) this.dom.modalGenre.textContent = 'Yayın sunucusu yanıt vermiyor';
    });

    this.audioEngine.on('volumeChange', (vol) => {
      if (this.dom.modalVolSlider) this.dom.modalVolSlider.value = vol;
    });

    this.audioEngine.on('trackchange', (track) => {
      this._updateTrackMetadataUI(track);
    });
  }

  _updatePlaybackState(isPlaying, station) {
    // Mini Player SVG Play/Pause
    const miniPlaySvg = this.dom.miniPlayBtn ? this.dom.miniPlayBtn.querySelector('.mini-play-svg') : null;
    const miniPauseSvg = this.dom.miniPlayBtn ? this.dom.miniPlayBtn.querySelector('.mini-pause-svg') : null;
    if (miniPlaySvg && miniPauseSvg) {
      miniPlaySvg.style.display = isPlaying ? 'none' : 'block';
      miniPauseSvg.style.display = isPlaying ? 'block' : 'none';
    }

    // Fullscreen Modal SVG Play/Pause
    const modalPlaySvg = this.dom.modalPlayBtn ? this.dom.modalPlayBtn.querySelector('.play-svg') : null;
    const modalPauseSvg = this.dom.modalPlayBtn ? this.dom.modalPlayBtn.querySelector('.pause-svg') : null;
    if (modalPlaySvg && modalPauseSvg) {
      modalPlaySvg.style.display = isPlaying ? 'none' : 'block';
      modalPauseSvg.style.display = isPlaying ? 'block' : 'none';
    }

    // Directory Row Play/Pause SVGs
    const currentId = station ? station.id : (this.audioEngine.currentStation ? this.audioEngine.currentStation.id : null);
    document.querySelectorAll('.dir-station-row').forEach(row => {
      const id = parseInt(row.getAttribute('data-st-id'));
      const isRowPlaying = isPlaying && id === currentId;
      const playSvg = row.querySelector('.row-play-svg');
      const pauseSvg = row.querySelector('.row-pause-svg');
      if (playSvg && pauseSvg) {
        playSvg.style.display = isRowPlaying ? 'none' : 'block';
        pauseSvg.style.display = isRowPlaying ? 'block' : 'none';
      }
      if (id === currentId) row.classList.add('active');
      else row.classList.remove('active');
    });

    // Spectrum Visualizer
    if (this.dom.vizBars) {
      this.dom.vizBars.forEach(b => {
        if (isPlaying) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    // Ambient Glow behind Artwork
    const glow = document.getElementById('playerAmbientGlow');
    if (glow) {
      glow.style.opacity = isPlaying ? '1' : '0.4';
    }

    // Subtitle updates (preserve track info if active)
    if (this.dom.miniSubtitle && station) {
      const lastTrack = this.audioEngine.metadataService ? this.audioEngine.metadataService.lastTrack : null;
      if (isPlaying && lastTrack && lastTrack.stationId === station.id) {
        this.dom.miniSubtitle.innerHTML = `<span class="mini-track-live">🎵 <b>${lastTrack.artist}</b> - ${lastTrack.title}</span>`;
      } else {
        this.dom.miniSubtitle.textContent = isPlaying ? '● CANLI YAYIN' : 'Duraklatıldı';
      }
    }
  }

  _updatePlayerDisplays(station) {
    if (!station) return;
    const logoSrc = station.logo || './assets/brand/favicon.svg';
    const lastTrack = this.audioEngine.metadataService ? this.audioEngine.metadataService.lastTrack : null;
    const isSameStationTrack = lastTrack && lastTrack.stationId === station.id;

    if (this.dom.miniLogo) this.dom.miniLogo.src = (isSameStationTrack && lastTrack.coverUrl) ? lastTrack.coverUrl : logoSrc;
    if (this.dom.miniTitle) this.dom.miniTitle.textContent = station.name;
    if (this.dom.miniSubtitle) {
      if (isSameStationTrack) {
        this.dom.miniSubtitle.innerHTML = `<span class="mini-track-live">🎵 <b>${lastTrack.artist}</b> - ${lastTrack.title}</span>`;
      } else {
        this.dom.miniSubtitle.textContent = this.audioEngine.isPlaying ? '● CANLI YAYIN' : 'Canlı Radyo';
      }
    }

    if (this.dom.modalLogo) this.dom.modalLogo.src = (isSameStationTrack && lastTrack.coverUrl) ? lastTrack.coverUrl : logoSrc;
    if (this.dom.modalTitle) this.dom.modalTitle.textContent = station.name;
    if (this.dom.modalGenre) this.dom.modalGenre.textContent = this.audioEngine.isPlaying ? 'Canlı Yayın Akışı' : 'Hazır';
    if (this.dom.modalCodec) this.dom.modalCodec.textContent = `${(station.format || 'HLS').toUpperCase()} Akışı • 128 kbps • ${station.isHttps ? 'HTTPS' : 'HTTP'}`;

    // Track box in modal
    const trackBox = document.getElementById('modalTrackBox');
    const trackTitle = document.getElementById('modalTrackTitle');
    const trackArtist = document.getElementById('modalTrackArtist');
    if (trackBox && trackTitle && trackArtist) {
      if (isSameStationTrack) {
        trackTitle.textContent = lastTrack.title || 'Canlı Müzik';
        trackArtist.textContent = lastTrack.artist || station.name;
        trackBox.style.display = 'block';
      } else {
        trackTitle.textContent = this.audioEngine.isPlaying ? 'Kesintisiz Canlı Yayın' : 'Canlı Radyo Yayını';
        trackArtist.textContent = station.name;
        trackBox.style.display = 'block';
      }
    }

    // Update Favorite Button state
    const isFav = RadioStorage.isFavorite(station.id);
    this._updateFavoriteButton(isFav);

    this._updatePlaybackState(this.audioEngine.isPlaying, station);
  }

  _updateFavoriteButton(isFav) {
    const btn = document.getElementById('modalFavBtn');
    if (!btn) return;
    const emptyIcon = btn.querySelector('.heart-icon.empty');
    const filledIcon = btn.querySelector('.heart-icon.filled');
    if (emptyIcon && filledIcon) {
      emptyIcon.style.display = isFav ? 'none' : 'block';
      filledIcon.style.display = isFav ? 'block' : 'none';
    }
  }

  // Handle Dynamic "Now Playing" Song & Artist Metadata Update
  _updateTrackMetadataUI(track) {
    if (!track || !this.audioEngine.currentStation) return;
    if (this.audioEngine.currentStation.id !== track.stationId) return;

    if (this.dom.miniSubtitle) {
      const songText = track.artist ? `🎵 <b>${track.artist}</b> - ${track.title}` : `🎵 ${track.title}`;
      this.dom.miniSubtitle.innerHTML = `<span class="mini-track-live">${songText}</span>`;
    }

    const trackBox = document.getElementById('modalTrackBox');
    const trackTitle = document.getElementById('modalTrackTitle');
    const trackArtist = document.getElementById('modalTrackArtist');

    if (trackBox && trackTitle && trackArtist) {
      trackTitle.textContent = track.title || 'Canlı Müzik';
      trackArtist.textContent = track.artist || this.audioEngine.currentStation.name;
      trackBox.style.display = 'block';
    }

    if (track.coverUrl && this.dom.modalLogo) {
      const currentStationId = this.audioEngine.currentStation.id;
      const originalLogo = this.audioEngine.currentStation.logo || './assets/brand/favicon.svg';
      const img = new Image();
      img.onload = () => {
        if (this.audioEngine.currentStation && this.audioEngine.currentStation.id === currentStationId) {
          this.dom.modalLogo.src = track.coverUrl;
          if (this.dom.miniLogo) this.dom.miniLogo.src = track.coverUrl;
        }
      };
      img.onerror = () => {
        if (this.dom.modalLogo) this.dom.modalLogo.src = originalLogo;
      };
      img.src = track.coverUrl;
    }

    const glow = document.getElementById('playerAmbientGlow');
    if (glow && track.coverUrl) {
      glow.style.background = `radial-gradient(circle, rgba(239, 68, 68, 0.45) 0%, rgba(139, 92, 246, 0.35) 50%, transparent 75%)`;
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

  // Switch Bottom Nav Tabs
  switchTab(tabName) {
    if (tabName === 'categories') tabName = 'home';
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

  focusSearch() {
    if (this.activeTab !== 'home') {
      this.switchTab('home');
    }
    if (this.dom.viewport) {
      this.dom.viewport.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTimeout(() => {
      const input = document.getElementById('dirSearchInput');
      if (input) input.focus();
    }, 80);
  }

  // Main Render Dispatcher
  renderActiveTab() {
    if (!this.dom.viewport) return;

    if (this.activeTab === 'favorites') {
      this.renderFavoritesTab();
    } else if (this.activeTab === 'settings') {
      this.renderSettingsTab();
    } else {
      this.renderDirectoryHome();
    }
  }

  // ==========================================
  // VIEW: ALL RADIOS SINGLE SCREEN (DESIGN 3)
  // ==========================================
  _getFilteredStations() {
    const q = this._normalizeText(this.searchQuery);
    if (!q) return this.stations;
    return this.stations.filter(s => s._normName.includes(q) || s._normTags.includes(q));
  }

  _buildStationRowHtml(st) {
    const cur = this.audioEngine.currentStation;
    const isPlaying = this.audioEngine.isPlaying;
    const isCur = cur && cur.id === st.id;
    const isFav = RadioStorage.isFavorite(st.id);

    return `
      <div class="dir-station-row ${isCur ? 'active' : ''}" data-st-id="${st.id}" onclick="window.rApp.handleStationRowClick(${st.id})">
        <div class="dir-row-left">
          <img class="dir-row-logo" src="${st.logo || './assets/brand/favicon.svg'}" alt="${st.name}" loading="lazy">
          <div class="dir-row-details">
            <div class="dir-row-name">${st.name}</div>
            <div class="dir-row-tags">
              <span class="dir-tag-badge dir-tag-format">${(st.format || 'AAC').toUpperCase()}</span>
              ${st.isPopular ? '<span class="badge badge-live" style="font-size:9px; padding:1px 5px;">POPÜLER</span>' : ''}
            </div>
          </div>
        </div>
        <div class="dir-row-right">
          <button class="dir-fav-btn ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); window.rApp.toggleRowFavorite(${st.id}, this)" aria-label="Favori">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button class="dir-mini-play-btn" aria-label="Oynat / Duraklat">
            <svg class="row-play-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:none;' : 'display:block;'}"><polygon points="7,5 19,12 7,19"/></svg>
            <svg class="row-pause-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:block;' : 'display:none;'}"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  _renderStationList(reset = true) {
    const table = document.getElementById('dirStationsTable');
    const badge = document.getElementById('dirStatsBadge');
    const sentinel = document.getElementById('dirLoadMoreSentinel');
    if (!table) return;

    const filtered = this._getFilteredStations();
    if (badge) badge.textContent = `${filtered.length} İstasyon`;

    if (reset) {
      this.renderedLimit = 120;
      const slice = filtered.slice(0, this.renderedLimit);
      table.innerHTML = slice.length > 0
        ? slice.map(st => this._buildStationRowHtml(st)).join('')
        : '<div style="text-align:center; padding:48px 20px; color:var(--text-tertiary);">Aramanıza uygun radyo bulunamadı.</div>';
    } else {
      const oldLimit = this.renderedLimit;
      const nextLimit = oldLimit + 150;
      const slice = filtered.slice(oldLimit, nextLimit);
      if (slice.length > 0) {
        table.insertAdjacentHTML('beforeend', slice.map(st => this._buildStationRowHtml(st)).join(''));
        this.renderedLimit = nextLimit;
      }
    }

    if (sentinel) {
      if (this.renderedLimit < filtered.length) {
        sentinel.style.display = 'flex';
        sentinel.textContent = `Daha fazla radyo yükleniyor (${Math.min(this.renderedLimit, filtered.length)} / ${filtered.length})...`;
      } else {
        sentinel.style.display = 'none';
      }
    }
  }

  _setupInfiniteScroll() {
    if (this._dirObserver) {
      this._dirObserver.disconnect();
      this._dirObserver = null;
    }
    const sentinel = document.getElementById('dirLoadMoreSentinel');
    if (!sentinel || !this.dom.viewport) return;

    this._dirObserver = new IntersectionObserver((entries) => {
      if (entries[0] && entries[0].isIntersecting) {
        const filtered = this._getFilteredStations();
        if (this.renderedLimit < filtered.length) {
          this._renderStationList(false);
        }
      }
    }, {
      root: this.dom.viewport,
      rootMargin: '250px'
    });

    this._dirObserver.observe(sentinel);
  }

  renderDirectoryHome() {
    this.dom.viewport.innerHTML = `
      <div class="directory-container">
        
        <div class="dir-top-meta">
          <div>
            <div class="dir-main-title">Tüm Radyolar</div>
            <div style="font-size:12px; color:var(--text-tertiary);">Tek ekranda kesintisiz canlı radyo yayını</div>
          </div>
          <span class="dir-stats-badge" id="dirStatsBadge">${this.stations.length} İstasyon</span>
        </div>

        <!-- Search Bar (Preserved DOM across keystrokes) -->
        <div class="dir-search-box">
          <span class="dir-search-lens">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input id="dirSearchInput" type="text" placeholder="Radyo adı ara..." value="${this.searchQuery}" oninput="window.rApp.onSearchInput(this.value)" autocomplete="off">
          <button id="dirSearchClearBtn" class="dir-clear-btn" style="display:${this.searchQuery ? 'flex' : 'none'};" onclick="window.rApp.clearSearch()" aria-label="Temizle">✕</button>
        </div>

        <!-- All Stations List -->
        <div class="dir-stations-table" id="dirStationsTable"></div>
        <div id="dirLoadMoreSentinel" style="height:32px; display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--text-tertiary);"></div>

      </div>
    `;

    this._renderStationList(true);
    this._setupInfiniteScroll();
  }

  handleStationRowClick(stationId) {
    const st = this.getStationById(stationId);
    if (!st) return;
    if (this.audioEngine.currentStation && this.audioEngine.currentStation.id === stationId) {
      this.audioEngine.togglePlayPause();
    } else {
      this.audioEngine.playStation(st);
    }
  }

  toggleRowFavorite(stationId, btnEl) {
    const isNowFav = RadioStorage.toggleFavorite(stationId);
    if (btnEl) {
      btnEl.classList.toggle('is-fav', isNowFav);
      const svg = btnEl.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isNowFav ? '#ef4444' : 'none');
        svg.setAttribute('stroke', isNowFav ? '#ef4444' : 'currentColor');
      }
    }
    if (this.audioEngine.currentStation && this.audioEngine.currentStation.id === stationId) {
      this._updateFavoriteButton(isNowFav);
    }
    this.showToast(isNowFav ? 'Favorilere eklendi ❤️' : 'Favorilerden çıkarıldı 🤍');
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
        <div class="dir-station-row ${isCur ? 'active' : ''}" data-st-id="${st.id}" onclick="window.rApp.handleStationRowClick(${st.id})">
          <div class="dir-row-left">
            <img class="dir-row-logo" src="${st.logo || './assets/brand/favicon.svg'}" alt="${st.name}">
            <div class="dir-row-details">
              <div class="dir-row-name">${st.name}</div>
              <div class="dir-row-tags">
                <span class="dir-tag-badge dir-tag-format">${(st.format || 'AAC').toUpperCase()}</span>
                ${st.isPopular ? '<span class="badge badge-live" style="font-size:9px; padding:1px 5px;">POPÜLER</span>' : ''}
              </div>
            </div>
          </div>
          <div class="dir-row-right">
            <button class="dir-fav-btn is-fav" onclick="event.stopPropagation(); window.rApp.removeFavorite(${st.id})" aria-label="Favoriden Çıkar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="dir-mini-play-btn" aria-label="Oynat / Duraklat">
              <svg class="row-play-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:none;' : 'display:block;'}"><polygon points="7,5 19,12 7,19"/></svg>
              <svg class="row-pause-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:block;' : 'display:none;'}"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
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
  // VIEW: SETTINGS TAB
  // ==========================================
  renderSettingsTab() {
    this.dom.viewport.innerHTML = `
      <div style="padding:16px; display:flex; flex-direction:column; gap:18px;">
        
        <div class="section-header">
          <div class="section-title"><span>⚙️</span> Ayarlar & Tercihler</div>
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

        <!-- About & Legal / DMCA Section -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px;">
          <div style="font-size:15px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
            <span>ℹ️</span> <span>Hakkında & Telif Hakları (DMCA)</span>
          </div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px; line-height:1.5;">
            rAdio, kamuya açık ve ücretsiz radyo akışlarını derleyen bağımsız bir oynatıcıdır. Sunucularımızda hiçbir ses veya medya dosyası barındırılmaz (0 bayt barındırma).
          </div>
          <button class="filter-chip-btn" style="border-color:var(--accent-cyan); color:#38bdf8;" onclick="window.rApp.openAboutModal()">
            Yasal Bilgilendirme ve DMCA Bildirimi 📄
          </button>
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

        <!-- App Version & Force Reload -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px; text-align:center;">
          <div style="font-size:14px; font-weight:700; margin-bottom:4px;">🔄 Sürüm Bilgisi (v2.2.0)</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            En güncel arayüz ve yayın listesini anında çekmek için önbelleği sıfırlayıp yenileyebilirsiniz.
          </div>
          <button class="filter-chip-btn" style="background:linear-gradient(135deg, var(--accent-purple), var(--accent-blue)); color:#fff; border:none; padding:10px 18px; font-weight:700;" onclick="window.rApp.forceAppUpdate()">
            Önbelleği Temizle & Yenile 🔄
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
      if (this.audioEngine.metadataService) {
        if (this.audioEngine.metadataService.lastTrack) {
          this._updateTrackMetadataUI(this.audioEngine.metadataService.lastTrack);
        } else if (this.audioEngine.currentStation) {
          this.audioEngine.metadataService.fetchMetadata(this.audioEngine.currentStation);
        }
      }
    }
  }

  closePlayerModal() {
    if (this.dom.playerModal) {
      this.dom.playerModal.classList.remove('open');
    }
  }

  openAboutModal() {
    if (this.dom.aboutModal) {
      this.dom.aboutModal.classList.add('open');
    }
  }

  closeAboutModal() {
    if (this.dom.aboutModal) {
      this.dom.aboutModal.classList.remove('open');
    }
  }

  toggleCurrentFavorite() {
    if (!this.audioEngine.currentStation) return;
    const isNowFav = RadioStorage.toggleFavorite(this.audioEngine.currentStation.id);
    this._updateFavoriteButton(isNowFav);
    this.showToast(isNowFav ? 'Favorilere eklendi ❤️' : 'Favorilerden çıkarıldı 🤍');
    if (this.activeTab === 'favorites') this.renderFavoritesTab();
    else if (this.activeTab === 'home') {
      const row = document.querySelector(`.dir-station-row[data-st-id="${this.audioEngine.currentStation.id}"] .dir-fav-btn`);
      if (row) {
        row.classList.toggle('is-fav', isNowFav);
        const svg = row.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', isNowFav ? '#ef4444' : 'none');
          svg.setAttribute('stroke', isNowFav ? '#ef4444' : 'currentColor');
        }
      }
    }
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

  onSearchInput(val) {
    this.searchQuery = val;
    const clearBtn = document.getElementById('dirSearchClearBtn');
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
    this._renderStationList(true);
  }

  clearSearch() {
    this.searchQuery = '';
    const input = document.getElementById('dirSearchInput');
    const clearBtn = document.getElementById('dirSearchClearBtn');
    if (input) {
      input.value = '';
      input.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';
    this._renderStationList(true);
  }

  getStationById(id) {
    return this.stations.find(s => s.id === id);
  }

  // ==========================================
  // ANTI-COPY & INTELLECTUAL PROPERTY SHIELD
  // ==========================================
  _setupAntiCopyProtections() {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    }, { capture: true });

    document.addEventListener('copy', (e) => {
      if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        return false;
      }
    });

    document.addEventListener('cut', (e) => {
      if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        return false;
      }
    });

    document.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    });

    document.addEventListener('selectstart', (e) => {
      if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        return false;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && ['u', 'U', 's', 'S'].includes(e.key)) {
        e.preventDefault();
        return false;
      }
    });

    try {
      if (window.top !== window.self) {
        window.top.location = window.self.location;
      }
    } catch (e) {
      window.location = 'about:blank';
    }
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

  async forceAppUpdate() {
    this.showToast('Önbellek temizleniyor ve uygulama yenileniyor...', '⏳');
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) {}
    }
    if (navigator.serviceWorker) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      } catch (e) {}
    }
    setTimeout(() => {
      window.location.href = window.location.pathname + '?reload=' + Date.now();
    }, 400);
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=2.2.0').then((reg) => {
          console.log('[rAdio] Service Worker registered with scope:', reg.scope);
          reg.update();
        }).catch((err) => {
          console.log('[rAdio] SW registration notice:', err.message);
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
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
