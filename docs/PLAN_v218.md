# Auditoría General — v218

> **Versión auditada:** `app.js?v217`, `eq.js?v217`, `midi.js?v217`, `presets.js?v217`, `fix_swap.js?v216`, `harmony.js?v216`, `trainer.js` (sin versión), `index.html`, `raw_tones.js`, `raw_rhythms.js`
> **Fecha:** 2026-10-11 (COT) · **Alcance:** verificación completa del estado del proyecto tras el sprint Items A/B/C de v218.
> **No duplica:** [`AUDITORIA_MIXER_v180.md`](AUDITORIA_MIXER_v180.md) ni [`AUDITORIA_v190.md`](AUDITORIA_v190.md) — los hallazgos previos que siguen abiertos se retoman en la sección *Verificación de hallazgos previos*.
> Las líneas citadas corresponden al árbol de trabajo de v218 tal como existe en disco hoy. Sin cambios de código en este informe.

---

## Resumen ejecutivo

Este sprint marcó los tres ítems del plan como "completos". La auditoría revela que **Item B está incompleto** (0 archivos `.mid` existen), que el **Motor EQ del Mixer es funcionalmente placebo** sobre el hardware CT-S500 (y sobre SpessaSynth), y que varios hallazgos de auditorías previas siguen abiertos. Los problemas de sustain son reales pero menos graves que lo descrito en v190 gracias al mecanismo `SUSTAIN_TAPS`.

| Severidad | Cantidad | IDs |
|---|---|---|
| 🔴 Crítico | 1 | V1 |
| 🟠 Alto | 3 | V2, V3, V4 |
| 🟡 Medio | 7 | V5 – V11 |
| ⚪ Bajo / deuda técnica | 6 | V12 – V17 |

---

## Respuestas directas a las 4 preguntas

### P1 — ¿Por qué el sustain "a veces no funciona"?

El botón SUSTAIN no usa CC64 (damper) sino CC72 (Release Time) con valor `SUS_RELEASE=110` (`app.js:15`). Al activarlo envía CC72=110 a las 3 partes; al desactivarlo, envía `RELEASE_NEUTRAL=64` o el `CAT_RELEASE_NEUTRAL` de esa categoría. El problema es que cualquier `applySmartProfile` — llamado al cambiar timbre, cambiar ambiente, o reconectar MIDI — envía entre 18 y 21 CCs por parte, borrando CC72. El mecanismo de recuperación (`SUSTAIN_TAPS = [150, 400, 700, 1300]` ms, `app.js:21`) programa 4 re-envíos de CC72 tras cada ráfaga, pero **si el usuario hace algo dentro de los 1.3 s siguientes** (otro cambio de timbre, p. ej.), la ráfaga nueva cancela los taps restantes y el CC72 nunca llega. Además `resetEQ()` no re-asegura el sustain tras el reset.

### P2 — ¿Los defaults de búsqueda ("foto") persisten correctamente?

Existen en `app.js:416–427`: U1→`'Piano'`, U2→`'Pad'`, L→`'String'`. Tienen la **menor** precedencia de 3 capas: primero se restaura `localStorage.searchPreset_<part>`, si no existe se aplica el default. El problema es que `localStorage.searchPreset_<part>` se escribe en cada evento `input` del campo de búsqueda (`app.js:429–444`), de modo que tras la primera sesión el default queda congelado permanentemente. Para que volvieran a funcionar habría que borrar manualmente los valores del localStorage. Adicionalmente, el fix `e01c969` (priorizar categoría) fue revertido en v214 y no se reintrodujo.

### P3 — ¿Son BODY/AIR/TRAIL controles distintos de LOWS/HIGHS/DECAY?

**No.** Son alias del mismo CC:

| Sección UI | Label | CC | Sección UI | Label |
|---|---|---|---|---|
| Master EQ (§2) | LOWS | CC104 | DSP & Acoustic (§5) | BODY |
| Master EQ (§2) | HIGHS | CC102 | DSP & Acoustic (§5) | AIR |
| Envelope (§4) | DECAY | CC75 | DSP & Acoustic (§5) | TRAIL |

