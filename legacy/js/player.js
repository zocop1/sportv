/* ============================================================
   SportV · reproductor propio
   Soporta: HLS (.m3u8), archivos directos (mp4/webm) e iframes.
   Sin anuncios, sin rastreadores, sin dependencias externas
   más allá de hls.js (que se carga solo cuando se necesita).
   ============================================================ */

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

let hlsLibPromise = null;
function loadHlsLib() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLibPromise) return hlsLibPromise;
  hlsLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HLS_CDN;
    s.async = true;
    s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js no inicializó')));
    s.onerror = () => reject(new Error('No se pudo cargar hls.js (¿sin conexión?)'));
    document.head.appendChild(s);
  });
  return hlsLibPromise;
}

/* ---------- helpers de fuentes ---------- */

export function toYouTubeEmbed(url) {
  if (!url) return null;
  try {
    const base = typeof location !== 'undefined' && location.href
      ? location.href
      : 'https://www.youtube.com/';
    const u = new URL(url, base);
    const host = u.hostname.replace(/^www\./, '');

    let id = null;
    if (host === 'youtu.be') {
      id = u.pathname.slice(1);
    } else if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
      else if (u.pathname.startsWith('/live/')) id = u.pathname.split('/')[2];
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2];
    }
    if (!id) return null;
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  } catch {
    return null;
  }
}

