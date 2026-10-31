/* ============================================================
   SportV · constantes y valores por defecto
   ============================================================ */

/* API pública y oficial de MLB (sin API key, permite CORS). */
export const MLB_API = 'https://statsapi.mlb.com/api/v1';
export const MLB_TEAM_LOGO = 'https://www.mlbstatic.com/team-logos';

/* Football-Data.org v4 (requiere token gratuito: ver README). */
export const FOOTBALL_API = 'https://api.football-data.org/v4';
export const FOOTBALL_REGISTER = 'https://www.football-data.org/client/register';

export const DEFAULT_CONFIG = {
  appName: 'SportV',
  refreshSeconds: 30,
  football: { token: '', competitions: [] },
};

/* Un "servidor" es una fuente que TÚ configuras en data/sources.json.
   type: "hls" | "file" | "iframe" | "youtube" | "auto" */
export const DEFAULT_SOURCES = {
  default: [],
  games: {},
};

export const SOURCE_TYPES = ['hls', 'file', 'iframe', 'youtube', 'auto'];

/* Búsqueda de transmisiones oficiales (se abre en el navegador). */
export const YOUTUBE_SEARCH = 'https://www.youtube.com/results?search_query=';
