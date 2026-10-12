# Auditoría completa — CasioController v235

**Fecha:** 2026-10-11 · **Alcance:** lectura línea por línea de TODOS los archivos del proyecto (app.js 1516, eq.js 1291, index.html 879, style.css 1973, library.js 456, presets.js 443, trainer.js 399, harmony.js 322, midi.js 224, raw_tones.js 845, raw_rhythms.js 265, los 5 scripts herramienta, `tools/legacy/` (44 archivos), los JSON de datos y toda la documentación). Verificación cruzada con greps de globales, `localStorage`, `innerHTML`, tokens y referencias entre archivos.

**Total: ~130 hallazgos únicos** — 6 críticos, 27 altos, ~45 medios, ~35 bajos, ~17 nits. Todos los hallazgos críticos/altos citados fueron verificados personalmente contra el archivo; no es teoría.

---

## Resumen ejecutivo

La app funciona y la base de datos de tonos está impecable (764 tonos, 33 categorías, 0 IDs duplicados, 0 NaN). Pero el proyecto arrastra **6 problemas que rompen funcionalidad o destruyen datos hoy mismo**, y un patrón transversal: features cuya UI quedó viva cuando su lógica se desconectó (octava por pista, Pitch/Wait del Trainer, columna CC95, columna Events, `midi.js`).

**Orden de ataque recomendado:**

1. **Críticos (1–2 h):** `SUS_RELEASE` (eq.js), `ghFileSha` (presets.js), 2 XSS (library.js), cascada `.btn` (style.css).
2. **Altos que se sienten al tocar (medio día):** `noteOff` del VK (app.js:1467/1481), octava por pista, tempo del Trainer, `style.css?v216`, tema claro.
3. **Limpieza (1 h):** borrar `midi.js`, `tools/legacy/`, 4 scripts herramienta rotos, actualizar README a v235.

---

## 🔴 CRÍTICOS (6)

### CRIT-01 · `SUS_RELEASE` no existe → `ReferenceError` con SUSTAIN activo
**`eq.js:1076, 1144, 1196, 1213`**
```js
if (tuning[part].sus) {
    sendCC(part, 72, SUS_RELEASE);   // ← SUS_RELEASE no está definido en NINGÚN archivo
}
```
El refactor a `CAT_SUS_RELEASE`/`susRelease(part)` (app.js:22-60) no se propagó a eq.js. Con el botón SUSTAIN ON:
- `applySmartProfile` lanza y **aborta el bucle de las 3 partes** (app.js:518-520) → las partes 2 y 3 se quedan con EQ viejo.
- En el handler `change` del fader (eq.js:1212-1217) el throw ocurre **antes** de `saveToneEQForPart`/`saveAppState` → **ningún ajuste de EQ se persiste**.
- En el click de switch (1143-1146) se saltan el resync de sustain y el autosave.

**Fix:** reemplazar las 4 ocurrencias por `susRelease(part)`.

### CRIT-02 · `ghFileSha` se guarda antes de parsear → un fallo borra la nube
**`presets.js:39-40`**
```js
ghFileSha = json.sha;                                          // ← se asigna ANTES
const cloud = JSON.parse(decodeURIComponent(escape(atob(...)))); // ← si esto falla...
```
…el `catch` de `syncPull` retorna `false`, pero **`ghFileSha` ya quedó seteado**. El siguiente `syncPush` ve SHA válido, salta el pull (línea 61) y hace PUT solo con el estado local → **sobreescribe y destruye `presets.json` en GitHub**. Disparador real: la API de Contents devuelve `content: ""` cuando el archivo supera ~1 MB (crecimiento inevitable por PRS-04, ver MED-01).

**Fix:** asignar el SHA solo tras el parseo exitoso; en el `catch`, `ghFileSha = null`.

