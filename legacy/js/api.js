/* ============================================================
   SportV · adaptadores de datos
   Normaliza MLB (oficial) y fútbol (football-data.org) a una
   misma forma de "partido" para la interfaz.
   ============================================================ */

import { MLB_API, MLB_TEAM_LOGO, FOOTBALL_API } from './config.js';

/* ---------- utilidades ---------- */

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function isValidISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromISODate(s).getTime());
}

function jget(url, headers) {
  return fetch(url, { headers }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/* ============================================================
   MLB · https://statsapi.mlb.com
   ============================================================ */

function mlbTeam(side, logoBase) {
  const t = side?.team ?? {};
  const rec = side?.leagueRecord;
  return {
    id: t.id ?? null,
    name: t.shortName || t.teamName || t.name || '',
    fullName: t.name || '',
    abbr: t.abbreviation || (t.fileCode ? String(t.fileCode).toUpperCase() : ''),
    score: typeof side?.score === 'number' ? side.score : null,
    isWinner: side?.isWinner === true,
    record: rec ? `${rec.wins}-${rec.losses}` : '',
    logo: t.id ? `${logoBase}/${t.id}.svg` : null,
    pitcher: side?.probablePitcher?.fullName ?? null,
  };
}

function normalizeMlbGame(g, logoBase) {
  const ls = g.linescore ?? null;
  const state = g.status?.abstractGameState ?? 'Preview';

  const inning = ls?.currentInning
    ? `${ls.inningState === 'Top' ? '▲' : '▼'} ${ls.currentInningOrdinal || ls.currentInning}`
    : '';

  return {
    id: `mlb-${g.gamePk}`,
    pk: g.gamePk,
    sport: 'mlb',
    league: 'MLB',
    leagueName: 'Major League Baseball',
    start: g.gameDate,
    state,                                 /* Preview | Live | Final */
    detail: g.status?.detailedState ?? '',
    inning,
    venue: g.venue?.name || g.teams?.home?.team?.venue?.name || '',
    away: mlbTeam(g.teams?.away, logoBase),
    home: mlbTeam(g.teams?.home, logoBase),
    linescore: ls,
    broadcasts: (g.broadcasts ?? []).map((b) => b.name).filter(Boolean),
    officialUrl: `https://www.mlb.com/tv/g${g.gamePk}`,
    officialLabel: 'MLB.TV',
    raw: g,
  };
}

export async function fetchMlbGames(isoDate, logoBase = MLB_TEAM_LOGO) {
  const url =
    `${MLB_API}/schedule?sportId=1&date=${isoDate}` +
    `&hydrate=team,linescore,probablePitcher,broadcasts`;

  const data = await jget(url);
  const games = data?.dates?.[0]?.games ?? [];
  return games.map((g) => normalizeMlbGame(g, logoBase));
}

/* ============================================================
   Fútbol · https://api.football-data.org/v4  (token opcional)
   ============================================================ */

function normalizeFootballMatch(m) {
  const score = m.score ?? {};
  const ft = score.fullTime ?? {};
  const winner = score.winner ?? null;   /* HOME_TEAM | AWAY_TEAM | DRAW | null */
  const statusMap = {
    SCHEDULED: 'Preview', TIMED: 'Preview', IN_PLAY: 'Live',
    PAUSED: 'Live', FINISHED: 'Final', SUSPENDED: 'Final',
    POSTPONED: 'Preview', CANCELLED: 'Final', AWARDED: 'Final',
  };
  const state = statusMap[m.status] ?? 'Preview';

  const side = (t, goals, isWinner) => ({
    id: t?.id ?? null,
    name: t?.shortName || t?.name || '',
    fullName: t?.name || '',
    abbr: t?.tla || (t?.name ? t.name.slice(0, 3).toUpperCase() : ''),
    score: typeof goals === 'number' ? goals : null,
    isWinner: isWinner === true,
    record: '',
    logo: t?.crest || null,
    pitcher: null,
  });

  return {
    id: `foot-${m.id}`,
    pk: m.id,
    sport: 'football',
    league: m.competition?.code || '',
    leagueName: m.competition?.name || 'Fútbol',
    start: m.utcDate,
    state,
    detail: m.status || '',
    inning: '',
    venue: m.venue || '',
    away: side(m.awayTeam, ft.away, winner === 'AWAY_TEAM'),
    home: side(m.homeTeam, ft.home, winner === 'HOME_TEAM'),
    linescore: null,
    broadcasts: [],
    officialUrl: null,
    officialLabel: null,
    raw: m,
  };
}

export async function fetchFootballGames(isoDate, { token, competitions = [] } = {}) {
  if (!token) {
    const err = new Error('Sin token de football-data.org');
    err.code = 'NO_TOKEN';
    throw err;
  }

  const params = new URLSearchParams({
    dateFrom: isoDate,
    dateTo: isoDate,
  });
  if (competitions.length) params.set('competitions', competitions.join(','));

  const data = await jget(`${FOOTBALL_API}/matches?${params}`, {
    'X-Auth-Token': token,
  });

  const matches = data?.matches ?? [];
  return matches.map(normalizeFootballMatch);
}
