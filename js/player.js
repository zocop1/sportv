/* ============================================================
   SportV · reproductor HLS
   hls.js se carga solo cuando se reproduce el primer canal.
   ============================================================ */

import { countryLabel, flagEmoji, initials, qualityText } from './iptv.js';

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

let hlsLibPromise = null;

function loadHlsLib() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLibPromise) return hlsLibPromise;

  hlsLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HLS_CDN;
    script.async = true;
    script.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js no se inicializó')));
    script.onerror = () => reject(new Error('No se pudo descargar hls.js'));
    document.head.appendChild(script);
  });

  return hlsLibPromise;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`;
}

function isDirectFile(url) {
  return /\.(mp4|webm|ogv|m4v)(\?|#|$)/i.test(url);
}

export class Player {
  constructor(refs) {
    Object.assign(this, refs);

    this.channel = null;
    this.hls = null;
    this.mode = null;
    this.isLive = true;
    this._gen = 0;
    this._teardown = false;
    this._dragging = false;
    this._started = false;
    this._mediaRecovered = false;
    this._loadTimer = null;
    this._controlsTimer = null;
    this._volumeTimer = null;

    this._bind();
    this._restoreVolume();
  }

  /* ============================================================
     API pública
     ============================================================ */

  setIdle(channel = null, { eyebrow = 'Destacado' } = {}) {
    this._stopPlayback();
    this.channel = channel || null;
    this._setPoster(channel, eyebrow);

    this.root.classList.remove('is-playing', 'is-paused', 'has-error', 'is-loading', 'controls-hidden');
    this.root.classList.add('is-poster');
    this.video.classList.add('hidden');
    this.poster.classList.remove('hidden', 'is-loading');
    this.error.classList.add('hidden');
    this.spinner.classList.add('hidden');
    this.bigPlay.classList.add('hidden');
    this._setQuality([]);
    this._setLive(false);
    this._paint();
  }

  async load(channel, { autoplay = true } = {}) {
    if (!channel?.url) {
      this.showError('Canal sin señal', 'Este canal no tiene un enlace de reproducción.');
      return;
    }

    this._stopPlayback();
    const gen = ++this._gen;

    this.channel = channel;
    this._mediaRecovered = false;
    this._started = false;

    this.root.classList.remove('is-poster', 'is-paused', 'has-error', 'controls-hidden');
    this.root.classList.add('is-loading');
    this._setPoster(channel, 'Ahora');
    this.poster.classList.remove('hidden');
    this.poster.classList.add('is-loading');
    this.error.classList.add('hidden');
    this.spinner.classList.remove('hidden');
    this.bigPlay.classList.add('hidden');
    this.video.classList.remove('hidden');
    this._setQuality([]);
    this._setLive(true);

    this._loadTimer = setTimeout(() => {
      if (gen !== this._gen || this._started) return;
      this.showError(
        'El canal no responde',
        'No se recibió la señal a tiempo. Puede estar fuera de línea, geobloqueado o no permitir CORS.',
      );
    }, 18000);

    const url = channel.url;

    if (isDirectFile(url)) {
      this._loadNative(url, autoplay, gen);
      return;
    }

    await this._loadHls(url, autoplay, gen);
  }

  stop() {
    this._stopPlayback();
    this.channel = null;
    this._setPoster(null);
    this.root.classList.add('is-poster');
    this.poster.classList.remove('hidden');
  }

  togglePlay() {
    if (!this.channel) return;
    if (this.error.classList.contains('hidden') === false) return;

    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  retry() {
    if (!this.channel) return;
    this.load(this.channel, { autoplay: true });
  }

  setFavorite(isFavorite) {
    this.btnFav.classList.toggle('is-fav', !!isFavorite);
    this.btnFav.setAttribute('aria-label', isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos');
  }

  /* ============================================================
     Carga de medios
     ============================================================ */

  async _loadHls(url, autoplay, gen) {
    this.mode = 'hls';

    let Hls;
    try {
      Hls = await loadHlsLib();
    } catch (error) {
      if (gen !== this._gen) return;
      this.showError(
        'No se pudo cargar el reproductor',
        'No se pudo descargar hls.js. Revisa tu conexión a internet y vuelve a intentarlo.',
      );
      return;
    }

    if (gen !== this._gen) return;

    if (!Hls.isSupported()) {
      if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this._loadNative(url, autoplay, gen);
      } else {
        this.showError(
          'Formato no compatible',
          'Este navegador no puede reproducir HLS. Prueba con Safari, Edge o Chrome actualizado.',
        );
      }
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 30,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      manifestLoadingTimeOut: 12000,
      manifestLoadingMaxRetry: 2,
      levelLoadingTimeOut: 12000,
      levelLoadingMaxRetry: 2,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 2,
    });

    this.hls = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (gen !== this._gen) return;
      this._started = true;
      clearTimeout(this._loadTimer);
      this.spinner.classList.add('hidden');
      this._setQuality(hls.levels || []);
      this._setLive(!!hls.levels?.[0]?.details?.live);
      if (autoplay) this._play(gen);
      else this._revealPaused();
    });

    hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
      if (gen !== this._gen) return;
      this._setLive(!!data.details?.live);
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      if (gen !== this._gen) return;
      if (this.quality.value === '-1' || !this.quality.value) return;
      this.quality.value = String(data.level);
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (gen !== this._gen || !data.fatal) return;

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this._mediaRecovered) {
        this._mediaRecovered = true;
        try { hls.recoverMediaError(); } catch { /* ignore */ }
        return;
      }

      const detail = String(data.details || '');
      let message = 'La señal no está disponible desde tu red. Puede estar geobloqueada, fuera de línea o bloquear CORS.';

      if (/timeout/i.test(detail)) {
        message = 'El canal tardó demasiado en responder. Prueba de nuevo o elige otro canal.';
      } else if (/manifest|level|fragment/i.test(detail)) {
        message = 'No se pudo descargar la lista de reproducción. El canal puede estar fuera de línea o bloquear el acceso desde el navegador.';
      }

      this.showError('No se pudo reproducir el canal', message);
    });

    hls.loadSource(url);
    hls.attachMedia(this.video);
  }

  _loadNative(url, autoplay, gen) {
    this.mode = 'native';
    const video = this.video;

    video.src = url;

    video.addEventListener('loadedmetadata', () => {
      if (gen !== this._gen) return;
      this._started = true;
      clearTimeout(this._loadTimer);
      this._setLive(!Number.isFinite(video.duration));
      this._paint();
    }, { once: true });

    video.addEventListener('canplay', () => {
      if (gen !== this._gen) return;
      this._started = true;
      clearTimeout(this._loadTimer);
      this.spinner.classList.add('hidden');
    }, { once: true });

    video.addEventListener('error', () => {
      if (gen !== this._gen) return;
      this.showError(
        'No se pudo abrir el canal',
        'El enlace está caído, ha caducado o no permite reproducirse en el navegador. Prueba otro canal.',
      );
    }, { once: true });

    if (autoplay) this._play(gen);
    else this._revealPaused();
  }

  _play(gen) {
    this.video.play()
      .then(() => {
        if (gen !== this._gen) return;
        this.spinner.classList.add('hidden');
      })
      .catch(() => {
        if (gen !== this._gen) return;
        this._revealPaused();
      });
  }

  _revealPaused() {
    this.spinner.classList.add('hidden');
    this.poster.classList.add('hidden');
    this.poster.classList.remove('is-loading');
    this.bigPlay.classList.remove('hidden');
    this.root.classList.remove('is-loading', 'has-error');
    this.root.classList.add('is-paused');
    this._showControlsNow();
  }

  showError(title, message) {
    clearTimeout(this._loadTimer);
    this._gen += 1;

    if (this.channel?.http && location.protocol === 'https:') {
      title = 'Canal HTTP bloqueado en HTTPS';
      message = 'Este canal usa una conexión HTTP y el navegador bloquea contenido mixto en páginas HTTPS. Abre SportV en local (http://localhost) o copia el enlace para verlo en VLC.';
    }

    this._destroyHls();
    this._resetVideo();
    this.spinner.classList.add('hidden');
    this.poster.classList.add('hidden');
    this.poster.classList.remove('is-loading');
    this.video.classList.add('hidden');
    this.bigPlay.classList.add('hidden');
    this.root.classList.remove('is-playing', 'is-paused', 'is-loading', 'is-poster');
    this.root.classList.add('has-error');

    this.errTitle.textContent = title;
    this.errMsg.textContent = message;
    this.error.classList.remove('hidden');
    this.qualityPill.classList.add('hidden');
    this._setLive(false);
    this._setQuality([]);
  }

  /* ============================================================
     Póster / fondo
     ============================================================ */

  _setPoster(channel, eyebrow = 'Destacado') {
    if (!channel) {
      this.posterEyebrow.textContent = 'SportV';
      this.posterName.textContent = 'TV en vivo';
      this.posterMeta.textContent = 'Elige un canal para empezar';
      this.posterInitials.textContent = 'SV';
      this.posterLogo.classList.add('hidden');
      this.posterLogo.removeAttribute('src');
      this.stageBg.style.backgroundImage = '';
      this.qualityPill.classList.add('hidden');
      this.posterPlay.disabled = true;
      return;
    }

    this.posterEyebrow.textContent = eyebrow;
    this.posterName.textContent = channel.name;
    this.posterInitials.textContent = initials(channel.name);

    const logo = channel.logo
      && (location.protocol !== 'https:' || !/^http:\/\//i.test(channel.logo))
      ? channel.logo
      : '';

    if (logo) {
      this.posterLogo.src = logo;
      this.posterLogo.classList.remove('hidden');
      this.stageBg.style.backgroundImage = `url("${logo.replace(/"/g, '\\"')}")`;
    } else {
      this.posterLogo.classList.add('hidden');
      this.posterLogo.removeAttribute('src');
      this.stageBg.style.backgroundImage = '';
    }

    const meta = [
      `${flagEmoji(channel.country)} ${escapeHtml(countryLabel(channel.country))}`,
      escapeHtml(qualityText(channel)),
    ];
    if (channel.group) meta.push(escapeHtml(channel.group));
    if (channel.not24) meta.push('No 24/7');
    if (channel.http) meta.push('HTTP');

    this.posterMeta.innerHTML = meta.join(' <span class="sep">·</span> ');
    this.posterPlay.disabled = false;

    if (channel.quality) {
      this.qualityPill.textContent = qualityText(channel);
      this.qualityPill.classList.remove('hidden');
    } else {
      this.qualityPill.classList.add('hidden');
    }
  }

  /* ============================================================
     Reproducción y teardown
     ============================================================ */

  _stopPlayback() {
    this._gen += 1;
    this._teardown = true;
    clearTimeout(this._loadTimer);
    clearTimeout(this._controlsTimer);
    this._destroyHls();
    this._resetVideo();
    this._teardown = false;
    this._started = false;
    this.bigPlay.classList.add('hidden');
    this.spinner.classList.add('hidden');
    this.error.classList.add('hidden');
  }

  _destroyHls() {
    if (this.hls) {
      try { this.hls.destroy(); } catch { /* ignore */ }
      this.hls = null;
    }
  }

  _resetVideo() {
    const video = this.video;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch { /* ignore */ }
  }

  /* ============================================================
     Controles
     ============================================================ */

  _setLive(live) {
    this.isLive = !!live;
    this.livePill.classList.toggle('hidden', !live);
    this.progress.classList.toggle('is-live', !!live);
    this.progress.setAttribute('aria-valuetext', live ? 'En vivo' : '');
    if (live) this.time.textContent = 'EN VIVO';
  }

  _setQuality(levels) {
    const select = this.quality;
    select.innerHTML = '';

    if (!levels.length) {
      select.classList.add('hidden');
      return;
    }

    const auto = document.createElement('option');
    auto.value = '-1';
    auto.textContent = 'Auto';
    select.appendChild(auto);

    levels
      .map((level, index) => ({
        index,
        height: level.height || 0,
        label: level.height
          ? `${level.height}p`
          : `${Math.round((level.bitrate || 0) / 1000)} kbps`,
      }))
      .sort((a, b) => b.height - a.height)
      .forEach((level) => {
        const option = document.createElement('option');
        option.value = String(level.index);
        option.textContent = level.label;
        select.appendChild(option);
      });

    select.value = '-1';
    select.classList.remove('hidden');
  }

  _paint() {
    const video = this.video;
    const duration = video.duration;
    const current = video.currentTime;

    if (this.isLive) {
      this.played.style.width = '100%';
      this.time.textContent = 'EN VIVO';
      this.progress.classList.add('is-live');
    } else if (!Number.isFinite(duration) || duration <= 0) {
      this.played.style.width = '0%';
      this.time.textContent = '0:00';
      this.progress.classList.remove('is-live');
    } else {
      const pct = Math.min(100, Math.max(0, (current / duration) * 100));
      this.played.style.width = `${pct}%`;
      this.time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      this.progress.classList.remove('is-live');
    }

    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      const base = Number.isFinite(duration) && duration > 0 ? duration : Math.max(end, current, 1);
      this.buffer.style.width = `${Math.min(100, (end / base) * 100)}%`;
    } else {
      this.buffer.style.width = '0%';
    }
  }

  _paintVolume() {
    const video = this.video;
    const muted = video.muted || video.volume === 0;
    this.btnMute.innerHTML = icon(muted ? 'mute' : 'volume');
    this.btnMute.classList.toggle('is-muted', muted);
  }

  _restoreVolume() {
    try {
      const stored = JSON.parse(localStorage.getItem('sportv.player.v2') || 'null');
      if (stored && typeof stored.volume === 'number') {
        this.video.volume = Math.min(1, Math.max(0, stored.volume));
        this.video.muted = !!stored.muted;
        this.volume.value = String(this.video.volume);
      }
    } catch { /* ignore */ }
    this._paintVolume();
  }

  _saveVolume() {
    try {
      localStorage.setItem('sportv.player.v2', JSON.stringify({
        volume: this.video.volume,
        muted: this.video.muted,
      }));
    } catch { /* ignore */ }
  }

  _showControlsNow() {
    this.root.classList.remove('controls-hidden');
    clearTimeout(this._controlsTimer);
  }

  _hideControlsSoon() {
    this._showControlsNow();
    if (this.video.paused) return;

    this._controlsTimer = setTimeout(() => {
      if (!this.video.paused && this.root.classList.contains('is-playing')) {
        this.root.classList.add('controls-hidden');
      }
    }, 2800);
  }

  _seekToLive() {
    if (this.hls && this.hls.liveSyncPosition != null) {
      this.video.currentTime = this.hls.liveSyncPosition;
    } else if (this.video.seekable.length) {
      this.video.currentTime = this.video.seekable.end(this.video.seekable.length - 1) - 2;
    }
    this.video.play().catch(() => {});
  }

  _seekFromEvent(event) {
    const rect = this.progress.getBoundingClientRect();
    if (!rect.width) return;
    const x = event.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));

    if (this.isLive || !Number.isFinite(this.video.duration) || this.video.duration <= 0) {
      this._seekToLive();
      return;
    }

    this.video.currentTime = pct * this.video.duration;
  }

  /* ============================================================
     Eventos
     ============================================================ */

  _bind() {
    const video = this.video;

    /* logo roto: se queda el monograma */
    this.posterLogo.addEventListener('error', () => {
      this.posterLogo.classList.add('hidden');
      this.posterLogo.removeAttribute('src');
    });

    /* botón central de pausa */
    this.bigPlay.addEventListener('click', (event) => {
      event.stopPropagation();
      this.togglePlay();
    });

    video.addEventListener('click', () => this.togglePlay());

    video.addEventListener('playing', () => {
      if (this._teardown) return;
      this.spinner.classList.add('hidden');
      this.poster.classList.add('hidden');
      this.poster.classList.remove('is-loading');
      this.error.classList.add('hidden');
      this.bigPlay.classList.add('hidden');
      this.root.classList.remove('is-poster', 'is-paused', 'is-loading', 'has-error');
      this.root.classList.add('is-playing');
      this._hideControlsSoon();
    });

    video.addEventListener('pause', () => {
      if (this._teardown || !this.channel) return;
      if (this.root.classList.contains('is-loading') || this.root.classList.contains('has-error')) return;
      this.bigPlay.classList.remove('hidden');
      this.root.classList.remove('is-playing');
      this.root.classList.add('is-paused');
      this._showControlsNow();
    });

    video.addEventListener('waiting', () => {
      if (this._teardown || !this.channel) return;
      if (!this.root.classList.contains('has-error')) this.spinner.classList.remove('hidden');
    });
    video.addEventListener('canplay', () => this.spinner.classList.add('hidden'));
    video.addEventListener('timeupdate', () => this._paint());
    video.addEventListener('progress', () => this._paint());
    video.addEventListener('durationchange', () => this._paint());
    video.addEventListener('volumechange', () => {
      this._paintVolume();
      clearTimeout(this._volumeTimer);
      this._volumeTimer = setTimeout(() => this._saveVolume(), 250);
    });

    this.btnPlay.addEventListener('click', () => this.togglePlay());
    this.btnPrev.addEventListener('click', () => this.onPrev?.());
    this.btnNext.addEventListener('click', () => this.onNext?.());
    this.btnFav.addEventListener('click', () => this.onFav?.());

    this.btnMute.addEventListener('click', () => {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = 0.4;
      this.volume.value = String(video.volume);
      this._paintVolume();
      this._saveVolume();
    });

    this.volume.addEventListener('input', () => {
      video.volume = Number(this.volume.value);
      video.muted = video.volume === 0;
      this._paintVolume();
    });

    this.quality.addEventListener('change', () => {
      if (!this.hls) return;
      this.hls.currentLevel = Number(this.quality.value);
    });

    this.btnPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch { /* ignore */ }
    });

    this.btnFull.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (this.root.requestFullscreen) {
        this.root.requestFullscreen().catch(() => {});
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    });

    this.errRetry.addEventListener('click', () => this.retry());
    this.errNext.addEventListener('click', () => this.onNext?.());
    this.errCopy.addEventListener('click', () => this.onCopy?.());

    /* barra de progreso */
    this.progress.addEventListener('pointerdown', (event) => {
      this._dragging = true;
      this.progress.setPointerCapture?.(event.pointerId);
      this._seekFromEvent(event);
    });
    this.progress.addEventListener('pointermove', (event) => {
      if (this._dragging) this._seekFromEvent(event);
    });
    this.progress.addEventListener('pointerup', () => { this._dragging = false; });
    this.progress.addEventListener('pointercancel', () => { this._dragging = false; });

    /* mostrar controles */
    this.root.addEventListener('mousemove', () => this._hideControlsSoon());
    this.root.addEventListener('touchstart', () => this._hideControlsSoon(), { passive: true });

    document.addEventListener('keydown', (event) => {
      const tag = (event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea'
        || tag === 'button' || tag === 'a' || event.target?.isContentEditable) return;
      if (!this.channel || this.root.classList.contains('is-poster')) return;

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          this.togglePlay();
          break;
        case 'n':
          event.preventDefault();
          this.onNext?.();
          break;
        case 'p':
          event.preventDefault();
          this.onPrev?.();
          break;
        case 'm':
          video.muted = !video.muted;
          this._paintVolume();
          this._saveVolume();
          break;
        case 'f':
          this.btnFull.click();
          break;
        case 'ArrowUp':
          event.preventDefault();
          video.volume = Math.min(1, video.volume + 0.05);
          video.muted = false;
          this.volume.value = String(video.volume);
          this._paintVolume();
          break;
        case 'ArrowDown':
          event.preventDefault();
          video.volume = Math.max(0, video.volume - 0.05);
          this.volume.value = String(video.volume);
          this._paintVolume();
          break;
        case 'ArrowRight':
          if (!this.isLive && Number.isFinite(video.duration)) {
            event.preventDefault();
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
          }
          break;
        case 'ArrowLeft':
          if (!this.isLive && Number.isFinite(video.duration)) {
            event.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          break;
        default:
          break;
      }
    });
  }
}