/* Decide cómo reproducir una fuente configurada. */
export function resolveSource(source) {
  const url = (source?.url || '').trim();
  if (!url) return { mode: 'none' };

  const type = (source?.type || 'auto').toLowerCase();

  if (type === 'iframe') return { mode: 'iframe', url };
  if (type === 'youtube') {
    const embed = toYouTubeEmbed(url);
    return embed ? { mode: 'iframe', url: embed } : { mode: 'iframe', url };
  }
  if (type === 'hls') return { mode: 'video', url, kind: 'hls' };
  if (type === 'file') return { mode: 'video', url, kind: 'file' };

  /* auto */
  if (/\.m3u8(\?|$)/i.test(url)) return { mode: 'video', url, kind: 'hls' };
  if (/youtu\.?be|youtube\.com/i.test(url)) {
    const embed = toYouTubeEmbed(url);
    return { mode: 'iframe', url: embed || url };
  }
  if (/\.(mp4|webm|ogv|m4v)(\?|$)/i.test(url)) return { mode: 'video', url, kind: 'file' };
  return { mode: 'iframe', url };
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/* ============================================================
   Player
   ============================================================ */

export class Player {
  constructor(refs) {
    Object.assign(this, refs);

    this.mode = null;
    this.hls = null;
    this.current = null;
    this.isLive = false;
    this._idleTimer = null;
    this._dragging = false;

    this._bind();
  }

  /* ---------- carga ---------- */

  async load(source) {
    const resolved = resolveSource(source);
    this.current = source || null;
    this._teardownMedia();

    if (resolved.mode === 'none') {
      this._showMsg(
        `<strong>Sin señal configurada</strong>
         Esta fuente está vacía. Abre <code>data/sources.json</code>
         y pon la URL del flujo.
         <div class="hint">Puedes usar una señal propia (.m3u8 / .mp4) o un embed oficial.</div>`
      );
      this._setControls(true);
      return;
    }

    if (resolved.mode === 'iframe') {
      this._showMsg('');
      this.msg.classList.add('hidden');
      this.video.classList.add('hidden');
      this.video.removeAttribute('src');
      this.frame.classList.remove('hidden');
      this.frame.src = resolved.url;
      this.mode = 'iframe';
      this._setControls(true);
      this._setQuality([]);
      this._setLive(false);
      return;
    }

    /* modo video */
    this.mode = 'video';
    this.frame.classList.add('hidden');
    this.frame.removeAttribute('src');
    this.video.classList.remove('hidden');
    this._setControls(false);
    this.root.classList.add('is-idle');

    if (resolved.kind === 'hls') {
      this._spinner(true);
      try {
        const Hls = await loadHlsLib();
        if (Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: true,
            enableWorker: true,
            backBufferLength: 90,
            liveDurationInfinity: true,
          });
          this.hls = hls;
          hls.loadSource(resolved.url);
          hls.attachMedia(this.video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            this._spinner(false);
            this._setQuality(data.levels || []);
            this._setLive(!!data.levels?.[0]?.details?.live);
            this.video.play().catch(() => {});
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            if (this.quality.value === '-1') return;
            this.quality.value = String(data.level);
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              this._showMsg(
                `<strong>No se pudo conectar con la señal</strong>
                 La URL no respondió o bloqueó la conexión (CORS / token caducado).
                 <div class="hint">Revisa la URL en data/sources.json</div>`
              );
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              this._showMsg('<strong>Error de reproducción</strong>Prueba con otro servidor.');
            }
            this._spinner(false);
          });
          return;
        }
      } catch (e) {
        this._spinner(false);
        this._showMsg(`<strong>No se pudo cargar el reproductor HLS</strong>${e.message}`);
        return;
      }
    }

    /* MP4 / archivo directo, o HLS nativo (Safari/iOS) */
    this.video.src = resolved.url;
    this._setQuality([]);
    this.video.addEventListener('loadedmetadata', () => this._setLive(!Number.isFinite(this.video.duration)), { once: true });
    this.video.addEventListener('error', () => {
      this._showMsg(
        `<strong>No se pudo abrir el video</strong>
         El archivo no existe, está protegido o el servidor no permite el acceso.
         <div class="hint">Revisa la URL en data/sources.json</div>`
      );
    }, { once: true });
    this.video.play().catch(() => {});
  }

  /* ---------- controles de UI ---------- */

  _showMsg(html) {
    if (!html) {
      this.msg.classList.add('hidden');
      this.msg.innerHTML = '';
      return;
    }
    this.msg.classList.remove('hidden');
    this.msg.innerHTML = `<div>${html}</div>`;
    this.video.classList.add('hidden');
    this.frame.classList.add('hidden');
  }

  _setControls(disabled) {
    [this.btnPlay, this.progress].forEach((el) => el && el.classList.toggle('hidden', disabled));
    this.volume.disabled = disabled;
    this.btnMute.disabled = disabled;
    this.btnPip.disabled = disabled;
    this.quality.classList.toggle('hidden', disabled);
  }

  _spinner(on) {
    this.spinner.classList.toggle('hidden', !on);
  }

  _setLive(live) {
    this.isLive = live;
    this.progress.classList.toggle('is-live', live);
    this.btnLive.classList.toggle('hidden', !live);
  }

  _setQuality(levels) {
    const sel = this.quality;
    sel.innerHTML = '';
    if (!levels.length) {
      sel.classList.add('hidden');
      return;
    }
    const auto = document.createElement('option');
    auto.value = '-1';
    auto.textContent = 'Auto';
    sel.appendChild(auto);

    const sorted = levels
      .map((l, i) => ({ i, h: l.height || 0, name: l.name || (l.height ? `${l.height}p` : `Nivel ${i + 1}`) }))
      .sort((a, b) => b.h - a.h);

    for (const l of sorted) {
      const o = document.createElement('option');
      o.value = String(l.i);
      o.textContent = l.name;
      sel.appendChild(o);
    }
    sel.classList.remove('hidden');
    sel.value = '-1';
  }

  /* ---------- limpieza ---------- */

  _teardownMedia() {
    if (this.hls) {
      try { this.hls.destroy(); } catch {}
      this.hls = null;
    }
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch {}
    this.frame.removeAttribute('src');
    this._spinner(false);
  }

  destroy() {
    this._teardownMedia();
    this._showMsg('');
  }

  /* ---------- eventos ---------- */

  _bind() {
    const v = this.video;

    this.btnPlay.addEventListener('click', () => this.togglePlay());
    v.addEventListener('click', () => this.togglePlay());

    v.addEventListener('play', () => {
      this.btnPlay.innerHTML = '&#10074;&#10074;';
      this.btnPlay.setAttribute('aria-label', 'Pausar');
      this._idleSoon();
    });
    v.addEventListener('pause', () => {
      this.btnPlay.innerHTML = '&#9654;';
      this.btnPlay.setAttribute('aria-label', 'Reproducir');
    });

    v.addEventListener('timeupdate', () => this._paint());
    v.addEventListener('progress', () => this._paint());
    v.addEventListener('durationchange', () => this._paint());
    v.addEventListener('waiting', () => this._spinner(true));
    v.addEventListener('playing', () => this._spinner(false));
    v.addEventListener('canplay', () => this._spinner(false));

    this.btnMute.addEventListener('click', () => {
      v.muted = !v.muted;
      this._paintVolume();
    });
    this.volume.addEventListener('input', () => {
      v.volume = Number(this.volume.value);
      v.muted = v.volume === 0;
      this._paintVolume();
    });

    this.quality.addEventListener('change', () => {
      const lvl = Number(this.quality.value);
      if (this.hls && lvl >= 0) this.hls.currentLevel = lvl;
      else if (this.hls) this.hls.currentLevel = -1;
    });

    this.btnLive.addEventListener('click', () => {
      if (this.hls && this.hls.liveSyncPosition != null) v.currentTime = this.hls.liveSyncPosition;
      else if (v.seekable.length) v.currentTime = v.seekable.end(v.seekable.length - 1);
      v.play().catch(() => {});
    });

    this.btnFull.addEventListener('click', () => {
      const el = this.root;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });

    this.btnPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await v.requestPictureInPicture();
      } catch {}
    });

    /* barra de progreso */
    const seekFromEvent = (e) => {
      const rect = this.progress.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const pct = Math.min(1, Math.max(0, x / rect.width));
      if (!Number.isFinite(v.duration) || v.duration === 0) return;
      v.currentTime = pct * v.duration;
    };

    this.progress.addEventListener('mousedown', (e) => {
      this._dragging = true;
      seekFromEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (this._dragging) seekFromEvent(e);
    });
    window.addEventListener('mouseup', () => (this._dragging = false));

    this.progress.addEventListener('touchstart', (e) => {
      this._dragging = true;
      seekFromEvent(e);
    }, { passive: true });
    this.progress.addEventListener('touchmove', (e) => {
      if (this._dragging) seekFromEvent(e);
    }, { passive: true });
    this.progress.addEventListener('touchend', () => (this._dragging = false));

    /* mostrar controles al mover el mouse */
    this.root.addEventListener('mousemove', () => {
      this.root.classList.remove('is-idle');
      this._idleSoon();
    });

    /* atajos de teclado */
    document.addEventListener('keydown', (e) => {
      if (this.mode !== 'video') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault(); this.togglePlay(); break;
        case 'ArrowRight':
          e.preventDefault(); v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5); break;
        case 'ArrowLeft':
          e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5); break;
        case 'ArrowUp':
          e.preventDefault(); v.volume = Math.min(1, v.volume + 0.05); this.volume.value = String(v.volume); v.muted = false; this._paintVolume(); break;
        case 'ArrowDown':
          e.preventDefault(); v.volume = Math.max(0, v.volume - 0.05); this.volume.value = String(v.volume); this._paintVolume(); break;
        case 'm':
          v.muted = !v.muted; this._paintVolume(); break;
        case 'f':
          this.btnFull.click(); break;
      }
    });
  }

  _idleSoon() {
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (!this.video.paused && this.mode === 'video') this.root.classList.add('is-idle');
    }, 2600);
  }

  togglePlay() {
    if (this.mode !== 'video') return;
    if (this.video.paused) this.video.play().catch(() => {});
    else this.video.pause();
  }

  _paint() {
    const v = this.video;
    const dur = v.duration;
    const cur = v.currentTime;

    if (Number.isFinite(dur) && dur > 0) {
      const pct = (cur / dur) * 100;
      this.played.style.width = `${pct}%`;
      this.tDur.textContent = fmtTime(dur);
      this.progress.classList.add('playable');
    } else {
      /* directo sin duración conocida */
      this.played.style.width = '100%';
      this.tDur.textContent = 'EN DIRECTO';
      this.progress.classList.remove('playable');
    }

    this.tCur.textContent = fmtTime(cur);

    if (v.buffered.length) {
      const end = v.buffered.end(v.buffered.length - 1);
      const base = Number.isFinite(dur) && dur > 0 ? dur : Math.max(end, cur, 1);
      this.buffer.style.width = `${Math.min(100, (end / base) * 100)}%`;
    }
    this._spinner(v.readyState < 3 && !v.paused && v.seekable.length > 0 && v.currentTime === 0);
  }

  _paintVolume() {
    const v = this.video;
    this.btnMute.innerHTML = v.muted || v.volume === 0 ? '&#128263;' : v.volume < 0.5 ? '&#128265;' : '&#128266;';
  }
}
