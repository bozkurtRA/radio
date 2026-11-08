// rAdio High-Performance Audio Engine & Media Session API
class RadioAudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.volume = RadioStorage.getVolume();
    this.hls = null;

    this.currentStation = null;
    this.isPlaying = false;
    this.isLoading = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimer = null;

    this.listeners = {
      play: [],
      pause: [],
      loading: [],
      error: [],
      stationChange: [],
      volumeChange: []
    };

    this._setupNativeAudioListeners();
    this._setupMediaSessionHandlers();
  }

  // Subscribe to engine events
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error('AudioEngine event error:', e); }
      });
    }
  }

  _setupNativeAudioListeners() {
    this.audio.addEventListener('playing', () => {
      this.isPlaying = true;
      this.isLoading = false;
      this.reconnectAttempts = 0;
      this.emit('play', this.currentStation);
    });

    this.audio.addEventListener('waiting', () => {
      this.isLoading = true;
      this.emit('loading', this.currentStation);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.isLoading = false;
      this.emit('pause', this.currentStation);
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('[AudioEngine] Stream playback error:', e);
      this.handleStreamFailure();
    });

    this.audio.addEventListener('volumechange', () => {
      this.emit('volumeChange', this.audio.volume);
    });
  }

  // Play a radio station
  playStation(station) {
    if (!station || !station.url) return;

    // Check if user has approved access (mandatory login & approval)
    const user = RadioStorage.getUser();
    if (!user || user.status !== 'approved') {
      this.emit('error', 'Radyo yayınlarını dinleyebilmek için giriş yapmalı ve yönetici onayına sahip olmalısınız.');
      if (window.rApp && typeof window.rApp.checkAuthAndEnforceGate === 'function') {
        window.rApp.checkAuthAndEnforceGate();
      }
      return;
    }

    if (this.currentStation && this.currentStation.id === station.id && this.isPlaying) {
      this.pause();
      return;
    }

    // Clean up previous timer / HLS instance
    this.clearReconnect();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    this.currentStation = station;
    this.isLoading = true;
    RadioStorage.addRecent(station.id);
    this.emit('stationChange', station);
    this.emit('loading', station);

    const streamUrl = station.url;
    const isHls = streamUrl.toLowerCase().includes('.m3u8');

    // 1. iOS Safari native HLS check
    if (isHls && this.audio.canPlayType('application/vnd.apple.mpegurl')) {
      this.audio.src = streamUrl;
      this._attemptPlay();
    }
    // 2. Non-Apple browser with Hls.js fallback
    else if (isHls && window.Hls && window.Hls.isSupported()) {
      this.hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true
      });
      this.hls.loadSource(streamUrl);
      this.hls.attachMedia(this.audio);
      this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        this._attemptPlay();
      });
      this.hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          this.handleStreamFailure();
        }
      });
    }
    // 3. Direct HTML5 Audio (AAC, MP3, Icecast)
    else {
      this.audio.src = streamUrl;
      this._attemptPlay();
    }

    this._updateMediaSession(station);
  }

  _attemptPlay() {
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        this.isPlaying = true;
        this.isLoading = false;
        this.emit('play', this.currentStation);
      }).catch((err) => {
        console.log('[AudioEngine] Play attempt notification:', err.message);
        this.isLoading = false;
        this.emit('pause', this.currentStation);
      });
    }
  }

  pause() {
    this.clearReconnect();
    this.audio.pause();
    this.isPlaying = false;
    this.isLoading = false;
    this.emit('pause', this.currentStation);
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      if (this.currentStation) {
        this.playStation(this.currentStation);
      }
    }
  }

  setVolume(val) {
    const clamped = Math.max(0, Math.min(1, val));
    this.audio.volume = clamped;
    RadioStorage.setVolume(clamped);
  }

  getVolume() {
    return this.audio.volume;
  }

  // Auto-reconnect watchdog with exponential backoff
  handleStreamFailure() {
    if (!this.currentStation) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000;
      console.log(`[AudioEngine] Stream dropped. Reconnecting attempt ${this.reconnectAttempts} in ${delay}ms...`);
      this.isLoading = true;
      this.emit('loading', this.currentStation);

      this.reconnectTimer = setTimeout(() => {
        if (this.currentStation) {
          this.playStation(this.currentStation);
        }
      }, delay);
    } else {
      console.warn('[AudioEngine] Reconnect failed after max attempts.');
      this.isLoading = false;
      this.isPlaying = false;
      this.emit('error', 'Yayın bağlantısı kurulamadı. Lütfen internetinizi veya başka bir istasyonu deneyin.');
    }
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // iOS Lock Screen & Bluetooth Headset Media Session Integration
  _updateMediaSession(station) {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: 'rAdio – Mobil Canlı Radyo',
      album: station.category || 'Canlı Yayın',
      artwork: [
        { src: station.logo || './assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: station.logo || './assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }

  _setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('stop', () => this.pause());

    // Headset next/previous buttons
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (window.rApp) window.rApp.playAdjacentStation(-1);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (window.rApp) window.rApp.playAdjacentStation(1);
    });
  }
}

window.RadioAudioEngine = RadioAudioEngine;
