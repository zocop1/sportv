/* ============================================================
   SportV · capa de datos IPTV
   Descarga y normaliza las listas M3U públicas de iptv-org.
   ============================================================ */

import { APP } from './config.js';

const cache = new Map();

/* ---------- texto y países ---------- */

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' });
  } catch {
    return null;
  }
})();

export function countryLabel(code) {
  if (!code) return 'Internacional';
  const cc = String(code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return 'Internacional';
  try {
    return regionNames?.of(cc) || cc;
  } catch {
    return cc;
  }
}

export function flagEmoji(code) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🌐';
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
}

export function initials(name) {
  const words = String(name || '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'TV';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ---------- calidad ---------- */

export function qualityRank(quality) {
  if (!quality) return 0;
  if (quality === '4K') return 2160;
  if (quality === 'HD') return 720;
  if (quality === 'SD') return 480;
  const m = String(quality).match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
}

export function qualityGroup(quality) {
  if (!quality) return 'other';
  if (quality === '4K') return '4k';
  const rank = qualityRank(quality);
  if (rank >= 1080) return '1080';
  if (rank >= 720) return '720';
  if (rank >= 576) return '576';
  if (rank >= 480) return '480';
  return 'other';
}

function detectQuality(title) {
  const match = title.match(/\((\d{3,4})p\)/i);
  if (match) {
    const n = Number(match[1]);
    return n >= 2000 ? '4K' : `${n}p`;
  }
  if (/\b(4k|uhd)\b/i.test(title)) return '4K';
  if (/\bfhd\b/i.test(title)) return '1080p';
  if (/\bhd\b/i.test(title)) return 'HD';
  if (/\bsd\b/i.test(title)) return 'SD';
  return '';
}

/* ---------- parser M3U ---------- */

function splitExtinf(line) {
  const body = line.replace(/^#EXTINF:/i, '');
  let inQuote = false;
  let comma = -1;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) {
      comma = i;
      break;
    }
  }

  const attrsText = comma === -1 ? body : body.slice(0, comma);
  const title = comma === -1 ? '' : body.slice(comma + 1).trim();
  const attrs = {};
  const re = /([\w-]+)=(?:"([^"]*)"|([^\s]+))/g;
  let match;

  while ((match = re.exec(attrsText))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }

  return { attrs, title };
}

function cleanTitle(title) {
  return title
    .replace(/\s*\(\d{3,4}p\)\s*/gi, ' ')
    .replace(/\s*\[(?:not\s*24\/7|geo-?blocked|not\s*24\s*hours)\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectCountry(tvgId) {
  const match =
    String(tvgId || '').match(/\.([a-z]{2})@/i) ||
    String(tvgId || '').match(/\.([a-z]{2})$/i);
  return match ? match[1].toLowerCase() : '';
}

function slugify(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'canal';
}

export function parseM3U(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const channels = [];
  const seenIds = new Set();
  const seenUrls = new Set();
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      current = splitExtinf(line);
      continue;
    }

    /* #EXTVLCOPT y otros metadatos se ignoran. */
    if (line.startsWith('#')) continue;
    if (!current) continue;

    const url = line.split('|')[0].trim();
    const { attrs, title } = current;
    current = null;

    if (!/^https?:\/\//i.test(url)) continue;
    if (!title) continue;
    if (seenUrls.has(url)) continue;

    const tvgId = (attrs['tvg-id'] || '').trim();
    const country = detectCountry(tvgId);
    const name = cleanTitle(title) || title;
    const id = tvgId || `${slugify(name)}.${country || 'int'}`;

    if (seenIds.has(id)) continue;
    seenIds.add(id);
    seenUrls.add(url);

    const quality = detectQuality(title);
    const group = (attrs['group-title'] || '').trim();
    const logo = (attrs['tvg-logo'] || '').trim();

    channels.push({
      id,
      tvgId,
      name,
      logo,
      url,
      country,
      quality,
      group,
      http: /^http:\/\//i.test(url),
      not24: /\[not\s*24\/7\]/i.test(title),
      geo: /\[geo-?blocked\]/i.test(title),
      search: normalizeText(`${name} ${countryLabel(country)} ${group}`),
    });
  }

  return channels;
}

/* ---------- descarga + caché ---------- */

export async function fetchPlaylist(slug, { force = false, signal } = {}) {
  const hit = cache.get(slug);
  if (!force && hit && Date.now() - hit.time < APP.cacheMs) {
    return hit.channels;
  }

  const res = await fetch(`${APP.base}/categories/${slug}.m3u`, {
    signal,
    cache: force ? 'reload' : 'default',
  });

  if (!res.ok) {
    throw new Error(`No se pudo cargar la lista (${res.status})`);
  }

  const channels = parseM3U(await res.text());
  cache.set(slug, { time: Date.now(), channels });
  return channels;
}

export function clearCache() {
  cache.clear();
}

/* ---------- orden ---------- */

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function sortChannels(list, mode) {
  const copy = list.slice();

  if (mode === 'country') {
    copy.sort((a, b) =>
      collator.compare(countryLabel(a.country), countryLabel(b.country)) ||
      collator.compare(a.name, b.name));
  } else if (mode === 'quality') {
    copy.sort((a, b) =>
      qualityRank(b.quality) - qualityRank(a.quality) ||
      collator.compare(a.name, b.name));
  } else {
    copy.sort((a, b) => collator.compare(a.name, b.name));
  }

  return copy;
}

export function searchable(channel) {
  return channel.search || normalizeText(
    `${channel.name} ${countryLabel(channel.country)} ${channel.group || ''}`,
  );
}

export function qualityText(channel) {
  if (!channel.quality) return 'TV';
  if (channel.quality === '4K') return '4K';
  return channel.quality;
}
