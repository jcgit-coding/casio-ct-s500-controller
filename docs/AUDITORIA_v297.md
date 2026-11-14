# Auditoría v297 — revisión estática + navegador (sin hardware)

> **Fecha:** 13 nov 2026 · **Versión:** v297 (`ff86523`) · **Alcance:** todos los módulos cargados (`eq`, `pitch`, `presets`, `app`, `harmony`, `library`, `trainer`), datos (`library/`, `trainer/`) e `index.html`/`style.css`.
> **Método:** análisis estático (IDs del DOM, globales duplicados, claves de `localStorage`, `fetch`, sintaxis) + pruebas reales en navegador con `midiOutput` interceptado. **No se probó contra el CT-S500**: todo lo que depende del hardware queda marcado como pendiente (§6 del plan).
> Las líneas citadas corresponden a v297.

---

## Resumen

| Severidad | Hallazgos |
|---|---|
| 🔴 Alto | A1 (XSS almacenado), A2 (preset no guarda ambiente), A3 (botón Import roto) |
| 🟠 Medio | M1 (tempo del Trainer ignorado), M2 (reconexión recarga tonos), M3 (override de EQ congela el perfil), M4 (dos tokens PAT), M5 (PC Synth no carga), M6 (Pitch/Wait del Trainer sin lógica) |
| 🟡 Bajo | B1 (rate limit GitHub en el badge), B2 (`mctrl-oct` placebo), B3 (`midi.js` muerto), B4 (binarios trackeados), B5 (README desfasado) |
| ⚪ Nits | N1 (`activeRhythmBadge`), N2 (autosave 1 s), N3 (`sendCC` sin clamp), N4 (reloj por `setInterval`) |

**Lo verificado y correcto está en §4.** Varios hallazgos de auditorías anteriores ya están **obsoletos** (§5).

---

## 1. 🔴 Alto

### A1 — XSS almacenado en Library (confirmado con PoC)

- **Archivos:** `library.js:625-628` (`hl()`), `library.js:642`, `library.js:650`, `library.js:515/598/649` (`onclick="...openSong('${s.id}')"`).
- **Evidencia:** `hl(txt)` solo escapa el *query* de búsqueda, no el texto; y el título/artista se interpolan en `innerHTML` sin escapar. Los `id` se inyectan dentro de un atributo `onclick` escapando solo `'`.
- **PoC ejecutado:** insertar una canción con `title: '<img src=x onerror="window.__xss=1">'` → al renderizar la lista, `window.__xss === 1`.
- **Impacto:** cualquier título/artista/`id` malicioso (import, sync de GitHub, `library/index.json`) ejecuta JS en el origen de la app. Combinado con B4/M4 (PAT en `localStorage`), permite robar el token.
- **Fix:** escapar `&<>"'` en `hl()` y en todos los `innerHTML` con datos; construir el `onclick` con `addEventListener` + `dataset.id`, nunca por concatenación.

### A2 — El preset no guarda el ambiente (`currentEnv`)

- **Archivos:** `presets.js:193-210` (objeto `data`), `presets.js:218-267` (`loadPreset`).
- **Evidencia:** `captureAndSavePreset` guarda `eqState`, `tuning`, transposes, categorías, tonos y filtros — **no** `currentEnv`. `loadPreset` tampoco lo restaura.
- **Consecuencia:** si guardas un preset en Hall y lo cargas estando en Studio, los CC del EQ son los de Hall pero el selector dice Studio; al cambiar de tono o ambiente, el perfil salta. El preset deja de ser reproducible.
- **Fix:** añadir `environment: currentEnv` al snapshot y `if (data.environment) setEnvironment(...)` al cargar (con migración: presets sin el campo se aplican tal cual).

### A3 — El botón Import de Library lanza excepción

- **Archivos:** `library.js:57` (listener), `library.js:160-163`.
- **Evidencia:** `importFromText()` lee `lib-song-title-input`, `lib-song-artist-input` y `lib-raw-text-input`; **esos IDs no existen** en `index.html` (0 coincidencias). Prueba: `TypeError: Cannot read properties of null (reading 'value')`.
- **Impacto:** `#lib-btn-import` está visible y no funciona (hallazgo `MED-17` de v235, aún abierto).
- **Fix:** o se añaden los 3 campos al formulario, o se elimina el botón/handler.