`eq.js:38–40` define los 3 duplicados. `applySmartProfile` itera sobre `EQ_CONTROLS` (aplanamiento de todas las secciones), por lo que envía CC104, CC102 y CC75 **dos veces** cada vez que aplica un perfil: una por la sección EQ y otra por la sección DSP. En total son 21 envíos pero solo 18 CCs únicos por parte. Los dos sliders de cada par comparten el mismo estado implícito (el último en llegar gana) y no están sincronizados visualmente entre sí.

### P4 — ¿Qué es el Active DSP real del CT-S500 y la app lo controla?

El manual CT-S500 describe dos sistemas distintos:
- **Equalizer** (EN-96): ajuste de 3 bandas (Low/Mid/High), controlable desde el panel del teclado.
- **Active DSP** (EN-98–EN-105): efectos de timbre seleccionables por tipo (Reverb, Chorus, Delay, Flanger, etc.) con parámetros propios por timbre, controlados vía **SysEx Casio** (sección 13.3 del MIDI Implementation).

La app envía CC102/103/104 etiquetados como EQ y CC95 como "DSP Drive". Estos CCs **no aparecen en el MIDI Implementation oficial del CT-S500** como controles del Equalizer ni del Active DSP (`eq.js:11–12`: *"unverified against CT-S500 MIDI Implementation PDF"*). Son CCs de la especificación GM/GS extendida pensados para sintetizadores de sobremesa (CC74=Brightness/Cutoff, CC71=Resonance, etc.) que el CT-S500 **puede o no** responder dependiendo del timbre y del modo. Los efectos reales del Active DSP solo son accesibles por SysEx y la app no los implementa. El Motor EQ del Mixer es, en la práctica, **placebo** sobre el hardware. Sobre SpessaSynth (PC Synth), los CCs son ignorados si el soundfont no responde a ellos.

---

## 🔴 Críticos

### V1 — Item B incompleto: 0 archivos `.mid` en `trainer/` — el Trainer nunca carga piezas

- **Archivos:** `trainer/` (15 subdirectorios), `trainer.js:239–250`
- **Evidencia:** verificado en disco — cada subdirectorio contiene únicamente `meta.json` (~120 bytes). No existe ningún archivo `.mid` en toda la carpeta `trainer/` ni en `trainer_midi/` (que contiene solo `trainer_database.json`).
- **Reproducción:** abrir la vista Trainer → seleccionar cualquier pieza → `trainer.js:242` hace `fetch('trainer/{id}/{id}.mid')` → respuesta 404 → siempre muestra *"No MIDI file for this piece. Import a .mid file with the button above."* El usuario nunca puede usar el Trainer sin importar manualmente.
- **Impacto:** la funcionalidad principal del Trainer está inoperativa en todas las piezas incluidas. El sprint v218 reportó Item B como completo, pero solo se entregó la UI/integración sin los datos.
- **Fix:** generar/incluir los 15 archivos `.mid` correspondientes en `trainer/{id}/{id}.mid`, o ajustar `meta.json` para que apunten a una URL externa.

---

## 🟠 Altos

### V2 — Motor EQ es placebo sobre el CT-S500: CCs 102/103/104/95 no verificados

- **Archivos:** `eq.js:11–12` (comentario), `eq.js:38–40` (definición), documentación CT-S500
- **Evidencia:** el comentario en `eq.js:11–12` lo admite explícitamente: *"CC102/103/104 are Casio AiX proprietary — not in the GM spec. Behavior observed as EQ shelves; unverified against CT-S500 MIDI Implementation PDF."* El MIDI Implementation oficial del CT-S500 no lista estos CCs como controles del Equalizer. El Active DSP real requiere SysEx.
- **Impacto:** el usuario mueve los sliders de EQ (LOWS/MIDS/HIGHS/BODY/AIR/TRAIL/DSP) creyendo que modifica el sonido del teclado, cuando el hardware posiblemente los ignora por completo. Ninguno de los 132 perfiles de `TONE_ENV_MATRIX` tiene efecto acústico verificado sobre el CT-S500.
- **Fix a largo plazo:** implementar SysEx para el Active DSP según el MIDI Implementation sección 13.3; o documentar explícitamente en la UI que el EQ opera solo sobre el PC Synth.

### V3 — `SUSTAIN_TAPS` no recupera CC72 si el usuario actúa dentro de 1.3 s

