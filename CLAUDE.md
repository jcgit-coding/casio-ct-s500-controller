# CasioController — Reglas del proyecto para agentes IA

Este archivo documenta las reglas y convenciones que cualquier agente IA debe seguir al trabajar en este proyecto. Léelo antes de hacer cualquier cambio.

---

## Descripción del proyecto

Aplicación web para controlar el Casio CT-S500 vía Web MIDI API.
- Hosting: **GitHub Pages** (`jcgit-coding/casio-ct-s500-controller`)
- Fuente local: **Google Drive** (PC del usuario) — es la fuente de verdad para edición
- La tablet y el teléfono solo leen desde GitHub Pages, nunca escriben directamente

---

## Biblioteca de canciones (`library/`)

### Estructura
- `library/index.json` — array plano con `{id, title, artist, genre, original_key}` de cada canción
- `library/{id}/meta.json` — metadata completa de la canción
- `library/{id}/chords_v1_lacuerda.txt`, `chords_v2_lacuerda.txt`, … — acordes importados desde lacuerda.net
- `library/{id}/chords.txt` — canciones añadidas manualmente (sin scraper)

### Convención de IDs
`{artist_slug}_{song_slug}` — todo minúsculas, sin tildes, espacios reemplazados por `_`.
Ejemplo: `fernel_monroy_remolineando`, `coritos_paseate_nazareno`

---

## Importador lacuerda.net (`tools/lacuerda-import.js`)

### REGLA OBLIGATORIA — múltiples versiones

**Siempre se deben importar TODAS las versiones de tipo "Letra y Acordes" (tipo R) disponibles para cada canción.**

- Cada versión se guarda como archivo separado: `chords_v1_lacuerda.txt`, `chords_v2_lacuerda.txt`, etc.
- La calificación/rating (`lcd`) de cada versión se guarda en `meta.json` bajo el campo `versions`.
- **Solo si no existe ninguna versión R** se acepta como fallback una tablatura (tipo T) u otro tipo.
- **Nunca importar solo la primera versión** cuando hay múltiples disponibles.
- Nunca importar versiones de tipo Bajo (B), Piano (P), Ukulele (U) o similares (K) — se descartan.

### Uso
```bash
node tools/lacuerda-import.js --artist "marcos-witt"
node tools/lacuerda-import.js --artist "toma_tu_lugar" --display-name "Marcos Brunet" --artist-id "marcos_brunet"
node tools/lacuerda-import.js --artist "fernel_monroy" --delay 2000 --max 50
```

Opciones:
- `--artist` — slug del artista en lacuerda.net (obligatorio)
- `--display-name` — nombre para mostrar en la biblioteca (sobreescribe el de lacuerda)
- `--artist-id` — prefijo de carpeta en `library/` (sobreescribe el slug)
- `--delay` — ms entre requests (default: 1400)
- `--max` — máximo de canciones base (default: todas)

### Estructura de `meta.json` para canciones importadas
```json
{
  "id": "fernel_monroy_remolineando",
  "title": "Remolineando",
  "artist": "Fernel Monroy",
  "genre": "Worship",
  "original_key": "G",
  "versions": [
    { "file": "chords_v1_lacuerda.txt", "source": "https://...", "lcd": 42 },
    { "file": "chords_v2_lacuerda.txt", "source": "https://...", "lcd": 15 }
  ]
}
```

---

## Servidor puente local (`tools/lacuerda-server.js`)

Servidor HTTP en `localhost:7373` para disparar el importador desde la UI de la app.
- `GET /status` → `{ok: true}`
- `POST /import` body `{artist, displayName?, artistId?}` → lanza el scraper
- `GET /progress` → SSE con salida en tiempo real

Iniciar con: `node tools/lacuerda-server.js`

---

## Estilo de código

- Sin comentarios innecesarios — solo cuando el "por qué" no es obvio
- Sin emojis en el código
- Sin abstracciones prematuras — no diseñar para requisitos hipotéticos
- Sin manejo de errores para escenarios imposibles
- Variables CSS para colores; dark mode vía `@media (prefers-color-scheme: dark)`
- Clases del mixer para controles de la library: `global-bar`, `step-btn`, `step-val`, `btn-reset-small`, `global-label`

---

## Control de versiones

- Rama principal: `main`
- Git user: `jcgit-coding`
- Commits en español, formato: `feat(scope): descripción`
- Siempre incluir al final: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## Lo que NO hacer

- No eliminar `library/index.json` — es el índice central
- No renombrar canciones manualmente sin actualizar `index.json`
- No usar la API de Gemini ni ninguna IA externa para procesar acordes — el scraper de lacuerda.net es suficiente
- No subir claves API ni tokens al repositorio
- No hacer `git push --force` a `main`
