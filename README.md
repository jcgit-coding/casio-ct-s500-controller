# Casio CT-S500 Pro Controller — v267

Una aplicación web (Web MIDI API) diseñada para transformar el teclado **Casio CT-S500** (y la serie compatible CT-S y WU-BT10) en un instrumento de diseño sonoro completo. Esta app expone parámetros ocultos del motor AiX de Casio, permitiendo usar el teclado con la fluidez y profundidad de un DAW (Digital Audio Workstation) o un sintetizador profesional.

---

## 1. Arquitectura del Sistema

La aplicación está construida sin frameworks de terceros (Vanilla HTML/CSS/JS) para garantizar un rendimiento instantáneo, compatibilidad absoluta con Web MIDI y cero latencia al procesar eventos musicales.

### Estructura de Archivos
- `index.html`: La estructura visual, construida semánticamente. Carga iconos Material UI y la tipografía Montserrat.
- `style.css`: Motor de diseño. Utiliza CSS Variables (`--panel-bg`, `--accent`, etc.) para gestionar dinámicamente un Tema Claro / Tema Oscuro. Usa una arquitectura puramente basada en Flexbox para lograr un diseño "Responsive" extremo (funciona igual de bien en monitores 4K que en smartphones verticales).
- `app.js`: El cerebro de la aplicación. Gestiona la conexión MIDI, el "State Management" global, los listeners de la interfaz y la inyección en el DOM.
- `eq.js`: Motor EQ, `TONE_ENV_MATRIX` (33 categorías × 4 ambientes), `getToneEnvPreset`, `applySmartProfile`. Los CCs 102/103/104 operan sobre el PC Synth; el Active DSP real del CT-S500 requiere SysEx.
- `midi.js`: Conexión y routing MIDI (Web MIDI API).
- `presets.js`: Persistencia local y sincronización GitHub de presets de usuario.
- `harmony.js`: Motor de armonía y acordes.
- `library.js`: Panel de biblioteca de canciones con acordes. Incluye parser de acordes (cifrado inglés A–G y solfège español DO–SI), transpositon por tonalidad, y gestor de eventos en vivo (setlists).
- `trainer.js`: Piano Trainer (importar .mid manualmente — sin archivos .mid incluidos).
- `raw_tones.js` y `raw_rhythms.js`: Bases de datos crudas del manual oficial de Casio. Contienen listas de texto sin formato que `app.js` "parsea" al arrancar para construir los catálogos lógicos.

---

## 2. Gestión de Estado y Persistencia (State Management)

Dado que la comunicación MIDI es a menudo unidireccional (el teclado no siempre reporta la posición de todos sus parámetros internos al encenderse), la app mantiene un árbol de estado estricto:

- `eqState`: Un objeto que almacena los valores (0-127) de 21 parámetros CC (Control Change) independientes para cada canal o parte (`U1`, `U2`, `L`).
- `tuning`: Mantiene registro de la octava y el estado del pedal Sustain por cada parte.
- `globalTranspose` / `globalOctave`: Transposición y octava maestras.
- **LocalStorage (`casioAppState`)**: Un `setInterval` captura y guarda todo el estado de la mesa de mezclas y los instrumentos seleccionados cada 1000ms. Al recargar la página, la función `loadAppState()` inyecta silenciosamente estos valores de regreso a los faders sin bombardear de inmediato al teclado, permitiendo retomar el ensayo exactamente donde se dejó.
- **GitHub Sync**: Los presets se sincronizan con un repositorio GitHub vía la API de contenidos. La función `mergePresetStores` usa timestamp (`_ts`) para resolver conflictos (el más reciente gana). Las eliminaciones se marcan con tombstones `{_deleted:true, _ts}` para sobrevivir merges.

---

## 3. Motor Web MIDI y Mitigación de Errores

El módulo MIDI de la aplicación fue diseñado para sortear las extremas limitaciones de seguridad impuestas por navegadores modernos, especialmente en ecosistemas móviles (Android/Chrome).

### Bloqueo de Puertos "Fantasma" (MidiThrough)
En Android, el sistema operativo inyecta rutinariamente un puerto virtual llamado `Android MIDI` o `MidiThrough`. Adaptadores USB OTG genéricos a menudo se reportan como "Dispositivo USB genérico" en lugar de "Casio".
- **La Solución:** La función `reconnectMIDI()` rastrea todos los puertos. Prioriza nombres que contengan `CASIO`, `CT-S`, `WU-BT`, `BLE`. Si no los encuentra, filtra y expulsa agresivamente cualquier puerto que contenga la palabra `THROUGH` o `ANDROID`, obligando a la app a engancharse al cable físico USB real.

