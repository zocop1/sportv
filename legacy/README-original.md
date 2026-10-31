# SportV

Centro de partidos en vivo con **reproductor propio y sin anuncios**.
Muestra el calendario y los marcadores de **MLB** (API pública oficial), y
opcionalmente de **fútbol** (football-data.org), y reproduce la señal que tú
configures en un reproductor HTML5 minimalista.

---

## 1. Cómo se usa

El proyecto usa `fetch()` y módulos ES, así que **necesita servirse por HTTP**
(no funciona abriendo el `index.html` con doble clic).

### Opción A — servidor rápido con Python

```bash
cd /home/gbzocop/Documentos/sportv
python3 -m http.server 8080
```

Luego abre: <http://localhost:8080>

### Opción B — servidor rápido con Node

```bash
npx --yes serve -l 8080 /home/gbzocop/Documentos/sportv
```

### Opción C — XAMPP (Apache)

Copia la carpeta a `htdocs`:

```bash
cp -r /home/gbzocop/Documentos/sportv /opt/lampp/htdocs/sportv
```

Luego abre: <http://localhost/sportv>

También hay un atajo: `./serve.sh`

---

## 2. Qué incluye

| Función | Detalle |
|---|---|
| Lista de partidos | MLB del día con equipos, récords, abridores y marcador en vivo |
| Navegación por fecha | ‹ día anterior · Hoy · día siguiente › |
| Marcador automático | Se refresca cada 30 s (configurable) |
| Reproductor propio | HLS (`.m3u8`), archivos directos (`.mp4`/`.webm`) e iframes (YouTube) |
| Controles | Play/pausa, volumen, barra de progreso, calidad (Auto/720p/1080p…), Picture-in-Picture, pantalla completa, botón EN VIVO |
| Atajos de teclado | `espacio`/`k` play · `←`/`→` ±5 s · `↑`/`↓` volumen · `m` silencio · `f` pantalla completa |
| Selector de servidores | Igual que lacancha: píldoras para cambiar de fuente al instante |
| Añadir fuente en vivo | Botón **+ Añadir** en el reproductor (se guarda en tu navegador) |
| Cero anuncios | No hay scripts de terceros, ni popups, ni rastreadores |

---

## 3. Configurar las "señales" (servidores)

Edita **`data/sources.json`**:

```json
{
  "default": [
    { "name": "Señal 1 (HLS)", "type": "hls", "url": "https://tu-servidor/stream.m3u8" },
    { "name": "YouTube oficial", "type": "youtube", "url": "https://www.youtube.com/watch?v=XXXX" }
  ],
  "games": {
    "mlb-745804": [
      { "name": "Señal para este partido", "type": "hls", "url": "https://..." }
    ]
  }
}
```

- **`default`** → aparece en todos los partidos.
- **`games`** → fuentes exclusivas de un partido. La clave es el `id` del
  partido, que para MLB es `mlb-<gamePk>` (lo ves en la URL de `mlb.com/tv/g<gamePk>`).

### Tipos soportados

| `type` | Qué espera |
|---|---|
| `hls` | Un `.m3u8` (se reproduce con hls.js) |
| `file` | Un archivo directo `.mp4` / `.webm` |
| `iframe` | Cualquier URL para incrustar en un iframe |
| `youtube` | Un enlace normal de YouTube; se convierte solo a *embed* |
| `auto` | Detecta el tipo por la URL (por defecto) |

> Si dejas `"url": ""`, la píldora aparece desactivada con un punto, indicando
> que falta configurarla.

---

## 4. Activar el fútbol (gratis)

1. Regístrate gratis en <https://www.football-data.org/client/register>
2. Copia tu **API token** del correo.
3. Pégalo en **`data/config.json`**:

```json
{
  "refreshSeconds": 30,
  "football": {
    "token": "TU_TOKEN_AQUI",
    "competitions": ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "BSA", "CL"]
  }
}
```

Códigos de competición: `PL` Premier, `PD` LaLiga, `SA` Serie A, `BL1` Bundesliga,
`FL1` Ligue 1, `DED` Eredivisie, `PPL` Primeira Liga, `BSA` Brasileirão, `CL` Champions.

> El plan gratuito tiene límite de peticiones (10/min) y los marcadores pueden
> ir con algo de retraso.

---

## 5. Estructura

```
sportv/
├── index.html            # estructura de la página
├── serve.sh              # arranca un servidor local
├── css/
│   └── styles.css        # estética minimalista (claro/oscuro automático)
├── js/
│   ├── config.js         # constantes (endpoints, valores por defecto)
│   ├── api.js            # adaptadores MLB + fútbol
│   ├── player.js         # reproductor propio (HLS / archivo / iframe)
│   └── app.js            # interfaz, lista, selector de servidores, auto-refresh
└── data/
    ├── config.json       # ajustes tuyos (token de fútbol, intervalo)
    └── sources.json      # tus servidores/señales
```

---

## 6. Sobre el modelo de lacancha.tv y por qué esto es distinto

Un sitio tipo lacancha **no genera la señal**: es un intermediario. Su cadena es:

```
Estadio → titular (MLB/ESPN) → CDN con token o DRM
                                      ↓  alguien captura esa señal
                          la re-emite en un servidor propio
                                      ↓
                    lacancha solo incrusta el <iframe> de ese servidor
```

Cada "servidor" de la lista es otro dominio distinto con el mismo partido
(por eso los canales se caen tanto: los tokens del CDN expiran en minutos).
El negocio son los anuncios, y por eso esas páginas están llenas de
popups, redirecciones y avisos.

**SportV hace la parte legítima del modelo:** la misma interfaz (partidos →
reproductor → selector de servidor), pero

- el calendario y los marcadores vienen de la **API pública oficial de MLB**;
- el reproductor es tuyo, sin anuncios ni rastreadores;
- las señales las pones tú en `data/sources.json` (tu propia señal, un canal
  oficial, el *Free Game of the Day*, etc.).

Lo que **no** incluye, a propósito: capturar o desbloquear señales de servicios
de pago (romper tokens/DRM). Eso infringe derechos de autor y los términos de
uso, y quien construye o aloja la página es el responsable legal.

---

## 7. Ideas para ampliar

- Filtro por equipo o por liga dentro de MLB.
- Segundo reproductor en mosaico para ver dos partidos a la vez.
- Guardar "canales favoritos" por equipo.
- Notificación cuando empieza el partido de tu equipo.
- Programar el auto-refresh más agresivo (5 s) cuando hay partido en vivo.