- **Archivos:** `app.js:21`, `app.js:304–359`
- **Reproducción:** SUSTAIN ON → cambiar timbre (→ `applySmartProfile` cancela taps anteriores y programa 4 nuevos) → dentro de 1.3 s cambiar timbre de nuevo → los 4 taps de la primera ráfaga se cancelaron y los 4 de la segunda no han disparado todavía → CC72 = 64 (neutral), sustain perdido sin feedback al usuario.
- **Impacto:** en uso en vivo, cambiar timbres rápido con sustain ON causa pérdida silenciosa del efecto.
- **Fix:** en lugar de cancelar taps anteriores con `clearTimeout`, acumularlos o usar un único timer que se resetee pero mantenga el valor objetivo.

### V4 — `resetEQ()` no re-asegura CC72 tras el reset

- **Archivos:** `app.js:266` (botón reset), búsqueda de `resetEQ` en `app.js`
- **Evidencia:** `resetEQ()` llama `applySmartProfile` para las 3 partes; `applySmartProfile` explícitamente elimina CC72 del estado (`eq.js:811–812`) y solo lo re-envía si `tuning[part].sus` es `true` al final de la función (`eq.js:839–841`). Si `sus=true` pero el usuario acaba de presionar Reset, el CC72 se re-envía — esto es correcto. Sin embargo, si el `SUSTAIN_TAPS` estaba pendiente de una ráfaga anterior, el reset lo cancela (`clearTimeout`) sin reagendar nuevos taps, dejando posiblemente CC72 en el valor erróneo.
- **Impacto:** edge case audible: reset con sustain ON durante los 1.3 s de post-cambio-de-timbre puede silenciar el sustain.

---

## 🟡 Medios

### V5 — Sliders BODY/AIR/TRAIL y LOWS/HIGHS/DECAY no sincronizados visualmente

- **Archivos:** `eq.js:38–40` (duplicados), `eq.js:781–842` (applySmartProfile)
- **Evidencia:** los 3 pares comparten CC pero son sliders independientes en la UI. Mover LOWS no actualiza BODY visualmente, aunque ambos envían CC104. Al cargar un perfil, `applySmartProfile` actualiza el slider que renderiza la sección §2 pero puede no actualizar el de §5 (o viceversa, dependiendo del orden de `EQ_CONTROLS`).
- **Impacto:** UI engañosa — el usuario ve valores diferentes para el mismo parámetro real.

### V6 — Cache-busting inconsistente: `fix_swap.js?v216`, `harmony.js?v216` vs core `?v217`; `library.js`, `trainer.js` sin versión

- **Archivo:** `index.html:870–873`
- **Evidencia:**
  ```
  fix_swap.js?v216    ← un commit atrás
  harmony.js?v216     ← un commit atrás
  library.js          ← sin versión
  trainer.js          ← sin versión
  raw_tones.js        ← sin versión
  raw_rhythms.js      ← sin versión
  ```
- **Impacto:** cambios en `library.js` o `trainer.js` no invalidan la caché del navegador; cambios en `harmony.js` o `fix_swap.js` en v218 serán servidos desde caché como v216.

### V7 — Lógica redundante en `getToneEnvPreset` línea 356 (doble negación)

- **Archivo:** `eq.js:356`
- **Evidencia:** `(name.includes('POP PIANO') && !name.includes('POP PIANO') === false)` simplifica a `name.includes('POP PIANO')`, pero la condición BRIGHT/ROCK PIANO/POP PIANO en `eq.js:304` aparece antes, por lo que esta rama nunca captura 'POP PIANO' en primer lugar. La condición extra es dead code confuso.
- **Impacto:** bajo (no causa bug audible), pero oscurece la intención y puede causar regresiones al editar.

### V8 — `fix_swap.js` cargado en producción — es un parche, no parte del diseño

- **Archivo:** `index.html:870`, `fix_swap.js` (3,675 bytes)
- **Evidencia:** 15 archivos `fix_*.js` en la raíz (todos ~Oct 4, ninguno actualizado en v210+). Solo `fix_swap.js` se carga en `index.html`. Su lógica de swap de partes debería estar integrada en `app.js`.
- **Impacto:** deuda técnica activa; si la lógica de swap de `app.js` cambia, `fix_swap.js` puede quedar desincronizado silenciosamente.

### V9 — Defaults de búsqueda congelados tras la primera sesión (ver P2)