### Seguridad y SysEx en Chrome Móvil
Solicitar acceso exclusivo de sistema (`{ sysex: true }`) provoca que Chrome bloquee el acceso silencioso al hardware.
- El código se inicializa con `{ sysex: false }` para asegurar que el teclado sea reconocido para mensajes estándar (Notas, CC, PC).
- Si Chrome en Android bloquea la conexión inicial (`NotAllowedError` / `SecurityError`), la app captura el error y redirige al usuario a utilizar el botón manual de **Reconectar**. Presionar este botón cuenta como un "Gesto de Usuario" (User Gesture), lo que obliga al navegador móvil a abrir el pop-up de permisos USB.

### Prevención de Desbordamiento del Búfer Casio (Throttling)
Cuando se cambia un instrumento (Program Change), Casio tarda unos milisegundos en cargar el nuevo DSP. Si la aplicación dispara inmediatamente un aluvión de 21 mensajes de ecualización (CC), el teclado ignora el comando de cambio de instrumento.
- **La Solución:** `scheduleProfile(part, catName)` espera estratégicamente 150ms después de solicitar un nuevo Tono antes de enviar el paquete de configuraciones de ecualización.
- **Reenvío de CC72 (Sustain):** El CT-S500 resetea todos los controladores tras una ráfaga grande de CCs. Para preservar el sustain y el release largo de choirs/strings/pads, CC72 se reenvía a las 3 partes mediante `resyncAllSustain()` → `SUSTAIN_TAPS = [150, 400, 700, 1300]` ms, con timers cancelables por parte en `scheduleSustainResync(part, delays)`.

### Reconexión sin recargar tonos
`reconnectMIDI()` compara el ID del nuevo puerto con `_lastMidiOutputId`. Si es el mismo (ej. reconexión Bluetooth momentánea), solo reenvía CCs — sin Program Change al Casio. Si el ID cambia (puerto físico nuevo), sí recarga los tonos completos.

---

## 4. Perfiles Acústicos Inteligentes (Smart Acoustic Profiles)

Seleccionar un sonido no es suficiente; un Órgano necesita distorsión y rotary, mientras que un Piano necesita Reverb profunda.
La constante `ENVIRONMENTS` en `app.js` es un motor de diseño sonoro automatizado: 4 ambientes (Estudio/Vivo/Sala/Jazz) × 33 categorías = 132 perfiles.
- Cuando la aplicación detecta que el usuario seleccionó un tono desde un `optgroup` (ej. cambió de "PIANO" a "ELEC.ORGAN"), inyecta automáticamente una matriz de valores predefinidos:
  - *String Ensemble / Choir:* Ataques lentos, liberación larga, Reverb profunda. CC72 neutral elevado (75–78) para preservar el decay natural.
  - *Synth Lead:* Filtros (Cutoff) cerrados, alta resonancia, vibrato activo y Portamento.
  - *Elec. Organ:* Activación del DSP Rotatorio, cero resonancia.
- Los CCs de interpretación en vivo (CC1 Mod, CC65 Portamento SW, CC66 Sostenuto, CC67 Soft) están en `PERFORMANCE_CCS` y nunca se resetean al cambiar de tono.

---

## 5. Complejidad de la Interfaz y Workarounds de CSS

La mesa de mezclas requiere potenciómetros (faders) verticales muy largos (200px) para permitir precisión al tacto en pantallas de celulares y tablets.

### El Bug de Renderizado "Webkit Transform Bounding-Box"
Para crear faders verticales de manera compatible entre navegadores, se rotan faders horizontales nativos: `transform: rotate(-90deg)`.
- **El Problema:** El motor Webkit (Chrome/Safari Móvil) calcula el ancho del contenedor padre basándose en el elemento *antes* de ser rotado (un fader horizontal de 200px de ancho). Esto creaba un "ancho fantasma" masivo que empujaba el resto de la interfaz fuera de la pantalla, rompiendo los cálculos de `justify-content: space-evenly` de la cuadrícula.
- **La Solución Arquitectónica:** Se descartó el uso de `position: absolute`. En su lugar, el fader mantiene su flujo estándar de bloque pero utiliza márgenes negativos matemáticamente perfectos (`margin: 88px -88px;`). Esto anula obligatoriamente la caja delimitadora invisible (bounding box) calculada por el navegador, forzando a la cuadrícula Flexbox a distribuir los controles de ecualización uniformemente (18px de separación estricta) a lo largo de toda la pantalla, independientemente de la resolución del dispositivo.

