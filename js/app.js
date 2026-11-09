// rAdio Main Application Controller (Shared Coordinator for Mobile & Desktop UIs)
class RadioApp {
  constructor() {
    this.audioEngine = new RadioAudioEngine();
    this.desktopUI = window.RadioDesktopUI ? new window.RadioDesktopUI(this) : null;

    this.theme = 'directory';
    this.activeTab = 'home'; // Mobile tabs: 'home' | 'favorites' | 'settings'
    this.viewModePref = this._resolveInitialViewPref(); // 'auto' | 'mobile' | 'desktop'
    this.currentView = document.documentElement.dataset.uiView === 'desktop' ? 'desktop' : 'mobile';

    this.stations = [];
    this.searchQuery = '';
    this.renderedLimit = 120;
    this._dirObserver = null;

    this.sleepTimerMinutes = 0;
    this.sleepTimerInterval = null;
    this.sleepRemainingSeconds = 0;

    this._playerTriggerEl = null;
    this._aboutTriggerEl = null;
    this.dom = {};
  }

  _resolveInitialViewPref() {
    try {
      const qp = new URLSearchParams(window.location.search).get('view');
      if (qp === 'mobile' || qp === 'desktop' || qp === 'auto') {
        return qp;
      }
    } catch {}
    return RadioStorage.getViewMode();
  }

  _computeEffectiveView(pref = this.viewModePref) {
    if (pref === 'mobile' || pref === 'desktop') return pref;
    return window.innerWidth >= 960 ? 'desktop' : 'mobile';
  }

  async init() {
    this._cacheDom();
    this._bindMobileAndSharedEvents();
    this._setupViewportSync();
    this._setupAntiCopyProtections();
    this._setupAudioEngineListeners();
    this._setupGlobalKeyboardShortcuts();

    if (this.desktopUI) {
      this.desktopUI.init();
    }

    this.applyViewMode({ forceRender: false });
    this._registerServiceWorker();

    await this.loadData();

    if (this.desktopUI) {
      this.desktopUI.renderAll();
    }
    this.renderActiveTab();
    this.applyViewMode({ forceRender: true });
    this._checkA2HSPrompt();
  }

  _cacheDom() {
    this.dom.mobileShell = document.getElementById('app');
    this.dom.desktopShell = document.getElementById('desktopShell');
    this.dom.viewport = document.getElementById('mainViewport');
    this.dom.modernNav = document.getElementById('modernTabNav');
    this.dom.miniPlayer = document.getElementById('modernMiniPlayer');
    this.dom.playerModal = document.getElementById('playerSheetModal');
    this.dom.aboutModal = document.getElementById('aboutModal');
    this.dom.toastContainer = document.getElementById('toastContainer');
    this.dom.a2hsBanner = document.getElementById('a2hsBanner');

    // Mobile Header Buttons
    this.dom.mobileBrandBtn = document.getElementById('mobileBrandBtn');
    this.dom.mobileToPcBtn = document.getElementById('mobileToPcBtn');
    this.dom.mobileSearchFocusBtn = document.getElementById('mobileSearchFocusBtn');
    this.dom.mobileAboutBtn = document.getElementById('mobileAboutBtn');

    // Mini Player elements
    this.dom.miniLogo = document.getElementById('miniLogo');
    this.dom.miniTitle = document.getElementById('miniTitle');
    this.dom.miniSubtitle = document.getElementById('miniSubtitle');
    this.dom.miniPlayBtn = document.getElementById('miniPlayBtn');

    // Modal Player elements
    this.dom.modalDismissBtn = document.getElementById('modalDismissBtn');
    this.dom.modalHandlePill = document.getElementById('modalHandlePill');
    this.dom.modalLogo = document.getElementById('modalLogo');
    this.dom.modalTitle = document.getElementById('modalTitle');
    this.dom.modalGenre = document.getElementById('modalGenre');
    this.dom.modalCodec = document.getElementById('modalCodec');
    this.dom.modalPlayBtn = document.getElementById('modalPlayBtn');
    this.dom.modalPrevBtn = document.getElementById('modalPrevBtn');
    this.dom.modalNextBtn = document.getElementById('modalNextBtn');
    this.dom.modalFavBtn = document.getElementById('modalFavBtn');
    this.dom.modalVolSlider = document.getElementById('modalVolSlider');
    this.dom.modalVolMinBtn = document.getElementById('modalVolMinBtn');
    this.dom.modalVolMaxBtn = document.getElementById('modalVolMaxBtn');
    this.dom.modalSleepBar = document.getElementById('modalSleepBar');
    this.dom.modalStatusBanner = document.getElementById('modalStatusBanner');
    this.dom.modalStatusBannerText = document.getElementById('modalStatusBannerText');
    this.dom.modalRetryBtn = document.getElementById('modalRetryBtn');
    this.dom.sleepTimerText = document.getElementById('sleepTimerText');
    this.dom.vizBars = document.querySelectorAll('#playerSheetModal .viz-bar');

    // About & A2HS controls
    this.dom.aboutCloseTopBtn = document.getElementById('aboutCloseTopBtn');
    this.dom.aboutCloseBottomBtn = document.getElementById('aboutCloseBottomBtn');
    this.dom.a2hsDismissBtn = document.getElementById('a2hsDismissBtn');
  }