---

## 2. 🟠 Medio

### M1 — El tempo del Trainer se ignora antes de Play

- **Archivos:** `trainer.js:318` vs `trainer.js:321`, `trainer.js:344-348`.
- **Evidencia:** `_applySpeed()` se llama **antes** de `this.isPlaying = true`; dentro exige `if (this.midiSequencer && this.isPlaying)`. El tempo fijado antes de pulsar Play nunca se aplica.
- **Fix:** `this.isPlaying = true; this._applySpeed(); this.midiSequencer.play();`.

### M2 — La reconexión MIDI recarga los 3 tonos

- **Archivos:** `app.js:228` (`let _lastMidiOutputId`), `app.js:318` (única escritura).
- **Evidencia:** se escribe pero **nunca se lee**. Cada reconexión llama `pushAllToKeyboard(false)` → Program Change a las 3 partes (corta notas sostenidas). El comportamiento documentado en README §3 (“mismo puerto → solo CCs”) no existe (`HIGH-07` de v235).
- **Fix:** `const same = midiOutput.id === _lastMidiOutputId; pushAllToKeyboard(!same);`.

### M3 — Mover un fader congela el perfil completo del tono

- **Archivos:** `app.js:197-215` (`saveToneEQForPart`), `eq.js:989`.
- **Evidencia medida:** al mover solo CUTOFF de U2, el override guardado fue
  `{10:64, 71:64, 73:70, 74:101, 76:66, 77:66, 78:70, 91:44, 93:24, 94:14, 999:64}`
  — 11 CCs en vez de `{74: 101}`. (`MED-07` de v235.)
- **Impacto:** las mejoras futuras de `ROLES` no llegan a ese tono hasta pulsar Reset.
- **Fix:** guardar solo el diff contra `getToneEnvPreset()`.

### M4 — Dos claves distintas para el token de GitHub

- **Archivos:** `presets.js:14` (`casioGhToken`), `library.js:422` (`github_pat`).
- **Impacto:** el usuario pega el PAT dos veces; cada módulo ignora el del otro (`HIGH-09`).
- **Fix:** unificar con migración en ambos sentidos.

### M5 — El PC Synth no carga

- **Archivo:** `app.js:1336`.
- **Evidencia:** `import('https://esm.sh/spessasynth_lib@4.3.14')` → `SyntaxError: The requested module '/spessasynth_core?target=es2022' does not provide an export named 'KeyModifier'`.
- **Impacto:** el sintetizador interno queda inoperativo (fuera del foco actual, pero roto).
- **Fix:** fijar también la versión de `spessasynth_core` (o usar `?bundle`/versión que exporte `KeyModifier`) y verificar en consola.

### M6 — Pitch y Wait Mode del Trainer son estado muerto

- **Archivos:** `trainer.js:90-100` (`this.pitch` solo pinta la UI), `trainer.js:111-114` (`waitMode` solo cambia CSS).
- **Impacto:** dos controles visibles sin efecto (`HIGH-04`/`HIGH-05`).

---

## 3. 🟡 Bajo / ⚪ Nits

| ID | Hallazgo | Evidencia |
|---|---|---|
| B1 | Rate limit de GitHub en el badge | Cada carga hace `api.github.com/.../commits/main`; con 403 el badge no muestra fecha. Usar `raw.githubusercontent` o cachear. |
| B2 | `mctrl-oct` es placebo | `app.js:1445-1490`: `mctrlOct` se pinta pero no entra en ningún cálculo; OPCT del Mixer ya es global. |
| B3 | `midi.js` muerto pero trackeado | No está en `index.html`; duplicado divergente de `app.js` (`HIGH-21`). |
| B4 | `soundfont.sf2` (31 MB) y `presets.json` trackeados | `git ls-files` los lista pese a `.gitignore`; los presets quedarían públicos (`MED-34`). |
| B5 | README en v288 | 9 versiones de retraso (`L8`). |
| N1 | `activeRhythmBadge` inexistente | `app.js:1110` lo busca con guarda: código muerto. |
| N2 | Autosave cada 1 s | `saveAppState` sin dirty-flag → ~86 400 escrituras/día. |
| N3 | `sendCC` no valida 0-127 | Confía en los llamadores. |
| N4 | Reloj MIDI por `setInterval` | Medido: 50 pulsos/s a 121 BPM (±3 %). En pestaña en segundo plano colapsa (~1 s). Usar `AudioContext`/worker. |
| — | `syncPull` sin caché | Una llamada a la API por carga; con 403 cae a local correctamente. |

