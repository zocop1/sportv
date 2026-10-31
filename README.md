# SportV

Visor ligero de **TV en vivo** con estética de sala de estar, pensado para explorar los canales públicos de [iptv-org](https://github.com/iptv-org/iptv) y cambiar de emisora sin complicaciones.

Sin backend, sin registro, sin anuncios y sin paso de compilación: HTML, CSS y JavaScript moderno.

---

## Qué incluye

- **Catálogo de iptv-org** cargado bajo demanda por categoría (Deportes, Noticias, Cine, Series, Infantil, Música, etc.).
- **Búsqueda** por nombre de canal, país o categoría.
- **Filtros** por país, calidad, solo canales 24/7 y solo HTTPS.
- **Filtros deportivos** por nombre del canal: fútbol, NFL, motor, combate, baloncesto, béisbol, tenis, golf y ciclismo.
- **Favoritos y recientes** guardados en `localStorage`.
- **Reproductor HLS** con `hls.js` (se descarga solo al primer canal) y soporte nativo en Safari.
- Selector de calidad, volumen persistente, picture-in-picture y pantalla completa.
- **Cambio de canal** con botones o teclado: `n` siguiente, `p` anterior, `m` silencio, `f` pantalla completa, `/` buscar.
- **Diseño responsive** tipo Apple TV: barra lateral en escritorio, cajón lateral y navegación por chips en móvil.
- **Aviso legal** y manejo de errores con opción de reintentar, pasar al siguiente canal o copiar el enlace para VLC.

---

## Cómo ejecutarlo

El proyecto usa módulos ES (`import`/`export`) y `fetch()`, así que debe servirse por HTTP. Abrir `index.html` con doble clic no funciona.

### Atajo incluido

```bash
cd /home/gbzocop/Documentos/sportv
./serve.sh 8080
```

Abre <http://localhost:8080>.

### Con Python

```bash
cd /home/gbzocop/Documentos/sportv
python3 -m http.server 8080
```

### Con Node

```bash
npx --yes serve -l 8080 /home/gbzocop/Documentos/sportv
```

No hay dependencias que instalar para ejecutar la app.

---

## Estructura

```text
sportv/
├── index.html          Interfaz y sprite de iconos SVG
├── css/styles.css      Diseño oscuro, responsive y controles del reproductor
├── js/
│   ├── config.js       Categorías, filtros deportivos, filtros de calidad y almacenamiento
│   ├── iptv.js         Parser M3U, países, calidad, caché y descarga desde iptv-org
│   ├── player.js       Reproductor HLS/nativo, controles y manejo de errores
│   └── app.js          Estado, navegación, filtros, tarjetas, favoritos y vistas
├── serve.sh            Servidor local rápido
├── legacy/             Versión anterior del proyecto (MLB/fútbol), conservada
└── README.md
```

Los datos **no se empaquetan** en el proyecto: se descargan en tiempo de ejecución desde:

```text
https://iptv-org.github.io/iptv/categories/<categoria>.m3u
```

La primera vez, la app empieza en `sports` y solo carga la lista de esa categoría (unos 116 KB), no el índice completo de iptv-org (~2,5 MB). Después recuerda la última vista visitada. Las listas se mantienen en caché en memoria durante 10 minutos.

---

## Fuente y legalidad

SportV **no aloja, no retransmite y no modifica** ningún contenido. Solo muestra enlaces públicos publicados por [iptv-org](https://github.com/iptv-org/iptv). Cada emisora y cada enlace pertenecen a sus respectivos titulares.

- Verifica que puedes ver cada canal legalmente en tu país.
- Algunos enlaces pueden estar caídos, geobloqueados o limitados por derechos deportivos.
- SportV no está afiliado a iptv-org, ESPN, beIN Sports, Fox Sports ni a ninguna otra emisora.

Si eres titular de derechos y quieres retirar un enlace, el lugar correcto para reportarlo es el repositorio de iptv-org, que mantiene la lista.

---

## Limitaciones normales de la TV pública en el navegador

Muchos canales de iptv-org **no se podrán reproducir en el navegador**, aunque el enlace exista. Motivos habituales:

1. **CORS**: el servidor del canal no envía `Access-Control-Allow-Origin`, y `hls.js` no puede descargar los segmentos.
2. **Geobloqueo**: la emisora solo permite su país o región.
3. **HTTP en una página HTTPS**: el navegador bloquea el contenido mixto. La app oculta esos canales por defecto con «Solo HTTPS».
4. **Enlaces caídos o caducados**: iptv-org es una lista viva y algunos canales dejan de responder.
5. **DRM o formatos propietarios**: no compatibles con un reproductor HLS estándar.
6. **CDN de hls.js bloqueada**: el reproductor se descarga de `cdn.jsdelivr.net` la primera vez que reproduces un canal. Si tu red bloquea ese dominio, la app mostrará un error de reproductor.

Si un canal falla:

- Usa **Siguiente canal** o la tecla `n`.
- Prueba **Copiar enlace** y ábrelo en VLC con *Medio → Abrir ubicación de red*.
- En local (`http://localhost`) puedes desactivar «Solo HTTPS» para probar más canales HTTP.

Para producción, sirve la app por **HTTPS** y mantén activado «Solo HTTPS».

---

## Personalización

Casi todo lo ajustable está en `js/config.js`:

- `APP.base`: URL base de las listas de iptv-org.
- `APP.pageSize`: canales que se pintan por tanda (60 por defecto).
- `APP.cacheMs`: duración de la caché en memoria.
- `APP.featuredNames`: nombres que tienen prioridad al elegir el canal destacado.
- `CATEGORIES`: categorías visibles y cuáles aparecen en la barra principal.
- `SPORT_FILTERS`: expresiones regulares para los chips deportivos.
- `QUALITY_FILTERS`: grupos de calidad del filtro.

Para añadir una categoría, usa el identificador oficial de iptv-org (por ejemplo `travel`, `weather`, `science`) y añádela a `CATEGORIES`. La lista debe existir en:

```text
https://iptv-org.github.io/iptv/categories/<id>.m3u
```

Las claves de `localStorage` son:

- `sportv.view.v2`
- `sportv.favorites.v2`
- `sportv.recent.v2`
- `sportv.player.v2`

---

## Despliegue

Al ser estático, funciona en GitHub Pages, Netlify, Cloudflare Pages, Vercel o cualquier servidor web:

1. Sube `index.html`, `css/` y `js/`.
2. Sirve el sitio por HTTPS.
3. No hace falta configurar variables de entorno ni backend.

La carpeta `legacy/` no es necesaria para producción y puede excluirse del despliegue.

---

## Versión anterior

La primera versión del proyecto (centro de partidos MLB/fútbol con `data/*.json` y `js/api.js`) está conservada en [`legacy/`](legacy/), junto con su README original. La app actual ya no usa esos archivos.
