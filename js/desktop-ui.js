// rAdio Dedicated Desktop (PC) Studio Interface Controller
class RadioDesktopUI {
  constructor(app) {
    this.app = app;
    this.navSection = 'all'; // 'all' | 'popular' | 'favorites' | 'recent'
    this.activeCategory = 'all';
    this.formatFilter = 'all'; // 'all' | 'hls' | 'aac' | 'mp3' | 'stream'
    this.density = RadioStorage.getPcDensity(); // 'grid' | 'list'
    this.renderedLimit = 120;
    this._observer = null;
    this._bound = false;
    this._cachedFiltered = [];
    this.categories = [];
    this.dom = {};
  }

  init() {
    this._cacheDom();
    if (!this.dom.shell || this._bound) return;
    this._bindEvents();
    this._syncVolumeUi(this.app.audioEngine.getState());
    this._syncDensityButtons();
    this._bound = true;
  }

  _cacheDom() {
    this.dom.shell = document.getElementById('desktopShell');
    if (!this.dom.shell) return;

    this.dom.brandBtn = document.getElementById('pcBrandBtn');
    this.dom.searchInput = document.getElementById('pcSearchInput');
    this.dom.searchClearBtn = document.getElementById('pcSearchClearBtn');
    this.dom.livePill = document.getElementById('pcLiveStatusPill');
    this.dom.livePillText = document.getElementById('pcLiveStatusText');
    this.dom.switchToMobileBtn = document.getElementById('pcToMobileBtn');
    this.dom.aboutBtn = document.getElementById('pcAboutBtn');

    this.dom.navList = document.getElementById('pcPrimaryNavList');
    this.dom.catList = document.getElementById('pcCategoryList');
    this.dom.sleepGrid = document.getElementById('pcSleepGrid');
    this.dom.sleepRemaining = document.getElementById('pcSleepRemaining');

    this.dom.main = document.getElementById('pcMainPane');
    this.dom.mainHeading = document.getElementById('pcMainHeading');
    this.dom.mainCount = document.getElementById('pcMainCount');
    this.dom.mainSubtitle = document.getElementById('pcMainSubtitle');
    this.dom.formatFilters = document.getElementById('pcFormatFilters');
    this.dom.densityGridBtn = document.getElementById('pcDensityGridBtn');
    this.dom.densityListBtn = document.getElementById('pcDensityListBtn');
    this.dom.featuredStrip = document.getElementById('pcFeaturedStrip');
    this.dom.featuredRow = document.getElementById('pcFeaturedRow');
    this.dom.grid = document.getElementById('pcStationsGrid');
    this.dom.loadMoreWrap = document.getElementById('pcLoadMoreWrap');
    this.dom.loadMoreBtn = document.getElementById('pcLoadMoreBtn');
    this.dom.loadMoreSentinel = document.getElementById('pcLoadMoreSentinel');

    // Player Deck elements
    this.dom.deckGlow = document.getElementById('pcDeckGlow');
    this.dom.deckArtFrame = document.getElementById('pcDeckArtFrame');
    this.dom.deckLogo = document.getElementById('pcDeckLogo');
    this.dom.deckVizBars = this.dom.shell.querySelectorAll('.pc-viz-bar');
    this.dom.deckTitle = document.getElementById('pcDeckTitle');
    this.dom.deckMeta = document.getElementById('pcDeckMeta');
    this.dom.deckCodec = document.getElementById('pcDeckCodec');
    this.dom.deckTrackBadgeText = document.getElementById('pcDeckTrackBadgeText');
    this.dom.deckTrackTitle = document.getElementById('pcDeckTrackTitle');
    this.dom.deckTrackArtist = document.getElementById('pcDeckTrackArtist');
    this.dom.deckAlert = document.getElementById('pcDeckAlert');
    this.dom.deckAlertText = document.getElementById('pcDeckAlertText');
    this.dom.deckRetryBtn = document.getElementById('pcDeckRetryBtn');

    this.dom.prevBtn = document.getElementById('pcPrevBtn');
    this.dom.playBtn = document.getElementById('pcPlayBtn');
    this.dom.nextBtn = document.getElementById('pcNextBtn');
    this.dom.favBtn = document.getElementById('pcDeckFavBtn');
    this.dom.muteBtn = document.getElementById('pcMuteBtn');
    this.dom.volSlider = document.getElementById('pcVolSlider');
    this.dom.volPercent = document.getElementById('pcVolPercent');
  }