- **Archivo:** `app.js:416–444`
- **Evidencia:** ver respuesta P2. El default `U2='Pad'` solo se aplica si `localStorage.searchPreset_U2` no existe. Tras un cambio de filtro, ese valor se escribe y los defaults nunca vuelven a usarse.
- **Impacto:** UX: tras sesión inicial, los defaults de la "foto" no se aplican aunque el usuario espere que lo hagan.

### V10 — Mojibake en `app.js`: caracteres UTF-8 corruptos

- **Archivos:** `app.js`, `eq.js`
- **Evidencia:** el grep del explorador reportó `â€"` (U+2014 EM DASH corrupto) y otros artefactos de doble-encoding. Ocurre cuando el archivo fue guardado en UTF-8 sin BOM y leído/procesado como Latin-1 en algún punto del workflow.
- **Impacto:** comentarios ilegibles; posiblemente afecte strings de UI si algún literal con tildes/guiones largos quedó corrupto.

### V11 — Identificadores y valores de ambiente en español (`Estudio`, `Vivo`, `Sala`)

- **Archivos:** `eq.js:75` (`currentEnv = 'Estudio'`), `index.html:256–259` (option values), `TONE_ENV_MATRIX` keys, `eq.js:62` (tooltip `'Rueda de MODULATION'`)
- **Evidencia:**
  - Clave de estado: `currentEnv` se inicializa con la cadena `'Estudio'`
  - `option value="Estudio"`, `"Vivo"`, `"Sala"` (index.html) — son identificadores de datos, no labels de UI
  - `TONE_ENV_MATRIX` usa `'Estudio'/'Vivo'/'Sala'/'Jazz'` como claves internas
  - Tooltip en `eq.js:62`: `'Rueda de MODULATION'` (español explícito en UI)
  - Comentario en `eq.js:77` en español
- **Impacto:** rompe la regla de inglés del proyecto; las claves de ambiente en español crean dependencias ocultas (cualquier comparación de strings fallaría si se cambian a inglés sin actualizar todas las ramas).

---

## ⚪ Bajo / deuda técnica

### V12 — Sin `.gitignore`: `soundfont.sf2` (30.8 MB) y `node_modules/` sin protección

- **Evidencia:** no existe `.gitignore` en la raíz. `soundfont.sf2` es 30.8 MB (binario) y podría committerse accidentalmente.
- **Archivo afectado:** raíz del repositorio

### V13 — 15 archivos `fix_*.js` muertos en la raíz (excepto `fix_swap.js`)

- **Evidencia:** `fix_android_input.js`, `fix_app_accents.js`, `fix_app_properly.js`, `fix_app_safely.js`, `fix_eq_faders.js`, `fix_html.js`, `fix_light_faders.js`, `fix_light_mode.js`, `fix_midi.js`, `fix_mobile.js`, `fix_mobile2.js`, `fix_mobile3.js`, `fix_mobile_audio.js`, `fix_scroll.js`, `fix_sf2_slider.js` — todos del 4/Oct, ninguno cargado en `index.html`.
- **Impacto:** contaminan el árbol de trabajo, confunden el grep y el historial.

### V14 — Archivos de artefactos de herramientas en la raíz

- `,` (cero bytes, nombre es solo una coma) — probablemente accidente de teclado
- `.OBSIDIANTEST` (cero bytes) + directorio `.obsidian/` — artefacto de abrir el proyecto en Obsidian

### V15 — `repertorio.js` en la raíz no se carga en `index.html`

- **Evidencia:** `repertorio.js` (6,387 bytes, Oct 11 — reciente) no aparece en ningún `<script>` tag de `index.html`.
- **Impacto:** si contiene funcionalidad nueva, está inactiva; si es legacy, debería eliminarse.

### V16 — README.md documenta `ENVIRONMENTS` que ya no existe (referencia a v195)

- **Evidencia:** `README.md` (15,981 bytes, Oct 9) menciona el objeto `ENVIRONMENTS` como si fuera la fuente de verdad de los ambientes. El código actual usa `TONE_ENV_MATRIX` con 33 categorías × 4 ambientes; `ENVIRONMENTS` fue eliminado en versiones anteriores.
- **Impacto:** documentación engañosa.

### V17 — Clave GitHub PAT y posible clave Gemini en `localStorage`