---

## 4. ✅ Verificado correcto (navegador real)

| Área | Resultado |
|---|---|
| Carga de la app | 7 vistas renderizan, sin errores JS propios (solo `AudioWorklet` y permiso MIDI del entorno) |
| Sintaxis | `node --check` OK en los 9 JS de raíz |
| IDs del DOM | 186 IDs, **0 duplicados**; 0 globales duplicados entre scripts |
| **Pitch (v297)** | `SELFTEST 8/8`; connect / cambio de tono / PC del teclado / `CC121` / preset / estado legacy → **mismo valor en canales 0,1,2** |
| Persistencia | `oct -1 / trn +3 / sustain U2 ON` sobrevive recarga; UI y valor RPN coinciden |
| Cambio de tono | PC + 55 CC + RPN correctos; `currentTone` y UI sincronizados |
| Faders EQ | Escriben `eqState` de la parte activa y envían al canal correcto; Reset re-aplica 18 CC |
| Sustain | ON → CC72=100 ×3; OFF → CC72=64 + CC64=0; CC72 entrante **no** contamina `eqState`; CC64 físico se espeja a las 3 partes |
| Teclado virtual | Note-off usa el canal y la nota originales (HIGH-01 corregido) |
| Reloj MIDI | 50 mensajes `F8`/s a 121 BPM |
| Library | 3937 canciones; abrir canción OK; acentos UTF-8 correctos; transpose de canción **no** toca el del Mixer |
| `ROLES` | `MELLOW E.PIANO`→`ep`, `MELLOW/BRIGHT STRINGS`→`strings_ens`, `SYNTH STRINGS`→pad, `BRIGHTNESS`→pad: sin secuestros por substring |
| Datos | `trainer/index.json` 15/15 meta OK; muestra de 25 canciones con sus `versions[].file` existentes |
| Ambientes | Studio/Live/Hall/Jazz generan perfiles distintos (reverb 22/16/52/28) |

---

## 5. Hallazgos anteriores que ya son obsoletos

| Hallazgo viejo | Estado en v297 |
|---|---|
| `HIGH-14`, `HIGH-15`, `MED-08`, `MED-09`, `MED-10`, `MED-31`, `V7` (cascada de substrings) | **Obsoleto**: el resolver es exacto (`TONE_ROLE[nombre] \|\| CAT_ROLE[cat]`). Verificado con 8 tonos. |
| `CRIT-04` (doble `initMIDI`) | Corregido: `midiInitAttempted` cubre badge y botón. |
| `HIGH-01` (`noteOff` del VK) | Corregido: guarda `{ch, shiftedNote}`. |
| CC102/103/104 y CC95 | Eliminados de `eq.js` (verificado en código). |
| `.gitignore`, `fix_*.js`, `repertorio.js`, `.OBSIDIANTEST` | Resueltos. |
| `V3`/`V4` (sustain tras ráfagas) | Mitigado/corregido en v294 (CC64 espejado, `resetEQ` re-asegura). |

---

## 6. Orden recomendado

1. **A1 (XSS)** — único hallazgo de seguridad explotable.
2. **A3 (Import roto)** y **A2 (preset sin ambiente)** — features visibles.
3. **M2 (reconexión)** y **M4 (token único)** — afectan uso en vivo.
4. **M1/M6 (Trainer)** cuando existan los `.mid`.
5. **M3 (diff de overrides)** y **M5 (versión de SpessaSynth)**.
6. Limpieza B3/B4 y README.