  _bindEvents() {
    this.dom.brandBtn?.addEventListener('click', () => {
      this.navSection = 'all';
      this.activeCategory = 'all';
      this.formatFilter = 'all';
      this.app.setSearchQuery('');
      this.renderAll();
      this.dom.main?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    this.dom.switchToMobileBtn?.addEventListener('click', () => {
      this.app.setViewMode('mobile', { persist: true, announce: true });
    });

    this.dom.aboutBtn?.addEventListener('click', () => {
      this.app.openAboutModal(this.dom.aboutBtn);
    });

    this.dom.searchInput?.addEventListener('input', (e) => {
      this.app.setSearchQuery(e.target.value);
    });

    this.dom.searchClearBtn?.addEventListener('click', () => {
      this.app.setSearchQuery('');
      this.dom.searchInput?.focus();
    });

    this.dom.navList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pc-nav]');
      if (!btn) return;
      const section = btn.getAttribute('data-pc-nav');
      if (!section) return;
      this.navSection = section;
      if (section !== 'all') {
        this.activeCategory = 'all';
      }
      this.renderSidebar();
      this.renderWorkspace();
      this.dom.main?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    this.dom.catList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pc-cat]');
      if (!btn) return;
      const catId = btn.getAttribute('data-pc-cat');
      if (!catId) return;
      this.navSection = 'all';
      this.activeCategory = catId;
      this.renderSidebar();
      this.renderWorkspace();
      this.dom.main?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    this.dom.sleepGrid?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pc-sleep]');
      if (!btn) return;
      const mins = parseInt(btn.getAttribute('data-pc-sleep'), 10);
      if (!Number.isNaN(mins)) {
        this.app.setSleepTimer(mins);
      }
    });

    this.dom.formatFilters?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pc-format]');
      if (!btn) return;
      this.formatFilter = btn.getAttribute('data-pc-format') || 'all';
      this._syncFormatButtons();
      this.renderWorkspace();
    });

    this.dom.densityGridBtn?.addEventListener('click', () => this.setDensity('grid'));
    this.dom.densityListBtn?.addEventListener('click', () => this.setDensity('list'));

    this.dom.featuredRow?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-st-id]');
      if (!chip) return;
      const stId = parseInt(chip.getAttribute('data-st-id'), 10);
      this.app.handleStationRowClick(stId);
    });

    this.dom.grid?.addEventListener('click', (e) => {
      const favBtn = e.target.closest('.pc-card-fav-btn');
      if (favBtn) {
        const favId = parseInt(favBtn.getAttribute('data-fav-id'), 10);
        this.toggleFavorite(favId);
        return;
      }

      const selectBtn = e.target.closest('.pc-card-select');
      if (selectBtn) {
        const stId = parseInt(selectBtn.getAttribute('data-st-id'), 10);
        this.app.handleStationRowClick(stId);
      }
    });

    // Clean inline SVG fallback when any station logo image fails on desktop
    this.dom.main?.addEventListener('error', (e) => {
      const target = e.target;
      if (target && target.tagName === 'IMG') {
        const art = target.closest('.pc-card-artwork');
        if (art) {
          art.classList.add('is-fallback');
        } else if (target.dataset.fallbackApplied !== '1') {
          target.dataset.fallbackApplied = '1';
          target.src = './assets/brand/favicon.svg';
        }
      }
    }, true);

    this.dom.deckLogo?.addEventListener('error', () => {
      if (this.dom.deckArtFrame) {
        this.dom.deckArtFrame.classList.add('is-fallback');
      }
    });

    this.dom.loadMoreBtn?.addEventListener('click', () => this.loadMore());

    this.dom.prevBtn?.addEventListener('click', () => this.app.playAdjacentStation(-1));
    this.dom.nextBtn?.addEventListener('click', () => this.app.playAdjacentStation(1));
    this.dom.playBtn?.addEventListener('click', () => this.app.audioEngine.togglePlayPause());
    this.dom.favBtn?.addEventListener('click', () => this.app.toggleCurrentFavorite());
    this.dom.deckRetryBtn?.addEventListener('click', () => this.app.audioEngine.retryCurrentStation());

    this.dom.muteBtn?.addEventListener('click', () => {
      this.app.audioEngine.toggleMute();
    });

    this.dom.volSlider?.addEventListener('input', (e) => {
      this.app.onVolumeChange(e.target.value);
    });
  }

  _buildCategoryDefs() {
    const stations = this.app.stations || [];
    const defs = [
      { id: 'all', name: 'Tümü', icon: 'radio', match: () => true },
      { id: 'pop', name: 'Pop', icon: 'music', match: (s, t) => t.includes('pop') || (s.category === 'Pop' && t.length > 0 && !t.includes('karışık') && !t.includes('tivi') && !t.includes('kıbrıs')) },
      { id: 'arabesk', name: 'Arabesk', icon: 'flame', match: (s, t) => s.category === 'Arabesk' || t.includes('arabesk') },
      { id: 'yabanci', name: 'Yabancı', icon: 'globe', match: (s, t) => s.category === 'Yabancı Pop' || t.includes('yabancı') },
      { id: 'karisik', name: 'Karışık', icon: 'shuffle', match: (s, t) => t.includes('karışık') },
      { id: 'dini', name: 'Dini', icon: 'moon', match: (s, t) => s.category === 'Dini' || t.includes('dini') },
      { id: 'haber', name: 'Haber & Spor', icon: 'newspaper', match: (s, t) => s.category === 'Haber - Spor' || t.includes('haber') },
      { id: 'halk', name: 'Halk Müziği', icon: 'music', match: (s, t) => s.category === 'Halk Müziği' || t.includes('halkmüzik') },
      { id: 'nostalji', name: 'Nostalji', icon: 'disc', match: (s, t) => s.category === 'Nostalji' || t.includes('nostalji') },
      { id: 'tivi', name: 'TV Kanalları', icon: 'tv', match: (s, t) => t.includes('tivi') },
      { id: 'slow', name: 'Slow', icon: 'heart', match: (s, t) => s.category === 'Slow' || t.includes('slow') },
      { id: 'kurtce', name: 'Kürtçe', icon: 'music', match: (s, t) => s.category === 'Kürtçe' || t.includes('kürtçe') },
      { id: 'azeri', name: 'Azerbaycan', icon: 'globe', match: (s, t) => s.category === 'Azerbaycan' || t.includes('azeri') },
      { id: 'klasik', name: 'Klasik Müzik', icon: 'disc', match: (s, t) => s.category === 'Klasik Müzik' || t.includes('klasik') },
      { id: 'karadeniz', name: 'Karadeniz', icon: 'wave', match: (s, t) => s.category === 'Karadeniz' || t.includes('karadeniz') },
      { id: 'oyun', name: 'Oyun Havası', icon: 'music', match: (s, t) => s.category === 'Oyun Havası' || t.includes('oyunhavası') },
      { id: 'rock', name: 'Rock', icon: 'bolt', match: (s, t) => s.category === 'Rock' || t.includes('rock') },
      { id: 'ozgun', name: 'Özgün', icon: 'mic', match: (s, t) => s.category === 'Özgün Müzik' || t.includes('özgün') },
      { id: 'rap', name: 'Rap & Hip-Hop', icon: 'mic', match: (s, t) => s.category === 'Rap & Hip-Hop' || t.includes('rap') },
      { id: 'lounge', name: 'Lounge', icon: 'coffee', match: (s, t) => s.category === 'Lounge' || t.includes('lounge') },
      { id: 'jazz', name: 'Caz & Blues', icon: 'music', match: (s, t) => s.category === 'Caz & Blues' || t.includes('jazz') },
      { id: 'akustik', name: 'Akustik', icon: 'guitar', match: (s, t) => s.category === 'Akustik' || t.includes('akustik') },
      { id: 'yerel', name: 'Yerel & Bölgesel', icon: 'pin', match: (s, t) => (t.length === 0 && s.category === 'Pop') || t.includes('yerel') || t.includes('kıbrıs') },
      { id: 'kultur', name: 'Kültür & Sanat', icon: 'sparkles', match: (s, t) => s.category === 'Kültür - Sanat' || t.includes('kültür') },
      { id: 'cocuk', name: 'Çocuk & Masal', icon: 'sparkles', match: (s, t) => s.category === 'Çocuk & Masal' || t.includes('bebek') },
      { id: 'kpop', name: 'K-Pop', icon: 'music', match: (s, t) => s.category === 'K-Pop' || t.includes('kpop') }
    ];

    this.categories = defs.map(d => {
      const count = d.id === 'all'
        ? stations.length
        : stations.filter(st => d.match(st, Array.isArray(st.tags) ? st.tags : [])).length;
      return { ...d, count };
    }).filter(d => d.count > 0 || d.id === 'all');
  }

  getDisplayCategory(st) {
    if (!st) return 'Canlı Radyo';
    const tags = Array.isArray(st.tags) ? st.tags : [];
    if (tags.includes('tivi') && st.category === 'Pop') return 'TV Kanalı';
    if (tags.includes('karışık') && st.category === 'Pop') return 'Karışık';
    if (tags.length === 0 && st.category === 'Pop') return 'Yerel & Bölgesel';
    return st.category || 'Canlı Radyo';
  }

  _catSvg(kind) {
    const base = 'width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    switch (kind) {
      case 'radio':
        return `<svg ${base}><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>`;
      case 'globe':
        return `<svg ${base}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
      case 'tv':
        return `<svg ${base}><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>`;
      case 'newspaper':
        return `<svg ${base}><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8z"/></svg>`;
      case 'moon':
        return `<svg ${base}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      case 'heart':
        return `<svg ${base}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      case 'bolt':
        return `<svg ${base}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
      case 'mic':
        return `<svg ${base}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
      case 'pin':
        return `<svg ${base}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
      case 'disc':
        return `<svg ${base}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
      case 'shuffle':
        return `<svg ${base}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`;
      case 'flame':
        return `<svg ${base}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
      default:
        return `<svg ${base}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }
  }

  _logoFallbackSvg() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>`;
  }

  setDensity(density) {
    this.density = RadioStorage.setPcDensity(density);
    this._syncDensityButtons();
    if (this.dom.grid) {
      this.dom.grid.classList.toggle('is-list', this.density === 'list');
    }
  }

  _syncDensityButtons() {
    if (this.dom.densityGridBtn) {
      this.dom.densityGridBtn.setAttribute('aria-pressed', this.density === 'grid' ? 'true' : 'false');
    }
    if (this.dom.densityListBtn) {
      this.dom.densityListBtn.setAttribute('aria-pressed', this.density === 'list' ? 'true' : 'false');
    }
  }

  _syncFormatButtons() {
    if (!this.dom.formatFilters) return;
    this.dom.formatFilters.querySelectorAll('[data-pc-format]').forEach(btn => {
      const val = btn.getAttribute('data-pc-format');
      btn.setAttribute('aria-pressed', val === this.formatFilter ? 'true' : 'false');
    });
  }

  syncSearchFromApp(query) {
    if (this.dom.searchInput && this.dom.searchInput.value !== query) {
      this.dom.searchInput.value = query;
    }
    if (this.dom.searchClearBtn) {
      this.dom.searchClearBtn.classList.toggle('visible', Boolean(query));
    }
    if (this.app.currentView === 'desktop') {
      this.renderWorkspace();
    }
  }

  syncSleepTimer(minutes, remainingSeconds) {
    if (this.dom.sleepGrid) {
      this.dom.sleepGrid.querySelectorAll('[data-pc-sleep]').forEach(btn => {
        const val = parseInt(btn.getAttribute('data-pc-sleep'), 10);
        btn.setAttribute('aria-pressed', val === minutes ? 'true' : 'false');
      });
    }
    if (this.dom.sleepRemaining) {
      this.dom.sleepRemaining.textContent = remainingSeconds > 0
        ? `${Math.ceil(remainingSeconds / 60)} Dk`
        : 'Kapalı';
    }
  }

  toggleFavorite(stationId) {
    const isNowFav = RadioStorage.toggleFavorite(stationId);
    const st = this.app.getStationById(stationId);
    const state = this.app.audioEngine.getState();

    this.renderSidebar();

    if (this.navSection === 'favorites') {
      this.renderWorkspace();
    } else if (this.dom.grid) {
      this.dom.grid.querySelectorAll(`.pc-card-fav-btn[data-fav-id="${stationId}"]`).forEach(btn => {
        btn.setAttribute('aria-pressed', isNowFav ? 'true' : 'false');
        btn.setAttribute('aria-label', `${st ? st.name : 'İstasyon'} favorilerden ${isNowFav ? 'çıkar' : 'ekle'}`);
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isNowFav ? 'currentColor' : 'none');
      });
    }

    if (state.station && state.station.id === stationId) {
      this._syncDeckFavorite(isNowFav);
    }

    this.app.showToast(isNowFav ? 'Favorilere eklendi ❤️' : 'Favorilerden çıkarıldı 🤍');
  }

  renderAll() {
    if (!this.dom.shell) return;
    this._buildCategoryDefs();
    this.syncSearchFromApp(this.app.searchQuery);
    this.syncSleepTimer(this.app.sleepTimerMinutes, this.app.sleepRemainingSeconds);
    this._syncDensityButtons();
    this._syncFormatButtons();
    this.renderSidebar();
    this.renderWorkspace();
    this.syncDeckState();
  }

  renderSidebar() {
    if (!this.dom.navList || !this.dom.catList) return;
    if (!this.categories.length && this.app.stations.length) {
      this._buildCategoryDefs();
    }

    const totalCount = this.app.stations.length;
    const popularCount = this.app.stations.filter(s => s.isPopular).length;
    const favCount = RadioStorage.getFavorites().length;
    const recentCount = RadioStorage.getRecent().length;

    const navItems = [
      { id: 'all', label: 'Tüm Radyolar', count: totalCount, icon: 'radio' },
      { id: 'popular', label: 'Popüler', count: popularCount, icon: 'flame' },
      { id: 'favorites', label: 'Favorilerim', count: favCount, icon: 'heart' },
      { id: 'recent', label: 'Son Dinlenenler', count: recentCount, icon: 'disc' }
    ];

    this.dom.navList.innerHTML = navItems.map(item => {
      const isCurrent = this.navSection === item.id && (item.id !== 'all' || this.activeCategory === 'all');
      return `
        <li>
          <button type="button" class="pc-nav-item-btn" data-pc-nav="${item.id}" ${isCurrent ? 'aria-current="page"' : ''}>
            <span class="pc-nav-label">
              ${this._catSvg(item.icon)}
              <span>${this.app._escapeHtml(item.label)}</span>
            </span>
            <span class="pc-nav-count">${item.count}</span>
          </button>
        </li>
      `;
    }).join('');

    this.dom.catList.innerHTML = this.categories.map(cat => {
      const isActive = this.navSection === 'all' && this.activeCategory === cat.id;
      return `
        <li>
          <button type="button" class="pc-cat-btn" data-pc-cat="${cat.id}" aria-pressed="${isActive ? 'true' : 'false'}">
            <span class="pc-nav-label">
              ${this._catSvg(cat.icon)}
              <span>${this.app._escapeHtml(cat.name)}</span>
            </span>
            <span class="pc-nav-count">${cat.count}</span>
          </button>
        </li>
      `;
    }).join('');
  }

  _getFilteredStations() {
    let list = this.app.stations || [];

    if (this.navSection === 'popular') {
      list = list.filter(s => s.isPopular);
    } else if (this.navSection === 'favorites') {
      const favIds = RadioStorage.getFavorites();
      const map = new Map(list.map(s => [s.id, s]));
      list = favIds.map(id => map.get(id)).filter(Boolean);
    } else if (this.navSection === 'recent') {
      const recentIds = RadioStorage.getRecent();
      const map = new Map(list.map(s => [s.id, s]));
      list = recentIds.map(id => map.get(id)).filter(Boolean);
    } else if (this.activeCategory !== 'all') {
      const catDef = this.categories.find(c => c.id === this.activeCategory);
      if (catDef) {
        list = list.filter(st => catDef.match(st, Array.isArray(st.tags) ? st.tags : []));
      }
    }

    if (this.formatFilter !== 'all') {
      list = list.filter(s => (s.format || '').toLowerCase() === this.formatFilter);
    }

    const q = this.app._normalizeText(this.app.searchQuery);
    if (q) {
      list = list.filter(s =>
        s._normName.includes(q) ||
        s._normTags.includes(q) ||
        this.app._normalizeText(this.getDisplayCategory(s)).includes(q)
      );
    }

    return list;
  }

  renderWorkspace() {
    if (!this.dom.grid) return;
    if (!this.categories.length && this.app.stations.length) {
      this._buildCategoryDefs();
    }

    const filtered = this._getFilteredStations();
    this._cachedFiltered = filtered;

    // Heading & Subtitle
    let heading = 'Tüm Radyolar';
    let subtitle = 'Geniş ekran masaüstü radyo istasyonu kataloğu ve anlık canlı akış';
    if (this.navSection === 'popular') {
      heading = 'Popüler İstasyonlar';
      subtitle = 'En çok dinlenen öne çıkan radyo kanalları';
    } else if (this.navSection === 'favorites') {
      heading = 'Favori İstasyonlarım';
      subtitle = 'Hızlı erişim için kalp eklediğiniz radyolar';
    } else if (this.navSection === 'recent') {
      heading = 'Son Dinlenenler';
      subtitle = 'Yakın zamanda çaldığınız kanallar';
    } else if (this.activeCategory !== 'all') {
      const catDef = this.categories.find(c => c.id === this.activeCategory);
      heading = catDef ? `${catDef.name} Radyoları` : 'Kategori';
      subtitle = `${filtered.length} istasyon kategori filtresiyle listeleniyor`;
    }

    if (this.app.searchQuery) {
      subtitle = `"${this.app.searchQuery}" araması için sonuçlar`;
    }

    if (this.dom.mainHeading) this.dom.mainHeading.textContent = heading;
    if (this.dom.mainCount) this.dom.mainCount.textContent = `${filtered.length} İstasyon`;
    if (this.dom.mainSubtitle) this.dom.mainSubtitle.textContent = subtitle;

    // Quick popular shelf shown cleanly on default All view without active search
    const showFeatured =
      this.navSection === 'all' &&
      this.activeCategory === 'all' &&
      this.formatFilter === 'all' &&
      !this.app.searchQuery;

    if (this.dom.featuredStrip && this.dom.featuredRow) {
      this.dom.featuredStrip.style.display = showFeatured ? 'block' : 'none';
      if (showFeatured) {
        const topQuick = this.app.stations.filter(s => s.isPopular).slice(0, 8);
        const curId = this.app.audioEngine.currentStation ? this.app.audioEngine.currentStation.id : null;
        this.dom.featuredRow.innerHTML = topQuick.map(st => `
          <button type="button" class="pc-quick-chip ${st.id === curId ? 'active' : ''}" data-st-id="${st.id}">
            <img src="${this.app._escapeHtml(st.logo || './assets/brand/favicon.svg')}" alt="" loading="lazy" width="32" height="32">
            <span class="pc-quick-chip-text">
              <span class="pc-quick-chip-name">${this.app._escapeHtml(st.name)}</span>
              <span class="pc-quick-chip-cat">${this.app._escapeHtml(this.getDisplayCategory(st))}</span>
            </span>
          </button>
        `).join('');
      }
    }

    this.dom.grid.classList.toggle('is-list', this.density === 'list');
    this.renderedLimit = 120;
    const slice = filtered.slice(0, this.renderedLimit);

    if (slice.length === 0) {
      this.dom.grid.innerHTML = `
        <div class="pc-empty-state">
          <div class="pc-empty-title">
            ${this.navSection === 'favorites' ? 'Henüz favori istasyon eklenmedi' : 'Eşleşen radyo istasyonu bulunamadı'}
          </div>
          <div class="pc-empty-desc">
            ${this.navSection === 'favorites'
              ? 'Kartların sağ üstündeki kalp düğmesine tıklayarak favori listesi oluşturabilirsiniz.'
              : 'Arama metnini veya format/kategori filtrelerini değiştirmeyi deneyin.'}
          </div>
        </div>
      `;
    } else {
      this.dom.grid.innerHTML = slice.map(st => this._buildStationCardHtml(st)).join('');
    }

    this._syncLoadMore();
    this._setupObserver();
  }

  loadMore() {
    if (!this.dom.grid) return;
    const filtered = this._cachedFiltered;
    if (this.renderedLimit >= filtered.length) return;

    const oldLimit = this.renderedLimit;
    const nextLimit = Math.min(oldLimit + 120, filtered.length);
    const slice = filtered.slice(oldLimit, nextLimit);
    if (slice.length > 0) {
      this.dom.grid.insertAdjacentHTML('beforeend', slice.map(st => this._buildStationCardHtml(st)).join(''));
      this.renderedLimit = nextLimit;
    }
    this._syncLoadMore();
  }

  _syncLoadMore() {
    if (!this.dom.loadMoreWrap || !this.dom.loadMoreBtn) return;
    const remaining = Math.max(0, this._cachedFiltered.length - this.renderedLimit);
    this.dom.loadMoreWrap.style.display = remaining > 0 ? 'flex' : 'none';
    if (remaining > 0) {
      this.dom.loadMoreBtn.textContent = `Daha Fazla Göster (+${Math.min(remaining, 120)} / ${remaining} kalan)`;
    }
  }

  _setupObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (!this.dom.loadMoreSentinel || !this.dom.main) return;

    this._observer = new IntersectionObserver((entries) => {
      if (entries[0] && entries[0].isIntersecting) {
        if (this.renderedLimit < this._cachedFiltered.length) {
          this.loadMore();
        }
      }
    }, {
      root: this.dom.main,
      rootMargin: '280px'
    });

    this._observer.observe(this.dom.loadMoreSentinel);
  }

  _buildStationCardHtml(st) {
    const state = this.app.audioEngine.getState();
    const isCur = state.station && state.station.id === st.id;
    const isActivePlaying = isCur && state.isPlaying;
    const isFav = RadioStorage.isFavorite(st.id);
    const safeName = this.app._escapeHtml(st.name);
    const safeCat = this.app._escapeHtml(this.getDisplayCategory(st));
    const safeLogo = this.app._escapeHtml(st.logo || './assets/brand/favicon.svg');
    const formatLabel = this.app._escapeHtml((st.format || 'aac').toUpperCase());

    return `
      <article class="pc-station-card ${isCur ? 'active' : ''}" data-pc-card-id="${st.id}">
        <button type="button" class="pc-card-select" data-st-id="${st.id}" aria-pressed="${isCur ? 'true' : 'false'}">
          <div class="pc-card-top">
            <div class="pc-card-artwork">
              <img src="${safeLogo}" alt="" loading="lazy" width="50" height="50">
              <span class="pc-logo-fallback">${this._logoFallbackSvg()}</span>
            </div>
            <div class="pc-card-titles">
              <div class="pc-card-name">${safeName}</div>
              <div class="pc-card-cat">${safeCat}</div>
            </div>
          </div>
          <div class="pc-card-meta">
            <span class="pc-format-chip">${formatLabel}</span>
            <span class="pc-proto-chip ${st.isHttps ? '' : 'is-http'}">${st.isHttps ? 'HTTPS' : 'HTTP'}</span>
            ${isActivePlaying ? '<span class="pc-playing-chip">CANLI</span>' : ''}
            ${st.isPopular && !isActivePlaying ? '<span class="pc-proto-chip">POPÜLER</span>' : ''}
          </div>
        </button>
        <div class="pc-card-actions">
          <button type="button" class="pc-card-fav-btn" data-fav-id="${st.id}" aria-pressed="${isFav ? 'true' : 'false'}" aria-label="${safeName} favorilerden ${isFav ? 'çıkar' : 'ekle'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <span class="pc-card-play-badge" aria-hidden="true">
            ${isActivePlaying
              ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
              : '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,5 19,12 7,19"/></svg>'
            }
          </span>
        </div>
      </article>
    `;
  }

  syncActiveCards() {
    if (!this.dom.shell) return;
    const state = this.app.audioEngine.getState();
    const curId = state.station ? state.station.id : null;
    const playSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,5 19,12 7,19"/></svg>';
    const pauseSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

    if (this.dom.featuredRow) {
      this.dom.featuredRow.querySelectorAll('.pc-quick-chip').forEach(chip => {
        const id = parseInt(chip.getAttribute('data-st-id'), 10);
        chip.classList.toggle('active', id === curId);
      });
    }

    if (this.dom.grid) {
      this.dom.grid.querySelectorAll('.pc-station-card').forEach(card => {
        const id = parseInt(card.getAttribute('data-pc-card-id'), 10);
        const isCur = id === curId;
        const isLive = isCur && state.isPlaying;
        card.classList.toggle('active', isCur);

        const selBtn = card.querySelector('.pc-card-select');
        if (selBtn) selBtn.setAttribute('aria-pressed', isCur ? 'true' : 'false');

        const badge = card.querySelector('.pc-card-play-badge');
        if (badge) badge.innerHTML = isLive ? pauseSvg : playSvg;

        const meta = card.querySelector('.pc-card-meta');
        if (meta) {
          let chip = meta.querySelector('.pc-playing-chip');
          if (isLive && !chip) {
            chip = document.createElement('span');
            chip.className = 'pc-playing-chip';
            chip.textContent = 'CANLI';
            meta.appendChild(chip);
          } else if (!isLive && chip) {
            chip.remove();
          }
        }
      });
    }

    if (this.navSection === 'recent') {
      this.renderSidebar();
      this.renderWorkspace();
    }
  }

  syncDeckState(overrideNotice = null) {
    if (!this.dom.shell) return;
    const state = this.app.audioEngine.getState();
    const st = state.station;

    if (st) {
      const sameTrack = state.lastTrack && state.lastTrack.stationId === st.id;
      const logoSrc = (sameTrack && state.lastTrack._coverVerified && state.lastTrack.coverUrl)
        ? state.lastTrack.coverUrl
        : (st.logo || './assets/brand/favicon.svg');

      if (this.dom.deckArtFrame) this.dom.deckArtFrame.classList.remove('is-fallback');
      if (this.dom.deckLogo && this.dom.deckLogo.getAttribute('src') !== logoSrc) {
        this.dom.deckLogo.src = logoSrc;
      }

      if (this.dom.deckTitle) this.dom.deckTitle.textContent = st.name;
      if (this.dom.deckMeta) {
        this.dom.deckMeta.textContent = `${this.getDisplayCategory(st)} • ${state.isPlaying ? 'Canlı Yayın' : (state.isReconnecting ? 'Yeniden Bağlanıyor' : (state.isLoading ? 'Bağlanıyor' : 'Hazır'))}`;
      }
      if (this.dom.deckCodec) {
        this.dom.deckCodec.textContent = `${(st.format || 'aac').toUpperCase()} Akışı • ${st.isHttps ? 'HTTPS Güvenli' : 'HTTP Akış'}`;
      }

      if (sameTrack) {
        if (this.dom.deckTrackBadgeText) this.dom.deckTrackBadgeText.textContent = 'ŞİMDİ ÇALIYOR';
        if (this.dom.deckTrackTitle) this.dom.deckTrackTitle.textContent = state.lastTrack.title || 'Canlı Müzik';
        if (this.dom.deckTrackArtist) this.dom.deckTrackArtist.textContent = state.lastTrack.artist || st.name;
      } else {
        if (this.dom.deckTrackBadgeText) this.dom.deckTrackBadgeText.textContent = state.isPlaying ? 'CANLI YAYIN AKIŞI' : 'MASAÜSTÜ OYNATICI';
        if (this.dom.deckTrackTitle) {
          this.dom.deckTrackTitle.textContent = state.isPlaying ? 'Kesintisiz Canlı Yayın' : 'Çalmak için Oynat düğmesine basın';
        }
        if (this.dom.deckTrackArtist) this.dom.deckTrackArtist.textContent = st.name;
      }

      this._syncDeckFavorite(RadioStorage.isFavorite(st.id));
    }

    // Play/Pause Button & Equalizer
    if (this.dom.playBtn) {
      const playSvg = this.dom.playBtn.querySelector('.pc-play-svg');
      const pauseSvg = this.dom.playBtn.querySelector('.pc-pause-svg');
      const showPause = state.isPlaying || state.isLoading || state.isReconnecting;
      if (playSvg && pauseSvg) {
        playSvg.style.display = showPause ? 'none' : 'block';
        pauseSvg.style.display = showPause ? 'block' : 'none';
      }
      this.dom.playBtn.setAttribute('aria-label', showPause ? 'Duraklat' : 'Oynat');
    }

    if (this.dom.deckGlow) {
      this.dom.deckGlow.classList.toggle('active', state.isPlaying);
    }
    if (this.dom.deckVizBars) {
      this.dom.deckVizBars.forEach(b => b.classList.toggle('active', state.isPlaying));
    }

    // Header Live Pill & Telemetry Alert Box
    let pillState = 'idle';
    let pillText = 'HAZIR';
    if (state.isReconnecting) {
      pillState = 'reconnecting';
      pillText = `YENİDEN BAĞLANIYOR (${state.reconnectAttempt}/${state.maxReconnectAttempts})`;
    } else if (state.isLoading) {
      pillState = 'loading';
      pillText = 'BAĞLANIYOR...';
    } else if (state.isPlaying) {
      pillState = 'playing';
      pillText = st ? `CANLI: ${st.name}` : 'CANLI YAYIN';
    } else if (state.errorInfo) {
      pillState = 'error';
      pillText = 'BAĞLANTI HATASI';
    }

    if (this.dom.livePill) this.dom.livePill.setAttribute('data-state', pillState);
    if (this.dom.livePillText) this.dom.livePillText.textContent = pillText;

    if (this.dom.deckAlert && this.dom.deckAlertText) {
      if (overrideNotice && overrideNotice.tone === 'reconnecting') {
        this.dom.deckAlert.classList.add('visible');
        this.dom.deckAlert.setAttribute('data-tone', 'reconnecting');
        this.dom.deckAlertText.textContent = overrideNotice.message;
        if (this.dom.deckRetryBtn) this.dom.deckRetryBtn.style.display = 'none';
      } else if (state.isReconnecting) {
        this.dom.deckAlert.classList.add('visible');
        this.dom.deckAlert.setAttribute('data-tone', 'reconnecting');
        this.dom.deckAlertText.textContent = `Bağlantı yeniden kuruluyor (${state.reconnectAttempt}/${state.maxReconnectAttempts})...`;
        if (this.dom.deckRetryBtn) this.dom.deckRetryBtn.style.display = 'none';
      } else if (state.errorInfo) {
        this.dom.deckAlert.classList.add('visible');
        this.dom.deckAlert.setAttribute('data-tone', 'error');
        this.dom.deckAlertText.textContent = state.errorInfo.message;
        if (this.dom.deckRetryBtn) {
          this.dom.deckRetryBtn.style.display = state.errorInfo.recoverable !== false || state.errorInfo.code === 'AUTOPLAY_BLOCKED' ? 'inline-block' : 'none';
        }
      } else {
        this.dom.deckAlert.classList.remove('visible');
      }
    }

    this._syncVolumeUi(state);
    this.syncActiveCards();
  }

  _syncDeckFavorite(isFav) {
    if (!this.dom.favBtn) return;
    this.dom.favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    this.dom.favBtn.setAttribute('aria-label', isFav ? 'Favorilerden çıkar' : 'Favorilere ekle');
    const svg = this.dom.favBtn.querySelector('svg');
    if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  }

  _syncVolumeUi(state) {
    if (!this.dom.volSlider) return;
    const effectiveVol = state.muted ? 0 : state.volume;
    const pct = Math.round(effectiveVol * 100);
    this.dom.volSlider.value = String(effectiveVol);
    this.dom.volSlider.style.setProperty('--attr-min', this.dom.volSlider.min || '0');
    this.dom.volSlider.style.setProperty('--attr-max', this.dom.volSlider.max || '1');
    this.dom.volSlider.style.setProperty('--control-value', String(effectiveVol));
    this.dom.volSlider.setAttribute('aria-valuetext', effectiveVol === 0 ? 'Sessiz (%0)' : `Yüzde ${pct}`);

    if (this.dom.volPercent) {
      this.dom.volPercent.textContent = `%${pct}`;
    }

    if (this.dom.muteBtn) {
      this.dom.muteBtn.setAttribute('aria-label', effectiveVol === 0 ? 'Sesi Aç' : 'Sessize Al');
      this.dom.muteBtn.setAttribute('aria-pressed', effectiveVol === 0 ? 'true' : 'false');
      const unmutedSvg = this.dom.muteBtn.querySelector('.vol-on-svg');
      const mutedSvg = this.dom.muteBtn.querySelector('.vol-off-svg');
      if (unmutedSvg && mutedSvg) {
        unmutedSvg.style.display = effectiveVol === 0 ? 'none' : 'block';
        mutedSvg.style.display = effectiveVol === 0 ? 'block' : 'none';
      }
    }
  }
}

window.RadioDesktopUI = RadioDesktopUI;
