/* ============================================================
   SportV · aplicación principal
   ============================================================ */

import {
  DEFAULT_CONFIG, DEFAULT_SOURCES, MLB_TEAM_LOGO, FOOTBALL_REGISTER, YOUTUBE_SEARCH,
} from './config.js';
import {
  fetchMlbGames, fetchFootballGames, toISODate, fromISODate, addDays,
} from './api.js';
import { Player } from './player.js';

/* ---------- estado ---------- */

const state = {
  sport: 'mlb',
  date: toISODate(new Date()),
  games: [],
  selectedId: null,
  config: structuredClone(DEFAULT_CONFIG),
  sources: structuredClone(DEFAULT_SOURCES),
  official: { channels: [], searches: [] },
  custom: {},          /* señales añadidas en runtime (localStorage) */
  timer: null,
  loading: false,
};

/* ---------- helpers ---------- */

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function fullDate(iso) {
  const d = fromISODate(iso);
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

function relDateLabel(iso) {
  const today = toISODate(new Date());
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  if (iso === addDays(today, 1)) return 'Mañana';
  return fromISODate(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------- UI refs ---------- */

const els = {};

function captureEls() {
  const ids = [
    'sportTabs', 'segThumb', 'prevDay', 'nextDay', 'datePill', 'dateLabel',
    'listTitle', 'listCount', 'notice', 'gameList',
    'stageEmpty', 'stageBody', 'matchup', 'player', 'video', 'frame',
    'playerMsg', 'playerSpinner', 'controls', 'progress', 'progressBuffer',
    'progressPlayed', 'btnPlay', 'btnMute', 'volume', 'tCur', 'tDur',
    'quality', 'btnPip', 'btnFull', 'btnLive', 'sources', 'official', 'stageInfo',
    'lastUpdate', 'footNote',
  ];
  for (const id of ids) els[id] = $(id);
}

/* ---------- player ---------- */

let player = null;

function initPlayer() {
  player = new Player({
    root: els.player,
    video: els.video,
    frame: els.frame,
    msg: els.playerMsg,
    spinner: els.playerSpinner,
    controls: els.controls,
    progress: els.progress,
    played: els.progressPlayed,
    buffer: els.progressBuffer,
    btnPlay: els.btnPlay,
    btnMute: els.btnMute,
    volume: els.volume,
    tCur: els.tCur,
    tDur: els.tDur,
    quality: els.quality,
    btnFull: els.btnFull,
    btnPip: els.btnPip,
    btnLive: els.btnLive,
  });
}

/* ---------- carga de configuración ---------- */

async function loadJson(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadSettings() {
  try {
    const cfg = await loadJson('data/config.json');
    state.config = { ...structuredClone(DEFAULT_CONFIG), ...cfg,
      football: { ...DEFAULT_CONFIG.football, ...(cfg.football || {}) } };
  } catch { /* usa defaults */ }

  try {
    const src = await loadJson('data/sources.json');
    state.sources = {
      default: Array.isArray(src.default) ? src.default : [],
      games: src.games && typeof src.games === 'object' ? src.games : {},
    };
  } catch { /* sin fuentes configuradas */ }

  try {
    const off = await loadJson('data/official.json');
    state.official = {
      channels: Array.isArray(off.channels) ? off.channels : [],
      searches: Array.isArray(off.searches) ? off.searches : [],
    };
  } catch { /* sin fuentes oficiales */ }

  state.custom = lsGet('sportv.custom', {});
  if (state.config.appName) document.title = `${state.config.appName} · Partidos en vivo`;
}

/* ---------- fuentes ---------- */

function sourcesFor(gameId) {
  const list = [];
  const seen = new Set();
  const push = (s) => {
    if (!s || !s.name) return;
    const key = s.name + '|' + (s.url || '');
    if (seen.has(key)) return;
    seen.add(key);
    list.push(s);
  };

  (state.sources.default || []).forEach(push);
  (state.sources.games?.[gameId] || []).forEach(push);
  (state.custom.__global || []).forEach(push);
  (state.custom[gameId] || []).forEach(push);

  return list;
}

function addCustomSource(gameId, source) {
  const key = gameId || '__global';
  state.custom[key] = [...(state.custom[key] || []), source];
  lsSet('sportv.custom', state.custom);
}

/* ---------- render: lista ---------- */

function statusInfo(g) {
  if (g.state === 'Live') {
    return { cls: 'is-live', text: 'En vivo', showDot: true };
  }
  if (g.state === 'Final') {
    return { cls: 'is-final', text: g.detail || 'Final', showDot: false };
  }
  return { cls: '', text: localTime(g.start) || 'Programado', showDot: false };
}

function teamRow(t, side) {
  const logo = t.logo
    ? `<img class="team-logo" src="${esc(t.logo)}" alt="" loading="lazy"
         onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-logo ph'}))" />`
    : `<span class="team-logo ph"></span>`;

  const score = t.score === null || t.score === undefined ? '' : t.score;

  return `
    <div class="team-row ${side} ${t.isWinner ? 'is-winner' : ''}">
      ${logo}
      <span class="team-abbr">${esc(t.abbr)}</span>
      <span class="team-name">${esc(t.name)}</span>
      <span class="team-score">${score}</span>
    </div>`;
}

function renderList() {
  const list = els.gameList;

  if (!state.games.length) {
    list.innerHTML = `<div class="empty-list">${
      state.loading ? 'Cargando partidos…' : 'No hay partidos para este día.'
    }</div>`;
    els.listCount.textContent = '0';
    return;
  }

  els.listCount.textContent = String(state.games.length);

  list.innerHTML = state.games.map((g) => {
    const st = statusInfo(g);
    const active = g.id === state.selectedId ? 'is-active' : '';
    const foot = [];
    if (g.venue) foot.push(`<span class="venue">${esc(g.venue)}</span>`);
    else foot.push('<span></span>');
    if (g.state === 'Live' && g.inning) foot.push(`<span class="inning">${esc(g.inning)}</span>`);
    else foot.push(`<span>${esc(g.leagueName || '')}</span>`);

    return `
      <button class="game-card ${active}" data-id="${esc(g.id)}" type="button">
        <div class="gc-top">
          <span class="gc-status ${st.cls}">${st.showDot ? '<span class="live-dot"></span>' : ''}${esc(st.text)}</span>
          <span class="gc-time">${esc(fullDate(state.date))}</span>
        </div>
        ${teamRow(g.away, 'away')}
        ${teamRow(g.home, 'home')}
        <div class="gc-foot">${foot.join('')}</div>
      </button>`;
  }).join('');

  list.querySelectorAll('.game-card').forEach((card) => {
    card.addEventListener('click', () => selectGame(card.dataset.id));
  });
}

/* ---------- render: stage ---------- */

function matchupHtml(g) {
  const st = statusInfo(g);
  const scoreTxt = (g.state === 'Preview')
    ? 'vs'
    : `${g.away.score ?? 0} – ${g.home.score ?? 0}`;

  return `
    <div class="mu-side away">
      ${g.away.logo ? `<img src="${esc(g.away.logo)}" alt="" onerror="this.style.visibility='hidden'" />` : ''}
      <div class="mu-meta">
        <div class="mu-abbr">${esc(g.away.abbr || g.away.name)}</div>
        <div class="mu-rec">${esc(g.away.record || g.away.name)}</div>
      </div>
    </div>
    <div class="mu-center">
      <div class="mu-score">${esc(scoreTxt)}</div>
      <div class="mu-state ${st.cls}">${esc(st.text)}${g.inning ? ' · ' + esc(g.inning) : ''}</div>
    </div>
    <div class="mu-side home">
      <div class="mu-meta">
        <div class="mu-abbr">${esc(g.home.abbr || g.home.name)}</div>
        <div class="mu-rec">${esc(g.home.record || g.home.name)}</div>
      </div>
      ${g.home.logo ? `<img src="${esc(g.home.logo)}" alt="" onerror="this.style.visibility='hidden'" />` : ''}
    </div>`;
}

function linescoreHtml(ls) {
  if (!ls?.innings?.length) return '';

  const innings = ls.innings;
  const maxCols = 12;
  const shown = innings.slice(-maxCols);

  const head = shown.map((i) => `<th>${esc(i.ordinalNum || i.num)}</th>`).join('');
  const row = (side) => shown.map((i) => {
    const v = i[side]?.runs;
    return `<td>${v === undefined || v === null ? '·' : esc(v)}</td>`;
  }).join('');

  const t = ls.teams || {};
  const tot = (side) => {
    const s = t[side] || {};
    return `<td class="total">${s.runs ?? '-'}</td><td>${s.hits ?? '-'}</td><td>${s.errors ?? '-'}</td>`;
  };

  const teamLabel = (side) => {
    const g = state.games.find((x) => x.id === state.selectedId);
    return g ? esc(g[side].abbr) : side;
  };

  return `
    <table class="linescore">
      <thead>
        <tr><th class="team"></th>${head}<th class="total">R</th><th>H</th><th>E</th></tr>
      </thead>
      <tbody>
        <tr><td class="team">${teamLabel('away')}</td>${row('away')}${tot('away')}</tr>
        <tr><td class="team">${teamLabel('home')}</td>${row('home')}${tot('home')}</tr>
      </tbody>
    </table>`;
}

function infoHtml(g) {
  const items = [];
  const add = (k, v) => { if (v) items.push(`<div class="info-item"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`); };

  add('Liga', g.leagueName);
  add('Sede', g.venue);
  add('Inicio', new Date(g.start).toLocaleString('es-MX', { weekday: 'long', hour: '2-digit', minute: '2-digit' }));
  if (g.away.pitcher) add(`Abridor ${g.away.abbr}`, g.away.pitcher);
  if (g.home.pitcher) add(`Abridor ${g.home.abbr}`, g.home.pitcher);
  if (g.broadcasts.length) add('Transmisión', g.broadcasts.join(', '));

  return `
    <div class="info-grid">${items.join('')}</div>
    ${linescoreHtml(g.linescore)}`;
}

function renderSources(g) {
  const sources = sourcesFor(g.id);
  const active = player.current;

  const pills = sources.map((s, i) => {
    const empty = !(s.url || '').trim();
    const isActive = active && active.name === s.name;
    return `<button class="src-pill ${isActive ? 'is-active' : ''} ${empty ? 'is-empty' : ''}"
              data-idx="${i}" type="button" title="${empty ? 'Sin URL configurada' : esc(s.url)}">
              ${esc(s.name)}${empty ? ' ·' : ''}
            </button>`;
  }).join('');

  const official = g.officialUrl
    ? `<a class="src-link" href="${esc(g.officialUrl)}" target="_blank" rel="noopener noreferrer">
         Abrir en ${esc(g.officialLabel || 'servicio oficial')} ↗
       </a>`
    : '';

  els.sources.innerHTML = `
    <span class="sources-label">Servidores</span>
    ${pills || '<span class="src-pill is-empty">sin fuentes configuradas</span>'}
    <button class="src-pill" id="addSrc" type="button">+ Añadir</button>
    ${official}
  `;

  els.sources.querySelectorAll('.src-pill[data-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = sources[Number(btn.dataset.idx)];
      if (!s) return;
      player.load(s);
      renderSources(g);
    });
  });

  const addBtn = els.sources.querySelector('#addSrc');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const url = window.prompt(
        'URL de la señal (tuya u oficial).\n\n' +
        'Ejemplos válidos: un .m3u8 propio, un .mp4, o un enlace de YouTube.\n' +
        'Se guardará solo en este navegador (localStorage).'
      );
      if (!url || !url.trim()) return;

      const name = window.prompt('Nombre para mostrar del servidor:', `Señal ${sources.length + 1}`)
        || `Señal ${sources.length + 1}`;

      addCustomSource(null, { name, type: 'auto', url: url.trim() });
      renderSources(g);
      player.load({ name, type: 'auto', url: url.trim() });
    });
  }
}

