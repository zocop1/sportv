/* ============================================================
   SportV · configuración
   Catálogo de canales: iptv-org (enlaces públicos)
   ============================================================ */

export const APP = {
  name: 'SportV',
  tagline: 'TV en vivo',
  base: 'https://iptv-org.github.io/iptv',
  source: 'https://github.com/iptv-org/iptv',
  pageSize: 60,
  cacheMs: 10 * 60 * 1000,
  featuredNames: [
    'ESPN', 'Fox Sports', 'Fox Deportes', 'DAZN', 'Sky Sports',
    'TNT Sports', 'beIN Sports', 'Eurosport', 'DSports', 'TUDN',
    'TyC Sports', 'SportTV', 'SporTV', 'Movistar Deportes',
    'Azteca Deportes', 'Telemundo', 'Canal+ Sport', 'Golazo',
    'DirecTV Sports', 'ESPN Deportes',
  ],
};

/* Categorías oficiales de iptv-org. `primary` aparece en la barra
   principal; el resto se agrupa en «Más categorías». */
export const CATEGORIES = [
  { id: 'sports',        label: 'Deportes',        icon: 'trophy',    primary: true },
  { id: 'news',          label: 'Noticias',        icon: 'news',      primary: true },
  { id: 'movies',        label: 'Cine',            icon: 'film',      primary: true },
  { id: 'series',        label: 'Series',          icon: 'tv',        primary: true },
  { id: 'entertainment', label: 'Entretenimiento', icon: 'sparkles',  primary: true },
  { id: 'kids',          label: 'Infantil',        icon: 'smile',     primary: true },
  { id: 'music',         label: 'Música',          icon: 'music',     primary: true },
  { id: 'documentary',   label: 'Documentales',    icon: 'book',      primary: true },
  { id: 'comedy',        label: 'Comedia',         icon: 'smile',     primary: false },
  { id: 'auto',          label: 'Motor',           icon: 'car',       primary: false },
  { id: 'cooking',       label: 'Cocina',          icon: 'fork',      primary: false },
  { id: 'travel',        label: 'Viajes',          icon: 'plane',     primary: false },
  { id: 'science',       label: 'Ciencia',         icon: 'flask',     primary: false },
  { id: 'outdoor',       label: 'Aire libre',      icon: 'mountain',  primary: false },
  { id: 'culture',       label: 'Cultura',         icon: 'palette',   primary: false },
  { id: 'education',     label: 'Educación',       icon: 'grad',      primary: false },
  { id: 'family',        label: 'Familia',         icon: 'users',     primary: false },
  { id: 'lifestyle',     label: 'Estilo de vida',  icon: 'heart',     primary: false },
  { id: 'business',      label: 'Negocios',        icon: 'briefcase', primary: false },
  { id: 'weather',       label: 'Clima',           icon: 'cloud',     primary: false },
  { id: 'general',       label: 'General',         icon: 'globe',     primary: false },
  { id: 'public',        label: 'Público',         icon: 'landmark',  primary: false },
  { id: 'religious',     label: 'Religioso',       icon: 'sparkle',   primary: false },
  { id: 'shop',          label: 'Compras',         icon: 'bag',       primary: false },
  { id: 'relax',         label: 'Relax',           icon: 'moon',      primary: false },
  { id: 'classic',       label: 'Clásicos',        icon: 'clock',     primary: false },
  { id: 'animation',     label: 'Animación',       icon: 'sparkles',  primary: false },
  { id: 'legislative',   label: 'Legislativo',     icon: 'landmark',  primary: false },
  { id: 'interactive',   label: 'Interactivo',     icon: 'cursor',    primary: false },
];

/* Filtros rápidos dentro de Deportes. Se basan en el nombre del canal:
   iptv-org no ofrece subcategorías deportivas. */
const SOCCER = /(futbol|fútbol|football|soccer|liga|calcio|bundesliga|premier|serie\s*a|uefa|fifa|conmebol|concacaf|mls|eredivisie|ligue\s*1|la\s*liga|primeira|brasileir|libertadores|sudamericana|champions|europa\s*league|copa)/i;
const NFL = /(nfl|football\s*americano|redzone)/i;
const MOTOR = /(motor|moto|formula|formulá|\bf1\b|nascar|rally|speed|auto\s*moto|drag|supercars|indycar|endurance|dakar)/i;
const COMBAT = /(ufc|mma|boxeo|boxing|\bbox\b|fight|wwe|wrestling|aew|combate|kickbox|muay)/i;
const BASKET = /(nba|basket|baloncesto|euroleague|\bacb\b|ncaa)/i;
const BASEBALL = /(mlb|baseball|béisbol|beisbol|pelota)/i;
const TENNIS = /(tennis|tenis|\batp\b|\bwta\b|wimbledon|roland\s*garros|us\s*open|australian\s*open)/i;
const GOLF = /(golf|pga|lpga|ryder)/i;
const CYCLING = /(cycl|cicl|tour\s*de\s*france|\bgiro\b|vuelta\s*a\s*espa)/i;

export const SPORT_FILTERS = [
  { id: 'all',      label: 'Todos',          test: () => true },
  { id: 'football', label: 'Fútbol',         test: (c) => SOCCER.test(c.name) && !NFL.test(c.name) },
  { id: 'nfl',      label: 'NFL',            test: (c) => NFL.test(c.name) },
  { id: 'motor',    label: 'Motor',          test: (c) => MOTOR.test(c.name) },
  { id: 'combat',   label: 'Combate',        test: (c) => COMBAT.test(c.name) },
  { id: 'basket',   label: 'Baloncesto',     test: (c) => BASKET.test(c.name) },
  { id: 'baseball', label: 'Béisbol',        test: (c) => BASEBALL.test(c.name) },
  { id: 'tennis',   label: 'Tenis',          test: (c) => TENNIS.test(c.name) },
  { id: 'golf',     label: 'Golf',           test: (c) => GOLF.test(c.name) },
  { id: 'cycling',  label: 'Ciclismo',       test: (c) => CYCLING.test(c.name) },
  { id: 'other',    label: 'General / Otros',test: () => true, other: true },
];

export const QUALITY_FILTERS = [
  { id: 'all',   label: 'Todas' },
  { id: '4k',    label: '4K' },
  { id: '1080',  label: '1080p' },
  { id: '720',   label: '720p' },
  { id: '576',   label: '576p' },
  { id: '480',   label: '480p' },
  { id: 'other', label: 'Otras' },
];

export const STORAGE = {
  view: 'sportv.view.v2',
  favorites: 'sportv.favorites.v2',
  recent: 'sportv.recent.v2',
  player: 'sportv.player.v2',
};
