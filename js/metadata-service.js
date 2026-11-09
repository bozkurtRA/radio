// rAdio Real-Time "Now Playing" Song & Artist Metadata Service
class RadioMetadataService {
  constructor() {
    this.currentStation = null;
    this.pollInterval = null;
    this.lastTrack = null;
    this.listeners = [];
    this.POLL_SECONDS = 15;
    this.coverCache = new Map();
    this._sessionController = null;
  }

  onTrackChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  _notify(track) {
    if (!track || !this.currentStation || this.currentStation.id !== track.stationId) return;

    if (
      this.lastTrack &&
      this.lastTrack.title === track.title &&
      this.lastTrack.artist === track.artist &&
      this.lastTrack.stationId === track.stationId
    ) {
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
    this._sessionController = new AbortController();

    this.fetchMetadata(station);
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
    if (this._sessionController) {
      try { this._sessionController.abort(); } catch {}
      this._sessionController = null;
    }
    this.currentStation = null;
    this.lastTrack = null;
  }

  async _fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const parentSignal = this._sessionController ? this._sessionController.signal : null;
    if (parentSignal && parentSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (parentSignal) {
        parentSignal.removeEventListener('abort', onParentAbort);
      }
    }
  }

  async fetchMetadata(station) {
    if (!station || !station.url) return;
    if (!this.currentStation || this.currentStation.id !== station.id) return;

    try {
      const urlLower = (station.url || '').toLowerCase();
      const nameLower = (station.name || '').toLowerCase();
      let track = null;

      // 1. TurkMedya (Alem FM, Lig Radyo)
      if (
        urlLower.includes('turkmedya.radyotvonline.net') ||
        urlLower.includes('alemfm') ||
        nameLower.includes('alem fm') ||
        nameLower.includes('lig radyo')
      ) {
        track = await this._fetchTurkMedya(station);
      }
      // 2. Power Group
      else if (urlLower.includes('powerapp.com.tr') || nameLower.includes('power')) {
        track = await this._fetchPowerGroup(station);
      }
      // 3. Radyo Fenomen Group
      else if (urlLower.includes('radyofenomen.com') || nameLower.includes('fenomen')) {
        track = await this._fetchFenomen(station);
      }
      // 4. Triton / StreamTheWorld / Karnaval
      else if (urlLower.includes('streamtheworld.com')) {
        track = await this._fetchTriton(station);
      }
      // 5. Kral Grubu
      else if (
        nameLower.includes('kral fm') ||
        nameLower.includes('kral pop') ||
        urlLower.includes('kralfm') ||
        urlLower.includes('kralpop')
      ) {
        track = await this._fetchKralGroup(station);
      }

      if (track && this.currentStation && this.currentStation.id === station.id) {
        this._notify(track);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // Silent non-blocking fallback so metadata unavailability never breaks audio or spams DevTools
    }
  }

  async _fetchTurkMedya(station) {
    try {
      const resp = await this._fetchWithTimeout(
        'https://turkmedya.radyotvonline.net/status-json.xsl',
        { headers: { Accept: 'application/json' } },
        4000
      );
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
      if (!rawTitle || (rawTitle.toLowerCase().includes('alem fm') && rawTitle.length < 10)) return null;

      let artist = '';
      let song = rawTitle;
      if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        artist = parts[0].trim();
        song = parts.slice(1).join(' - ').trim();
      }

      const cleanArtist = this._formatArtistTitle(artist) || station.name;
      const cleanTitle = this._formatArtistTitle(song) || 'Canlı Müzik';
      const coverUrl = (await this._fetchCoverArt(cleanArtist, cleanTitle)) || station.logo;

      return {
        stationId: station.id,
        stationName: station.name,
        title: cleanTitle,
        artist: cleanArtist,
        coverUrl,
        source: 'turkmedya'
      };
    } catch {
      return null;
    }
  }

  async _fetchPowerGroup(station) {
    try {
      const slug = this._getPowerSlug(station);
      if (!slug) return null;

      const resp = await this._fetchWithTimeout(
        `https://api.powergroup.com.tr/v3/Route/get?url=/radios/${slug}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'client=web&lang=tr&version=23&devicePlatform=1&deviceType=0'
        },
        4000
      );
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
          coverUrl = (await this._fetchCoverArt(artist, title)) || station.logo;
        }

        return {
          stationId: station.id,
          stationName: station.name,
          title: this._formatArtistTitle(title) || 'Canlı Yayın',
          artist: this._formatArtistTitle(artist) || station.name,
          coverUrl,
          source: 'powergroup'
        };
      }
      return null;
    } catch {
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
    if (u.includes('powergold') || name.includes('gold')) return 'powergold';
    if (u.includes('powerfm') || name.includes('fm')) return 'powerfm';
    return 'powerturk';
  }

  async _fetchFenomen(station) {
    try {
      const slug = this._getFenomenSlug(station);
      if (!slug) return null;

      const resp = await this._fetchWithTimeout(
        `https://api.radyofenomen.com/Channels/${slug}?appRef=FenomenWebV2`,
        { headers: { Accept: 'application/json' } },
        4000
      );
      if (!resp.ok) return null;

      const json = await resp.json();
      const timeline = json && json.response && Array.isArray(json.response.timeline) ? json.response.timeline : null;
      if (!timeline || timeline.length === 0) return null;

      const item = timeline[0];
      const title = (item.songTitle || '').trim();
      const artist = (item.artistTitle || '').trim();
      if (!title && !artist) return null;

      const coverUrl =
        item.albumCoverIMG ||
        item.albumCoverIMGSmall ||
        (await this._fetchCoverArt(artist, title)) ||
        station.logo;

      return {
        stationId: station.id,
        stationName: station.name,
        title: this._formatArtistTitle(title) || 'Canlı Yayın',
        artist: this._formatArtistTitle(artist) || station.name,
        coverUrl,
        source: 'fenomen'
      };
    } catch {
      return null;
    }
  }