- **Evidencia:** `presets.js:3–5` muestra constantes `GH_OWNER/GH_REPO/GH_FILE` para sincronización con GitHub. Si el flujo de sync almacena el PAT en `localStorage` (patrón común en esta app), la clave queda accesible en la consola del navegador y en cualquier JS del origen.
- **Impacto:** riesgo de seguridad si el usuario tiene el PAT guardado en localStorage en un dispositivo compartido.
- **Nota:** no se accedió a `localStorage` en esta auditoría; verificar manualmente en consola: `Object.keys(localStorage).filter(k => k.includes('token') || k.includes('key') || k.includes('pat'))`.

---

## Verificación de hallazgos previos

| ID previo | Descripción | Estado en v218 |
|---|---|---|
| MED-06 (v180) | CC102/103/104 sin verificar vs MIDI Implementation | 🔴 **Abierto** → ahora es V2 (Alto) |
| MED-09 (v180) | EQ placebo sobre hardware | 🔴 **Abierto** → ahora es V2 (Alto) |
| A8 (v190) | Sliders write-only / PAN reset en cada perfil | 🟡 **Parcialmente abierto** → V5 (sinc. visual de duplicados) |
| A14 (v190) | Sustain perdido en flujos de ráfaga | 🟡 **Parcialmente cerrado** — `SUSTAIN_TAPS` mitiga pero no elimina (V3) |
| A3 (v190) | VK ignora globalTranspose en PC Synth | ❓ **No verificado** en esta auditoría — requiere test manual |

---

## Anexo A — Tabla de CCs del Mixer vs CT-S500

