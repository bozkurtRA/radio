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
    this.isIntentionalPause = true;

    this.candidateUrls = [];
    this.currentCandidateIndex = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 4;
    this.reconnectTimer = null;
    this.watchdogTimer = null;

    this.listeners = {
      play: [],
      pause: [],
      loading: [],
      error: [],
      stationChange: [],
      volumeChange: [],
      trackchange: []
    };

    this.metadataService = window.RadioMetadataService ? new window.RadioMetadataService() : null;
    if (this.metadataService) {
      this.metadataService.onTrackChange(track => this._onTrackMetadata(track));
    }

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
      this.isIntentionalPause = false;
      this.clearWatchdog();
      this.reconnectAttempts = 0;
      this.emit('play', this.currentStation);
    });

    this.audio.addEventListener('waiting', () => {
      if (!this.isIntentionalPause) {
        this.isLoading = true;
        this.emit('loading', this.currentStation);
        this._startWatchdog();
      }
    });

    this.audio.addEventListener('stalled', () => {
      if (!this.isIntentionalPause && !this.isPlaying) {
        this.isLoading = true;
        this.emit('loading', this.currentStation);
        this._startWatchdog();
      }
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.clearWatchdog();

      // Only emit pause if explicitly paused by user!
      // If paused due to network glitch or buffer stall, do NOT falsely report "Duraklatıldı"!
      if (this.isIntentionalPause) {
        this.isLoading = false;
        this.emit('pause', this.currentStation);
      }
    });

    this.audio.addEventListener('error', (e) => {
      if (this.isIntentionalPause) return;
      console.warn('[AudioEngine] Audio element error:', this.audio.error);
      this.handleStreamFailure();
    });

    this.audio.addEventListener('volumechange', () => {
      this.emit('volumeChange', this.audio.volume);
    });
  }

  // Generate smart fallback candidates for stream resilience
  _getCandidateUrls(rawUrl) {
    const candidates = [];
    let u = (rawUrl || '').trim();

    // 1. Clean icy:// protocol
    if (u.startsWith('icy://')) {
      u = 'https://' + u.slice(6);
    }

    // 2. Clean listen.pls
    if (u.toLowerCase().includes('listen.pls')) {
      u = u.replace(/\/listen\.pls.*/i, '/;').replace(/listen\.pls.*/i, ';');
    }

    // 3. If bare port shoutcast (e.g. :8080 or :8080/), append /;
    if (/:\d{2,5}$/.test(u)) {
      u = u + '/;';
    } else if (/:\d{2,5}\/$/.test(u)) {
      u = u + ';';
    }

    // Add primary cleaned URL
    candidates.push(u);

    // If HTTP, offer HTTPS
    if (u.startsWith('http://')) {
      candidates.push(u.replace('http://', 'https://'));
    }
    // If HTTPS, offer HTTP fallback
    if (u.startsWith('https://')) {
      candidates.push(u.replace('https://', 'http://'));
    }

    // Shoutcast semicolon path variations
    if (u.endsWith('/;') || u.endsWith(';')) {
      const base = u.replace(/\/;$/, '').replace(/;$/, '');
      candidates.push(base + '/stream');
      candidates.push(base + '/');
    } else if (!u.toLowerCase().includes('.m3u8')) {
      const base = u.endsWith('/') ? u : u + '/';
      candidates.push(base + ';');
      candidates.push(base + 'stream');
    }

    // Deduplicate preserving order
    return [...new Set(candidates.filter(c => c && c.length > 8))];
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

    // Toggle pause if user taps currently playing station
    if (this.currentStation && this.currentStation.id === station.id && this.isPlaying) {
      this.pause();
      return;
    }

    // Clean up previous timers / HLS instance
    this.clearReconnect();
    this.clearWatchdog();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    this.currentStation = station;
    this.isIntentionalPause = false;
    this.isLoading = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;

    this.candidateUrls = this._getCandidateUrls(station.url);
    this.currentCandidateIndex = 0;

    RadioStorage.addRecent(station.id);
    this.emit('stationChange', station);
    this.emit('loading', station);

    this._playCandidate(this.candidateUrls[0]);
    this._updateMediaSession(station);
    if (this.metadataService) {
      this.metadataService.start(station);
    }
  }

  // Play a specific candidate URL
  _playCandidate(streamUrl) {
    this._startWatchdog();

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

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
          console.warn('[Hls.js] Fatal HLS error:', data.type, data.details);
          this.handleStreamFailure();
        }
      });
    }
    // 3. Direct HTML5 Audio (AAC, MP3, Icecast, Shoutcast)
    else {
      this.audio.src = streamUrl;
      this._attemptPlay();
    }
  }

  _attemptPlay() {
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        this.isPlaying = true;
        this.isLoading = false;
        this.clearWatchdog();
        this.emit('play', this.currentStation);
      }).catch((err) => {
        console.warn('[AudioEngine] Play attempt catch:', err.name, err.message);
        if (!this.isIntentionalPause) {
          this.handleStreamFailure();
        }
      });
    }
  }

  pause() {
    this.isIntentionalPause = true;
    this.clearReconnect();
    this.clearWatchdog();
    if (this.metadataService) {
      this.metadataService.stop();
    }

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    this.audio.pause();
    this.audio.removeAttribute('src'); // Stop streaming bandwidth
    this.audio.load();

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

  // Multi-candidate failover and auto-reconnect watchdog
  handleStreamFailure() {
    if (!this.currentStation || this.isIntentionalPause) return;
    this.clearWatchdog();

    // 1. Try next candidate URL if available
    if (this.currentCandidateIndex + 1 < this.candidateUrls.length) {
      this.currentCandidateIndex++;
      const nextCandidate = this.candidateUrls[this.currentCandidateIndex];
      console.log(`[AudioEngine] Candidate failed. Trying candidate [${this.currentCandidateIndex}]: ${nextCandidate}`);
      this.isLoading = true;
      this.emit('loading', this.currentStation);
      this._playCandidate(nextCandidate);
      return;
    }

    // 2. All candidates exhausted: start exponential backoff reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.currentCandidateIndex = 0; // Reset candidates for new attempt
      const delay = Math.min(Math.pow(2, this.reconnectAttempts - 1) * 1200, 8000);
      console.log(`[AudioEngine] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
      this.isLoading = true;
      this.emit('loading', this.currentStation);

      this.reconnectTimer = setTimeout(() => {
        if (!this.isIntentionalPause && this.currentStation) {
          this._playCandidate(this.candidateUrls[0]);
        }
      }, delay);
    } else {
      console.warn('[AudioEngine] Reconnect failed after all candidate attempts.');
      this.isLoading = false;
      this.isPlaying = false;
      this.isIntentionalPause = true;
      this.emit('error', 'Yayın sunucusuna bağlanılamadı. Lütfen internetinizi veya başka bir istasyonu deneyin.');
      this.emit('pause', this.currentStation);
    }
  }

  _startWatchdog() {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (this.isLoading && !this.isPlaying && !this.isIntentionalPause) {
        console.warn('[AudioEngine] Stream loading timed out (7s). Triggering failover...');
        this.handleStreamFailure();
      }
    }, 7000);
  }

  clearWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // Dynamic Song / Artist Metadata Handler
  _onTrackMetadata(track) {
    if (!this.currentStation || this.currentStation.id !== track.stationId) return;

    // Update MediaSession with exact Track & Artist for iOS Lockscreen / Car / Smartwatch
    if ('mediaSession' in navigator) {
      const artworks = [];
      if (track.coverUrl) {
        artworks.push({ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' });
      }
      artworks.push({ src: this.currentStation.logo || './assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' });
      artworks.push({ src: this.currentStation.logo || './assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' });

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: `${track.artist} (${this.currentStation.name})`,
        album: this.currentStation.category || 'Canlı Radyo',
        artwork: artworks
      });
    }

    this.emit('trackchange', track);
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
