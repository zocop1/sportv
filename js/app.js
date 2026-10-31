/* ============================================================
   SportV · interfaz
   ============================================================ */

import { APP, CATEGORIES, SPORT_FILTERS, QUALITY_FILTERS, STORAGE } from './config.js';
import {
  fetchPlaylist, countryLabel, flagEmoji, initials, normalizeText,
  qualityGroup, qualityRank, qualityText, searchable, sortChannels,
} from './iptv.js';
import { Player } from './player.js';

/* ---------- helpers ---------- */

const $ = (id) => document.getElementById(id);

const el = {};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && item.id && item.name && item.url);
}

function safeLogo(channel) {
  const logo = channel?.logo || '';
  if (location.protocol === 'https:' && /^http:\/\//i.test(logo)) return '';
  return logo;
}

function snapshot(channel) {
  return {
    id: channel.id,
    name: channel.name,
    logo: channel.logo || '',
    url: channel.url,
    country: channel.country || '',
    quality: channel.quality || '',
    group: channel.group || '',
    not24: !!channel.not24,
    http: !!channel.http,
    search: channel.search || normalizeText(
      `${channel.name} ${countryLabel(channel.country)} ${channel.group || ''}`,
    ),
  };
}

/* ---------- estado ---------- */

const state = {
  view: 'sports',
  channels: [],
  filtered: [],
  query: '',
  country: 'all',
  quality: 'all',
  sport: 'all',
  only247: false,
  httpsOnly: location.protocol === 'https:',
  sort: 'name',
  favorites: cleanList(readStorage(STORAGE.favorites, [])),
  recent: cleanList(readStorage(STORAGE.recent, [])),
  current: null,
  playing: false,
  rendered: 0,
  loading: false,
  error: null,
  controller: null,
};

let player = null;
let searchTimer = null;
let toastTimer = null;
let observer = null;

/* ---------- referencias ---------- */

function captureEls() {
  const ids = [
    'navPrimary', 'navLibrary', 'navMore', 'mobileNav',
    'viewTitle', 'viewCount', 'searchInput', 'searchClear', 'filtersBtn', 'refreshBtn',
    'menuBtn', 'sidebar', 'scrim', 'filters', 'countryFilter', 'qualityFilter',
    'sortFilter', 'only247', 'httpsOnly', 'clearFilters',
    'stage', 'video', 'stageBg', 'stagePoster', 'posterLogo',
    'posterInitials', 'posterEyebrow', 'posterName', 'posterMeta', 'posterPlay', 'posterNext',
    'stageError', 'errTitle', 'errMsg', 'errRetry', 'errNext', 'errCopy',
    'spinner', 'bigPlay', 'livePill', 'qualityPill', 'controls', 'progress',
    'progressBuffer', 'progressPlayed', 'btnPlay', 'btnPrev', 'btnNext', 'btnMute',
    'volume', 'time', 'quality', 'btnPip', 'btnFull', 'btnFav',
    'nowBar', 'nowLogo', 'nowInitials', 'nowName', 'nowMeta',
    'nowPrev', 'nowNext', 'nowFav', 'nowLink',
    'browseTitle', 'browseMeta', 'lastUpdate', 'sportChips', 'grid',
    'empty', 'emptyTitle', 'emptyText', 'emptyRetry', 'emptyClear',
    'loadMoreWrap', 'loadMore', 'sentinel',
    'aboutBtn', 'aboutModal', 'aboutClose', 'aboutOk', 'toast',
  ];
  for (const id of ids) el[id] = $(id);
}

/* ---------- navegación ---------- */

function navItem(item, mobile = false) {
  const cls = mobile ? 'mnav-item' : 'nav-item';
  return `<button class="${cls}" data-view="${esc(item.id)}" type="button" aria-label="${esc(item.label)}">
    ${icon(item.icon)}<span>${esc(item.label)}</span>
  </button>`;
}

function buildNav() {
  const primary = CATEGORIES.filter((c) => c.primary);
  const more = CATEGORIES.filter((c) => !c.primary);

  el.navPrimary.innerHTML = primary.map((c) => navItem(c)).join('');
  el.navMore.innerHTML = more.map((c) => navItem(c)).join('');

  el.navLibrary.innerHTML = `
    <button class="nav-item" data-view="favorites" type="button">
      ${icon('heart')}<span>Favoritos</span>
      <span class="nav-count" data-count="favorites">0</span>
    </button>
    <button class="nav-item" data-view="recent" type="button">
      ${icon('clock')}<span>Recientes</span>
      <span class="nav-count" data-count="recent">0</span>
    </button>`;

  el.mobileNav.innerHTML = [
    ...primary,
    { id: 'favorites', label: 'Favoritos', icon: 'heart' },
    { id: 'recent', label: 'Recientes', icon: 'clock' },
  ].map((c) => navItem(c, true)).join('');
}

function setActiveNav() {
  document.querySelectorAll('.nav-item[data-view], .mnav-item[data-view]').forEach((item) => {
    const active = item.dataset.view === state.view;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function updateCounts() {
  document.querySelectorAll('[data-count="favorites"]').forEach((node) => {
    node.textContent = String(state.favorites.length);
    node.classList.toggle('is-zero', state.favorites.length === 0);
  });
  document.querySelectorAll('[data-count="recent"]').forEach((node) => {
    node.textContent = String(state.recent.length);
    node.classList.toggle('is-zero', state.recent.length === 0);
  });
}

function viewLabel() {
  const category = CATEGORIES.find((c) => c.id === state.view);
  if (category) return category.label;
  if (state.view === 'favorites') return 'Favoritos';
  if (state.view === 'recent') return 'Recientes';
  return 'Canales';
}

/* ---------- filtros ---------- */

function buildFilters() {
  el.qualityFilter.innerHTML = QUALITY_FILTERS
    .map((q) => `<option value="${q.id}">${q.label}</option>`)
    .join('');

  el.sortFilter.innerHTML = `
    <option value="name">Nombre A-Z</option>
    <option value="country">País</option>
    <option value="quality">Mejor calidad</option>`;

  el.httpsOnly.checked = state.httpsOnly;
  el.qualityFilter.value = state.quality;
  el.sortFilter.value = state.sort;
}

function currentBase() {
  if (state.view === 'favorites') return state.favorites;
  if (state.view === 'recent') return state.recent;
  return state.channels;
}

function updateCountryOptions() {
  const base = currentBase();
  const counts = new Map();

  for (const channel of base) {
    const code = channel.country || '';
    counts.set(code, (counts.get(code) || 0) + 1);
  }

  const entries = [...counts.entries()].sort((a, b) =>
    countryLabel(a[0]).localeCompare(countryLabel(b[0]), 'es'));

  const options = ['<option value="all">Todos los países</option>'];
  for (const [code, count] of entries) {
    options.push(
      `<option value="${esc(code)}">${flagEmoji(code)} ${esc(countryLabel(code))} (${count})</option>`,
    );
  }

  el.countryFilter.innerHTML = options.join('');

  if (state.country !== 'all' && !counts.has(state.country)) {
    state.country = 'all';
  }
  el.countryFilter.value = state.country;
}

function matchesSport(channel, id) {
  const filter = SPORT_FILTERS.find((f) => f.id === id);
  if (!filter || id === 'all') return true;

  if (filter.other) {
    return !SPORT_FILTERS.some((f) => !f.other && f.id !== 'all' && f.test(channel));
  }
  return filter.test(channel);
}

function applySport(list, id) {
  if (id === 'all') return list;
  return list.filter((channel) => matchesSport(channel, id));
}

function renderSportChips(preSport) {
  if (state.view !== 'sports') {
    el.sportChips.classList.add('hidden');
    el.sportChips.innerHTML = '';
    return;
  }

  el.sportChips.classList.remove('hidden');
  el.sportChips.innerHTML = SPORT_FILTERS.map((filter) => {
    const count = filter.id === 'all'
      ? preSport.length
      : preSport.filter((channel) => matchesSport(channel, filter.id)).length;
    const active = state.sport === filter.id ? 'is-active' : '';
    return `<button class="chip ${active}" data-sport="${filter.id}" type="button">
      <span>${esc(filter.label)}</span><em>${count}</em>
    </button>`;
  }).join('');
}

function applyFilters() {
  const base = currentBase();

  let pre = base;

  if (state.query) {
    const query = normalizeText(state.query);
    pre = pre.filter((channel) => searchable(channel).includes(query));
  }

  if (state.country !== 'all') {
    pre = pre.filter((channel) => (channel.country || '') === state.country);
  }

  if (state.quality !== 'all') {
    pre = pre.filter((channel) => qualityGroup(channel.quality) === state.quality);
  }

  if (state.only247) {
    pre = pre.filter((channel) => !channel.not24);
  }

  if (state.httpsOnly) {
    pre = pre.filter((channel) => !channel.http);
  }

  const preSport = pre;
  const filtered = applySport(preSport, state.view === 'sports' ? state.sport : 'all');

  state.filtered = sortChannels(filtered, state.sort);

  renderSportChips(preSport);
  renderGrid({ reset: true });
  updateMeta(base.length);
}

function updateMeta(total) {
  const visible = state.filtered.length;

  if (state.loading) {
    el.browseMeta.textContent = 'Cargando canales…';
    el.viewCount.textContent = '…';
    return;
  }

  el.viewCount.textContent = String(visible);
  el.browseMeta.textContent = visible === total
    ? `${total} ${total === 1 ? 'canal' : 'canales'}`
    : `${visible} de ${total} canales`;
}

/* ---------- tarjetas ---------- */

function skeletonCard() {
  return `<div class="channel-card skeleton-card" aria-hidden="true">
    <div class="ch-art"><div class="sk sk-logo"></div></div>
    <div class="ch-body"><div class="sk sk-title"></div><div class="sk sk-meta"></div></div>
  </div>`;
}

function showSkeletons() {
  el.grid.innerHTML = Array.from({ length: 12 }, skeletonCard).join('');
  el.empty.classList.add('hidden');
  el.sportChips.classList.add('hidden');
  el.loadMoreWrap.classList.add('hidden');
  el.browseMeta.textContent = 'Cargando canales…';
  el.viewCount.textContent = '…';
  el.lastUpdate.textContent = '';
}

function cardHtml(channel) {
  const favorite = state.favorites.some((item) => item.id === channel.id);
  const active = state.current?.id === channel.id;
  const logo = safeLogo(channel);
  const meta = `${flagEmoji(channel.country)} ${esc(countryLabel(channel.country))}`;
  const extra = [];
  if (channel.not24) extra.push('No 24/7');
  if (channel.group && state.view !== 'sports') extra.push(esc(channel.group));

  return `<article class="channel-card ${active ? 'is-current' : ''}" data-id="${esc(channel.id)}"
      tabindex="0" role="button" aria-label="Reproducir ${esc(channel.name)}">
    <div class="ch-art">
      <div class="ch-glow" aria-hidden="true"></div>
      <div class="ch-logo">
        <span>${esc(initials(channel.name))}</span>
        ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
      </div>
      <button class="fav-btn ${favorite ? 'is-fav' : ''}" data-fav="${esc(channel.id)}"
        type="button" aria-label="${favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}"
        title="${favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${icon('heart')}</button>
      ${channel.quality ? `<span class="badge-quality">${esc(qualityText(channel))}</span>` : ''}
      ${channel.http ? '<span class="badge-http">HTTP</span>' : ''}
      ${active && state.playing ? '<span class="badge-playing"><span class="dot"></span>Reproduciendo</span>' : ''}
    </div>
    <div class="ch-body">
      <h3 title="${esc(channel.name)}">${esc(channel.name)}</h3>
      <p>${meta}${extra.length ? ` <span class="sep">·</span> ${extra.join(' <span class="sep">·</span> ')}` : ''}</p>
    </div>
  </article>`;
}

function renderGrid({ reset = false } = {}) {
  if (reset) {
    state.rendered = 0;
    el.grid.innerHTML = '';
  }

  const total = state.filtered.length;

  if (!total) {
    el.grid.innerHTML = '';
    updateEmpty();
    updateLoadMore();
    return;
  }

  el.empty.classList.add('hidden');

  const start = state.rendered;
  const end = Math.min(start + APP.pageSize, total);
  if (start >= end) {
    updateLoadMore();
    return;
  }

  const html = state.filtered.slice(start, end).map(cardHtml).join('');

  if (reset) el.grid.innerHTML = html;
  else el.grid.insertAdjacentHTML('beforeend', html);

  state.rendered = end;
  updateActiveCards();
  updateLoadMore();
}

function updateLoadMore() {
  const remaining = state.filtered.length - state.rendered;
  el.loadMoreWrap.classList.toggle('hidden', remaining <= 0 || state.filtered.length === 0);
  if (remaining > 0) {
    el.loadMore.textContent = `Cargar más · ${remaining} restantes`;
  }
}

function updateActiveCards() {
  const id = state.current?.id;
  el.grid.querySelectorAll('.channel-card[data-id]').forEach((card) => {
    card.classList.toggle('is-current', card.dataset.id === id);
  });
}

function updateEmpty() {
  if (state.filtered.length) {
    el.empty.classList.add('hidden');
    return;
  }

  if (state.loading) {
    el.empty.classList.add('hidden');
    return;
  }

  el.empty.classList.remove('hidden');
  el.emptyRetry.classList.add('hidden');
  el.emptyClear.classList.add('hidden');

  if (state.error) {
    el.emptyTitle.textContent = 'No se pudo cargar';
    el.emptyText.textContent = 'No se pudo conectar con iptv-org. Revisa tu conexión a internet y vuelve a intentarlo.';
    el.emptyRetry.classList.remove('hidden');
    return;
  }

  if (state.view === 'favorites') {
    el.emptyTitle.textContent = 'Aún no tienes favoritos';
    el.emptyText.textContent = 'Toca el corazón de un canal para guardarlo aquí y tenerlo siempre a mano.';
    return;
  }

  if (state.view === 'recent') {
    el.emptyTitle.textContent = 'Todavía no has visto nada';
    el.emptyText.textContent = 'Los canales que reproduzcas aparecerán aquí para volver a ellos.';
    return;
  }

  const hasFilters = state.query || state.country !== 'all' || state.quality !== 'all'
    || state.sport !== 'all' || state.only247;

  if (hasFilters) {
    el.emptyTitle.textContent = 'Sin coincidencias';
    el.emptyText.textContent = 'Prueba con otro país, otra calidad o un término de búsqueda diferente.';
    el.emptyClear.classList.remove('hidden');
    return;
  }

  el.emptyTitle.textContent = 'No hay canales';
  el.emptyText.textContent = 'Esta lista no tiene canales disponibles en este momento.';
  el.emptyRetry.classList.remove('hidden');
}

function showGridError() {
  state.filtered = [];
  el.grid.innerHTML = '';
  el.sportChips.classList.add('hidden');
  el.loadMoreWrap.classList.add('hidden');
  el.empty.classList.remove('hidden');
  el.emptyTitle.textContent = 'No se pudo cargar';
  el.emptyText.textContent = 'No se pudo conectar con iptv-org. Revisa tu conexión a internet y vuelve a intentarlo.';
  el.emptyRetry.classList.remove('hidden');
  el.emptyClear.classList.add('hidden');
  el.browseMeta.textContent = 'Sin conexión';
  el.viewCount.textContent = '—';
}

/* ---------- reproductor ---------- */

function initPlayer() {
  player = new Player({
    root: el.stage,
    video: el.video,
    stageBg: el.stageBg,
    poster: el.stagePoster,
    posterLogo: el.posterLogo,
    posterInitials: el.posterInitials,
    posterEyebrow: el.posterEyebrow,
    posterName: el.posterName,
    posterMeta: el.posterMeta,
    posterPlay: el.posterPlay,
    error: el.stageError,
    errTitle: el.errTitle,
    errMsg: el.errMsg,
    errRetry: el.errRetry,
    errNext: el.errNext,
    errCopy: el.errCopy,
    spinner: el.spinner,
    bigPlay: el.bigPlay,
    controls: el.controls,
    progress: el.progress,
    played: el.progressPlayed,
    buffer: el.progressBuffer,
    btnPlay: el.btnPlay,
    btnPrev: el.btnPrev,
    btnNext: el.btnNext,
    btnMute: el.btnMute,
    volume: el.volume,
    time: el.time,
    quality: el.quality,
    btnPip: el.btnPip,
    btnFull: el.btnFull,
    btnFav: el.btnFav,
    livePill: el.livePill,
    qualityPill: el.qualityPill,
    onNext: playNext,
    onPrev: playPrev,
    onFav: () => toggleFavorite(state.current),
    onCopy: copyCurrent,
  });
}

function pickFeatured(list) {
  const pool = list.filter((channel) => !(state.httpsOnly && channel.http));
  if (!pool.length) return list[0] || null;

  let best = pool[0];
  let bestScore = -1;

  for (const channel of pool) {
    let score = qualityRank(channel.quality) / 360;
    if (!channel.not24) score += 2;
    if (channel.logo) score += 1;
    if (!channel.http) score += 3;
    if (APP.featuredNames.some((name) => normalizeText(channel.name).includes(normalizeText(name)))) {
      score += 25;
    }
    if (score > bestScore) {
      bestScore = score;
      best = channel;
    }
  }

  return best;
}

function setIdle(channel) {
  state.current = channel || null;
  state.playing = false;

  if (channel) {
    player.setIdle(channel, { eyebrow: `Destacado en ${viewLabel()}` });
    player.setFavorite(isFavorite(channel));
  } else {
    player.setIdle(null);
  }

  updateNow(channel);
  updateActiveCards();
}

function playChannel(channel, { scroll = true, autoplay = true } = {}) {
  if (!channel?.url) return;

  state.current = channel;
  state.playing = true;

  player.load(channel, { autoplay });
  player.setFavorite(isFavorite(channel));
  updateNow(channel);
  updateActiveCards();
  addRecent(channel);

  if (scroll && window.innerWidth <= 900) {
    requestAnimationFrame(() => el.stage.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

function playNext() {
  const list = state.filtered.length ? state.filtered : currentBase();
  if (!list.length) return;

  const index = list.findIndex((channel) => channel.id === state.current?.id);
  const next = index === -1 ? list[0] : list[(index + 1) % list.length];
  playChannel(next, { scroll: false });
}

function playPrev() {
  const list = state.filtered.length ? state.filtered : currentBase();
  if (!list.length) return;

  const index = list.findIndex((channel) => channel.id === state.current?.id);
  const prev = index === -1 ? list[list.length - 1] : list[(index - 1 + list.length) % list.length];
  playChannel(prev, { scroll: false });
}

function isFavorite(channel) {
  return !!channel && state.favorites.some((item) => item.id === channel.id);
}

function toggleFavorite(channel) {
  if (!channel) return;

  const exists = isFavorite(channel);

  if (exists) {
    state.favorites = state.favorites.filter((item) => item.id !== channel.id);
  } else {
    state.favorites = [snapshot(channel), ...state.favorites];
  }

  writeStorage(STORAGE.favorites, state.favorites);
  updateCounts();

  const favorite = !exists;
  document.querySelectorAll('[data-fav]').forEach((button) => {
    if (button.dataset.fav !== channel.id) return;
    button.classList.toggle('is-fav', favorite);
    button.setAttribute('aria-label', favorite ? 'Quitar de favoritos' : 'Añadir a favoritos');
    button.title = favorite ? 'Quitar de favoritos' : 'Añadir a favoritos';
  });

  if (state.current?.id === channel.id) {
    player.setFavorite(favorite);
    updateNow(state.current);
  }

  if (state.view === 'favorites') {
    state.channels = state.favorites.slice();
    updateCountryOptions();
    applyFilters();
    if (!state.playing) setIdle(state.favorites[0] || null);
  }

  showToast(favorite ? 'Añadido a favoritos' : 'Quitado de favoritos');
}

function addRecent(channel) {
  const item = snapshot(channel);
  state.recent = [item, ...state.recent.filter((entry) => entry.id !== item.id)].slice(0, 12);
  writeStorage(STORAGE.recent, state.recent);
  updateCounts();
}

function updateNow(channel) {
  if (!channel) {
    el.nowBar.classList.add('hidden');
    el.nowName.textContent = '—';
    el.nowMeta.textContent = '—';
    document.title = `${APP.name} · ${APP.tagline}`;
    return;
  }

  el.nowBar.classList.remove('hidden');
  el.nowName.textContent = channel.name;
  el.nowInitials.textContent = initials(channel.name);

  const logo = safeLogo(channel);
  if (logo) {
    el.nowLogo.src = logo;
    el.nowLogo.classList.remove('hidden');
  } else {
    el.nowLogo.classList.add('hidden');
    el.nowLogo.removeAttribute('src');
  }

  const meta = [
    `${flagEmoji(channel.country)} ${esc(countryLabel(channel.country))}`,
    esc(qualityText(channel)),
  ];
  if (channel.group) meta.push(esc(channel.group));
  if (channel.not24) meta.push('No 24/7');
  if (channel.http) meta.push('HTTP');
  el.nowMeta.innerHTML = meta.join(' <span class="sep">·</span> ');

  const favorite = isFavorite(channel);
  el.nowFav.classList.toggle('is-fav', favorite);
  el.nowFav.setAttribute('aria-label', favorite ? 'Quitar de favoritos' : 'Añadir a favoritos');
  el.nowFav.title = favorite ? 'Quitar de favoritos' : 'Añadir a favoritos';

  document.title = `${channel.name} · ${APP.name}`;
}

async function copyCurrent() {
  const url = state.current?.url;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    showToast('Enlace copiado. Pégalo en VLC → Abrir ubicación de red.');
  } catch {
    window.prompt('Copia este enlace para abrirlo en VLC:', url);
  }
}

/* ---------- carga de vistas ---------- */

async function loadView(view, { force = false, keepFilters = false } = {}) {
  const valid = CATEGORIES.some((category) => category.id === view)
    || view === 'favorites'
    || view === 'recent';
  if (!valid) view = 'sports';

  state.view = view;
  writeStorage(STORAGE.view, view);
  state.error = null;
  state.loading = true;

  if (!keepFilters) {
    state.query = '';
    state.country = 'all';
    state.quality = 'all';
    state.sport = 'all';
    state.only247 = false;
    el.searchInput.value = '';
    el.qualityFilter.value = 'all';
    el.only247.checked = false;
    updateSearchClear();
  }

  updateCounts();
  setActiveNav();
  updateViewTitles();

  if (view === 'favorites' || view === 'recent') {
    state.controller?.abort();
    state.channels = (view === 'favorites' ? state.favorites : state.recent).slice();
    state.loading = false;
    updateCountryOptions();
    applyFilters();
    el.lastUpdate.textContent = 'Biblioteca local';

    if (!state.playing) setIdle(state.channels[0] || null);
    else updateActiveCards();
    return;
  }

  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;

  state.channels = [];
  showSkeletons();
  if (!state.playing) setIdle(null);

  try {
    const list = await fetchPlaylist(view, { force, signal: controller.signal });
    if (controller.signal.aborted) return;

    state.channels = list;
    state.loading = false;
    state.controller = null;

    updateCountryOptions();
    applyFilters();

    if (!state.playing) setIdle(pickFeatured(list));
    else updateActiveCards();

    el.lastUpdate.textContent = `Actualizado ${new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit',
    })}`;
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) return;

    state.loading = false;
    state.controller = null;
    state.error = error;
    showGridError();
    if (!state.playing) setIdle(null);
  }
}

function updateViewTitles() {
  const label = viewLabel();
  el.viewTitle.textContent = label;
  el.browseTitle.textContent = label;

  if (!state.current) {
    document.title = `${label} · ${APP.name}`;
  }
}

function updateSearchClear() {
  el.searchClear.classList.toggle('hidden', !el.searchInput.value);
}

function clearAllFilters() {
  state.query = '';
  state.country = 'all';
  state.quality = 'all';
  state.sport = 'all';
  state.only247 = false;
  state.httpsOnly = location.protocol === 'https:';
  state.sort = 'name';

  el.searchInput.value = '';
  el.countryFilter.value = 'all';
  el.qualityFilter.value = 'all';
  el.sortFilter.value = 'name';
  el.only247.checked = false;
  el.httpsOnly.checked = state.httpsOnly;

  updateSearchClear();
  applyFilters();
}

/* ---------- drawer / modal / toast ---------- */

function openDrawer() {
  el.sidebar.classList.add('is-open');
  el.scrim.classList.add('is-open');
  document.body.classList.add('drawer-open');
  el.menuBtn.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  el.sidebar.classList.remove('is-open');
  el.scrim.classList.remove('is-open');
  document.body.classList.remove('drawer-open');
  el.menuBtn.setAttribute('aria-expanded', 'false');
}

function openAbout() {
  closeDrawer();
  el.aboutModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  el.aboutClose.focus();
}

function closeAbout() {
  el.aboutModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  el.aboutBtn.focus();
}

function showToast(message, duration = 2800) {
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), duration);
}

/* ---------- eventos ---------- */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const nav = event.target.closest('.nav-item[data-view], .mnav-item[data-view]');
    if (nav) {
      event.preventDefault();
      closeDrawer();
      loadView(nav.dataset.view);
      return;
    }

    const brand = event.target.closest('.brand[data-view]');
    if (brand) {
      event.preventDefault();
      closeDrawer();
      loadView(brand.dataset.view || 'sports');
    }
  });

  el.searchInput.addEventListener('input', () => {
    updateSearchClear();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = el.searchInput.value.trim();
      applyFilters();
    }, 160);
  });

  el.searchClear.addEventListener('click', () => {
    el.searchInput.value = '';
    state.query = '';
    updateSearchClear();
    applyFilters();
    el.searchInput.focus();
  });

  el.countryFilter.addEventListener('change', () => {
    state.country = el.countryFilter.value;
    applyFilters();
  });

  el.qualityFilter.addEventListener('change', () => {
    state.quality = el.qualityFilter.value;
    applyFilters();
  });

  el.sortFilter.addEventListener('change', () => {
    state.sort = el.sortFilter.value;
    applyFilters();
  });

  el.only247.addEventListener('change', () => {
    state.only247 = el.only247.checked;
    applyFilters();
  });

  el.httpsOnly.addEventListener('change', () => {
    state.httpsOnly = el.httpsOnly.checked;
    applyFilters();
  });

  el.clearFilters.addEventListener('click', clearAllFilters);
  el.emptyClear.addEventListener('click', clearAllFilters);

  el.emptyRetry.addEventListener('click', () => {
    if (state.view === 'favorites' || state.view === 'recent') {
      state.channels = currentBase().slice();
      updateCountryOptions();
      applyFilters();
    } else {
      loadView(state.view, { force: true, keepFilters: true });
    }
  });

  el.filtersBtn.addEventListener('click', () => {
    document.body.classList.toggle('filters-open');
    el.filtersBtn.setAttribute(
      'aria-expanded',
      String(document.body.classList.contains('filters-open')),
    );
  });

  el.refreshBtn.addEventListener('click', () => {
    el.refreshBtn.classList.add('is-spinning');
    if (state.view === 'favorites' || state.view === 'recent') {
      state.channels = currentBase().slice();
      updateCountryOptions();
      applyFilters();
      updateCounts();
      showToast('Biblioteca actualizada');
      setTimeout(() => el.refreshBtn.classList.remove('is-spinning'), 700);
    } else {
      loadView(state.view, { force: true, keepFilters: true })
        .finally(() => setTimeout(() => el.refreshBtn.classList.remove('is-spinning'), 500));
    }
  });

  el.menuBtn.addEventListener('click', () => {
    if (el.sidebar.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });
  el.scrim.addEventListener('click', closeDrawer);

  el.posterPlay.addEventListener('click', () => {
    if (state.current) playChannel(state.current);
  });
  el.posterNext.addEventListener('click', playNext);

  el.nowPrev.addEventListener('click', playPrev);
  el.nowNext.addEventListener('click', playNext);
  el.nowFav.addEventListener('click', () => toggleFavorite(state.current));
  el.nowLink.addEventListener('click', copyCurrent);

  el.sportChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-sport]');
    if (!chip) return;
    state.sport = chip.dataset.sport;
    applyFilters();
  });

  el.grid.addEventListener('click', (event) => {
    const favoriteButton = event.target.closest('[data-fav]');
    if (favoriteButton) {
      event.preventDefault();
      event.stopPropagation();
      const channel = findChannel(favoriteButton.dataset.fav);
      if (channel) toggleFavorite(channel);
      return;
    }

    const card = event.target.closest('.channel-card[data-id]');
    if (!card) return;
    const channel = findChannel(card.dataset.id);
    if (channel) playChannel(channel);
  });

  el.grid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('button, a, input, select')) return;
    const card = event.target.closest('.channel-card[data-id]');
    if (!card) return;
    event.preventDefault();
    const channel = findChannel(card.dataset.id);
    if (channel) playChannel(channel);
  });

  /* imagen rota: se queda el monograma */
  el.grid.addEventListener('error', (event) => {
    if (event.target?.tagName === 'IMG') event.target.classList.add('is-broken');
  }, true);

  el.nowLogo.addEventListener('error', () => {
    el.nowLogo.classList.add('hidden');
    el.nowLogo.removeAttribute('src');
  });

  el.loadMore.addEventListener('click', () => renderGrid({ reset: false }));

  el.aboutBtn.addEventListener('click', openAbout);
  el.aboutClose.addEventListener('click', closeAbout);
  el.aboutOk.addEventListener('click', closeAbout);
  el.aboutModal.addEventListener('click', (event) => {
    if (event.target === el.aboutModal) closeAbout();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!el.aboutModal.classList.contains('hidden')) closeAbout();
      else if (el.sidebar.classList.contains('is-open')) closeDrawer();
      else if (el.searchInput.value) {
        el.searchInput.value = '';
        state.query = '';
        updateSearchClear();
        applyFilters();
      }
      return;
    }

    if (event.key === '/' && !event.target?.closest?.('input, textarea, select, [contenteditable]')) {
      event.preventDefault();
      el.searchInput.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeDrawer();
  });

  window.addEventListener('offline', () => showToast('Sin conexión a internet'));
}

function findChannel(id) {
  return state.filtered.find((channel) => channel.id === id)
    || state.channels.find((channel) => channel.id === id)
    || state.favorites.find((channel) => channel.id === id)
    || state.recent.find((channel) => channel.id === id)
    || null;
}

function setupObserver() {
  if (!('IntersectionObserver' in window)) return;

  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (state.loading || state.rendered >= state.filtered.length) return;
    renderGrid({ reset: false });
  }, { rootMargin: '700px 0px' });

  observer.observe(el.sentinel);
}

/* ---------- arranque ---------- */

async function init() {
  captureEls();
  buildNav();
  buildFilters();
  initPlayer();
  bindEvents();
  updateCounts();
  setupObserver();

  const saved = readStorage(STORAGE.view, 'sports');
  const valid = CATEGORIES.some((category) => category.id === saved)
    || saved === 'favorites'
    || saved === 'recent';

  await loadView(valid ? saved : 'sports');
}

init();
