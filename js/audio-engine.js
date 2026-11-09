// rAdio Shared High-Performance Audio Engine & Media Session Controller
class RadioAudioEngine {
  constructor() {
    this.audio = this._acquirePersistentAudioElement();
    this.audio.preload = 'none';
    this.audio.playsInline = true;
    this.audio.setAttribute('playsinline', '');
    this.audio.volume = RadioStorage.getVolume();

    this.hls = null;
    this.currentStation = null;
    this.isPlaying = false;
    this.isLoading = false;
    this.isReconnecting = false;
    this.isIntentionalPause = true;
    this.isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    this.candidateUrls = [];
    this.currentCandidateIndex = 0;
    this.activeStreamUrl = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelays = [1500, 3000, 5000];
    this.reconnectTimer = null;
    this.watchdogTimer = null;

    this._playSessionId = 0;
    this._attemptToken = 0;
    this._attemptHandled = false;
    this._mediaRecoveryUsed = false;
    this._suppressMediaErrors = false;
    this._lastFailure = null;
    this._errorInfo = null;
    this._stallBaselineTime = 0;
    this._previousVolume = this.audio.volume > 0 ? this.audio.volume : 0.85;

    this.listeners = {
      play: [],
      pause: [],
      loading: [],
      reconnecting: [],
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
    this._setupNetworkListeners();
    this._setupMediaSessionHandlers();
  }

  _acquirePersistentAudioElement() {
    let el = document.getElementById('radioMasterAudio');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'radioMasterAudio';
      el.hidden = true;
      if (document.body) {
        document.body.appendChild(el);
      }
    }
    return el;
  }