### CRIT-03 · XSS almacenado en la lista de canciones (roba los 3 tokens)
**`library.js:280-285`**
```js
container.innerHTML = songs.map(s => `
  <div ... onclick='RepertoireSync.openSong("${s.id}")'>
    <div ...>${s.title}</div>
    <div ...>${s.artist || "Unknown Artist"}</div>`)
```
`id`/`title`/`artist` vienen del `index.json` de la nube (editable vía repo/PR o por la IA). Un `"` en el id rompe el atributo; un `<img onerror>` en el título ejecuta JS. Un XSS roba de un golpe `github_pat`, `casioGhToken` y `gemini_api_key` de LocalStorage (HTML-12).

**Fix:** montar filas con `createElement` + `addEventListener` (patrón ya usado correctamente en `presets.js:291-327`), pintar con `textContent`, validar `id` con `/^[a-z0-9_]+$/`.

### CRIT-04 · XSS almacenado en el visor de acordes
**`library.js:186` + `parseRawTextToChords` (125-161)**
`htmlContent` se construye desde el `chords.txt` sin escapar HTML; el parser solo envuelve acordes en `<span>`. Un `<svg onload=...>` en la letra se ejecuta al abrir la canción.

**Fix:** escapar cada línea (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`) antes del regex de acordes, y construir los `<span>` con `createElement`.

Mismo patrón (menor exposición) en `trainer.js:184-193` (TRN-03) y `harmony.js:125-127,178` (HRM-01).

### CRIT-05 · Cascada CSS rota: `.btn` posterior anula todas las variantes
**`style.css:1375-1381`** (después de `.btn-primary`:535, `.btn-accent`:542, `.btn-start`:563, `.btn-eq`:575 — misma especificidad 0,1,0 → gana la última)
```css
.btn, .step-btn, .sus-btn { background: var(--panel-bg); color: var(--text); ... }
```
**Save Keys, Refresh, Save now, EDIT EQ y Connect MIDI perdieron su color** y se ven como botones genéricos. La evidencia de que el equipo ya lo notó: `.btn-stop` (570) y `.daw-btn-play/stop` (1852-1863) solo sobreviven porque les pusieron `!important` — y hay **43 `!important`** en el archivo tapando esta y otras colisiones (CSS-02/05).

**Fix:** mover el bloque 1366-1397 antes de las variantes, o subir especificidad (`.btn.btn-primary`), y luego barrer los `!important` huérfanos.

### CRIT-06 · `append_css.js` no compila y los otros 3 scripts herramienta destruirían el proyecto
- **`append_css.js:4`** — `SyntaxError` en `node --check`; inutilizable (y no idempotente si se arreglara).
- **`build_html.js:9,43`** — si se ejecuta hoy, **duplica la pestaña y la vista PC SYNTH** (sus regex aún matchean) → IDs de DOM duplicados.
- **`improve_ui.js:85`** — `replace(/===/g,'')` + reinyecciones no idempotentes → duplica box-shadows y sombrea el `.track-card`.
- **`remove_emojis.js`** — obsoleto (index.html ya no tiene emojis) y puede inyectar `<span>` dentro de strings JS.

**Fix:** `git rm append_css.js build_html.js improve_ui.js remove_emojis.js` (su trabajo ya está aplicado). Arreglar `bump.js` (ver MED-30) o borrarlo también.

---

## 🟠 ALTOS (27)

### Funcionalidad rota (se siente al usar)

| ID | Archivo:línea | Problema | Fix |
|---|---|---|---|
| **HIGH-01** | `app.js:1467, 1481-1483` | **`noteOff` del VK pasa objetos donde va canal/nota.** `vkActiveKeys[note]` es `{ch, shiftedNote}`: en 1481 `0x80 \| {obj}` → **canal 0 siempre** (U2/L → notas colgadas en el hardware) y `pcSynth.noteOff(obj, …)` falla (el try/catch lo silencia). En 1467 se pasa la nota **sin** el shift → notas colgadas en el SF2. | `const {ch, shiftedNote} = vkActiveKeys[note]; pcSynth.noteOff(ch, shiftedNote); send([0x80\|ch, note, 0]);` |
| **HIGH-02** | `app.js:819-826` vs `1011-1022` | **La octava por pista es cosmética.** `tuning[part].oct` se muestra, se persiste en presets… pero `sendCoarseTuning` solo usa `globalOctave`+`globalTranspose` — el valor por pista **nunca llega al Casio**. (midi.js:132 lo documenta como remoción intencional por desync con el PC synth, pero dejaron la UI viva.) Además los botones octava del rack mctrl disparan **también** `sendCoarseTuning` por la captura genérica de `.step-btn` (app.js:813-826) → doble listener. | Decidir: (a) aplicar `tuning[part].oct` en el shift del VK y en `sendCoarseTuning` por parte, o (b) **eliminar la UI de octava por pista** y dejar solo la global. En `initQuickControls`, salir temprano si `!btn.dataset.action`. |
| **HIGH-03** | `trainer.js:318, 344-348` | **El tempo elegido antes de Play se ignora:** `_applySpeed()` se llama antes de `isPlaying = true` y el guard lo exige → poner 60 BPM y pulsar Play suena a velocidad del archivo. | `this.isPlaying = true; this._applySpeed(); this.midiSequencer.play();` o quitar el guard. |
| **HIGH-04** | `trainer.js:89-101` | **El Pitch no hace nada:** `this.pitch` solo se escribe en la UI; ningún código lo aplica. | Aplicar transposición a los eventos o quitar el control. |
| **HIGH-05** | `trainer.js:110-115` | **Wait Mode es estado muerto:** se alterna y pinta CSS pero la lógica de playback nunca lo lee. | Implementar o eliminar el botón. |
| **HIGH-06** | `app.js:406-411` | **Sync del selector GM bloqueado:** la actualización de `sf2-prog-*` y `pcPartProgram` está *dentro* del `if (window.pcSynth…)`; mientras el SF2 carga, un Program Change entrante del Casio no actualiza la UI. | Sacar `sel.value`/`pcPartProgram[part] = d1` fuera del if. |
| **HIGH-07** | `app.js:241, 333-334` | **`_lastMidiOutputId` se escribe pero nunca se lee.** El comportamiento documentado en README §3 ("reconexión del mismo puerto → solo CCs, sin Program Change") **no existe**: cada blip de Bluetooth recarga los 3 tonos (corte audible). El git history (v228b "restore MIDI code exactly as before the split") explica la regresión. | Restaurar: `const same = midiOutput.id === _lastMidiOutputId; pushAllToKeyboard(!same);` |
| **HIGH-08** | `presets.js:144-147` | **Import sin merge por `_ts` ni push:** `Object.assign` pisa presets más nuevos con un export viejo, y no llama `syncPush()` → el siguiente pull automático puede pisar el import. | Usar `mergePresetStores(existing, imported)` + `syncPush()`. |
| **HIGH-09** | `presets.js:14,162` vs `library.js:211,387` | **Dos claves de LocalStorage para el mismo PAT:** `casioGhToken` (sync de presets) y `github_pat` (biblioteca) — el usuario pega el token dos veces y cada módulo ignora el del otro. | Unificar con migración en ambos sentidos. |
| **HIGH-10** | `library.js:409-443` | **Guardado a GitHub sin `res.ok` ni retry de 409** en `index.json`: un 422/409 se ignora → archivos huérfanos sin entrada o carrera entre guardados. | `if (!res.ok) throw` + patrón de cola/409 de presets.js:49-92. |
| **HIGH-11** | `library.js:401` | **Colisión de id de canción:** 4 dígitos de timestamp = ventana de ~2,7 h por título. | `crypto.randomUUID()`. |
| **HIGH-12** | `trainer.js:242-248` | **Los 15 `.mid` del Trainer no existen** (`trainer/{id}/{id}.mid` en ninguna pieza) → el Trainer está inoperativo para todo el índice. | Generar los .mid o marcar `available:false`. |

### Perfiles de sonido (eq.js)

| ID | Línea | Problema | Fix |
|---|---|---|---|
| **HIGH-13** | matriz 82-282, presets | **Columna CC95 (Phaser) fantasma:** los 540 presets calculan, persisten y nunca envían `'95'` — `EQ_CONTROLS` no lo tiene y todos los bucles de envío iteran solo `EQ_CONTROLS`. | Borrar `'95'` de la matriz, o añadir el control a `EQ_CONTROLS`. |
| **HIGH-14** | `eq.js:295,301` | **`BRIGHT`/`MELLOW` secuestran 12 tonos reales** sin guarda de categoría: `MELLOW E.PIANO`, `MELLOW/BRIGHT STRINGS`, `MEDIUM TRUMPET`, `MELLOW SAW LEAD`, `BRIGHTNESS`… reciben perfil de **piano**. | Condicionar a `cat === 'PIANO'` (o exigir tokens `PIANO`/`GRAND` en el nombre). |
| **HIGH-15** | `eq.js:669` vs `676` | **Rama SYNTH STRINGS 100% muerta:** 'SYNTH STRINGS' contiene 'STRINGS' → la línea 669 la captura antes. 11 tonos SYNTH-STRINGS reciben cuerdas lentas en vez del perfil brillante dedicado. | Mover la rama antes de 669, o `&& !name.startsWith('SYNTH')`. |
| **HIGH-16** | `index.html:15` | **`style.css?v216` con la app en v235** — nadie recibe los cambios de CSS ya commiteados. (Verificado en git: el CSS no cambió desde v216, así que hoy es inocuo, pero es una trampa activa.) | `style.css?v235` + que `bump.js` lo cubra. |
| **HIGH-17** | `style.css:973-999` | **Tema claro incompleto:** no se overridden `--border` (blanco sobre blanco → bordes invisibles), `--input-bg`, `--surface-hover`. | Añadir las 3 variables al bloque light. |
| **HIGH-18** | `style.css:1371` | **`button { outline:none }` global + cero `:focus-visible`** en 160 botones: navegación por teclado invisible. | Regla `:focus-visible` con `outline: 2px solid var(--accent)`. |
| **HIGH-19** | `style.css:63/714, 69/720, 93/732, 1469/1692…` | **~12 selectores duplicados y contradictorios** (`.track-card`, `.rack-channel`, `.sus-btn.sus-on`, `.selected-tone`…): "gana la última" inmantenible. | Consolidar cada selector en una sola regla. |
| **HIGH-20** | `library.js:172` | **`applyTranspose` no maneja bemoles:** la regex `[CDEFGAB]#?` en `"Bb"` come solo la `B` → `Cb` mal escrito. | Parsear `[A-G](?:#|b)?` y reescribir con la notación original. |
| **HIGH-21** | `midi.js` (archivo completo) | **`midi.js` es código muerto divergente:** no se carga desde v228 y su copia en app.js ya difiere (`sysex=false`+retry vs detección Android sin retry). Riesgo: editar el archivo equivocado; si se recarga, colisiona `initMIDI`/`reconnectMIDI`/`setStatus`/`onMIDIMessage`. | `git rm midi.js`; portar el retry de permiso denegado (midi.js:28-37) a app.js si se quiere. |

### Repo / proceso

| ID | Problema | Fix |
|---|---|---|
| **HIGH-22** | **`soundfont.sf2` de 31.5 MB trackeado** (88% del repo) pese a estar en `.gitignore` — la regla no aplica a archivos ya trackeados. | `git rm --cached soundfont.sf2` + servirlo por releases/CDN. |
| **HIGH-23** | **README en v219 vs repo en v235**, changelog cortado en v195 (40 versiones perdidas), y documenta `ENVIRONMENTS` (constante **inexistente**; la real es `TONE_ENV_MATRIX`), `midi.js` (borrado), `fix_swap.js` (borrado) y "app.js parsea con regex" (el parseo está en `raw_tones.js`). | Reescribir §1/§4/§6/§7/§9. |
| **HIGH-24** | **Cero `package.json`, cero tests, cero lint.** Única validación posible: `node --check`. | Añadir `package.json` con `check` + `tools/validate_raw.js` + CI. |
| **HIGH-25** | **21 inputs sin label, 0 atributos ARIA**, botones `-`/`+` sin nombre accesible. | `aria-label`/`<label for>` por control. |
| **HIGH-26** | **3 tarjetas de track + 3 rack-channels + 69 chips de búsqueda duplicados byte a byte** y 207 `style="…"` inline. | Generar con JS a partir de `[{part:'U1'},{part:'U2'},{part:'L'}]` (el patrón ya existe para los faders). |
| **HIGH-27** | **Secretos (PAT + key Gemini) en LocalStorage en texto claro** — combinado con los XSS, un script inyectado los roba. | Cerrar primero los XSS; considerar clave por sesión. |

---

## 🟡 MEDIOS (selección de los ~45)

1. **MED-01** · `presets.js:19-29` — tombstones `{_deleted}` nunca se podan → `presets.json` crece hasta el límite de 1 MB que dispara CRIT-02. Purgar con `_ts > 90 días`.
2. **MED-02** · `presets.js:213` — `setItem` de presets sin try/catch (QuotaExceededError revienta la app; `saveAppState` sí lo tiene).
3. **MED-03** · `presets.js:139` — import usa `JSON.parse` crudo en vez de `readPresetsStore()` → "Invalid file" si el store local está corrupto aunque el archivo sea bueno.
4. **MED-04** · `presets.js:50-54` — la cola de sync serializa solo dentro de **una** pestaña; usar `navigator.locks`.
5. **MED-05** · `eq.js:1176-1181` — `_faderPart` se refresca en cada `input` contradiciendo su comentario; cambiar de parte a mitad del drag escribe MIDI en un parte y persiste en otro. Borrar la línea 1181.
6. **MED-06** · `eq.js:1052-1071, 1254-1270, 1182-1210` — ~40 `querySelectorAll` globales por cambio de perfil/switch y **2 por tick de drag (~60 Hz)**. Precomputar un Map en `buildEQ`.
7. **MED-07** · `eq.js:1216` + `app.js:211-225` — **mover UN fader congela los ~18 CC del tono como override permanente**: mejoras futuras de la matriz ya no se aplican a ese tono hasta Reset. Guardar solo el diff contra el perfil base.
8. **MED-08** · `eq.js:333` vs `416` — `'E.PIANO PAD'` secuestrado por el substring `'PIANO PAD'` (3 tonos).
9. **MED-09** · `eq.js:368` vs `605` — rama `MUTE TRUMPET` muerta tras el genérico `'TRUMPET'` (2 tonos).
10. **MED-10** · `eq.js:669` vs `900` — rama `BRASS & STRINGS` muerta; el tono real cae en cuerdas lentas.
11. **MED-11** · `trainer.js:212-253` — `selectSong` async sin token de cancelación → cambiar de pieza rápido deja UI y buffer desincronizados.
12. **MED-12** · `trainer.js:347` — baseline de tempo mágica `tempo / 120`: si el .mid tiene 90 BPM, la UI miente.
13. **MED-13** · `library.js:113-121` — `importFromText` rompe la transposición (`originalKey` ausente y `select.value="0"` no existe en el dropdown).
14. **MED-14** · `library.js:347` — API key de Gemini en query string (va a logs/historial); usar header `x-goog-api-key`.
15. **MED-15** · `library.js:431` — `atob` del índice sin quitar newlines (presets.js:40 sí lo hace).
16. **MED-16** · `index.html:710-713` + `library.js:7` — **panel EVENTS: UI presente, cero lógica** (`db.calendario` nunca se lee/escribe).
17. **MED-17** · `index.html:53,98-100` — `importFromText` referencia 4 IDs que no existen en el HTML → feature muerta.
18. **MED-18** · `index.html:695-696, 781-784` + `style.css` — la clase `active-tab` la alterna el JS pero **no existe ninguna regla CSS** → pestañas SONGS/EVENTS y filtros del Trainer sin feedback visual.
19. **MED-19** · `style.css:505` — `backdrop-filter: blur(12px)` sobre fondo opaco: coste de composición gratis en Android, cero efecto visible.
20. **MED-20** · `style.css:1173-1177` — workaround frágil `margin: 68px -68px` acoplado a `width:160px`; usar `writing-mode: vertical-lr; direction: rtl` y borrar `.fader-wrapper` (muerto) y la regla contradictoria 1362-1364.
21. **MED-21** · `style.css` — ~15 selectores muertos (`.settings-grid`, `.arranger-panel`, `.track-quick`…, ~120 líneas) + 2 media queries que los editan.
22. **MED-22** · `style.css` — sin `prefers-reduced-motion` pese a 12 `transition: all`.
23. **MED-23** · `style.css:1485` — `font-weight: 900` pero Montserrat solo carga 400-800 → faux-bold; `--text-muted` en tema claro falla WCAG AA a 9-11px.
24. **MED-24** · `app.js:1231,1241` — el SF2 se cachea en IndexedDB **antes** de que `sf2Init` tenga éxito → un init fallido deja un buffer malo que se reintenta en cada arranque.
25. **MED-25** · `app.js:642-656` — el filtro de tonos reconstruye 764 `<option>` con `JSON.stringify` por cada tecla, sin debounce.
26. **MED-26** · `app.js:1373-1378` — las etiquetas de octava del VK se congelan al construirse: cambiar `vkOctave` no las refresca (muestran C3 mientras suena C4).
27. **MED-27** · `app.js:1432-1446` — sin glissando: no hay `mouseenter` ni `touchmove`, así que arrastrar el dedo por las teclas no reproduce.
28. **MED-28** · `app.js:1090-1097, 1426-1430, 454` — código muerto confirmado: `debugMidiPorts` y `getMidiNote` sin llamantes; `pcSynth._audio` no existe → el pre-warm del AudioContext en el primer gesto es un **no-op silencioso** (audible en móvil: primer golpe de tecla mudo).
29. **MED-29** · `raw_tones.js:836-840` — **LSB siempre 0:** en 636 líneas el token es `0/64` y el parser hace `split('/')[0]`, descartando el `64`. Si `64` es el LSB real del banco Casio, se pide el banco equivocado (hallazgo arrastrado desde v180 sin verificar contra el manual).
30. **MED-30** · `bump.js` — funciona por casualiedad (matchea el primer `vNNN` del HTML), no actualiza `var V='v235'` del auto-reload ni `style.css?v216` → tras un bump el badge y el auto-reload quedan mintiendo.
31. **MED-31** · `eq.js:1004-1008** — lookup de categoría por primera coincidencia `includes` bidireccional: `'SYNTH'`→SYNTH-BASS, `'ORGAN'`→ELEC.ORGAN. Elegir la clave más larga.
32. **MED-32** · `eq.js:292` + `app.js:507-511` — `currentEnv` sin validar contra `['Studio','Live','Hall','Jazz']` → localStorage corrupto deja el selector en blanco y todos los lookups caen a Jazz.
33. **MED-33** · `.obsidian/` (5 archivos) trackeado y sin ignorar → churn constante.
34. **MED-34** · `presets.json` trackeado pese a estar en `.gitignore` — y es el archivo que presets.js sincroniza: los presets del usuario quedarían **públicos** en el repo.
35. **MED-35** · Mojibake (doble encoding) en ~100 comentarios de eq.js, 8 de app.js, 4 de presets.js y 9 secuencias visibles en index.html ("` sin instrumento `").
36. **MED-36** · `docs/PLAN_v218.md` — **8 de sus 17 hallazgos ya son falsos** (`.gitignore`, `fix_*.js`, `repertorio.js`, español en eq.js…) mientras 6 siguen abiertos → quien lo lea actúa sobre datos equivocados.
37. **MED-37** · `docs/PLAN.md` — aut contradictorio (marcado ✅ v218 pero las secciones dicen "qué falta"), cita `getToneEnvPreset` en app.js (está en eq.js) y ambientes "Room/Hall/Stage/Outdoor" que no existen.

---

## ⚪ BAJOS / 🔵 NITS (resumen)

- **Bajos:** sin favicon ni `description`/`theme-color`/`color-scheme`; `target="_blank"` sin `rel="noopener"` (index.html:417); APIs deprecadas en el guard de versión (`performance.navigation`, `location.reload(true)`, versión en 3 lugares); `escape`/`unescape` deprecados (presets.js/library.js); auto-save cada 1 s con dirty-flag ausente (86 400 escrituras/día); DOM queries dentro del timer de 200 ms del Trainer; `import()` de CDN sin compartir promesa con app.js; catálogo del Trainer asignado por referencia; `getNoteOffset` sin guard de índice −1; magia `24` del teclado de armonía; `max-width:100vw` genera scroll; `body{user-select:none}` impide copiar la letra en `.chords-canvas`; breakpoints 1026/800/768 solapados; `openSong` sin validar `id` (path traversal same-origin); PC del arranger CC86-89 sin verificar contra el manual; `parseInt` sin radix (app.js:698,718,937,1264,1277,1293).
- **Nits:** GM_INSTRUMENTS con nombres en español (Guitarra/Bajo/Trompeta/Fagot…) viola la regla "English Only" del README §8; `delete` redundantes `eqState[part][72]` + `['72']` (3 archivos); ~15 cláusulas OR muertas en la cascada de `getToneEnvPreset`; `parseInt` sin radix; `--blue-glow` sin usar; `.btn` declara `font-weight:600` dos veces; ramas "future-proof" muertas (ORCHESTRA/GAMelan/ERHU); markup colapsado en líneas de ~1200 chars; `html lang="es"` con UI en inglés; sin validación `MThd` al importar .mid local.

---

## ✅ Verificaciones que salen limpias

- **Datos crudos:** 764 tonos + 243 ritmos parseados con la lógica real del parser: **0 IDs duplicados, 0 huecos, 0 NaN, 0 líneas descartadas, 0 caracteres que rompan el HTML**. Formato idéntico al del parser.
- **eq.js datos:** los 540 presets tienen las 14 claves exactas, todos los valores enteros 0-127, sin ambientes faltantes en las 33 categorías.
- **MIDI:** ningún `sendCC` sale de 0-127; `0xB0 | CHANNEL[part]` usa canales 0-15 correctamente.
- **JSON:** `library/index.json` (10/10 entradas con meta+chords), `trainer/index.json` (15/15 meta), 25 `meta.json` — todos válidos y con paths existentes.
- **Referencias:** 0 scripts/CSS rotos en index.html; 0 IDs de DOM duplicados; balance de etiquetas correcto.
- **Colisiones de globales:** ninguna declaración duplicada entre los scripts que se cargan.

---

## 🗑️ Se puede borrar sin miedo (verificado: 0 referencias)

```
midi.js                              (huérfano desde v228, duplicado divergente de app.js)
append_css.js                        (no compila; su CSS ya está en style.css)
build_html.js                        (ya aplicado; ejecutarlo duplica index.html)
improve_ui.js                        (ya aplicado; ejecutarlo daña style.css)
remove_emojis.js                     (ya aplicado; index.html no tiene emojis)
tools/legacy/                        (44 scratch_*.js, 87 KB, ningún grep los referencia)
.gitignore líneas 4-20               (17 fix_*.js inexistentes + "," + ".OBSIDIANTEST")
.obsidian/ del tracking              (git rm -r --cached + añadir al ignore)
soundfont.sf2 del tracking           (git rm --cached; NO borrar del disco)
```
**Con precaución:** `bump.js` (arreglar MED-30 antes de conservar) y `trainer_midi/trainer_database.json` (posible fuente para generar los 15 `.mid` pendientes — **archivar, no borrar**).

## ➕ Faltan

1. `package.json` con `npm run check` (`node --check` de todos los JS) + `tools/validate_raw.js` (IDs, NaN, lsb, formato) + CI en GitHub Actions.
2. Los 15 `trainer/{id}/{id}.mid`, o índice con `available:false`.
3. README a v235 con el changelog v196-v235 (los mensajes de commit ya lo contienen).
4. Cache-busting unificado: `style.css?v235` y query en `raw_tones.js`/`raw_rhythms.js`/`spessasynth_processor.min.js` (raw_tones **sí cambió en v235** sin query → sirve catálogo viejo).
5. `.editorconfig` UTF-8 sin BOM para cerrar el mojibake.
6. Marca de estado en los docs antiguos (`> Estado en v235: ✅/⛔`) o archivarlos.

---

*Auditoría READ-ONLY: no se modificó ningún archivo del proyecto. Todos los números de línea corresponden a v235 (commit 7491c8d).*
