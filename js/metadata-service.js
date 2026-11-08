// rAdio Real-Time "Now Playing" Song & Artist Metadata Service
class RadioMetadataService {
  constructor() {
    this.currentStation = null;
    this.pollInterval = null;
    this.lastTrack = null;
    this.listeners = [];
    this.POLL_SECONDS = 15;
    this.coverCache = new Map();
  }

  onTrackChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  _notify(track) {
    if (!track) return;

    // Avoid redundant notifications if song hasn't changed
    if (this.lastTrack && 
        this.lastTrack.title === track.title && 
        this.lastTrack.artist === track.artist &&
        this.lastTrack.stationId === track.stationId) {
      return;
    }

    this.lastTrack = track;
    this.listeners.forEach(cb => {
      try {
        cb(track);
      } catch (e) {
        console.error('[MetadataService] Callback error:', e);
      }
    });
  }

  start(station) {
    if (!station) return;
    this.stop();
    this.currentStation = station;
    this.lastTrack = null;

    // 1. Immediate fetch
    this.fetchMetadata(station);

    // 2. Periodic poll every 15s while playing
    this.pollInterval = setInterval(() => {
      if (this.currentStation && this.currentStation.id === station.id) {
        this.fetchMetadata(station);
      }
    }, this.POLL_SECONDS * 1000);
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.currentStation = null;
    this.lastTrack = null;
  }

  async fetchMetadata(station) {
    if (!station || !station.url) return;

    try {
      const urlLower = (station.url || '').toLowerCase();
      const nameLower = (station.name || '').toLowerCase();

      // Source 1: TurkMedya (Alem FM, Alem Slow, Alem Farabesk, Alem Plaktan, Alem Atmosfer, Lig Radyo)
      if (urlLower.includes('turkmedya.radyotvonline.net') || 
          urlLower.includes('alemfm') || 
          nameLower.includes('alem fm') ||
          nameLower.includes('lig radyo')) {
        const track = await this._fetchTurkMedya(station);
        if (track) {
          this._notify(track);
          return;
        }
      }

      // Source 2: Power Group (Power Türk, Power FM, Power Pop, Power Love, etc.)
      if (urlLower.includes('powerapp.com.tr') || nameLower.includes('power')) {
        const track = await this._fetchPowerGroup(station);
        if (track) {
          this._notify(track);
          return;
        }
      }

      // Source 3: Triton / StreamTheWorld / Karnaval (Süper FM, Joy FM, Joy Türk, Metro FM, Virgin Radio, Retro Türk)
      if (urlLower.includes('streamtheworld.com')) {
        const track = await this._fetchTriton(station);
        if (track) {
          this._notify(track);
          return;
        }
      }

      // Source 4: Kral Grubu (Kral FM, Kral Pop)
      if (nameLower.includes('kral fm') || nameLower.includes('kral pop') || urlLower.includes('kralfm') || urlLower.includes('kralpop')) {
        const track = await this._fetchKralGroup(station);
        if (track) {
          this._notify(track);
          return;
        }
      }

      // Source 5: Generic Icecast status-json.xsl fallback
      if (urlLower.startsWith('https://') && !urlLower.includes('.m3u8')) {
        const track = await this._fetchGenericIcecast(station);
        if (track) {
          this._notify(track);
          return;
        }
      }
    } catch (err) {
      // Non-blocking catch for stream continuity
      console.warn('[MetadataService] Notice:', err.message || err);
    }
  }

