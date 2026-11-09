// rAdio Storage Manager (LocalStorage API)
class RadioStorage {
  static KEYS = {
    THEME: 'radio_theme',
    FAVORITES: 'radio_favorites',
    RECENT: 'radio_recent',
    VOLUME: 'radio_volume',
    SLEEP: 'radio_sleep_minutes',
    A2HS_DISMISSED: 'radio_a2hs_dismissed',
    VIEW_MODE: 'radio_view_mode',
    PC_DENSITY: 'radio_pc_density'
  };

  static getTheme() {
    return 'directory';
  }

  static setTheme() {
    try {
      localStorage.setItem(this.KEYS.THEME, 'directory');
    } catch {}
  }

  // View Mode: 'auto' | 'mobile' | 'desktop'
  static getViewMode() {
    try {
      const val = localStorage.getItem(this.KEYS.VIEW_MODE);
      if (val === 'mobile' || val === 'desktop' || val === 'auto') {
        return val;
      }
    } catch {}
    return 'auto';
  }

  static setViewMode(mode) {
    const safeMode = (mode === 'mobile' || mode === 'desktop') ? mode : 'auto';
    try {
      localStorage.setItem(this.KEYS.VIEW_MODE, safeMode);
    } catch {}
    return safeMode;
  }

  // PC Station View Density: 'grid' | 'list'
  static getPcDensity() {
    try {
      const val = localStorage.getItem(this.KEYS.PC_DENSITY);
      if (val === 'list' || val === 'grid') return val;
    } catch {}
    return 'grid';
  }

  static setPcDensity(density) {
    const safeDensity = density === 'list' ? 'list' : 'grid';
    try {
      localStorage.setItem(this.KEYS.PC_DENSITY, safeDensity);
    } catch {}
    return safeDensity;
  }

  // Favorites (Array of station IDs)
  static getFavorites() {
    try {
      const data = localStorage.getItem(this.KEYS.FAVORITES);
      return data ? JSON.parse(data) : [2, 3, 6, 8]; // Defaults: Power Türk, Süper FM, Kral FM, Slow Türk
    } catch {
      return [2, 3, 6, 8];
    }
  }

  static toggleFavorite(stationId) {
    const favs = this.getFavorites();
    const idx = favs.indexOf(stationId);
    if (idx > -1) {
      favs.splice(idx, 1);
    } else {
      favs.unshift(stationId);
    }
    try {
      localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(favs));
    } catch {}
    return favs.includes(stationId);
  }

  static isFavorite(stationId) {
    return this.getFavorites().includes(stationId);
  }

  // Recent Stations
  static getRecent() {
    try {
      const data = localStorage.getItem(this.KEYS.RECENT);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static addRecent(stationId) {
    let recent = this.getRecent().filter(id => id !== stationId);
    recent.unshift(stationId);
    if (recent.length > 30) recent.pop();
    try {
      localStorage.setItem(this.KEYS.RECENT, JSON.stringify(recent));
    } catch {}
  }

  // Volume (0.0 to 1.0)
  static getVolume() {
    try {
      const vol = localStorage.getItem(this.KEYS.VOLUME);
      if (vol !== null) {
        const parsed = parseFloat(vol);
        if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed));
      }
    } catch {}
    return 0.85;
  }

  static setVolume(volume) {
    const clamped = Math.max(0, Math.min(1, Number(volume) || 0));
    try {
      localStorage.setItem(this.KEYS.VOLUME, clamped.toString());
    } catch {}
  }

  // A2HS banner dismissed flag
  static isA2HSDismissed() {
    try {
      return localStorage.getItem(this.KEYS.A2HS_DISMISSED) === 'true';
    } catch {
      return false;
    }
  }

  static setA2HSDismissed() {
    try {
      localStorage.setItem(this.KEYS.A2HS_DISMISSED, 'true');
    } catch {}
  }
}

window.RadioStorage = RadioStorage;
