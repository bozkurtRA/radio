// rAdio Storage Manager (LocalStorage API)
class RadioStorage {
  static KEYS = {
    THEME: 'radio_theme',
    FAVORITES: 'radio_favorites',
    RECENT: 'radio_recent',
    VOLUME: 'radio_volume',
    USER: 'radio_auth_user_v2',
    SLEEP: 'radio_sleep_minutes',
    A2HS_DISMISSED: 'radio_a2hs_dismissed'
  };

  // Design Theme ('modern' | 'minimal' | 'directory')
  static getTheme() {
    return localStorage.getItem(this.KEYS.THEME) || 'modern';
  }

  static setTheme(theme) {
    localStorage.setItem(this.KEYS.THEME, theme);
  }

  // Favorites (Array of station IDs)
  static getFavorites() {
    try {
      const data = localStorage.getItem(this.KEYS.FAVORITES);
      return data ? JSON.parse(data) : [2, 3, 6, 8]; // Defaults to Power Türk, Süper FM, Kral FM, Slow Türk
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
    localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(favs));
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
    if (recent.length > 25) recent.pop();
    localStorage.setItem(this.KEYS.RECENT, JSON.stringify(recent));
  }

  // Volume (0.0 to 1.0)
  static getVolume() {
    const vol = localStorage.getItem(this.KEYS.VOLUME);
    return vol !== null ? parseFloat(vol) : 0.85;
  }

  static setVolume(volume) {
    localStorage.setItem(this.KEYS.VOLUME, volume.toString());
  }

  // User Session & Role
  static getUser() {
    try {
      // Clear legacy/cached session from previous versions
      if (localStorage.getItem('radio_user_session')) {
        localStorage.removeItem('radio_user_session');
      }
      const data = localStorage.getItem(this.KEYS.USER);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.email && parsed.status) {
          return parsed;
        }
      }
    } catch {}
    return null; // İlk açılışta oturum yok, doğrudan login/kayıt zorunlu
  }

  static setUser(userData) {
    localStorage.setItem(this.KEYS.USER, JSON.stringify(userData));
  }

  static clearUser() {
    localStorage.removeItem(this.KEYS.USER);
  }

  // A2HS banner dismissed flag
  static isA2HSDismissed() {
    return localStorage.getItem(this.KEYS.A2HS_DISMISSED) === 'true';
  }

  static setA2HSDismissed() {
    localStorage.setItem(this.KEYS.A2HS_DISMISSED, 'true');
  }
}

window.RadioStorage = RadioStorage;