function renderOfficial(g) {
  const o = state.official;
  const query = `${g.away.fullName || g.away.name} vs ${g.home.fullName || g.home.name}`;

  const searches = (o.searches || []).map((s) => {
    const url = (s.url || YOUTUBE_SEARCH).replace('{query}', encodeURIComponent(query));
    return `<a class="off-link is-search" href="${esc(url)}" target="_blank" rel="noopener noreferrer">&#128269; ${esc(s.name)}</a>`;
  }).join('');

  const channels = (o.channels || []).map((c) => `
    <a class="off-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"
       title="${esc(c.region || '')}">
      <span class="off-kind">${c.kind === 'youtube' ? '&#9654;' : '&#8599;'}</span>${esc(c.name)}
    </a>`).join('');

  if (!searches && !channels) {
    els.official.innerHTML = '';
    els.official.classList.add('hidden');
    return;
  }

  els.official.classList.remove('hidden');
  els.official.innerHTML = `
    <span class="sources-label">Oficiales</span>
    ${searches}${channels}`;
}

function renderStage() {
  const g = state.games.find((x) => x.id === state.selectedId);

  if (!g) {
    els.stageEmpty.classList.remove('hidden');
    els.stageBody.classList.add('hidden');
    return;
  }

  els.stageEmpty.classList.add('hidden');
  els.stageBody.classList.remove('hidden');

  els.matchup.innerHTML = matchupHtml(g);
  els.stageInfo.innerHTML = infoHtml(g);
  renderSources(g);
  renderOfficial(g);

  if (player.current == null) {
    const first = sourcesFor(g.id).find((s) => (s.url || '').trim());
    if (first) player.load(first);
    else player.load(null);
  }
}