---

## 6. Bases de Datos Dinámicas

En lugar de construir listas masivas de código HTML manualmente, el sistema ingiere catálogos crudos extraídos de manuales.
- El script lee líneas del tipo `1 STAGE PIANO 0 1 0/64` utilizando Expresiones Regulares (`RegEx`).
- Extrae el ID, Nombre, Program Change (PC) y Controladores de Banco (MSB/LSB).
- Construye menús `<select>` anidados (`<optgroup>`) clasificados automáticamente por categoría, permitiendo a la app buscar, iterar e inyectar atributos `data-` a una velocidad excepcionalmente rápida.

---

## 7. Regla de Versioning

**Cada vez que se modifica `app.js`, `style.css`, `fix_swap.js` o `harmony.js`, se debe actualizar el query string de cache busting en `index.html`:**

```html
<script src="app.js?v195"></script>       <!-- incrementar el número -->
<link rel="stylesheet" href="style.css?v187">
<script src="fix_swap.js?v187"></script>
<script src="harmony.js?v187"></script>
```

Sin este paso, los navegadores (especialmente móviles) sirven la versión anterior en caché y los cambios no se ven.

---

## Documentación técnica

- [`docs/AUDITORIA_v190.md`](docs/AUDITORIA_v190.md) — Auditoría general v190 (2026-10-04): bugs ocultos pendientes y mejoras propuestas (no duplica v170/v180).
- [`docs/AUDITORIA_MIXER_v180.md`](docs/AUDITORIA_MIXER_v180.md) — Auditoría completa del Mixer (2026-10-04): 5 críticos, 4 altos, 9 medios, 10 bajos. CRIT/HIGH/MED cerrados en v181–v187 **con residuos** (MED-03/04/06/07/09, HIGH-01/02/03) — ver [AUDITORIA_v190.md](AUDITORIA_v190.md#verificación-de-hallazgos-previos).
- [`MIXER_AUDIT.md`](MIXER_AUDIT.md) — Auditoría previa (v170). Todos los hallazgos resueltos.

---

## 8. Biblioteca de Canciones (Library Panel)

### Estructura de archivos
```
library/
  index.json                          # Índice maestro: [{id, title, artist, genre, original_key}]
  {artist}_{song}/
    meta.json                         # Metadata + lista de versiones
    chords_v1_lacuerda.txt            # Versión 1 (la de más votos en lacuerda)
    chords_v2_lacuerda.txt            # Versión 2
    chords_vN_lacuerda.txt            # ...
```

### Parser de acordes (`parseRawTextToChords` en `library.js`)
Convierte texto crudo de acordes a HTML con resaltado. Soporta:
- **Solfège español:** DO RE MI FA SOL LA SI (y variantes mixtas: Do, Re, Fa#, Sol/La, etc.)
- **Cifrado inglés:** C D E F G A B (con accidentales #/b)
- **Calificadores compuestos:** m, maj7, dim, aug, sus2/sus4, add9, 7sus4, 9sus4, 6/9, (add9), etc.
- **Notas de bajo:** RE/SOL, C/E, Sol/La, etc.
- Detección de líneas de acordes: stripping del token de acorde → si el remanente es vacío (ignorando separadores y dígitos) → línea de acorde.
- **Orden de alternación:** Español PRIMERO en el regex para evitar que `DO` sea consumido como `D` (inglés) + `O` remanente.
- **splitConcatChords:** Detecta acordes yuxtapuestos sin espacio (ej. `FAFA`, `SImDO`, `DOSOL9sus4`) usando matches consecutivos sin gap y les inserta espacio.

### Transposición
`applyTranspose(steps)` transpone todos los acordes visibles en pantalla. Detecta el sistema de notación de cada acorde (inglés o español) y devuelve el resultado en el mismo sistema.

### Selector de transposición
Dropdown con 12 tonalidades en cifrado inglés: C, C#/Db, D, … B.

### Scroll y navegación A–Z
- Contenedor con `max-height: calc(100vh - 290px)` para evitar lista infinita.
- Índice alfabético lateral (`position: absolute; right: 0`) que al clic hace scroll suave a la letra del artista dentro del contenedor correcto.

### Gestor de eventos / setlists
Eventos guardados en `localStorage` como `casio_events`. Cada evento contiene `{id, title, songs:[{id, versionFile, transpose}]}`. Permite agregar canciones al evento activo con la versión y transposición actual.

---

## 9. Herramientas de construcción de librería (`tools/`)

### `lacuerda-import.js` — Solo lacuerda.net
Scraper Node.js (sin dependencias npm) para poblar `library/` automáticamente.

```bash
node tools/lacuerda-import.js --artist "marcos-witt"
node tools/lacuerda-import.js --artist "grupo-grace" --delay 2000
node tools/lacuerda-import.js --artist "toma_tu_lugar" --display-name "Marcos Brunet" --artist-id "marcos_brunet"
node tools/lacuerda-import.js --artist "marcos-witt" --max 50
```

**REGLA OBLIGATORIA — múltiples versiones:**
- Se importan **TODAS** las versiones de tipo "Letra y Acordes" (tipo R) disponibles para cada canción.
- Cada versión se guarda como archivo separado: `chords_v1_lacuerda.txt`, `chords_v2_lacuerda.txt`, etc.
- La calificación (`lcd`) de cada versión queda en `meta.json` bajo `versions[].lcd`.
- Solo si **no existe ninguna versión R** se acepta como fallback una tablatura (tipo T).
- Tipos Bajo (B), Piano (P), Ukulele (U) y similares (K) se descartan siempre.
- **Nunca importar solo la primera versión** cuando hay múltiples disponibles.

**Cómo funciona:**
1. Descarga la página del artista de `acordes.lacuerda.net/{slug}/`
2. Lee todos los `<li lcd='N'>` del bloque `b_main` (lista completa, no solo el top-10)
3. **Agrupa por canción base:** `tu_fidelidad`, `tu_fidelidad2`, `tu_fidelidad3` → un solo directorio `marcos_witt_tu_fidelidad/`
4. Ordena versiones por `lcd` (votos) descendente — la mejor primero
5. Descarga **todas** las versiones R en `.shtml` y guarda `chords_v1_lacuerda.txt`, `chords_v2_lacuerda.txt`, etc.
6. Actualiza `library/index.json` con upsert (no destruye entradas existentes de otros artistas)

**Notas:**
- Uso personal únicamente (términos de lacuerda.net)
- Si necesitas canciones de otra fuente, provee el link o foto directamente — no se scrapeará cifraclub ni otro sitio automáticamente

### `validate-library.js` — Auditoría de calidad
```bash
node tools/validate-library.js
node tools/validate-library.js --artist "marcos-witt" --verbose
```
Analiza todos los archivos de acordes y reporta:
- ✅ OK — detectado y renderizable correctamente
- ℹ️ Info — líneas en MAYÚSCULAS no reconocidas como acordes (falsos positivos típicos del solfège)
- ⚠️ Warning — acordes concatenados, 0 líneas de acordes detectadas
- ❌ Error — contenido en portugués, archivo muy corto, sin archivo de acordes

Genera `tools/validation-report.json`.

---

## 10. Development Rules

- **English Only**: All codebase references, variables, folder names, and UI elements must strictly be in English (e.g. Trainer instead of Entrenador, Library instead of Repertorio).

## 9. Historial de Versiones (reciente)

### v267 · mar 14 oct 2026 · COT
- **fix(parser):** Soporte para calificadores compuestos: `7sus4`, `9sus4`, `13sus4`, `6/9`. Añadido `(?:sus[24])?` y `(?:/\d+)?` al final de `ES_QUAL` y `EN_QUAL`. Soluciona líneas como `RE7sus4 SOL9sus4` que fallaban detección.
- **fix(validate):** Mismo fix aplicado en `tools/validate-library.js`.

### v266 · mar 14 oct 2026 · COT
- **revert(library):** Restaurado dropdown de transposición con cifrado inglés (C, C#/Db, D, …).

### v264 · mar 14 oct 2026 · COT
- **fix(parser):** `splitConcatChords` reescrito con detección de adyacencia. Problema: look-ahead prefería `F` (inglés) sobre `FA` (español) cuando el acorde terminaba en mayúscula. Solución: `exec()` + insertar espacio solo cuando dos matches consecutivos no tienen gap. Casos resueltos: `FAFA→FA FA`, `DFA(b9)→D FA(b9)`, `SImDO→SIm DO`, `DOSOL9sus4→DO SOL9sus4`.

### v263 · mar 14 oct 2026 · COT
- **fix(parser):** Español PRIMERO en alternación de `CHORD_STRIP_RE` y `CHORD_RE`. Bug: `DO`/`RE`/`SOL` consumidos como `D`/`R`/`S` (inglés) dejando `O`/`E`/`OL` remanente. Fix: `ES_ROOT…` antes que `EN_ROOT…` en la alternación.
- **refactor(scraper):** `tools/scrape-artist.js` reescrito — solo lacuerda.net, todas las versiones por canción, agrupación por slug base (`tu_fidelidad` + `tu_fidelidad2` → un directorio), orden por votos `lcd`. Eliminado todo código de cifraclub.

### v262 · mar 14 oct 2026 · COT
- **fix(parser):** Acordes concatenados con calificadores aug/add (`SImLA+(aug)→SIm LA+(aug)`). Añadido `\\+(?:\\(aug\\))?` y `(?:\\((?:add|aug)\\d*\\))` a `ES_QUAL`.

### v261 · mar 14 oct 2026 · COT
- **feat(parser):** Soporte completo para solfège español en `parseRawTextToChords`: `ES_ROOT`, `ES_QUAL`, `ES_BASS`. `applyTranspose` con tablas `ES_TO_EN`/`EN_TO_ES` para transponer y devolver en el mismo sistema de notación.

### v260 · mar 14 oct 2026 · COT
- **fix(scraper):** URL de lacuerda corregida a `.shtml` para contenido completo (sin extensión devuelve preview truncado ~358 chars).

### v259 · mar 14 oct 2026 · COT
- **feat(library):** Catálogo completo de Marcos Witt — 393 canciones de lacuerda.net. Total biblioteca: ~415 canciones.

### v258 · mar 14 oct 2026 · COT
- **fix(scraper):** Dominio `acordes.lacuerda.net`, slugs con guion bajo (`marcos_witt`), lista completa de `<ul id=b_main>` (no el top-10 `rList`).

### v249–v257 · oct 2026 · COT
- Iteraciones del scraper dual (lacuerda + cifraclub), corrección de URLs, detección de portugués, gestión de índice. Superados por v258+.

### v248 · lun 12 oct 2026 22:58 · COT
- **feat(presets):** Restaurados los Presets de Búsqueda por defecto de inicio solicitados (Opción A):
  - **U1:** Preset chip "Piano" activo, filtro "Piano", Tono 1 *Stage Piano*.
  - **U2:** Preset chip "Pad" activo, filtro "Pad", Tono 8 *ADV Piano PAD*.
  - **L:** Preset chip "Strings" activo, filtro "String", Tono 24 *Strings Piano*.
- **fix(tones):** Desbloqueo inteligente del catálogo completo de 764 tonos en movimiento físico y navegación:
  - **MIDI In desde Casio:** Al girar la rueda o cambiar de tono en el teclado físico, `keepFilter=false` en `selectToneInList` y `onMIDIMessage` limpia automáticamente el filtro de búsqueda de esa pista, restaurando en pantalla los 764 tonos en sus 33 categorías con auto-scroll (`scrollIntoView`) directo al tono.
  - **Navegación de categorías `<` y `>`:** Presionar los botones de cambio de categoría en la app limpia de inmediato cualquier filtro de texto activo, permitiendo recorrer libremente las 33 categorías del Casio sin quedar atrapado en un subconjunto.
  - **Toggle en chips:** Tocar un chip activo lo apaga y despliega los 764 tonos con 1 solo toque.
- **fix(cache-buster):** Invalidador de caché robusto con redirección forzada vía timestamp (`window.location.replace`) que garantiza que los navegadores móviles y de escritorio descarguen `v248` de inmediato sin depender de recargas manuales.
- **cache-bust:** `index.html` → v248.

### v247 · lun 12 oct 2026 22:40 · COT
- **fix(tones):** Resuelto el problema por el cual la lista de tonos quedaba truncada y no permitía ver el catálogo completo de los 764 instrumentos:
  - **Catálogo completo en arranque:** Eliminada la pre-carga restrictiva de texto en el buscador (`Piano`, `Pad`, `Strings`). La app arranca con los instrumentos por defecto (U1: Stage Piano, U2: ADV Piano Pad, L: Strings Piano) pero con la lista de los 764 tonos completamente accesible en las 33 categorías.
  - **Auto-desbloqueo al mover desde el Casio:** Al cambiar de instrumento directamente en la rueda/panel del teclado físico, la app borra de inmediato cualquier filtro de búsqueda activo en esa pista, despliega la lista completa de 764 tonos y hace auto-scroll suave (`scrollIntoView`) al tono seleccionado.
  - **Chips con toggle On/Off:** Hacer clic sobre un chip de búsqueda activo (ej. "Piano", "Organ", "Pad") ahora lo desactiva y restaura instantáneamente la lista completa con un solo toque.
- **cache-bust:** `index.html` → v247.

### v246 · lun 12 oct 2026 18:52 · COT
- **cleanup(arranger):** Purga completa de Registraciones en la pestaña Arranger. El Arranger queda dedicado 100% y exclusivamente al acompañamiento rítmico, evitando cualquier interferencia o alteración sobre los tonos e instrumentos del Mixer.
- **docs(arranger):** Documentación explícita sobre la limitación de hardware del Casio CT-S500 (el firmware del teclado no cuenta con comandos MIDI estándar para cambiar ritmos 001–243, requiriendo marcación en el dial físico).
- **cache-bust:** `index.html` → v246.

### v245 · lun 12 oct 2026 18:39 · COT
- **feat(arranger):** Suite completa de control del acompañamiento (Arranger) rediseñada para máxima potencia y compatibilidad MIDI con el Casio CT-S500:
  - **Registration Memories (FW 1.06+):** Selector remoto de las 64 Registraciones del Casio (16 Bancos × 4 Botones de Registro). Permite cambiar instantáneamente por MIDI (CC 0 = 116, CC 32 = Banco, PC = Slot en Ch 1) el ritmo, variación, tempo, split y tonos completos desde la aplicación.
  - **Accompaniment Multi-Channel Mixer:** Mesa de mezcla para el acompañamiento con faders y botones de MUTE independientes: Master Arranger (Canales 9–16), Drums & Percussion (Canales 9–10), Bass (Canal 11) y Chords & Harmony (Canales 12–16).
  - **Realtime Transport & MIDI Clock:** Motor de reloj MIDI con Tap Tempo de alta precisión, pasos rápidos (`+/-5` y `+/-1` BPM) y control Start/Stop con disparo sincronizado de pulsos de reloj (0xF8).
  - **Factory Rhythm Quick Dial HUD:** Asistente visual prominente que muestra el número exacto (001–243) para girar la rueda dial del Casio y botón de un solo toque para aplicar el BPM sugerido según el estilo musical.
  - **Setup Guide Integrada:** Guía desplegable con los pasos para habilitar `MIDI In Clock` y `MIDI In Start/Stop` en el menú del teclado.
- **cache-bust:** `index.html` → v245.

### v244 · lun 12 oct 2026 17:16 · COT
- **fix(midi-in):** Al cambiar de tono directamente en el teclado físico Casio, la app captura Bank MSB (CC 0) + Bank LSB (CC 32) + Program Change con fallback seguro, sincroniza automáticamente la vista del EQ a esa pista (`activePart`) y aplica el perfil acústico recalculando y enviando los CCs de modelado al teclado y faders.
- **cache-bust:** `index.html` → v244.

### v243 · lun 12 oct 2026 17:12 · COT
- **fix(smart-profiles):** Resuelto el bug por el cual `getToneEnvPreset` no reconocía el nombre del tono (`tone.name` era `undefined`), provocando que todos los tonos de una misma categoría compartieran valores genéricos idénticos.
- **fix(smart-profiles):** Ahora se preserva el nombre real del tono en `currentTone` y `opt.value`, permitiendo que modelos de firma acústica específicos (Stage Piano, Bright, Mellow, Honky, Dyno, Violin, Sax, etc.) apliquen sus perfiles individuales de filtros, ataque, reverb, chorus y eco.
- **fix(ux):** Al seleccionar un tono en cualquier pista (`U1`, `U2`, `L`), la vista del EQ Mixer cambia automáticamente a esa pista y refresca los faders en pantalla para reflejar visualmente la nueva ecualización.
- **cache-bust:** `index.html` → v243.

### v242 · lun 12 oct 2026 17:04 · COT
- **fix(envelope):** Eliminado el fader RELEASE (CC 72) del panel EQ para evitar conflictos con el botón SUSTAIN. CC 72 queda gobernado exclusivamente por el sistema de sustain (`susRelease`, `releaseNeutral` y `resyncAllSustain`).
- **cache-bust:** `index.html` → v242.

### v241 · lun 12 oct 2026 16:32 · COT
- **fix(startup):** Garantía de arranque en limpio (Opción A). La app siempre inicia con: U1 (Piano → `1. STAGE PIANO`), U2 (Pad → `8. ADV PIANO PAD`), L (Strings → `24. STRINGS PIANO`) y sus chips activos.
- **fix(storage):** Se excluyó la persistencia de instrumentos de sesión en `casioAppState` para evitar el secuestro del arranque en futuras recargas.
- **fix(html):** Placeholders HTML limpios sin caracteres corruptos.
- **cache-bust:** `index.html` → v241.

### v240 · lun 12 oct 2026 16:05 · COT
- **feat(eq):** Restaurado fader analógico continuo **RELEASE** (CC 72) en la sección `Envelope`.
- **feat(tuning):** Nueva sección `Pitch & Tuning` con microafinación orgánica **DETUNE** vía RPN `00 01H` ($\pm50$ cents).
- **feat(voicing):** Añadido selector **MONO / POLY** (CC 126 / CC 127) para articulación y legato realista en vientos y leads.
- **feat(panic):** Botón de emergencia **PANIC** en la barra superior (CC 120 All Sound Off + CC 123 All Notes Off + CC 64 Off).
- **cleanup:** Purga definitiva de controladores no soportados por el CT-S500 (CC 75 Decay, CC 95, CC 102/103/104 Master EQ).
- **cache-bust:** `index.html` → v240.

### v195 · dom 04 oct 2026 07:24 · COT

- **fix(state):** `loadAppState` ignora tones de saves anteriores a v194 — L carga como 24. STRINGS PIANO por defecto en instalaciones limpias o migración desde v192/v193.
- **cache-bust:** `app.js` → v195.

### v194 · dom 04 oct 2026 07:24 · COT
- **fix(tones):** `loadAppState` solo restaura el tono guardado si el save incluye `searchFilters` (formato v192+). Saves anteriores (era OpenCode, sin `searchFilters`) usan el default de `initToneSearch` → L = 24. STRINGS PIANO, U2 = 457. ADV PIANO PAD.
- **fix(tones):** `loadPreset` también restaura el filtro de búsqueda antes de seleccionar el tono, y guarda `searchFilters` en `captureAndSavePreset`.
- **fix(presets):** `loadPreset` ya no sobreescribe CC7 con Part Mix Rules — respeta el volumen guardado en el preset.
- **cache-bust:** `app.js` → v194.

### v193 · dom 04 oct 2026 07:17 · COT
- **fix(sustain):** `scheduleProfile` movió `resyncAllSustain()` al interior del callback — los taps CC72 ahora empiezan DESPUÉS del burst de `applySmartProfile`, no compitiendo con él. Antes el primer tap (t+150ms) llegaba simultáneo al burst; el CT-S500 reseteaba CC72 después del tap, dejando sustain caído hasta t+400ms.
- **fix(sustain):** `beginEqProgrammatic` extendido de 100ms a 250ms — previene que eventos `input` asíncronos de Android escapen el guard y formen un burst de ~17 CC que reseteaba CC72 en los 3 canales.
- **cache-bust:** `app.js` → v193.

### v192 · dom 04 oct 2026 07:28 · COT
- **fix(tones):** `saveAppState` guarda el filtro de búsqueda activo (`searchFilters`) y `loadAppState` lo restaura antes de seleccionar el tono — U2 arranca en 457. ADV PIANO PAD y L en 24. STRINGS PIANO (o el último tono+filtro usados).
- **fix(vk):** A3 — VK aplica `globalTranspose + globalOctave×12` al PC Synth (antes desafinado 1–2 octavas vs Casio).
- **fix(vk):** A10 — VK suena por SF2 interno aunque EXT MIDI esté OFF; gate `mctrlEnabled` solo bloquea envío al Casio.
- **fix(vk):** `vkNoteOff` usa `shiftedNote` capturado en `vkNoteOn` para liberación correcta del SF2.
- **fix(eq):** A4 — sliders VOL/RVB del rack escriben a `eqState` → se preservan en reconexión y cambio de tono.
- **fix(midi):** A5 — CC7 entrante del Casio actualiza `eqState`; ya no silencia el fader EQ en la próxima reconexión.
- **fix(state):** A6 — `PERFORMANCE_CCS` (CC1/65/66/67) excluidos de `saveAppState` y de `pushAllToKeyboard` — arranque sin Mod/Portamento/Sostenuto/Soft congelados.
- **fix(state):** A2 — `readPresetsStore` ya no destruye `casioPresets` ante JSON corrupto; hace backup con timestamp.
- **fix(state):** `saveAppState` envuelto en `try/catch` — ya no lanza `QuotaExceededError` sin control (A11).
- **cache-bust:** `app.js` → v192.

### v191 · dom 04 oct 2026 06:56 · COT
- **fix(tones):** revertido a defaults originales — U2 → `457. ADV PIANO PAD`, L → `24. STRINGS PIANO` (primer resultado del filtro "Pad"/"String"). Se eliminó `DEFAULT_INSTRUMENT` y la selección por categoría que OpenCode introdujo.
- **cache-bust:** `app.js` → v191.

### v190 · dom 04 oct 2026 · COT
- **fix(sustain):** `resyncAllSustain()` reenvía CC72 a **las 3 partes** tras cualquier ráfaga: cambio de entorno, `switchEQ`, `resetEQ`, `scheduleProfile` y **`pushAllToKeyboard` también en la rama `skipTones`** (A1: 81 CC en un tick al reconectar el mismo puerto dejaba a U1/U2 sin sustain). Taps unificados en `SUSTAIN_TAPS = [150, 400, 700, 1300]`.
- **fix(sustain):** guard de faders EQ ahora es una ventana temporal (`beginEqProgrammatic`/`isEqProgrammatic`) — los eventos `input` asíncronos de Android escapaban del guard booleano sincrónico.
- **fix(sustain):** toggle SUSTAIN con retry a 20 ms para ambas direcciones; relee `tuning[part].sus` al disparar para evitar doble-tap.
- **fix(sustain):** Program Change externo re-sincroniza el sustain de esa parte si está ON.
- **fix(ui):** `loadAppState` restaura octava + estado SUSTAIN de las 3 partes incluso sin tonos guardados.
- **docs:** nueva `docs/AUDITORIA_v190.md`.

### v189 · dom 04 oct 2026 · COT
- **fix(sustain):** resync CC72 en todos los parts tras cambiar de tono.

### v188 · dom 04 oct 2026 · COT
- **cleanup:** LOW-08/09/10 + MED-09 (guards `EQ_CONTROLS`, cache-bust README, `CC 102/103/104` documentados como **sin verificar** contra el PDF de Casio).

### v187 · dom 04 oct 2026 · COT
- **refactor:** `sReedndConnect` renombrado a `reconnectMIDI` (DESIGN-04).
- **cleanup:** `EQ_CONTROLS.find(c => c && ...)` → guard innecesario removido; `blackOffsets` (array sin uso en VK); comentario incorrecto en `buildGMSelectors`. (LOW-08)
- **cache-bust:** `style.css`, `fix_swap.js`, `harmony.js` actualizados a v187. (LOW-09)

### v186 · dom 04 oct 2026 · COT
- **refactor(sustain):** LOW-07 — `scheduleSustainResync` centraliza todos los timers CC72.

### v185 · dom 04 oct 2026 · COT
- **fix(sf2+swap+xss):** MED-06/07 + LOW-05.

### v184 · dom 04 oct 2026 · COT
- **fix(midi+vk):** MED-01/02/05/08 — input detach, output-only, vol cap, stuck notes.

### v183 · dom 04 oct 2026 · COT
- **fix(sync+pc):** CRIT-02 sync strategy + HIGH-04 external PC.

### v182 · dom 04 oct 2026 · COT
- **fix(tones+octave):** debounce profile bursts + remove per-part octave desync.

### v181 · dom 04 oct 2026 · COT
- **fix(midi+presets):** CRIT-01/03/04/05 + HIGH-01/02/03 + MED-03.

### v162 · 2026-09-30 13:07 COT
- **UX Mixer:** Lista de tones reducida de `size=8` a `size=5`.
- **Fix:** Botón "↑ Top" ahora hace scroll al tope de la tarjeta Instrument 1 (`card-U1`), no al tope absoluto de la página.
- **feat:** EQ por tono+ambiente — al mover cualquier fader o switch, se guarda automáticamente el perfil para ese tono en ese ambiente (Studio/Live/Hall/Jazz). Cambiar de tono o ambiente carga el perfil guardado; si no existe, usa el perfil de categoría. Botón Reset borra el perfil guardado y vuelve al default de categoría.
- **feat:** Al recibir un Program Change del Casio físico, se aplica automáticamente `applySmartProfile` para la nueva categoría del tono.

---

*Creado para llevar las capacidades del motor de sonido Casio AiX a un entorno visual táctil, profesional y sin interrupciones.*