  _getFenomenSlug(station) {
    const u = (station.url || '').toLowerCase();
    const n = (station.name || '').toLowerCase();
    if (u.includes('fenomenturkyeniler') || n.includes('yeniler')) return 'fenomenturkyeniler';
    if (u.includes('fenomenturktrpop') || n.includes('tr-pop') || n.includes('tr pop')) return 'fenomenturktrpop';
    if (u.includes('fenomenturk') || n.includes('fenomen türk') || n.includes('fenomen turk')) return 'fenomenturk';
    if (u.includes('fenomenkpop') || n.includes('k-pop') || n.includes('kpop')) return 'fenomenkpop';
    if (u.includes('fenomenafro') || n.includes('afro')) return 'fenomenafro';
    if (u.includes('fenomenkarisik') || n.includes('karışık') || n.includes('karisik')) return 'fenomenkarisik';
    if (u.includes('fenomenpop') || n.includes('fenomen pop')) return 'fenomenpop';
    if (u.includes('fenomendans') || n.includes('dans')) return 'fenomendans';
    if (u.includes('fenomen2010') || n.includes('2010')) return 'fenomen2010';
    if (u.includes('clubbin') || n.includes('clubbin')) return 'clubbin';
    if (u.includes('fenomenakustik') || n.includes('akustik')) return 'fenomenakustik';
    if (u.includes('fenomenkanyon') || n.includes('kanyon')) return 'fenomenkanyon';
    if (u.includes('fenomengreece') || n.includes('greece')) return 'fenomengreece';
    if (u.includes('fenomen/') || n.includes('radyo fenomen') || n.trim() === 'fenomen') return 'radyofenomen';
    return null;
  }

  async _fetchTriton(station) {
    try {
      const match = station.url.match(/livestream-redirect\/([A-Za-z0-9_-]+)/i);
      if (!match || !match[1]) return null;
      const mount = match[1];

      const resp = await this._fetchWithTimeout(
        `https://np.tritondigital.com/public/nowplaying?mountName=${encodeURIComponent(mount)}&numberToFetch=1`,
        {},
        4000
      );
      if (!resp.ok) return null;

      const xmlText = await resp.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const properties = xmlDoc.querySelectorAll('property');

      let title = '';
      let artist = '';
      let coverUrl = '';
      properties.forEach(p => {
        const attr = p.getAttribute('name');
        if (attr === 'cue_title') title = p.textContent.trim();
        if (attr === 'track_artist_name') artist = p.textContent.trim();
        if (attr === 'track_cover_url') coverUrl = p.textContent.trim();
      });

      if (!title && !artist) return null;
      if (!coverUrl) {
        coverUrl = (await this._fetchCoverArt(artist, title)) || station.logo;
      }

      return {
        stationId: station.id,
        stationName: station.name,
        title: this._formatArtistTitle(title) || 'Canlı Müzik',
        artist: this._formatArtistTitle(artist) || station.name,
        coverUrl,
        source: 'triton'
      };
    } catch {
      return null;
    }
  }

  async _fetchKralGroup(station) {
    try {
      const name = (station.name || '').toLowerCase();
      const radioId = name.includes('pop') ? 2 : 1;
      const resp = await this._fetchWithTimeout(
        `https://www.kralmuzik.com.tr/rds/mobile?radio_id=${radioId}`,
        { headers: { Accept: 'application/json' } },
        3500
      );
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
        coverUrl = (await this._fetchCoverArt(artist, song)) || station.logo;
      }

      return {
        stationId: station.id,
        stationName: station.name,
        title: this._formatArtistTitle(song) || 'Canlı Yayın',
        artist: this._formatArtistTitle(artist) || station.name,
        coverUrl,
        source: 'kral'
      };
    } catch {
      return null;
    }
  }

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
      const resp = await this._fetchWithTimeout(
        `https://itunes.apple.com/search?term=${q}&media=music&limit=1`,
        {},
        3000
      );
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
    } catch {
      // Non-blocking fallback
    }
    this.coverCache.set(cacheKey, null);
    return null;
  }

  _formatArtistTitle(str) {
    if (!str) return '';
    const s = str.trim();
    if (s.length > 3 && s === s.toUpperCase() && !s.includes('http')) {
      return s.toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (m, p1, p2) => p1 + p2.toUpperCase());
    }
    return s;
  }
}

window.RadioMetadataService = RadioMetadataService;