function selectGame(id) {
  state.selectedId = id;
  player.current = null;
  renderList();
  renderStage();
  if (window.innerWidth <= 1000) {
    document.querySelector('.col-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- carga de partidos ---------- */

function setNotice(html, kind = '') {
  if (!html) {
    els.notice.classList.add('hidden');
    els.notice.innerHTML = '';
    return;
  }
  els.notice.className = `notice ${kind}`;
  els.notice.innerHTML = html;
}

async function loadGames({ skeleton = false } = {}) {
  state.loading = true;
  if (skeleton) {
    els.gameList.innerHTML = `<div class="skeleton-wrap">
      <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
    </div>`;
  }

  els.listTitle.textContent = state.sport === 'mlb' ? 'Béisbol · MLB' : 'Fútbol';
  els.dateLabel.textContent = relDateLabel(state.date);
  els.datePill.title = fullDate(state.date);

  try {
    if (state.sport === 'mlb') {
      setNotice('');
      state.games = await fetchMlbGames(state.date, MLB_TEAM_LOGO);
    } else {
      try {
        state.games = await fetchFootballGames(state.date, state.config.football);
        setNotice('');
      } catch (e) {
        state.games = [];
        if (e.code === 'NO_TOKEN') {
          setNotice(
            `Fútbol desactivado: falta el token gratuito de football-data.org.
             Regístrate en
             <a href="${FOOTBALL_REGISTER}" target="_blank" rel="noopener noreferrer">football-data.org</a>
             y pega el token en <code>data/config.json</code> → <code>football.token</code>.`,
            'warn'
          );
        } else {
          setNotice(`No se pudieron cargar los partidos de fútbol (${esc(e.message)}).`, 'warn');
        }
      }
    }
  } catch (e) {
    state.games = [];
    setNotice(`No se pudieron cargar los partidos (${esc(e.message)}). Revisa tu conexión.`, 'warn');
  }

  state.loading = false;

  if (state.selectedId && !state.games.some((g) => g.id === state.selectedId)) {
    state.selectedId = null;
    player.current = null;
    player.destroy();
  }

  renderList();
  renderStage();

  els.lastUpdate.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  scheduleRefresh();
}

function scheduleRefresh() {
  clearInterval(state.timer);
  const secs = Math.max(10, Number(state.config.refreshSeconds) || 30);
  state.timer = setInterval(() => {
    if (document.hidden) return;
    loadGames({ skeleton: false });
  }, secs * 1000);
}

/* ---------- eventos globales ---------- */

function moveSegThumb() {
  const active = els.sportTabs.querySelector('.seg-btn.is-active');
  if (!active || !els.segThumb) return;
  els.segThumb.style.width = `${active.offsetWidth}px`;
  els.segThumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
}

function bindEvents() {
  els.sportTabs.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      els.sportTabs.querySelectorAll('.seg-btn').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      moveSegThumb();
      state.sport = btn.dataset.sport;
      state.selectedId = null;
      player.current = null;
      player.destroy();
      els.stageBody.classList.add('hidden');
      els.stageEmpty.classList.remove('hidden');
      loadGames({ skeleton: true });
    });
  });

  els.prevDay.addEventListener('click', () => {
    state.date = addDays(state.date, -1);
    loadGames({ skeleton: true });
  });
  els.nextDay.addEventListener('click', () => {
    state.date = addDays(state.date, 1);
    loadGames({ skeleton: true });
  });
  els.datePill.addEventListener('click', () => {
    state.date = toISODate(new Date());
    loadGames({ skeleton: true });
  });

  window.addEventListener('resize', moveSegThumb);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadGames();
  });
}

/* ---------- arranque ---------- */

async function init() {
  captureEls();
  initPlayer();
  await loadSettings();
  bindEvents();
  requestAnimationFrame(moveSegThumb);
  els.footNote.textContent = `${state.config.appName} · reproductor propio, sin anuncios ni rastreadores.`;
  loadGames({ skeleton: true });
}

init();