  _bindMobileAndSharedEvents() {
    this.dom.mobileBrandBtn?.addEventListener('click', () => this.switchTab('home'));
    this.dom.mobileToPcBtn?.addEventListener('click', () => {
      this.setViewMode('desktop', { persist: true, announce: true });
    });
    this.dom.mobileSearchFocusBtn?.addEventListener('click', () => this.focusSearch());
    this.dom.mobileAboutBtn?.addEventListener('click', () => this.openAboutModal(this.dom.mobileAboutBtn));

    // Bottom Navigation Tabs
    this.dom.modernNav?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-nav-btn[data-tab]');
      if (!btn) return;
      this.switchTab(btn.getAttribute('data-tab'));
    });

    // Floating Mini Player
    this.dom.miniPlayer?.addEventListener('click', (e) => {
      if (e.target.closest('.mini-controls-wrap')) return;
      this.openPlayerModal();
    });
    this.dom.miniPlayer?.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.mini-controls-wrap')) {
        e.preventDefault();
        this.openPlayerModal();
      }
    });
    this.dom.miniPlayBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audioEngine.togglePlayPause();
    });

    // Fullscreen Modal Player Controls
    this.dom.modalDismissBtn?.addEventListener('click', () => this.closePlayerModal());
    this.dom.modalHandlePill?.addEventListener('click', () => this.closePlayerModal());
    this.dom.modalFavBtn?.addEventListener('click', () => this.toggleCurrentFavorite());
    this.dom.modalPlayBtn?.addEventListener('click', () => this.audioEngine.togglePlayPause());
    this.dom.modalPrevBtn?.addEventListener('click', () => this.playAdjacentStation(-1));
    this.dom.modalNextBtn?.addEventListener('click', () => this.playAdjacentStation(1));
    this.dom.modalRetryBtn?.addEventListener('click', () => this.audioEngine.retryCurrentStation());

    this.dom.modalVolSlider?.addEventListener('input', (e) => this.onVolumeChange(e.target.value));
    this.dom.modalVolMinBtn?.addEventListener('click', () => this.onVolumeChange(0));
    this.dom.modalVolMaxBtn?.addEventListener('click', () => this.onVolumeChange(1));
    this.dom.modalSleepBar?.addEventListener('click', () => {
      this.switchTab('settings');
      this.closePlayerModal();
    });

    // About Modal Controls
    this.dom.aboutCloseTopBtn?.addEventListener('click', () => this.closeAboutModal());
    this.dom.aboutCloseBottomBtn?.addEventListener('click', () => this.closeAboutModal());
    this.dom.aboutModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.aboutModal) {
        this.closeAboutModal();
      }
    });

    // A2HS Dismiss
    this.dom.a2hsDismissBtn?.addEventListener('click', () => this.dismissA2HS());

    // Mobile Viewport Event Delegation (Station rows, fav toggle, search, settings buttons)
    this.dom.viewport?.addEventListener('click', (e) => {
      const favBtn = e.target.closest('.dir-fav-btn[data-st-id]');
      if (favBtn) {
        e.stopPropagation();
        const stId = parseInt(favBtn.getAttribute('data-st-id'), 10);
        if (this.activeTab === 'favorites' && favBtn.hasAttribute('data-fav-remove')) {
          this.removeFavorite(stId);
        } else {
          this.toggleRowFavorite(stId, favBtn);
        }
        return;
      }

      const row = e.target.closest('.dir-station-row[data-st-id]');
      if (row) {
        const stId = parseInt(row.getAttribute('data-st-id'), 10);
        this.handleStationRowClick(stId);
        return;
      }

      const clearBtn = e.target.closest('#dirSearchClearBtn');
      if (clearBtn) {
        this.clearSearch();
        return;
      }

      const sleepBtn = e.target.closest('[data-sleep-mins]');
      if (sleepBtn) {
        const mins = parseInt(sleepBtn.getAttribute('data-sleep-mins'), 10);
        this.setSleepTimer(mins);
        return;
      }

      const viewBtn = e.target.closest('[data-view-mode]');
      if (viewBtn) {
        const mode = viewBtn.getAttribute('data-view-mode');
        this.setViewMode(mode, { persist: true, announce: true });
        return;
      }

      const actionBtn = e.target.closest('[data-settings-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-settings-action');
        if (action === 'open-about') this.openAboutModal(actionBtn);
        else if (action === 'show-a2hs') this.showA2HSPrompt(true);
        else if (action === 'force-update') this.forceAppUpdate();
      }
    });

    this.dom.viewport?.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'dirSearchInput') {
        this.onSearchInput(e.target.value);
      }
    });

    // Safe logo fallback inside mobile viewport & mini/modal artwork
    const attachSafeLogoFallback = (el) => {
      if (!el) return;
      el.addEventListener('error', () => {
        if (el.dataset.fallbackApplied === '1') return;
        el.dataset.fallbackApplied = '1';
        el.src = './assets/brand/favicon.svg';
      });
    };
    attachSafeLogoFallback(this.dom.miniLogo);
    attachSafeLogoFallback(this.dom.modalLogo);
    this.dom.viewport?.addEventListener('error', (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.dataset.fallbackApplied !== '1') {
        t.dataset.fallbackApplied = '1';
        t.src = './assets/brand/favicon.svg';
      }
    }, true);
  }

  _escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Turkish-accurate search normalization ('İ' -> 'i', 'I' -> 'i', 'ş' -> 's', etc.)
  _normalizeText(str) {
    if (!str) return '';
    return String(str)
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .trim();
  }

  setViewMode(mode, { persist = true, announce = false } = {}) {
    const valid = (mode === 'mobile' || mode === 'desktop' || mode === 'auto') ? mode : 'auto';
    this.viewModePref = valid;
    if (persist) {
      RadioStorage.setViewMode(valid);
    }

    const prevView = this.currentView;
    this.applyViewMode({ forceRender: true });

    if (announce) {
      if (valid === 'auto') {
        this.showToast(`Görünüm Otomatik moda alındı (${this.currentView === 'desktop' ? 'Masaüstü' : 'Mobil'}).`);
      } else if (this.currentView !== prevView || persist) {
        this.showToast(
          this.currentView === 'desktop'
            ? 'Masaüstü (PC) arayüzüne geçildi — yayın kesintisiz devam ediyor.'
            : 'Mobil arayüze geçildi — yayın kesintisiz devam ediyor.'
        );
      }
    }
  }

  applyViewMode({ forceRender = false } = {}) {
    const nextView = this._computeEffectiveView(this.viewModePref);
    const changed = nextView !== this.currentView;
    this.currentView = nextView;

    const root = document.documentElement;
    root.dataset.uiView = nextView;
    root.dataset.uiPref = this.viewModePref;

    const isDesktop = nextView === 'desktop';
    const aboutOpen = this.dom.aboutModal && this.dom.aboutModal.classList.contains('open');
    const playerOpen = !isDesktop && this.dom.playerModal && this.dom.playerModal.classList.contains('open');

    if (this.dom.mobileShell) {
      this.dom.mobileShell.hidden = isDesktop;
      this.dom.mobileShell.inert = isDesktop || Boolean(aboutOpen) || Boolean(playerOpen);
    }
    if (this.dom.desktopShell) {
      this.dom.desktopShell.hidden = !isDesktop;
      this.dom.desktopShell.inert = !isDesktop || Boolean(aboutOpen);
    }

    if (isDesktop) {
      this.closePlayerModal();
      if (typeof window.__syncRadioViewport === 'function') {
        window.__syncRadioViewport();
      }
      if ((changed || forceRender) && this.desktopUI) {
        this.desktopUI.renderAll();
      }
    } else {
      if (typeof window.__syncRadioViewport === 'function') {
        window.__syncRadioViewport();
      }
      if (changed || forceRender) {
        this.renderActiveTab();
        const state = this.audioEngine.getState();
        this._updatePlayerDisplays(state.station);
        this._syncModalStatusBanner(state);
      }
    }
  }

  setSearchQuery(val) {
    this.searchQuery = val || '';

    const mobileInput = document.getElementById('dirSearchInput');
    if (mobileInput && mobileInput.value !== this.searchQuery) {
      mobileInput.value = this.searchQuery;
    }
    const mobileClear = document.getElementById('dirSearchClearBtn');
    if (mobileClear) {
      mobileClear.style.display = this.searchQuery ? 'flex' : 'none';
    }

    if (this.currentView === 'mobile' && this.activeTab === 'home') {
      this._renderStationList(true);
    }
    if (this.desktopUI) {
      this.desktopUI.syncSearchFromApp(this.searchQuery);
    }
  }

  async loadData() {
    try {
      const stationsRes = await fetch('./data/stations.json').then(r => r.json());
      this.stations = (stationsRes || []).map(st => ({
        ...st,
        _normName: this._normalizeText(st.name),
        _normTags: Array.isArray(st.tags) ? st.tags.map(t => this._normalizeText(t)).join(' ') : ''
      }));

      if (this.stations.length > 0 && !this.audioEngine.currentStation) {
        this.audioEngine.currentStation = this.stations[0];
        this._updatePlayerDisplays(this.stations[0]);
      }
      this._syncVolumeSliders(this.audioEngine.getState());
    } catch (err) {
      console.error('[rAdio] Error loading stations:', err);
      this.showToast('İstasyon verileri yüklenirken bir sorun oluştu.', '⚠️');
    }
  }

  _setupAudioEngineListeners() {
    this.audioEngine.on('play', (station) => {
      const state = this.audioEngine.getState();
      this._updatePlaybackState(true, station);
      this._syncModalStatusBanner(state);
      if (this.desktopUI) this.desktopUI.syncDeckState();
    });

    this.audioEngine.on('pause', (station) => {
      const state = this.audioEngine.getState();
      this._updatePlaybackState(false, station);
      this._syncModalStatusBanner(state);
      if (this.desktopUI) this.desktopUI.syncDeckState();
    });

    this.audioEngine.on('loading', () => {
      const state = this.audioEngine.getState();
      if (this.dom.miniSubtitle) {
        this.dom.miniSubtitle.textContent = state.isReconnecting
          ? `Yeniden bağlanıyor (${state.reconnectAttempt}/${state.maxReconnectAttempts})...`
          : 'Bağlanıyor...';
      }
      if (this.dom.modalGenre) {
        this.dom.modalGenre.textContent = state.isReconnecting
          ? `Yeniden bağlanıyor (${state.reconnectAttempt}/${state.maxReconnectAttempts})...`
          : 'Bağlantı kuruluyor...';
      }
      this._syncModalStatusBanner(state);
      if (this.desktopUI) this.desktopUI.syncDeckState();
    });

    this.audioEngine.on('reconnecting', (info) => {
      const state = this.audioEngine.getState();
      if (this.dom.miniSubtitle) {
        this.dom.miniSubtitle.textContent = info.attempt > 0
          ? `Yeniden bağlanıyor (${info.attempt}/${info.maxAttempts})...`
          : 'Bağlantı bekleniyor...';
      }
      if (this.dom.modalGenre) {
        this.dom.modalGenre.textContent = info.message || 'Yeniden bağlanılıyor...';
      }
      this._syncModalStatusBanner(state, { tone: 'reconnecting', message: info.message });
      if (this.desktopUI) {
        this.desktopUI.syncDeckState({ tone: 'reconnecting', message: info.message });
      }
    });

    this.audioEngine.on('stationChange', (station) => {
      this._updatePlayerDisplays(station);
      this._refreshListActiveStates(station.id);
      this._syncModalStatusBanner(this.audioEngine.getState());
      if (this.desktopUI) this.desktopUI.syncDeckState();
    });

    this.audioEngine.on('error', (errData) => {
      const errObj = typeof errData === 'string'
        ? { code: 'UNKNOWN', message: errData, recoverable: true }
        : (errData || { code: 'UNKNOWN', message: 'Yayın sunucusu yanıt vermiyor.', recoverable: true });

      const state = this.audioEngine.getState();
      this.showToast(errObj.message, '⚠️');
      this._updatePlaybackState(false, state.station);
      if (this.dom.miniSubtitle) {
        this.dom.miniSubtitle.textContent = errObj.code === 'AUTOPLAY_BLOCKED' ? 'Başlatmak için dokunun' : 'Yayın Hatası';
      }
      if (this.dom.modalGenre) {
        this.dom.modalGenre.textContent = errObj.message;
      }
      this._syncModalStatusBanner(state);
      if (this.desktopUI) this.desktopUI.syncDeckState();
    });

    this.audioEngine.on('volumeChange', (payload) => {
      const state = this.audioEngine.getState();
      this._syncVolumeSliders(state, payload);
      if (this.desktopUI) this.desktopUI._syncVolumeUi(state);
    });

    this.audioEngine.on('trackchange', (track) => {
      this._updateTrackMetadataUI(track);
      if (this.desktopUI) this.desktopUI.syncDeckState();
    });
  }

  _syncVolumeSliders(state) {
    const vol = state.muted ? 0 : state.volume;
    if (this.dom.modalVolSlider) {
      this.dom.modalVolSlider.value = String(vol);
      this.dom.modalVolSlider.style.setProperty('--attr-min', this.dom.modalVolSlider.min || '0');
      this.dom.modalVolSlider.style.setProperty('--attr-max', this.dom.modalVolSlider.max || '1');
      this.dom.modalVolSlider.style.setProperty('--control-value', String(vol));
    }
  }

  _syncModalStatusBanner(state, overrideNotice = null) {
    if (!this.dom.modalStatusBanner || !this.dom.modalStatusBannerText) return;
    if (overrideNotice && overrideNotice.tone === 'reconnecting') {
      this.dom.modalStatusBanner.classList.add('visible');
      this.dom.modalStatusBanner.setAttribute('data-tone', 'reconnecting');
      this.dom.modalStatusBannerText.textContent = overrideNotice.message;
      if (this.dom.modalRetryBtn) this.dom.modalRetryBtn.style.display = 'none';
      return;
    }

    if (state.isReconnecting) {
      this.dom.modalStatusBanner.classList.add('visible');
      this.dom.modalStatusBanner.setAttribute('data-tone', 'reconnecting');
      this.dom.modalStatusBannerText.textContent = `Yeniden bağlanılıyor (${state.reconnectAttempt}/${state.maxReconnectAttempts})...`;
      if (this.dom.modalRetryBtn) this.dom.modalRetryBtn.style.display = 'none';
    } else if (state.errorInfo) {
      this.dom.modalStatusBanner.classList.add('visible');
      this.dom.modalStatusBanner.setAttribute('data-tone', 'error');
      this.dom.modalStatusBannerText.textContent = state.errorInfo.message;
      if (this.dom.modalRetryBtn) {
        this.dom.modalRetryBtn.style.display = (state.errorInfo.recoverable !== false || state.errorInfo.code === 'AUTOPLAY_BLOCKED') ? 'inline-block' : 'none';
      }
    } else {
      this.dom.modalStatusBanner.classList.remove('visible');
    }
  }

  _updatePlaybackState(isPlaying, station) {
    const miniPlaySvg = this.dom.miniPlayBtn ? this.dom.miniPlayBtn.querySelector('.mini-play-svg') : null;
    const miniPauseSvg = this.dom.miniPlayBtn ? this.dom.miniPlayBtn.querySelector('.mini-pause-svg') : null;
    if (miniPlaySvg && miniPauseSvg) {
      miniPlaySvg.style.display = isPlaying ? 'none' : 'block';
      miniPauseSvg.style.display = isPlaying ? 'block' : 'none';
    }

    const modalPlaySvg = this.dom.modalPlayBtn ? this.dom.modalPlayBtn.querySelector('.play-svg') : null;
    const modalPauseSvg = this.dom.modalPlayBtn ? this.dom.modalPlayBtn.querySelector('.pause-svg') : null;
    if (modalPlaySvg && modalPauseSvg) {
      modalPlaySvg.style.display = isPlaying ? 'none' : 'block';
      modalPauseSvg.style.display = isPlaying ? 'block' : 'none';
    }

    const currentId = station ? station.id : (this.audioEngine.currentStation ? this.audioEngine.currentStation.id : null);
    document.querySelectorAll('.dir-station-row').forEach(row => {
      const id = parseInt(row.getAttribute('data-st-id'), 10);
      const isRowPlaying = isPlaying && id === currentId;
      const playSvg = row.querySelector('.row-play-svg');
      const pauseSvg = row.querySelector('.row-pause-svg');
      if (playSvg && pauseSvg) {
        playSvg.style.display = isRowPlaying ? 'none' : 'block';
        pauseSvg.style.display = isRowPlaying ? 'block' : 'none';
      }
      row.classList.toggle('active', id === currentId);
    });

    if (this.dom.vizBars) {
      this.dom.vizBars.forEach(b => b.classList.toggle('active', isPlaying));
    }

    const glow = document.getElementById('playerAmbientGlow');
    if (glow) {
      glow.style.opacity = isPlaying ? '1' : '0.4';
    }

    if (this.dom.miniSubtitle && station) {
      const state = this.audioEngine.getState();
      const lastTrack = state.lastTrack;
      if (isPlaying && lastTrack && lastTrack.stationId === station.id) {
        this.dom.miniSubtitle.innerHTML = `<span class="mini-track-live">🎵 <b>${this._escapeHtml(lastTrack.artist)}</b> - ${this._escapeHtml(lastTrack.title)}</span>`;
      } else if (state.isReconnecting) {
        this.dom.miniSubtitle.textContent = `Yeniden bağlanıyor (${state.reconnectAttempt}/${state.maxReconnectAttempts})...`;
      } else if (state.errorInfo) {
        this.dom.miniSubtitle.textContent = state.errorInfo.code === 'AUTOPLAY_BLOCKED' ? 'Başlatmak için dokunun' : 'Yayın Hatası';
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

    if (this.dom.miniLogo) {
      delete this.dom.miniLogo.dataset.fallbackApplied;
      this.dom.miniLogo.src = (isSameStationTrack && lastTrack._coverVerified && lastTrack.coverUrl) ? lastTrack.coverUrl : logoSrc;
    }
    if (this.dom.miniTitle) this.dom.miniTitle.textContent = station.name;
    if (this.dom.miniSubtitle) {
      if (isSameStationTrack) {
        this.dom.miniSubtitle.innerHTML = `<span class="mini-track-live">🎵 <b>${this._escapeHtml(lastTrack.artist)}</b> - ${this._escapeHtml(lastTrack.title)}</span>`;
      } else {
        this.dom.miniSubtitle.textContent = this.audioEngine.isPlaying ? '● CANLI YAYIN' : 'Canlı Radyo';
      }
    }

    if (this.dom.modalLogo) {
      delete this.dom.modalLogo.dataset.fallbackApplied;
      this.dom.modalLogo.src = (isSameStationTrack && lastTrack._coverVerified && lastTrack.coverUrl) ? lastTrack.coverUrl : logoSrc;
    }
    if (this.dom.modalTitle) this.dom.modalTitle.textContent = station.name;
    if (this.dom.modalGenre) {
      if (this.audioEngine.isReconnecting) {
        this.dom.modalGenre.textContent = `Yeniden bağlanıyor (${this.audioEngine.reconnectAttempts}/${this.audioEngine.maxReconnectAttempts})...`;
      } else if (this.audioEngine.isLoading) {
        this.dom.modalGenre.textContent = 'Bağlantı kuruluyor...';
      } else if (this.audioEngine._errorInfo) {
        this.dom.modalGenre.textContent = this.audioEngine._errorInfo.message;
      } else {
        this.dom.modalGenre.textContent = this.audioEngine.isPlaying ? 'Canlı Yayın Akışı' : 'Hazır';
      }
    }
    if (this.dom.modalCodec) this.dom.modalCodec.textContent = `${(station.format || 'HLS').toUpperCase()} Akışı • 128 kbps • ${station.isHttps ? 'HTTPS' : 'HTTP'}`;

    const trackBox = document.getElementById('modalTrackBox');
    const trackTitle = document.getElementById('modalTrackTitle');
    const trackArtist = document.getElementById('modalTrackArtist');
    if (trackBox && trackTitle && trackArtist) {
      if (isSameStationTrack) {
        trackTitle.textContent = lastTrack.title || 'Canlı Müzik';
        trackArtist.textContent = lastTrack.artist || station.name;
      } else {
        trackTitle.textContent = this.audioEngine.isPlaying ? 'Kesintisiz Canlı Yayın' : 'Canlı Radyo Yayını';
        trackArtist.textContent = station.name;
      }
      trackBox.style.display = 'block';
    }

    const isFav = RadioStorage.isFavorite(station.id);
    this._updateFavoriteButton(isFav);
    this._updatePlaybackState(this.audioEngine.isPlaying, station);
  }

  _updateFavoriteButton(isFav) {
    const btn = this.dom.modalFavBtn;
    if (!btn) return;
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btn.setAttribute('aria-label', isFav ? 'Favorilerden çıkar' : 'Favorilere ekle');
    const emptyIcon = btn.querySelector('.heart-icon.empty');
    const filledIcon = btn.querySelector('.heart-icon.filled');
    if (emptyIcon && filledIcon) {
      emptyIcon.style.display = isFav ? 'none' : 'block';
      filledIcon.style.display = isFav ? 'block' : 'none';
    }
  }

  _updateTrackMetadataUI(track) {
    if (!track || !this.audioEngine.currentStation) return;
    if (this.audioEngine.currentStation.id !== track.stationId) return;

    if (this.dom.miniSubtitle) {
      const safeTitle = this._escapeHtml(track.title);
      const safeArtist = this._escapeHtml(track.artist);
      const songText = safeArtist ? `🎵 <b>${safeArtist}</b> - ${safeTitle}` : `🎵 ${safeTitle}`;
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
        track._coverVerified = true;
        if (this.audioEngine.currentStation && this.audioEngine.currentStation.id === currentStationId) {
          this.dom.modalLogo.src = track.coverUrl;
          if (this.dom.miniLogo) this.dom.miniLogo.src = track.coverUrl;
          if (this.desktopUI && this.desktopUI.dom.deckLogo) {
            this.desktopUI.dom.deckLogo.src = track.coverUrl;
          }
        }
      };
      img.onerror = () => {
        track._coverVerified = false;
        track.coverUrl = null;
        if (this.dom.modalLogo) this.dom.modalLogo.src = originalLogo;
      };
      img.src = track.coverUrl;
    }

    const glow = document.getElementById('playerAmbientGlow');
    if (glow && track.coverUrl) {
      glow.style.background = 'radial-gradient(circle, rgba(239, 68, 68, 0.45) 0%, rgba(139, 92, 246, 0.35) 50%, transparent 75%)';
    }
  }

  _refreshListActiveStates(activeId) {
    document.querySelectorAll('.dir-station-row[data-st-id]').forEach(el => {
      const id = parseInt(el.getAttribute('data-st-id'), 10);
      el.classList.toggle('active', id === activeId);
    });
  }

  playAdjacentStation(delta) {
    if (!this.stations.length) return;
    let pool = this.stations;
    if (this.currentView === 'desktop' && this.desktopUI && this.desktopUI._cachedFiltered && this.desktopUI._cachedFiltered.length > 0) {
      pool = this.desktopUI._cachedFiltered;
    }
    const currentId = this.audioEngine.currentStation ? this.audioEngine.currentStation.id : pool[0].id;
    let idx = pool.findIndex(s => s.id === currentId);
    if (idx === -1) idx = 0;
    let nextIdx = idx + delta;
    if (nextIdx < 0) nextIdx = pool.length - 1;
    if (nextIdx >= pool.length) nextIdx = 0;
    this.audioEngine.playStation(pool[nextIdx]);
  }

  switchTab(tabName) {
    if (tabName === 'categories') tabName = 'home';
    this.activeTab = tabName;
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    this.renderActiveTab();
  }

  focusSearch() {
    if (this.currentView === 'desktop') {
      const pcInput = document.getElementById('pcSearchInput');
      if (pcInput) pcInput.focus();
      return;
    }
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

  renderActiveTab() {
    if (!this.dom.viewport || this.currentView === 'desktop') return;

    if (this.activeTab === 'favorites') {
      this.renderFavoritesTab();
    } else if (this.activeTab === 'settings') {
      this.renderSettingsTab();
    } else {
      this.renderDirectoryHome();
    }
  }

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
    const safeName = this._escapeHtml(st.name);
    const safeLogo = this._escapeHtml(st.logo || './assets/brand/favicon.svg');
    const safeFormat = this._escapeHtml((st.format || 'AAC').toUpperCase());

    return `
      <div class="dir-station-row ${isCur ? 'active' : ''}" data-st-id="${st.id}">
        <div class="dir-row-left">
          <img class="dir-row-logo" src="${safeLogo}" alt="" loading="lazy" width="40" height="40">
          <div class="dir-row-details">
            <div class="dir-row-name">${safeName}</div>
            <div class="dir-row-tags">
              <span class="dir-tag-badge dir-tag-format">${safeFormat}</span>
              ${st.isPopular ? '<span class="badge badge-live" style="font-size:9px; padding:1px 5px;">POPÜLER</span>' : ''}
            </div>
          </div>
        </div>
        <div class="dir-row-right">
          <button type="button" class="dir-fav-btn ${isFav ? 'is-fav' : ''}" data-st-id="${st.id}" aria-pressed="${isFav ? 'true' : 'false'}" aria-label="${safeName} favori">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button type="button" class="dir-mini-play-btn" aria-label="${safeName} oynat veya duraklat">
            <svg class="row-play-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:none;' : 'display:block;'}" aria-hidden="true"><polygon points="7,5 19,12 7,19"/></svg>
            <svg class="row-pause-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:block;' : 'display:none;'}" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
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
    const safeQuery = this._escapeHtml(this.searchQuery);
    this.dom.viewport.innerHTML = `
      <div class="directory-container">
        <div class="dir-top-meta">
          <div>
            <h1 class="dir-main-title">Tüm Radyolar</h1>
            <div style="font-size:12px; color:var(--text-tertiary);">Tek ekranda kesintisiz canlı radyo yayını</div>
          </div>
          <span class="dir-stats-badge" id="dirStatsBadge">${this.stations.length} İstasyon</span>
        </div>

        <search class="dir-search-box">
          <span class="dir-search-lens" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <label class="visually-hidden" for="dirSearchInput">Radyo adı ara</label>
          <input id="dirSearchInput" type="search" placeholder="Radyo adı ara..." value="${safeQuery}" autocomplete="off">
          <button type="button" id="dirSearchClearBtn" class="dir-clear-btn" style="display:${this.searchQuery ? 'flex' : 'none'};" aria-label="Aramayı temizle">✕</button>
        </search>

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
      btnEl.setAttribute('aria-pressed', isNowFav ? 'true' : 'false');
      const svg = btnEl.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isNowFav ? '#ef4444' : 'none');
        svg.setAttribute('stroke', isNowFav ? '#ef4444' : 'currentColor');
      }
    }
    if (this.audioEngine.currentStation && this.audioEngine.currentStation.id === stationId) {
      this._updateFavoriteButton(isNowFav);
    }
    if (this.desktopUI) {
      this.desktopUI.renderSidebar();
      if (this.audioEngine.currentStation && this.audioEngine.currentStation.id === stationId) {
        this.desktopUI._syncDeckFavorite(isNowFav);
      }
    }
    this.showToast(isNowFav ? 'Favorilere eklendi ❤️' : 'Favorilerden çıkarıldı 🤍');
  }

  renderFavoritesTab() {
    const favIds = RadioStorage.getFavorites();
    const favStations = this.stations.filter(s => favIds.includes(s.id));
    const cur = this.audioEngine.currentStation;
    const isPlaying = this.audioEngine.isPlaying;

    const favRowsHtml = favStations.map(st => {
      const isCur = cur && cur.id === st.id;
      const safeName = this._escapeHtml(st.name);
      const safeLogo = this._escapeHtml(st.logo || './assets/brand/favicon.svg');
      const safeFormat = this._escapeHtml((st.format || 'AAC').toUpperCase());

      return `
        <div class="dir-station-row ${isCur ? 'active' : ''}" data-st-id="${st.id}">
          <div class="dir-row-left">
            <img class="dir-row-logo" src="${safeLogo}" alt="" loading="lazy" width="40" height="40">
            <div class="dir-row-details">
              <div class="dir-row-name">${safeName}</div>
              <div class="dir-row-tags">
                <span class="dir-tag-badge dir-tag-format">${safeFormat}</span>
                ${st.isPopular ? '<span class="badge badge-live" style="font-size:9px; padding:1px 5px;">POPÜLER</span>' : ''}
              </div>
            </div>
          </div>
          <div class="dir-row-right">
            <button type="button" class="dir-fav-btn is-fav" data-st-id="${st.id}" data-fav-remove="1" aria-label="${safeName} favoriden çıkar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button type="button" class="dir-mini-play-btn" aria-label="${safeName} oynat veya duraklat">
              <svg class="row-play-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:none;' : 'display:block;'}" aria-hidden="true"><polygon points="7,5 19,12 7,19"/></svg>
              <svg class="row-pause-svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="${isCur && isPlaying ? 'display:block;' : 'display:none;'}" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.dom.viewport.innerHTML = `
      <div style="padding:16px;">
        <div class="section-header" style="margin-bottom:16px;">
          <h1 class="section-title"><span>❤️</span> Favori İstasyonlarım (${favStations.length})</h1>
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

  renderSettingsTab() {
    this.dom.viewport.innerHTML = `
      <div style="padding:16px; display:flex; flex-direction:column; gap:18px;">
        <div class="section-header">
          <h1 class="section-title"><span>⚙️</span> Ayarlar &amp; Tercihler</h1>
        </div>

        <!-- View Mode Switcher -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px;">
          <div style="font-size:15px; font-weight:800; margin-bottom:4px;">🖥️ Ekran Görünümü</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            Cihaz genişliğine göre otomatik seçim yapabilir veya Mobil / Masaüstü görünümü sabitleyebilirsiniz (yayın durmaz).
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button type="button" class="filter-chip-btn ${this.viewModePref === 'auto' ? 'active' : ''}" data-view-mode="auto">Otomatik</button>
            <button type="button" class="filter-chip-btn ${this.viewModePref === 'mobile' ? 'active' : ''}" data-view-mode="mobile">Mobil Görünüm</button>
            <button type="button" class="filter-chip-btn ${this.viewModePref === 'desktop' ? 'active' : ''}" data-view-mode="desktop">PC (Masaüstü) Görünüm</button>
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
              <button type="button" class="filter-chip-btn ${this.sleepTimerMinutes === mins ? 'active' : ''}" data-sleep-mins="${mins}">
                ${mins === 0 ? 'Kapalı' : mins + ' Dk'}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- About & Legal / DMCA Section -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px;">
          <div style="font-size:15px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
            <span>ℹ️</span> <span>Hakkında &amp; Telif Hakları (DMCA)</span>
          </div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px; line-height:1.5;">
            rAdio, kamuya açık ve ücretsiz radyo akışlarını derleyen bağımsız bir oynatıcıdır. Sunucularımızda hiçbir ses veya medya dosyası barındırılmaz (0 bayt barındırma).
          </div>
          <button type="button" class="filter-chip-btn" style="border-color:var(--accent-cyan); color:#38bdf8;" data-settings-action="open-about">
            Yasal Bilgilendirme ve DMCA Bildirimi 📄
          </button>
        </div>

        <!-- iOS PWA Install Guide Action -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px; text-align:center;">
          <div style="font-size:14px; font-weight:700; margin-bottom:6px;">📱 Ana Ekrana Ekleme Kılavuzu</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            Safari'de Paylaş düğmesine dokunup "Ana Ekrana Ekle"yi seçerek rAdio'yu tam ekran uygulama gibi kullanabilirsiniz.
          </div>
          <button type="button" class="filter-chip-btn" style="background:var(--accent-orange); color:#fff; border:none;" data-settings-action="show-a2hs">
            Kılavuzu Göster
          </button>
        </div>

        <!-- App Version & Force Reload -->
        <div style="background:var(--surface-card); border:1px solid var(--glass-border); border-radius:20px; padding:18px; text-align:center;">
          <div style="font-size:14px; font-weight:700; margin-bottom:4px;">🔄 Sürüm Bilgisi (v2.3.0)</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
            En güncel arayüz ve yayın listesini anında çekmek için önbelleği sıfırlayıp yenileyebilirsiniz.
          </div>
          <button type="button" class="filter-chip-btn" style="background:linear-gradient(135deg, var(--accent-purple), var(--accent-blue)); color:#fff; border:none; padding:10px 18px; font-weight:700;" data-settings-action="force-update">
            Önbelleği Temizle &amp; Yenile 🔄
          </button>
        </div>
      </div>
    `;
  }

  openPlayerModal() {
    if (!this.dom.playerModal) return;
    this._playerTriggerEl = document.activeElement;
    this.dom.playerModal.classList.add('open');
    this.dom.playerModal.setAttribute('aria-hidden', 'false');
    if (this.dom.mobileShell) this.dom.mobileShell.inert = true;
    this._updatePlayerDisplays(this.audioEngine.currentStation);
    this._syncModalStatusBanner(this.audioEngine.getState());
    if (this.audioEngine.metadataService) {
      if (this.audioEngine.metadataService.lastTrack) {
        this._updateTrackMetadataUI(this.audioEngine.metadataService.lastTrack);
      } else if (this.audioEngine.currentStation) {
        this.audioEngine.metadataService.fetchMetadata(this.audioEngine.currentStation);
      }
    }
    if (this.dom.modalDismissBtn) {
      setTimeout(() => {
        if (this.dom.playerModal && this.dom.playerModal.classList.contains('open')) {
          this.dom.playerModal.scrollTop = 0;
          this.dom.modalDismissBtn.focus();
        }
      }, 60);
    }
  }

  closePlayerModal() {
    if (this.dom.playerModal) {
      const wasOpen = this.dom.playerModal.classList.contains('open');
      this.dom.playerModal.classList.remove('open');
      this.dom.playerModal.setAttribute('aria-hidden', 'true');
      const aboutOpen = this.dom.aboutModal && this.dom.aboutModal.classList.contains('open');
      if (this.dom.mobileShell) {
        this.dom.mobileShell.inert = (this.currentView === 'desktop') || Boolean(aboutOpen);
      }
      if (wasOpen && this._playerTriggerEl && typeof this._playerTriggerEl.focus === 'function') {
        try { this._playerTriggerEl.focus(); } catch {}
      }
      this._playerTriggerEl = null;
    }
  }

  openAboutModal(triggerEl = null) {
    if (!this.dom.aboutModal) return;
    this._aboutTriggerEl = triggerEl || document.activeElement;
    this.dom.aboutModal.classList.add('open');
    this.dom.aboutModal.setAttribute('aria-hidden', 'false');

    if (this.dom.mobileShell) this.dom.mobileShell.inert = true;
    if (this.dom.desktopShell) this.dom.desktopShell.inert = true;

    if (this.dom.aboutCloseTopBtn) {
      setTimeout(() => this.dom.aboutCloseTopBtn.focus(), 40);
    }
  }

  closeAboutModal() {
    if (!this.dom.aboutModal) return;
    this.dom.aboutModal.classList.remove('open');
    this.dom.aboutModal.setAttribute('aria-hidden', 'true');

    const isDesktop = this.currentView === 'desktop';
    const playerOpen = !isDesktop && this.dom.playerModal && this.dom.playerModal.classList.contains('open');
    if (this.dom.mobileShell) this.dom.mobileShell.inert = isDesktop || Boolean(playerOpen);
    if (this.dom.desktopShell) this.dom.desktopShell.inert = !isDesktop;

    if (this._aboutTriggerEl && typeof this._aboutTriggerEl.focus === 'function') {
      try { this._aboutTriggerEl.focus(); } catch {}
    }
    this._aboutTriggerEl = null;
  }

  toggleCurrentFavorite() {
    if (!this.audioEngine.currentStation) return;
    const stId = this.audioEngine.currentStation.id;
    const isNowFav = RadioStorage.toggleFavorite(stId);
    this._updateFavoriteButton(isNowFav);
    this.showToast(isNowFav ? 'Favorilere eklendi ❤️' : 'Favorilerden çıkarıldı 🤍');

    if (this.activeTab === 'favorites') {
      this.renderFavoritesTab();
    } else if (this.activeTab === 'home') {
      const btn = document.querySelector(`.dir-station-row[data-st-id="${stId}"] .dir-fav-btn`);
      if (btn) {
        btn.classList.toggle('is-fav', isNowFav);
        btn.setAttribute('aria-pressed', isNowFav ? 'true' : 'false');
        const svg = btn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', isNowFav ? '#ef4444' : 'none');
          svg.setAttribute('stroke', isNowFav ? '#ef4444' : 'currentColor');
        }
      }
    }

    if (this.desktopUI) {
      this.desktopUI._syncDeckFavorite(isNowFav);
      this.desktopUI.renderSidebar();
      if (this.desktopUI.navSection === 'favorites') {
        this.desktopUI.renderWorkspace();
      } else {
        const pcFavBtn = document.querySelector(`.pc-card-fav-btn[data-fav-id="${stId}"]`);
        if (pcFavBtn) {
          pcFavBtn.setAttribute('aria-pressed', isNowFav ? 'true' : 'false');
          const svg = pcFavBtn.querySelector('svg');
          if (svg) svg.setAttribute('fill', isNowFav ? 'currentColor' : 'none');
        }
      }
    }
  }

  removeFavorite(stId) {
    RadioStorage.toggleFavorite(stId);
    this.renderFavoritesTab();
    if (this.desktopUI) {
      this.desktopUI.renderSidebar();
      if (this.desktopUI.navSection === 'favorites') {
        this.desktopUI.renderWorkspace();
      }
    }
    this.showToast('İstasyon favorilerden kaldırıldı.');
  }

  onVolumeChange(val) {
    this.audioEngine.setVolume(parseFloat(val));
  }

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
        const m = Math.ceil(this.sleepRemainingSeconds / 60);
        if (this.dom.sleepTimerText) {
          this.dom.sleepTimerText.textContent = `Uyku: ${m} Dk`;
        }
        if (this.desktopUI) {
          this.desktopUI.syncSleepTimer(this.sleepTimerMinutes, this.sleepRemainingSeconds);
        }
        if (this.sleepRemainingSeconds <= 0) {
          clearInterval(this.sleepTimerInterval);
          this.sleepTimerInterval = null;
          this.sleepTimerMinutes = 0;
          this.sleepRemainingSeconds = 0;
          this.audioEngine.pause();
          this.showToast('Uyku zamanlayıcısı doldu, radyo durduruldu.', '🌙');
          if (this.dom.sleepTimerText) this.dom.sleepTimerText.textContent = 'Uyku: Kapalı';
          if (this.desktopUI) this.desktopUI.syncSleepTimer(0, 0);
          if (this.activeTab === 'settings') this.renderSettingsTab();
        }
      }, 1000);
      if (this.dom.sleepTimerText) this.dom.sleepTimerText.textContent = `Uyku: ${minutes} Dk`;
    } else {
      this.showToast('Uyku zamanlayıcısı kapatıldı.', '🌙');
      if (this.dom.sleepTimerText) this.dom.sleepTimerText.textContent = 'Uyku: Kapalı';
    }

    if (this.desktopUI) {
      this.desktopUI.syncSleepTimer(this.sleepTimerMinutes, this.sleepRemainingSeconds);
    }
    if (this.currentView === 'mobile' && this.activeTab === 'settings') {
      this.renderSettingsTab();
    }
  }

  onSearchInput(val) {
    this.setSearchQuery(val);
  }

  clearSearch() {
    this.setSearchQuery('');
    const input = document.getElementById('dirSearchInput');
    if (input) input.focus();
  }

  getStationById(id) {
    return this.stations.find(s => s.id === id);
  }

  _setupAntiCopyProtections() {
    document.addEventListener('contextmenu', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      e.preventDefault();
      return false;
    }, { capture: true });

    document.addEventListener('copy', (e) => {
      if (!e.target || !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        return false;
      }
    });

    document.addEventListener('cut', (e) => {
      if (!e.target || !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        return false;
      }
    });

    document.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    });

    document.addEventListener('selectstart', (e) => {
      if (!e.target || !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
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
    } catch {
      window.location = 'about:blank';
    }
  }

  showToast(message, icon = 'ℹ️') {
    if (!this.dom.toastContainer) return;
    while (this.dom.toastContainer.children.length >= 1) {
      this.dom.toastContainer.firstElementChild.remove();
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  _checkA2HSPrompt() {
    if (this.currentView === 'desktop') return;
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = ('standalone' in window.navigator) && window.navigator.standalone;

    if (isIos && !isStandalone && !RadioStorage.isA2HSDismissed()) {
      setTimeout(() => {
        const modalOpen = this.dom.playerModal?.classList.contains('open') || this.dom.aboutModal?.classList.contains('open');
        if (this.currentView === 'mobile' && !modalOpen) {
          this.showA2HSPrompt(false);
        }
      }, 3000);
    }
  }

  showA2HSPrompt() {
    if (this.dom.a2hsBanner && this.currentView === 'mobile') {
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
      const target = e.target;
      const inEditable = target && target.closest && target.closest('input, textarea, select, [contenteditable]');
      const inInteractive = target && target.closest && target.closest('button, a, [role="button"], input, textarea, select, [contenteditable]');

      if (e.key === 'Escape') {
        if (this.dom.aboutModal && this.dom.aboutModal.classList.contains('open')) {
          this.closeAboutModal();
          return;
        }
        if (this.dom.playerModal && this.dom.playerModal.classList.contains('open')) {
          this.closePlayerModal();
          return;
        }
        if (target && (target.id === 'pcSearchInput' || target.id === 'dirSearchInput') && this.searchQuery) {
          this.setSearchQuery('');
          return;
        }
      }

      if (e.key === '/' && !inEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.focusSearch();
        return;
      }

      if ((e.key === 'm' || e.key === 'M') && !inEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.audioEngine.toggleMute();
        return;
      }

      if (!inEditable && this.currentView === 'desktop' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.playAdjacentStation(1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.playAdjacentStation(-1);
          return;
        }
      }

      if (e.code === 'Space' && !inInteractive) {
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
      } catch {}
    }
    if (navigator.serviceWorker) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      } catch {}
    }
    setTimeout(() => {
      window.location.href = window.location.pathname + '?reload=' + Date.now();
    }, 400);
  }

  _setupViewportSync() {
    const sync = () => {
      if (this.viewModePref === 'auto') {
        const resolved = this._computeEffectiveView('auto');
        if (resolved !== this.currentView) {
          this.applyViewMode({ forceRender: true });
          return;
        }
      }

      if (typeof window.__syncRadioViewport === 'function') {
        window.__syncRadioViewport();
      }
      if (document.documentElement.dataset.iosGapFix === '1' && window.scrollY !== 0) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (!['INPUT', 'TEXTAREA'].includes(activeTag)) {
          window.scrollTo(0, 0);
        }
      }
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', () => setTimeout(sync, 120));
    window.addEventListener('pageshow', () => setTimeout(sync, 60));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', sync);
    }
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        if (this.currentView === 'mobile' && window.scrollY !== 0) window.scrollTo(0, 0);
        sync();
      }, 120);
    });
    window.addEventListener('scroll', () => {
      if (document.documentElement.dataset.iosGapFix === '1' && window.scrollY !== 0) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (!['INPUT', 'TEXTAREA'].includes(activeTag)) {
          window.scrollTo(0, 0);
        }
      }
    }, { passive: true });
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=2.3.0').then((reg) => {
          reg.update();
        }).catch((err) => {
          console.log('[rAdio] SW registration notice:', err.message);
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Skip initial clients.claim() on first visit so fresh sessions never mid-flight reload
          if (!hadController) return;
          if (this.audioEngine && (this.audioEngine.isPlaying || this.audioEngine.isLoading)) {
            this.showToast('Yeni sürüm hazır! Güncellemek için sayfayı yenileyebilirsiniz.');
            return;
          }
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.rApp = new RadioApp();
  window.rApp.init();
});
