# Casio CT-S500 Pro Controller — v194

Una aplicación web (Web MIDI API) diseñada para transformar el teclado **Casio CT-S500** (y la serie compatible CT-S y WU-BT10) en un instrumento de diseño sonoro completo. Esta app expone parámetros ocultos del motor AiX de Casio, permitiendo usar el teclado con la fluidez y profundidad de un DAW (Digital Audio Workstation) o un sintetizador profesional.

---

## 1. Arquitectura del Sistema

La aplicación está construida sin frameworks de terceros (Vanilla HTML/CSS/JS) para garantizar un rendimiento instantáneo, compatibilidad absoluta con Web MIDI y cero latencia al procesar eventos musicales.

### Estructura de Archivos
- `index.html`: La estructura visual, construida semánticamente. Carga iconos Material UI y la tipografía Montserrat.
- `style.css`: Motor de diseño. Utiliza CSS Variables (`--panel-bg`, `--accent`, etc.) para gestionar dinámicamente un Tema Claro / Tema Oscuro. Usa una arquitectura puramente basada en Flexbox para lograr un diseño "Responsive" extremo (funciona igual de bien en monitores 4K que en smartphones verticales).
- `app.js`: El cerebro de la aplicación. Gestiona la conexión MIDI, el "State Management" global, los listeners de la interfaz y la inyección en el DOM.
- `fix_swap.js`: Maneja el swap visual de partes (U1/U2/L) y llama a `window.swapPartState` para sincronizar el estado MIDI.
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
<script src="app.js?v194"></script>       <!-- incrementar el número -->
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

## 8. Historial de Versiones (reciente)

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