  // ==========================================
  // SOURCE 1: TURKMEDYA (Alem FM, Lig Radyo)
  // ==========================================
  async _fetchTurkMedya(station) {
    try {
      const resp = await fetch('https://turkmedya.radyotvonline.net/status-json.xsl', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (!resp.ok) return null;

      const data = await resp.json();
      const sources = data && data.icestats ? data.icestats.source : null;
      if (!sources) return null;

      const sourceList = Array.isArray(sources) ? sources : [sources];
      let mountSlug = 'alemfmaac';
      const u = (station.url || '').toLowerCase();
      if (u.includes('alemfmslow')) mountSlug = 'alemfmslow';
      else if (u.includes('alemfarabesk')) mountSlug = 'alemfarabesk';
      else if (u.includes('alemplaktan')) mountSlug = 'alemplaktan';
      else if (u.includes('alematmosfer')) mountSlug = 'alematmosfer';
      else if (u.includes('ligradyoaac') || (station.name || '').toLowerCase().includes('lig')) mountSlug = 'ligradyoaac';

      const match = sourceList.find(s => (s.listenurl || '').toLowerCase().includes(mountSlug));
      if (!match) return null;

      const rawTitle = (match.title || match.yp_currently_playing || '').trim();
      if (!rawTitle || rawTitle.toLowerCase().includes('alem fm') && rawTitle.length < 10) return null;

      let artist = '';
      let song = rawTitle;
      if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        artist = parts[0].trim();
        song = parts.slice(1).join(' - ').trim();
      }

      // Clean casing (e.g. SEMICENK -> Semicenk or capitalize)
      const cleanArtist = this._formatArtistTitle(artist) || station.name;
      const cleanTitle = this._formatArtistTitle(song) || 'Canlı Müzik';

      // Look up high-res album cover from Apple iTunes
      const coverUrl = await this._fetchCoverArt(cleanArtist, cleanTitle) || station.logo;

      return {
        stationId: station.id,
        stationName: station.name,
        title: cleanTitle,
        artist: cleanArtist,
        coverUrl: coverUrl,
        source: 'turkmedya'
      };
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // SOURCE 2: POWER GROUP API
  // ==========================================
  async _fetchPowerGroup(station) {
    try {
      const slug = this._getPowerSlug(station);
      if (!slug) return null;

      const resp = await fetch(`https://api.powergroup.com.tr/v3/Route/get?url=/radios/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client=web&lang=tr&version=23&devicePlatform=1&deviceType=0',
        signal: AbortSignal.timeout(4000)
      });

      if (!resp.ok) return null;
      const json = await resp.json();
      if (json && json.data && Array.isArray(json.data.timeline) && json.data.timeline.length > 0) {
        const item = json.data.timeline[0];
        let title = (item.songTitle || '').trim();
        let artist = (item.artistTitle || '').trim();

        if (!title && !artist) {
          if (json.data.nowPlaying) {
            title = json.data.nowPlaying.trim();
            artist = station.name;
          } else {
            return null;
          }
        }

        let coverUrl = null;
        if (item.image && item.image.prefix && item.image.suffix) {
          coverUrl = item.image.prefix.replace(/\/+$/, '') + '/' + item.image.suffix.replace(/^\/+/, '');
        }
        if (!coverUrl) {
          coverUrl = await this._fetchCoverArt(artist, title) || station.logo;
        }

        return {
          stationId: station.id,
          stationName: station.name,
          title: this._formatArtistTitle(title) || 'Canlı Yayın',
          artist: this._formatArtistTitle(artist) || station.name,
          coverUrl: coverUrl,
          source: 'powergroup'
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _getPowerSlug(station) {
    const u = (station.url || '').toLowerCase();
    const name = (station.name || '').toLowerCase();
    if (u.includes('powerturkslow') || name.includes('slow')) return 'powerturkslow';
    if (u.includes('powerturkakustik') || name.includes('akustik')) return 'powerturkakustik';
    if (u.includes('powerturk') || name.includes('türk') || name.includes('turk')) return 'powerturk';
    if (u.includes('powerpop') || name.includes('pop')) return 'powerpop';
    if (u.includes('powerlove') || name.includes('love')) return 'powerlove';
    if (u.includes('powerplus') || name.includes('plus')) return 'powerplus';
    if (u.includes('powerfm') || name.includes('fm')) return 'powerfm';
    return 'powerturk';
  }

  // ==========================================
  // SOURCE 3: TRITON DIGITAL (Karnaval)
  // ==========================================
  async _fetchTriton(station) {
    try {
      const match = station.url.match(/livestream-redirect\/([A-Za-z0-9_-]+)\.(aac|mp3)/i);
      if (!match || !match[1]) return null;
      const mount = match[1];

      const resp = await fetch(`https://np.tritondigital.com/public/nowplaying?mountName=${mount}&numberToFetch=1`, {
        signal: AbortSignal.timeout(4000)
      });
      if (!resp.ok) return null;

      const xmlText = await resp.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const properties = xmlDoc.querySelectorAll('property');

      let title = '', artist = '', coverUrl = '';
      properties.forEach(p => {
        const attr = p.getAttribute('name');
        if (attr === 'cue_title') title = p.textContent.trim();
        if (attr === 'track_artist_name') artist = p.textContent.trim();
        if (attr === 'track_cover_url') coverUrl = p.textContent.trim();
      });

      if (!title && !artist) return null;

      if (!coverUrl) {
        coverUrl = await this._fetchCoverArt(artist, title) || station.logo;
      }

      return {
        stationId: station.id,
        stationName: station.name,
        title: this._formatArtistTitle(title) || 'Canlı Müzik',
        artist: this._formatArtistTitle(artist) || station.name,
        coverUrl: coverUrl,
        source: 'triton'
      };
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // SOURCE 4: KRAL GRUBU (Kral FM, Kral Pop)
  // ==========================================
  async _fetchKralGroup(station) {
    try {
      const name = (station.name || '').toLowerCase();
      const radioId = (name.includes('pop')) ? 2 : 1;
      const resp = await fetch(`https://www.kralmuzik.com.tr/rds/mobile?radio_id=${radioId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3500)
      });
      if (!resp.ok) return null;

      const json = await resp.json();
      if (!json || !json.CurrentSong) return null;

      const song = (json.CurrentSong.SongName || '').trim();
      const artist = (json.CurrentSong.ArtistName || '').trim();
      if (!song && !artist) return null;

      let coverUrl = null;
      if (json.ServiceItuneResponse && json.ServiceItuneResponse.artworkUrl100) {
        coverUrl = json.ServiceItuneResponse.artworkUrl100.replace('100x100bb', '600x600bb');
      }
      if (!coverUrl) {
        coverUrl = await this._fetchCoverArt(artist, song) || station.logo;
      }

      return {
        stationId: station.id,
        stationName: station.name,
        title: this._formatArtistTitle(song) || 'Canlı Yayın',
        artist: this._formatArtistTitle(artist) || station.name,
        coverUrl: coverUrl,
        source: 'kral'
      };
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // SOURCE 5: GENERIC ICECAST status-json.xsl
  // ==========================================
  async _fetchGenericIcecast(station) {
    try {
      const parsed = new URL(station.url);
      const origin = parsed.origin;
      const resp = await fetch(`${origin}/status-json.xsl`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2500)
      });
      if (!resp.ok) return null;

      const data = await resp.json();
      const sources = data && data.icestats ? data.icestats.source : null;
      if (!sources) return null;

      const list = Array.isArray(sources) ? sources : [sources];
      const path = parsed.pathname.toLowerCase().replace(/^\/+/, '');
      const match = list.find(s => (s.listenurl || '').toLowerCase().includes(path)) || list[0];
      if (!match) return null;

      const raw = (match.title || match.yp_currently_playing || '').trim();
      if (!raw || raw.length < 3) return null;

      let artist = station.name;
      let title = raw;
      if (raw.includes(' - ')) {
        const parts = raw.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      const coverUrl = await this._fetchCoverArt(artist, title) || station.logo;

      return {
        stationId: station.id,
        stationName: station.name,
        title: this._formatArtistTitle(title),
        artist: this._formatArtistTitle(artist),
        coverUrl: coverUrl,
        source: 'icecast'
      };
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // ITUNES ALBUM ARTWORK RESOLVER (CORS OPEN)
  // ==========================================
  async _fetchCoverArt(artist, title) {
    if (!artist || !title) return null;
    const cleanA = artist.replace(/\b(radyo|fm|official|canli)\b/gi, '').trim();
    const cleanT = title.replace(/\b(canli|yayin|official)\b/gi, '').trim();
    if (!cleanA || !cleanT) return null;

    const cacheKey = `${cleanA}|${cleanT}`.toLowerCase();
    if (this.coverCache.has(cacheKey)) {
      return this.coverCache.get(cacheKey);
    }

    try {
      const q = encodeURIComponent(`${cleanA} ${cleanT}`);
      const resp = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!resp.ok) return null;

      const json = await resp.json();
      if (json && json.results && json.results.length > 0) {
        const item = json.results[0];
        if (item.artworkUrl100) {
          const hiRes = item.artworkUrl100.replace('100x100bb', '600x600bb');
          this.coverCache.set(cacheKey, hiRes);
          return hiRes;
        }
      }
    } catch (e) {
      // Non-blocking fallback
    }
    this.coverCache.set(cacheKey, null);
    return null;
  }

  // Clean and format all-caps song/artist strings
  _formatArtistTitle(str) {
    if (!str) return '';
    let s = str.trim();
    // If string is ALL CAPS, convert to Title Case for elegant typography
    if (s.length > 3 && s === s.toUpperCase() && !s.includes('http')) {
      return s.toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (m, p1, p2) => p1 + p2.toUpperCase());
    }
    return s;
  }
}

window.RadioMetadataService = RadioMetadataService;