  on(event, callback) {
    if (this.listeners[event] && typeof callback === 'function') {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[AudioEngine] Listener error (${event}):`, e);
      }
    });
  }

  getState() {
    return {
      station: this.currentStation,
      isPlaying: this.isPlaying,
      isLoading: this.isLoading,
      isReconnecting: this.isReconnecting,
      isOffline: this.isOffline,
      reconnectAttempt: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      errorInfo: this._errorInfo,
      lastTrack: this.metadataService ? this.metadataService.lastTrack : null,
      volume: this.audio.volume,
      muted: this.audio.muted || this.audio.volume === 0,
      activeStreamUrl: this.activeStreamUrl
    };
  }

  _isAppleSafariEngine() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const isAppleTouch = /iP(hone|od|ad)/.test(platform) ||
      (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
    const isSafariDesktop = /^((?!chrome|android|crios|fxios|edgios|edg|opr|opera).)*safari/i.test(ua);
    return isAppleTouch || isSafariDesktop;
  }

  _canPlayNativeHls() {
    return Boolean(
      this.audio.canPlayType('application/vnd.apple.mpegurl') ||
      this.audio.canPlayType('application/x-mpegURL')
    );
  }

  _isHlsUrl(streamUrl, station) {
    const lower = (streamUrl || '').toLowerCase();
    if (/\.m3u8(\?|#|$)/.test(lower)) return true;
    if (/\.(mp3|aac|aacp|ogg|oga|opus|wav)(\?|#|$)/i.test(lower)) return false;
    return Boolean(station && station.format === 'hls' && lower.includes('m3u8'));
  }

  _setupNativeAudioListeners() {
    this.audio.addEventListener('playing', () => {
      if (this.isIntentionalPause) return;
      this.isPlaying = true;
      this.isLoading = false;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this._errorInfo = null;
      this._lastFailure = null;
      this.clearWatchdog();
      this.clearReconnect();
      this.emit('play', this.currentStation);
    });

    this.audio.addEventListener('waiting', () => {
      if (this.isIntentionalPause || !this.currentStation) return;
      this.isLoading = true;
      this._stallBaselineTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
      this.emit('loading', this.currentStation);
      this._startWatchdog(this._playSessionId, true, this._attemptToken);
    });

    this.audio.addEventListener('stalled', () => {
      if (this.isIntentionalPause || !this.currentStation) return;
      this.isLoading = true;
      this._stallBaselineTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
      this.emit('loading', this.currentStation);
      this._startWatchdog(this._playSessionId, true, this._attemptToken);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.clearWatchdog();

      if (this.isIntentionalPause) {
        this.isLoading = false;
        this.isReconnecting = false;
        this.emit('pause', this.currentStation);
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.isIntentionalPause || !this.currentStation) return;
      this.isPlaying = false;
      this.isLoading = true;
      this._handleStreamFailure({
        code: 'STREAM_ENDED',
        message: 'Yayın akışı beklenmedik şekilde sonlandı, yeniden bağlanılıyor...'
      }, this._playSessionId, this._attemptToken);
    });

    this.audio.addEventListener('error', () => {
      if (this.isIntentionalPause || this._suppressMediaErrors || !this.currentStation) return;
      const failure = this._classifyMediaElementError(this.audio.error, this.activeStreamUrl);
      this._handleStreamFailure(failure, this._playSessionId, this._attemptToken);
    });

    this.audio.addEventListener('volumechange', () => {
      this.emit('volumeChange', {
        volume: this.audio.volume,
        muted: this.audio.muted || this.audio.volume === 0
      });
    });
  }

  _setupNetworkListeners() {
    window.addEventListener('offline', () => {
      this.isOffline = true;
      if (this.currentStation && !this.isIntentionalPause) {
        this.clearWatchdog();
        this.clearReconnect();
        this.isLoading = false;
        this.isPlaying = false;
        this.isReconnecting = true;
        const offlineInfo = {
          code: 'OFFLINE',
          message: 'İnternet bağlantısı kesildi. Bağlantı geri geldiğinde otomatik devam edilecek...',
          recoverable: true,
          station: this.currentStation
        };
        this._errorInfo = offlineInfo;
        this.emit('reconnecting', {
          station: this.currentStation,
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts,
          delayMs: 0,
          reason: 'OFFLINE',
          message: offlineInfo.message
        });
      }
    });

    window.addEventListener('online', () => {
      const wasOffline = this.isOffline;
      this.isOffline = false;
      if (wasOffline && this.currentStation && !this.isIntentionalPause) {
        this.reconnectAttempts = 0;
        this.currentCandidateIndex = 0;
        this.isReconnecting = true;
        this.isLoading = true;
        this._errorInfo = null;
        this.emit('reconnecting', {
          station: this.currentStation,
          attempt: 1,
          maxAttempts: this.maxReconnectAttempts,
          delayMs: 300,
          reason: 'ONLINE_RESTORED',
          message: 'İnternet bağlantısı geri geldi, yayın yeniden başlatılıyor...'
        });
        const sessionId = ++this._playSessionId;
        this._playCandidate(this.candidateUrls[0] || this.currentStation.url, sessionId);
      }
    });
  }

  _classifyMediaElementError(mediaError, streamUrl) {
    if (this.isOffline || navigator.onLine === false) {
      return {
        code: 'OFFLINE',
        message: 'İnternet bağlantısı bulunmuyor. Lütfen ağ bağlantınızı kontrol edin.',
        recoverable: true,
        url: streamUrl
      };
    }

    const code = mediaError ? mediaError.code : 0;
    const isMixedContent =
      window.location &&
      window.location.protocol === 'https:' &&
      typeof streamUrl === 'string' &&
      streamUrl.toLowerCase().startsWith('http://');

    if (isMixedContent) {
      return {
        code: 'MIXED_CONTENT',
        message: 'Bu istasyon yalnızca güvensiz HTTP üzerinden yayın yapıyor; HTTPS bağlantıda tarayıcı tarafından engellenmiş olabilir.',
        recoverable: false,
        url: streamUrl
      };
    }

    if (code === 2) {
      return {
        code: 'CORS_OR_NETWORK',
        message: 'Yayın sunucusuna ağ üzerinden erişilemedi veya bağlantı kesildi.',
        recoverable: true,
        url: streamUrl
      };
    }

    if (code === 3) {
      return {
        code: 'CODEC_UNSUPPORTED',
        message: 'Ses akışı çözümlenemedi. Tarayıcı bu akış biçimini desteklemiyor olabilir.',
        recoverable: false,
        url: streamUrl
      };
    }

    if (code === 4) {
      return {
        code: 'CODEC_UNSUPPORTED',
        message: 'Yayın formatı tarayıcı tarafından açılamadı veya sunucu akış sağlamıyor.',
        recoverable: true,
        url: streamUrl
      };
    }

    return {
      code: 'UNKNOWN',
      message: 'Yayın sunucusu yanıt vermiyor.',
      recoverable: true,
      url: streamUrl
    };
  }

  _classifyHlsError(data, streamUrl) {
    if (this.isOffline || navigator.onLine === false) {
      return {
        code: 'OFFLINE',
        message: 'İnternet bağlantısı kesildi.',
        recoverable: true,
        url: streamUrl
      };
    }

    const httpCode = data && data.response && typeof data.response.code === 'number'
      ? data.response.code
      : 0;
    const details = data ? data.details : '';

    if (httpCode >= 400) {
      return {
        code: 'HTTP_STATUS',
        httpStatus: httpCode,
        message: `Yayın sunucusu HTTP ${httpCode} hatası döndürdü.`,
        recoverable: httpCode >= 500 || httpCode === 404,
        url: streamUrl
      };
    }

    if (
      window.location &&
      window.location.protocol === 'https:' &&
      typeof streamUrl === 'string' &&
      streamUrl.toLowerCase().startsWith('http://')
    ) {
      return {
        code: 'MIXED_CONTENT',
        message: 'Güvensiz HTTP HLS yayını HTTPS sayfasında tarayıcı tarafından engellendi.',
        recoverable: false,
        url: streamUrl
      };
    }

    if (data && data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
      if (details === 'manifestLoadTimeOut' || details === 'levelLoadTimeOut' || details === 'fragLoadTimeOut') {
        return {
          code: 'STALL_TIMEOUT',
          message: 'Yayın sunucusu zaman aşımına uğradı.',
          recoverable: true,
          url: streamUrl
        };
      }
      return {
        code: 'CORS_OR_NETWORK',
        message: 'CORS izni veya ağ bağlantısı nedeniyle HLS akışı alınamadı.',
        recoverable: true,
        url: streamUrl
      };
    }

    if (data && data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
      return {
        code: 'CODEC_UNSUPPORTED',
        message: 'HLS ses kodeği veya medya segmenti çözümlenemedi.',
        recoverable: true,
        url: streamUrl
      };
    }

    return {
      code: 'UNKNOWN',
      message: 'HLS yayını başlatılamadı.',
      recoverable: true,
      url: streamUrl
    };
  }

  // Generate clean, verified fallback candidates without synthesizing invalid suffixes
  _getCandidateUrls(rawUrl) {
    const candidates = [];
    let u = (rawUrl || '').trim();
    if (!u) return candidates;

    if (u.startsWith('icy://')) {
      u = (window.location && window.location.protocol === 'https:' ? 'https://' : 'http://') + u.slice(6);
    }

    if (u.toLowerCase().includes('listen.pls')) {
      u = u.replace(/\/listen\.pls.*/i, '/;').replace(/listen\.pls.*/i, ';');
    }

    let parsed = null;
    try {
      parsed = new URL(u);
    } catch {}

    const pathname = parsed ? parsed.pathname : '';
    const isBarePort = parsed && parsed.port && (pathname === '' || pathname === '/');

    if (isBarePort) {
      const normalized = u.endsWith('/') ? `${u};` : `${u}/;`;
      candidates.push(normalized);
      candidates.push(u.replace(/\/$/, '') + '/stream');
      candidates.push(u.endsWith('/') ? u : `${u}/`);
    } else {
      candidates.push(u);
    }

    if (u.endsWith('/;') || u.endsWith(';')) {
      const base = u.replace(/\/;$/, '').replace(/;$/, '');
      candidates.push(`${base}/stream`);
      candidates.push(`${base}/`);
    }

    // Standard-port HTTP -> HTTPS fallback on HTTPS pages (avoid invalid SSL handshake on custom Shoutcast ports)
    if (u.startsWith('http://') && parsed && !parsed.port) {
      candidates.push('https://' + u.slice(7));
    }

    // HTTPS -> HTTP fallback ONLY when host itself is served over plain HTTP (never trigger mixed-content errors on HTTPS)
    if (u.startsWith('https://') && (!window.location || window.location.protocol !== 'https:') && parsed && !parsed.port) {
      candidates.push('http://' + u.slice(8));
    }

    return [...new Set(candidates.filter(c => typeof c === 'string' && c.length > 8))];
  }

  playStation(station) {
    if (!station || !station.url) return;

    if (this.currentStation && this.currentStation.id === station.id && this.isPlaying) {
      this.pause();
      return;
    }

    const sessionId = ++this._playSessionId;
    this._teardownPlayback(true);

    this.currentStation = station;
    this.isIntentionalPause = false;
    this.isLoading = true;
    this.isPlaying = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this._mediaRecoveryUsed = false;
    this._lastFailure = null;
    this._errorInfo = null;

    this.candidateUrls = this._getCandidateUrls(station.url);
    if (this.candidateUrls.length === 0) {
      this.candidateUrls = [station.url];
    }
    this.currentCandidateIndex = 0;

    RadioStorage.addRecent(station.id);
    this.emit('stationChange', station);
    this.emit('loading', station);

    this._playCandidate(this.candidateUrls[0], sessionId);
    this._updateMediaSession(station);
    if (this.metadataService) {
      this.metadataService.start(station);
    }
  }

  retryCurrentStation() {
    if (!this.currentStation) return;
    if (this.isPlaying) return;
    const station = this.currentStation;
    const sessionId = ++this._playSessionId;
    this._teardownPlayback(true);

    this.isIntentionalPause = false;
    this.isLoading = true;
    this.isPlaying = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this._mediaRecoveryUsed = false;
    this._lastFailure = null;
    this._errorInfo = null;

    this.candidateUrls = this._getCandidateUrls(station.url);
    if (this.candidateUrls.length === 0) this.candidateUrls = [station.url];
    this.currentCandidateIndex = 0;

    this.emit('loading', station);
    this._playCandidate(this.candidateUrls[0], sessionId);
    if (this.metadataService) {
      this.metadataService.start(station);
    }
  }

  _teardownPlayback(resetAudioSrc = true) {
    this.clearReconnect();
    this.clearWatchdog();

    if (this.hls) {
      try {
        if (window.Hls && window.Hls.Events) {
          this.hls.off(window.Hls.Events.MANIFEST_PARSED);
          this.hls.off(window.Hls.Events.ERROR);
        }
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch (e) {
        console.warn('[AudioEngine] HLS cleanup notice:', e);
      }
      this.hls = null;
    }

    this._suppressMediaErrors = true;
    try {
      this.audio.pause();
      if (resetAudioSrc && (this.audio.hasAttribute('src') || this.audio.src)) {
        this.audio.removeAttribute('src');
        this.audio.load();
      }
    } finally {
      Promise.resolve().then(() => {
        this._suppressMediaErrors = false;
      });
    }
  }

  _playCandidate(streamUrl, sessionId) {
    if (sessionId !== this._playSessionId || this.isIntentionalPause) return;

    const attemptToken = ++this._attemptToken;
    this._attemptHandled = false;

    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch {}
      this.hls = null;
    }

    this.activeStreamUrl = streamUrl;
    this._mediaRecoveryUsed = false;
    this._stallBaselineTime = 0;
    this._startWatchdog(sessionId, false, attemptToken);

    const isHls = this._isHlsUrl(streamUrl, this.currentStation);
    const preferNativeHls = isHls && this._isAppleSafariEngine() && this._canPlayNativeHls();

    // 1. Apple Safari / iOS: native hardware HLS playback
    if (preferNativeHls) {
      this.audio.src = streamUrl;
      this.audio.load();
      this._attemptPlay(sessionId, attemptToken);
      return;
    }

    // 2. Non-Safari browsers with Hls.js support
    if (isHls && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 12000,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        }
      });
      this.hls = hls;

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this.isIntentionalPause || this.hls !== hls) return;
        this._attemptPlay(sessionId, attemptToken);
      });

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this.isIntentionalPause || this.hls !== hls) return;
        if (!data || !data.fatal) return;

        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && !this._mediaRecoveryUsed) {
          this._mediaRecoveryUsed = true;
          try {
            hls.recoverMediaError();
            return;
          } catch {}
        }

        const classified = this._classifyHlsError(data, streamUrl);
        this._handleStreamFailure(classified, sessionId, attemptToken);
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(this.audio);
      return;
    }

    // 3. Fallback native HLS if Hls.js is unavailable on an HLS-capable browser
    if (isHls && this._canPlayNativeHls()) {
      this.audio.src = streamUrl;
      this.audio.load();
      this._attemptPlay(sessionId, attemptToken);
      return;
    }

    // 4. Direct HTML5 Audio (AAC, MP3, Icecast, Shoutcast, OGG)
    this.audio.src = streamUrl;
    this.audio.load();
    this._attemptPlay(sessionId, attemptToken);
  }

  _attemptPlay(sessionId, attemptToken = this._attemptToken) {
    if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this.isIntentionalPause) return;

    let playPromise;
    try {
      playPromise = this.audio.play();
    } catch (syncErr) {
      if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this.isIntentionalPause) return;
      this._handlePlayPromiseRejection(syncErr, sessionId, attemptToken);
      return;
    }

    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this.isIntentionalPause) return;
        this.isPlaying = true;
        this.isLoading = false;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this._errorInfo = null;
        this._lastFailure = null;
        this.clearWatchdog();
        this.clearReconnect();
        this.emit('play', this.currentStation);
      }).catch((err) => {
        if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this.isIntentionalPause) return;
        this._handlePlayPromiseRejection(err, sessionId, attemptToken);
      });
    }
  }

  _handlePlayPromiseRejection(err, sessionId, attemptToken = this._attemptToken) {
    if (sessionId !== this._playSessionId || attemptToken !== this._attemptToken || this._attemptHandled || this.isIntentionalPause) return;

    if (!err) {
      this._handleStreamFailure({ code: 'UNKNOWN', message: 'Yayın başlatılamadı.' }, sessionId, attemptToken);
      return;
    }

    // Expected cancellation during quick station change or pause
    if (err.name === 'AbortError') {
      return;
    }

    // Browser autoplay policy blocked playback without user gesture
    if (err.name === 'NotAllowedError') {
      this._attemptHandled = true;
      this.isIntentionalPause = true;
      this.clearWatchdog();
      this.clearReconnect();
      this.isLoading = false;
      this.isPlaying = false;
      this.isReconnecting = false;
      const errObj = {
        code: 'AUTOPLAY_BLOCKED',
        message: 'Tarayıcı otomatik oynatmayı engelledi. Dinlemek için Oynat düğmesine tıklayın.',
        recoverable: false,
        station: this.currentStation
      };
      this._errorInfo = errObj;
      this.emit('error', errObj);
      this.emit('pause', this.currentStation);
      return;
    }

    if (err.name === 'NotSupportedError') {
      this._handleStreamFailure({
        code: 'CODEC_UNSUPPORTED',
        message: 'Tarayıcı bu radyo akış biçimini desteklemiyor.',
        recoverable: true,
        url: this.activeStreamUrl
      }, sessionId, attemptToken);
      return;
    }

    const classified = this._classifyMediaElementError(this.audio.error, this.activeStreamUrl);
    this._handleStreamFailure(classified, sessionId, attemptToken);
  }

  pause() {
    this._playSessionId++;
    this.isIntentionalPause = true;
    this.isPlaying = false;
    this.isLoading = false;
    this.isReconnecting = false;
    this._errorInfo = null;

    if (this.metadataService) {
      this.metadataService.stop();
    }

    this._teardownPlayback(true);
    this.emit('pause', this.currentStation);
  }

  togglePlayPause() {
    if (this.isPlaying || this.isLoading || this.isReconnecting) {
      this.pause();
      return;
    }
    if (this.currentStation) {
      this.playStation(this.currentStation);
    }
  }

  setVolume(val) {
    const num = Number(val);
    const clamped = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0.85;
    if (clamped > 0) {
      this._previousVolume = clamped;
      this.audio.muted = false;
    }
    this.audio.volume = clamped;
    RadioStorage.setVolume(clamped);
  }

  toggleMute() {
    if (this.audio.muted || this.audio.volume === 0) {
      this.audio.muted = false;
      const restore = this._previousVolume > 0.02 ? this._previousVolume : 0.85;
      this.setVolume(restore);
    } else {
      if (this.audio.volume > 0.02) {
        this._previousVolume = this.audio.volume;
      }
      this.audio.muted = true;
    }
    return this.audio.muted || this.audio.volume === 0;
  }

  getVolume() {
    return this.audio.muted ? 0 : this.audio.volume;
  }

  _handleStreamFailure(failureInfo, sessionId, attemptToken = this._attemptToken) {
    if (
      sessionId !== this._playSessionId ||
      attemptToken !== this._attemptToken ||
      this._attemptHandled ||
      !this.currentStation ||
      this.isIntentionalPause
    ) {
      return;
    }
    this._attemptHandled = true;
    this.clearWatchdog();

    this._lastFailure = failureInfo || {
      code: 'UNKNOWN',
      message: 'Yayın sunucusuna bağlanılamadı.',
      recoverable: true,
      url: this.activeStreamUrl
    };

    // 1. Try next verified candidate URL for the same station first
    if (this.currentCandidateIndex + 1 < this.candidateUrls.length) {
      this.currentCandidateIndex++;
      const nextCandidate = this.candidateUrls[this.currentCandidateIndex];
      this.isLoading = true;
      this.emit('loading', this.currentStation);
      this._playCandidate(nextCandidate, sessionId);
      return;
    }

    // If browser is offline, pause reconnect loop and wait for 'online' event
    if (this.isOffline || navigator.onLine === false) {
      this.isLoading = false;
      this.isPlaying = false;
      this.isReconnecting = true;
      const offlineMsg = 'İnternet bağlantısı bekleniyor...';
      this._errorInfo = {
        code: 'OFFLINE',
        message: offlineMsg,
        recoverable: true,
        station: this.currentStation
      };
      this.emit('reconnecting', {
        station: this.currentStation,
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        delayMs: 0,
        reason: 'OFFLINE',
        message: offlineMsg
      });
      return;
    }

    // Non-recoverable definitive blocks (mixed content / autoplay) should fail fast
    if (this._lastFailure.code === 'MIXED_CONTENT' || this._lastFailure.code === 'AUTOPLAY_BLOCKED') {
      this._finalizeFailure(sessionId);
      return;
    }

    // 2. Controlled bounded reconnection attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const attemptIdx = this.reconnectAttempts;
      this.reconnectAttempts++;
      this.currentCandidateIndex = 0;
      const delayMs = this.reconnectDelays[attemptIdx] || 5000;

      this.isPlaying = false;
      this.isLoading = true;
      this.isReconnecting = true;

      const reconnectMsg = `Yayın kesildi • Yeniden bağlanılıyor (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`;
      this.emit('reconnecting', {
        station: this.currentStation,
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        delayMs,
        reason: this._lastFailure.code,
        message: reconnectMsg
      });
      this.emit('loading', this.currentStation);

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (sessionId !== this._playSessionId || this.isIntentionalPause || !this.currentStation) return;
        this._teardownPlayback(true);
        this._playCandidate(this.candidateUrls[0], sessionId);
      }, delayMs);
      return;
    }

    // 3. Reconnect budget exhausted
    this._finalizeFailure(sessionId);
  }

  _finalizeFailure(sessionId) {
    if (sessionId !== this._playSessionId) return;
    const station = this.currentStation;
    const base = this._lastFailure || {};
    const finalError = {
      code: base.code || 'UNKNOWN',
      httpStatus: base.httpStatus || null,
      message: base.message || 'Yayın sunucusuna bağlanılamadı. Lütfen başka bir istasyonu deneyin.',
      recoverable: base.recoverable !== false,
      station,
      url: base.url || this.activeStreamUrl
    };

    this._errorInfo = finalError;
    this.isLoading = false;
    this.isPlaying = false;
    this.isReconnecting = false;
    this.isIntentionalPause = true;
    this._teardownPlayback(true);

    this.emit('error', finalError);
    this.emit('pause', station);
  }

  _startWatchdog(sessionId, isMidStreamCheck = false, attemptToken = this._attemptToken) {
    this.clearWatchdog();
    const timeoutMs = isMidStreamCheck ? 8500 : 10000;
    const baseline = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;

    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (
        sessionId !== this._playSessionId ||
        attemptToken !== this._attemptToken ||
        this.isIntentionalPause ||
        !this.currentStation
      ) {
        return;
      }

      const nowTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
      const progressed =
        (nowTime - baseline > 0.25 && !this.audio.paused && this.audio.readyState >= 2) ||
        (nowTime - baseline > 0.08 && !this.audio.paused && this.audio.readyState >= 3);
      if (progressed) {
        return;
      }

      this._handleStreamFailure({
        code: 'STALL_TIMEOUT',
        message: isMidStreamCheck
          ? 'Yayın akışı takıldı, yeniden bağlanılıyor...'
          : 'Yayın sunucusu yanıt vermiyor (zaman aşımı).',
        recoverable: true,
        url: this.activeStreamUrl
      }, sessionId, attemptToken);
    }, timeoutMs);
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

  _onTrackMetadata(track) {
    if (!this.currentStation || this.currentStation.id !== track.stationId) return;

    if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
      const artworks = [];
      if (track.coverUrl) {
        artworks.push({ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' });
      }
      artworks.push({ src: this.currentStation.logo || './assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' });
      artworks.push({ src: this.currentStation.logo || './assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' });

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: `${track.artist} (${this.currentStation.name})`,
          album: this.currentStation.category || 'Canlı Radyo',
          artwork: artworks
        });
      } catch {}
    }

    this.emit('trackchange', track);
  }

  _updateMediaSession(station) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata !== 'function') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: 'rAdio – Canlı Radyo',
        album: station.category || 'Canlı Yayın',
        artwork: [
          { src: station.logo || './assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: station.logo || './assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch {}
  }

  _setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const handlers = [
      ['play', () => { if (!this.isPlaying) this.playStation(this.currentStation); }],
      ['pause', () => this.pause()],
      ['stop', () => this.pause()],
      ['previoustrack', () => { if (window.rApp) window.rApp.playAdjacentStation(-1); }],
      ['nexttrack', () => { if (window.rApp) window.rApp.playAdjacentStation(1); }]
    ];
    for (const [action, fn] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {}
    }
  }
}

window.RadioAudioEngine = RadioAudioEngine;