| CC | Label en app | Estándar GM | ¿CT-S500 responde? | Fuente |
|---|---|---|---|---|
| CC7 | Volume | GM Volume | ✅ Sí | GM spec |
| CC10 | Panning | GM Pan | ✅ Sí | GM spec |
| CC11 | Expression | GM Expression | ✅ Sí | GM spec |
| CC64 | Damper (pedal físico) | GM Sustain Pedal | ✅ Sí | GM spec |
| CC1 | Modulation Wheel | GM Mod Wheel | ✅ Sí | GM spec |
| CC65 | Portamento SW | GM Portamento On | ✅ Sí | GM spec |
| CC5 | Portamento Time | GM Portamento Time | ✅ Sí | GM spec |
| CC66 | Sostenuto | GM Sostenuto | ✅ Sí | GM spec |
| CC67 | Soft Pedal | GM Soft Pedal | ✅ Sí | GM spec |
| CC91 | Reverb | GM Reverb Send | ✅ Sí (nivel) | GM spec |
| CC93 | Chorus | GM Chorus Send | ✅ Sí (nivel) | GM spec |
| CC74 | Cutoff/Brightness | GM Brightness (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC71 | Resonance | GM Resonance (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC73 | Attack | GM Attack Time (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC75 | Decay / Trail | GM Decay Time (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC72 | Release / Sustain app | GM Release Time (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC76 | Vib Rate | GM Vib Rate (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC77 | Vib Depth | GM Vib Depth (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC78 | Vib Delay | GM Vib Delay (some impl.) | ⚠️ Depende del timbre | GM Level 2 |
| CC94 | Echo/Detune | No estándar GM | ❌ Sin verificar | Sin referencia |
| CC95 | DSP Drive | No estándar GM | ❌ Sin verificar | Sin referencia |
| CC102 | Highs / Air | No estándar GM (Casio AiX) | ❌ Sin verificar | `eq.js:11–12` |
| CC103 | Mids | No estándar GM (Casio AiX) | ❌ Sin verificar | `eq.js:11–12` |
| CC104 | Lows / Body | No estándar GM (Casio AiX) | ❌ Sin verificar | `eq.js:11–12` |

**Active DSP real (teclado):** controlado por SysEx Casio, sección 13.3 del MIDI Implementation. No implementado en la app.

---

## Anexo B — Cobertura de presets de `getToneEnvPreset`

| Nivel | Descripción | Cubierto |
|---|---|---|
| 1. Nombre específico (signature) | 66 bloques `if (name.includes(...))` en `eq.js:304–760` | ✅ 66 familias named |
| 2. Categoría exacta (`TONE_ENV_MATRIX`) | 33 categorías del CT-S500 en `eq.js:89–292` | ✅ 33 categorías |
| 3. Categoría normalizada | Fuzzy match en `eq.js:767–772` | ✅ Fallback parcial |
| 4. Fallback acústico | Curvas no planas genéricas en `eq.js:774–778` | ✅ Último recurso |

**Bug confirmado (`eq.js:356`):** la condición `!name.includes('POP PIANO') === false` es una doble negación que equivale a `name.includes('POP PIANO')`. Como el bloque BRIGHT/POP PIANO en línea 304 precede a este bloque, no hay captura errónea de 'POP PIANO' en la práctica, pero la condición es dead code confuso.

---

## Anexo C — Inventario de violaciones de la regla de inglés

| Archivo | Línea | Tipo | Contenido |
|---|---|---|---|
| `eq.js` | 62 | Tooltip UI | `tip: 'Rueda de MODULATION'` |
| `eq.js` | 75 | Identificador de estado | `let currentEnv = 'Estudio'` |
| `eq.js` | 77 | Comentario de código | `// CC72 (Release) eliminado del EQ — el teclado lo maneja internamente por instrumento` |
| `eq.js` | 89–292 | Claves de objeto (TONE_ENV_MATRIX) | `'Estudio'`, `'Vivo'`, `'Sala'` × 33 categorías |
| `index.html` | 256–259 | Atributos `value` de `<option>` | `"Estudio"`, `"Vivo"`, `"Sala"` |
| `app.js` | varios | Mojibake | `â€"` y otros artefactos de double-encoding |

**Alcance real:** las violaciones son estructurales (las claves de ambiente `Estudio/Vivo/Sala` están en decenas de comparaciones de strings a lo largo de `eq.js` y `app.js`) — un cambio a inglés requiere un rename global coordinado.

---

## Anexo D — Checklist de pruebas manuales sobre el teclado

Para confirmar hipótesis de hardware (CT-S500 conectado por USB-MIDI):

- [ ] **CC104:** mover slider LOWS de 0 a 127 — ¿cambia el sonido en Piano y en EDM Synth?
- [ ] **CC102:** ídem para HIGHS — ¿hay diferencia audible?
- [ ] **CC103:** ídem para MIDS
- [ ] **CC95:** slider DSP Drive a 127 — ¿distorsión o efecto?
- [ ] **CC94:** slider ECHO de 0 a 127 — ¿detuning/eco audible?
- [ ] **CC72:** mover slider de 0 a 127 con una nota sostenida — ¿la nota decae más lento?
- [ ] **SUSTAIN ON + cambio de timbre rápido (< 1 s):** ¿el sustain permanece tras el cambio?
- [ ] **SUSTAIN ON + Reset EQ:** ¿el sustain permanece o se pierde?
- [ ] **Trainer:** seleccionar cualquier pieza — ¿aparece "No MIDI file" siempre?

---

## Recomendaciones priorizadas

| Prioridad | Acción | Archivos |
|---|---|---|
| 1 | Agregar archivos `.mid` al Trainer (o documentar que son de importación manual) | `trainer/` |
| 2 | Documentar en la UI que el EQ opera sobre PC Synth, no sobre el hardware CT-S500 | `index.html` |
| 3 | Unificar `fix_swap.js` en `app.js` y eliminar el archivo parche | `app.js`, `index.html` |
| 4 | Corregir `SUSTAIN_TAPS` para acumular en vez de cancelar, y añadir re-aseguro en `resetEQ()` | `app.js` |
| 5 | Sincronizar visualmente los pares LOWS↔BODY, HIGHS↔AIR, DECAY↔TRAIL (o eliminar la sección DSP) | `eq.js`, `index.html` |
| 6 | Añadir `.gitignore` (excluir `soundfont.sf2`, `node_modules/`, `fix_*.js`, `presets.json`) | raíz |
| 7 | Actualizar cache-busting de todos los scripts a `?v218` | `index.html` |
| 8 | Limpiar archivos muertos (`fix_*.js` inactivos, `,`, `.OBSIDIANTEST`, `repertorio.js` si es legacy) | raíz |
| 9 | Migrar claves de ambiente de español a inglés (`Studio/Live/Hall/Jazz`) — cambio coordinado | `eq.js`, `app.js`, `index.html` |
| 10 | Evaluar SysEx para Active DSP si se quiere EQ real sobre el CT-S500 | nuevo módulo |
