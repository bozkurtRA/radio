// rAdio Real-Time "Now Playing" Song & Artist Metadata Service
class RadioMetadataService {
  constructor() {
    this.currentStation = null;
    this.pollInterval = null;
    this.lastTrack = null;
    this.listeners = [];
    this.POLL_SECONDS = 15;
  }

  onTrackChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  _notify(track) {
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
      // Source 1: Power Group Stations (Power Türk, Power FM, Power Pop, Power Love, etc.)
      if (station.url.includes('powerapp.com.tr')) {
        const track = await this._fetchPowerGroup(station);
        if (track) {
          this._notify(track);
          return;
        }
      }

      // Source 2: Triton / StreamTheWorld / Karnaval (Süper FM, Joy FM, Joy Türk, Metro FM, Virgin Radio, Retro Türk)
      if (station.url.includes('streamtheworld.com')) {
        const track = await this._fetchTriton(station);
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

  // Source A: Power Group API (CORS open)
  async _fetchPowerGroup(station) {
    const slug = this._getPowerSlug(station);
    if (!slug) return null;

    const resp = await fetch(`https://api.powergroup.com.tr/v3/Route/get?url=/radios/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client=web&lang=tr&version=23&devicePlatform=1&deviceType=0'
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

      return {
        stationId: station.id,
        stationName: station.name,
        title: title || 'Canlı Yayın',
        artist: artist || station.name,
        coverUrl: coverUrl,
        source: 'powergroup'
      };
    }
    return null;
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

  // Source B: Triton Digital Now Playing API (CORS open)
  async _fetchTriton(station) {
    const match = station.url.match(/livestream-redirect\/([A-Za-z0-9_-]+)\.(aac|mp3)/i);
    if (!match || !match[1]) return null;
    const mount = match[1];

    const resp = await fetch(`https://np.tritondigital.com/public/nowplaying?mountName=${mount}&numberToFetch=1`);
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

    return {
      stationId: station.id,
      stationName: station.name,
      title: title || 'Canlı Müzik',
      artist: artist || station.name,
      coverUrl: coverUrl || null,
      source: 'triton'
    };
  }
}

window.RadioMetadataService = RadioMetadataService;
