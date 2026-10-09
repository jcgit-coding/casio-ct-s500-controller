# Auditoría General — v190

> **Versión auditada:** `app.js?v190`, `index.html`, `fix_swap.js?v187`, `harmony.js?v187`, `raw_tones.js`, `style.css?v187`
> **Fecha:** 2026-10-04 (COT) · **Alcance:** bugs ocultos pendientes y mejoras propuestas.
> **No duplica:** [`MIXER_AUDIT.md`](../MIXER_AUDIT.md) (v170) ni [`AUDITORIA_MIXER_v180.md`](AUDITORIA_MIXER_v180.md) — los hallazgos de esas auditorías solo se retocan aquí cuando se reincidieron o cuando su fix quedó incompleto (sección *Verificación de hallazgos previos*).
> Las líneas citadas corresponden al árbol de trabajo de v190 **antes** de aplicar los fixes propuestos, salvo **A1** (corregido en esta misma versión) y **A15** (corregido junto con la publicación de este informe).

## Resumen ejecutivo

| Severidad | Cantidad | IDs |
|---|---|---|
| 🔴 Crítico | 1 | A1 |
| 🟠 Alto | 2 | A2, A3 |
| 🟡 Medio | 8 | A4 – A11 |
| ⚪ Bajo / deuda técnica | 4 | A12 – A15 |

El hallazgo dominante es **A1**: `pushAllToKeyboard(true)` — la ruta que se ejecuta en cada `statechange` de puerto MIDI — dispara 81 CC en un solo tick **sin** `resyncAllSustain()`. Es el mismo síntoma que v186–v190 vinieron a cerrar, y quedó fuera del `if (!skipTones)`. Los tres siguientes (A3, A10, A6) son bugs audibles/de arranque con fixes de 2-6 líneas cada uno.

---

## 🔴 Críticos

### A1 — `pushAllToKeyboard(true)` lanza 81 CC sin `resyncAllSustain()` y pierde el sustain de U1/U2

- **Estado:** ✅ **corregido en v190** — `resyncAllSustain()` pasó a ser incondicional en `pushAllToKeyboard` (fuera del `if (!skipTones)`).
- **Archivo:** `app.js:1878-1899`; llamadas en `app.js:415` y `app.js:2007`
- **Reproducción:**
  1. El usuario activa SUSTAIN → `tuning[part].sus` y CC72 a las 3 partes.
  2. Aparece/desaparece un puerto MIDI o cambia `connection` (segundo dispositivo, parpadeo del WU-BT10, reconexión Bluetooth) → `statechange` → `reconnectMIDI()` debounced (`app.js:398-423`).
  3. El id del output **no** cambió → rama `else` → `pushAllToKeyboard(true)` (`app.js:415`).
  4. `skipTones=true` → el `setTimeout(..., 0)` de `1887-1895` corre en un tick: 21 CC de `EQ_CONTROLS` + 5 CC de RPN Coarse Tuning + 1 CC72, por cada una de las 3 partes = **81 mensajes**; el CC72 de U1 queda en la posición 22 y el de U2 en la 49.
  5. `resyncAllSustain()` queda dentro de `if (!skipTones)` → **no se ejecuta**.
  6. Con el umbral documentado de ~17-18 CC por canal (`app.js:17-21`), el reset de controladores borra los CC72 de U1 y U2; solo sobrevive el de L (último de la ráfaga).
- **Impacto:** botón SUSTAIN en ON y hardware sin sustain en 2 de 3 partes, en silencio y en pleno tema. Es exactamente el síntoma reportado para v190.
- **Fix:** llamar `resyncAllSustain()` **siempre**, dentro/después del mismo `setTimeout` para que salga tras la ráfaga.
- **¿Duplica un hallazgo previo?** Sí → el hueco que dejó el fix de **CRIT-03**.

---

## 🟠 Altos

### A2 — `readPresetsStore` destruye la biblioteca ante JSON inválido y `syncPush` publica la tienda reducida

- **Archivo:** `app.js:1652-1655` (quita la clave en el `catch`), `app.js:1591-1595`, `app.js:1441-1477`
- **Reproducción:** `localStorage.casioPresets` contiene JSON corrupto → cualquier operación llama `readPresetsStore()` → el `catch` hace `removeItem("casioPresets")` y devuelve `{}` → el usuario crea un preset → `captureAndSavePreset` escribe `{"SoloEste": …}` y llama `syncPush()` → `ghFileSha` ya está cacheado (no hace pull) → el PUT sube 1 solo preset → `presets.json` en GitHub queda reducido a ese preset. El PUT no valida nada de lo que sube.
- **Impacto:** pérdida de datos local **y** en la nube, con precondición rara pero con código destructivo y sin validación.
- **Fix:** en el `catch` respaldar a `casioPresets.corrupt-<timestamp>` (o devolver `{}` sin borrar); en `_syncPushOnce` abortar con aviso si la tienda local tiene >50 % menos claves que la última leída.
- **¿Duplica un hallazgo previo?** No (CRIT-01/02 tocaron codificación y merge, no el parser destructivo).

### A3 — El teclado virtual → PC Synth ignora `globalTranspose`/`globalOctave`

- **Archivo:** `app.js:2308-2321` (nota cruda en `2315` y `2319`) vs `app.js:446-454` (hook de hardware con `shift = globalTranspose + globalOctave*12`) y `app.js:1854-1865` (`sendCoarseTuning` manda ese desplazamiento al Casio por RPN)
- **Reproducción:** con `INTERNAL SF2: ON` + `EXT MIDI: ON` y `globalOctave = -1` (default, `app.js:127`):
  - tecla **física** → `getNote` aplica `shift = -12` → Casio toca `n-12` y `pcSynth.noteOn(n-12)` → coinciden ✓
  - tecla del **VK** → `midiOutput.send(n)` (el Casio transpone por RPN → `n-12`) y `pcSynth.noteOn(n)` sin shift → **12 semitones de diferencia** (con transpose en +5, la diferencia es el intervalo fijado).
- **Impacto:** dos motores desafinados entre sí en una configuración normal — fallo audible inmediato.
- **Fix:** aplicar el mismo `const shift = globalTranspose + globalOctave * 12` en `vkNoteOn` antes de `pcSynth.noteOn(midiNote + shift)` (y coherencia en `vkNoteOff`, que hoy usa la nota guardada en `vkActiveKeys`).
- **¿Duplica un hallazgo previo?** No (MED-08 trataba notas colgadas y etiquetas, no afinación).

---

## 🟡 Medios

### A4 — Los faders VOL/RVB de MIDI CTRL escriben al hardware sin pasar por `eqState`

- **Archivo:** `app.js:2170-2179` (VOL) y `app.js:2181-2191` (RVB); contraste con `app.js:583` (`REVERB def:40`) vs `index.html:485/512/539` (`value="20"`)
- **Qué pasa:** el handler envía `CC7`/`CC91` y actualiza su propio `-val`, pero **nunca** escribe `eqState[part][cc]` → `pushAllToKeyboard` (`app.js:1889-1891`), `applySmartProfile` (`app.js:811-814`) y `switchEQ` (`app.js:1006-1022`) reenvían/repintan el valor viejo. RVB arranca con 20 en el rack y 40 en el panel EQ.
- **Impacto:** el valor del rack se revierte sin aviso en la próxima reconexión o cambio de tono; dos paneles mienten sobre el mismo CC.
- **Fix:** `eqState[part][cc] = v; saveToneEQForPart(part);` en ambos handlers y refrescar el fader equivalente del panel EQ (o convertirlos en vistas de `eqState`).
- **¿Duplica un hallazgo previo?** No (MED-05 era el tope 75/100, ya corregido).

### A5 — Un CC7 entrante mueve el fader de Volume pero no actualiza `eqState`

- **Archivo:** `app.js:483` (`if (d1 !== 7)` excluye el estado) vs `app.js:486-504` (el bloque de UI no excluye CC7)
- **Qué pasa:** llega un CC7 del panel → `eqState[part][7]` se queda en Part Mix (100/75/100) pero el fader se pinta con `d2` → `saveAppState` persiste el valor viejo → al cambiar de tono/ambiente/reconectar, `pushAllToKeyboard` reenvía el valor viejo y el volumen salta.
- **Impacto:** el usuario ajusta volumen en el teclado, ve moverse el fader, y todo vuelve atrás.
- **Fix:** decidir el modelo — o el estado sigue al hardware (`eqState[part][7] = d2` antes de pintar) o el fader no debe moverse (saltar el bloque si `d1 === 7`).
- **¿Duplica un hallazgo previo?** No → el reverso de **MED-04**/fix v177 (BUG-B), que excluyó solo la mitad.

### A6 — Los CC de interpretación (1/65/66/67) se persisten y se reenvían al arrancar, aunque son live-state

- **Archivo:** `app.js:35`, `app.js:174-179` (`saveToneEQForPart` sí los excluye), `app.js:1574-1577` (`captureAndSavePreset` solo borra 7 y 72), `app.js:1921`+`1942-1950` (`saveAppState` guarda `eqState` completo), `app.js:1889-1891` (`pushAllToKeyboard` envía los 21 CC), `app.js:2103-2108`
- **Qué pasa:** el pedal físico o el rack escriben CC66 → el estado los guarda → al recargar, `pushAllToKeyboard` los reenvía → SOSTENUTO/SOFT/PORTAMENTO quedan encendidos en hardware aunque el pedal esté suelto. `applySmartProfile` sí los salta (`app.js:777`, `812`).
- **Impacto:** arranque con estados de interpretación congelados; contradice el diseño documentado (HIGH-01: "live-state").
- **Fix:** excluir `PERFORMANCE_CCS` también en `captureAndSavePreset`, en `loadAppState` (purge tipo `1945`) y en el bucle de `pushAllToKeyboard`.
- **¿Duplica un hallazgo previo?** Sí → **HIGH-01** (su fix dejó fuera presets y push).

### A7 — El arranque sigue sin guards de `null` ni `safeInit`

- **Archivo:** `app.js:1493`, `app.js:1658-1660`, `app.js:1121-1122`, orden de init en `app.js:214-244`
- **Qué pasa:** una excepción en `initPresets`/`initToneSearch` (id inexistente tras editar el HTML) aborta el resto de `DOMContentLoaded`: no corren `loadToneEQ`, `loadAppState`, el `setInterval` de auto-guardado, `initMIDI` ni los listeners de pestañas/EQ.
- **Impacto:** app "en pantalla" pero sin MIDI y sin persistencia — el modo de fallo permanente de HIGH-03, ahora por `null` en vez de por JSON.
- **Fix:** `const safe = fn => { try { fn(); } catch(e) { console.error(e); } }` alrededor de cada `init*()` + `?.` en esas 3-4 líneas.
- **¿Duplica un hallazgo previo?** Sí → **HIGH-03** (reincidencia parcial).

### A8 — `changeTone` sigue sin debounce al navegar tonos

- **Archivo:** `app.js:1197` (list `change`), `app.js:1179` (chip) — el debounce de perfil está en `app.js:1082-1090`
- **Qué pasa:** cada click manda CC0 + CC32 + PC (3 mensajes) **síncrono**; recorrer 8 tonos rápido = 24 mensajes de PC intercalados con CCs de estado, sobre el umbral de 17-18 CC por canal → el Casio puede ignorarlos y quedar desincronizado de la UI (peor por Bluetooth).
- **Fix:** debounce corto (~80 ms, un timer por parte) para `changeTone`, paralelo al de `scheduleProfile`.
- **¿Duplica un hallazgo previo?** Sí → **HIGH-02** (la parte del PC no se implementó).

### A9 — Doble `requestMIDIAccess` si se pulsa Connect/Status con la promesa pendiente

- **Archivo:** `app.js:241-244`, `app.js:1911-1914`, `app.js:331-347`
- **Qué pasa:** los guards solo consultan `if (midiAccess)`, que sigue en `null` mientras Chrome muestra el diálogo → un segundo click crea un segundo `MIDIAccess` con su propio `onstatechange` y un segundo `reconnectMIDI()` inicial → **doble** `pushAllToKeyboard` (ver A1); en Android el rechazo de la 2.ª promesa puede pintar "MIDI Error" aunque la 1.ª haya servido.
- **Fix:** memoizar la promesa (`let midiAccessP = null; … midiAccessP ??= navigator.requestMIDIAccess({sysex})`) y que ambos handlers la usen.
- **¿Duplica un hallazgo previo?** Sí → **CRIT-04** (se añadió `midiInitAttempted`, no la memoización).

### A10 — El teclado virtual no suena por el SF2 interno si `EXT MIDI` está OFF

- **Archivo:** `app.js:2308-2309` (`if (!mctrlEnabled) return;`) vs `app.js:2317-2320` y `app.js:440-464` (el hook de hardware solo pide `pcSynthEnabled`)
- **Qué pasa:** con `INTERNAL SF2: ON` + `EXT MIDI: OFF` (default: `mctrlEnabled = false`), una tecla física sí suena por el SF2, pero la del VK sale en `2309` antes de llegar a la rama `pcSynthEnabled` → la tecla se pinta activa y no suena.
- **Impacto:** dos toggles que en la práctica son un solo interruptor; parece que el synth interno está roto.
- **Fix:** que el guard `mctrlEnabled` solo rodee el envío a `midiOutput` (`2315`), dejando `pcSynthEnabled` como único gate del SF2.
- **¿Duplica un hallazgo previo?** No.

### A11 — Escrituras a localStorage sin `try/catch`, incluida la de 1 Hz

- **Archivo:** `app.js:1934` (`saveAppState`, llamado cada 1000 ms desde `app.js:226`), además `app.js:1593`, `1690`, `1547`, `296/321`
- **Qué pasa:** cuota llena o storage bloqueado → `QuotaExceededError` **cada tick**, sin aviso en la UI → la app deja de persistir por el resto de la sesión y al recargar vuelve al último guardado exitoso. `saveToneEQ` y `readPresetsStore` sí están protegidos.
- **Fix:** `try/catch` + un aviso único en el badge de estado.
- **¿Duplica un hallazgo previo?** No (HIGH-03 era el lado de lectura).

---

## ⚪ Bajos / deuda técnica

### A12 — Código muerto nuevo/confirmado

- **Archivo:** `app.js:2332-2336` (`getMidiNote()` sin referencias; solo existe el closure `getNote` de `2339`), `app.js:1903-1910` (`debugMidiPorts()` sin HTML ni listener), `app.js:238` (`window.pcSynth._audio()` llama a un método que el objeto de `2083-2101` no define → el pre-warm del AudioContext nunca corre), `app.js:1346-1353` + `1957-1959` (ramas `oct±`/`oct-reset` que apuntan a `data-action`/`id="oct-"` inexistentes), `index.html:379` (`<input id="syncToken">` oculto y sin uso)
- **Impacto:** trampas de refactor; alguien "arreglará" código que no hace nada.
- **Fix:** borrar en un commit aparte (mismo criterio que LOW-08).
- **¿Duplica un hallazgo previo?** Parcial → el residuo de octava era **CRIT-05**; `_audio`, `getMidiNote` y `debugMidiPorts` son nuevos.

### A13 — LOW-01 sigue vivo: los botones OCT del rack disparan un RPN inútil

- **Archivo:** `app.js:1340-1354` (selector `.step-btn, .btn-reset-small[data-action]` + `sendCoarseTuning(part)` incondicional), `index.html:490-493/517-520/544-547`, `app.js:2159/2196-2204` (`mctrlOct` solo se escribe, nunca se lee)
- **Qué pasa:** esos botones tienen `data-part` pero no `data-action` → no entran en ninguna rama `oct±` y `getElementById('oct-U1')` da `null` → el ajuste no hace nada, **pero** igualmente manda la secuencia RPN (CC101/100/6/101/100) al canal 1 en cada click.
- **Impacto:** 5 CC inútiles por click y un "OCT" del rack que no hace nada.
- **Fix:** filtrar por `btn.dataset.action` antes de `sendCoarseTuning`, o quitar `data-part` de esos botones.
- **¿Duplica un hallazgo previo?** Sí → **LOW-01** (nunca se arregló).

### A14 — Persistencia sin campo de versión ni migraciones; `Object.assign` profundo

- **Archivo:** `app.js:1919-1935` (`casioAppState` sin `v`), `app.js:1578-1590` (presets sin versión), `app.js:1952`, `app.js:2010-2013`
- **Qué pasa:** `Object.assign(state.tuning, saved.tuning)` **reemplaza** los objetos `{U1,U2,L}` completos (cualquier clave nueva del código desaparece); no hay `migrate()` — las migraciones son líneas ad-hoc; si `loadAppState` falla a mitad, el `catch` devuelve `false` sin deshacer las mutaciones ya aplicadas → estado mezclado que `saveAppState` persiste.
- **Fix:** añadir `v: 1` + `migrate(saved)`, mergear por clave (`Object.assign(tuning[p], saved.tuning[p])`) y deshacer/marcar inválido el estado si el `catch` salta.
- **¿Duplica un hallazgo previo?** No.

### A15 — Documentación desalineada con el código

- **Archivo:** `README.md:27` (dice la clave `casioState`; la real es `casioAppState` — `app.js:1934/1939`), `README.md:58` (dice "31 categorías = 124 perfiles"; hay **33** categorías por ambiente en `app.js:617-649` → **132**), `README.md:105` ("Todos los CRIT/HIGH/MED resueltos en v181–v187" — falso para MED-03, MED-04 y MED-09 y para los residuos de HIGH-01/02/03), `README.md:126` ("`CC 102/103/104` verificados" — `app.js:549-550` dice *unverified against CT-S500 MIDI Implementation PDF*), `README.md:104/120` (enlazaban este archivo antes de que existiera).
- **Impacto:** el lector confía en estados de hallazgo falsos y en una clave de storage inexistente.
- **Fix:** corregido al publicar este informe.
- **¿Duplica un hallazgo previo?** Parcial → **LOW-09**.

---

## Verificación de hallazgos previos

**Reincidencias / fixes incompletos (confirmados contra v190):**

| Hallazgo previo | Estado | Nota |
|---|---|---|
| CRIT-03 | ⚠️ incompleto | Hueco en la rama `skipTones` → **A1** |
| CRIT-04 | ⚠️ incompleto | Solo se añadió `midiInitAttempted`; falta memoización → **A9** |
| HIGH-01 | ⚠️ incompleto | `toneEQ` y `applySmartProfile` excluyen `PERFORMANCE_CCS`; presets y push no → **A6** |
| HIGH-02 | ⚠️ incompleto | El perfil sí tiene debounce; el PC no → **A8** |
| HIGH-03 | ⚠️ incompleto | `JSON.parse` protegido; `getElementById` sin guard → **A7** |
| LOW-01 | ⛔ sigue | → **A13** |
| MED-03 | ⛔ sigue | `app.js:2007 if (midiOutput) pushAllToKeyboard(true)` sigue muerto: `loadAppState` corre en `225` e `initMIDI` en `233` (además async) |
| MED-04 | 🟡 a propósito | Part Mix Rules siguen forzadas en `800-802`, `1609-1611`, `1947-1949`; no debe anunciarse como resuelto |
| MED-06 | ⚠️ a medias | `swapPartState` (`1868`) ya intercambia sustain ✓; volumen/pan/EQ no, y la clase `.btn-swap.active` del HTML nunca se actualiza |
| MED-09 | ⚠️ sin verificar | Quedó "documentado, no verificado" (`app.js:549-550`) |
| MED-07 | ⚠️ a medias | `app.js:2077` desconecta el `masterGain` anterior ✓; sigue sin lock entre auto-load (`2124-2146`) y carga manual (`2148-2152`) |
| LOW-03 | ⛔ sigue | La etiqueta `INTERNAL SF2` se pinta en `index.html:30` antes de que `loadAppState` escriba `.checked` sin disparar `change` |

**Resueltos y verificados:** CRIT-01 (UTF-8, `1425`), CRIT-02 (merge por `_ts` + tombstones `1689` + cola serializada `1435-1439` + retry 409 `1460-1465`), CRIT-05 (octava por parte ya no se aplica al PC Synth, `447-449`; residuo muerto → A12), HIGH-04 (el PC externo no llama `applySmartProfile`, `524-531`), MED-01 (`398-423` output-only), MED-02 (detach del input, `363`), MED-05 (`volSlider.max = cap`, `2171`), MED-08 (`vkActiveKeys` guarda el canal, `2312/2326`), LOW-05 (`textContent`, `2114`), LOW-07 (`scheduleSustainResync`, `1068-1080`), LOW-08/09/10 (v188), y de MIXER_AUDIT: BUG-01/02/04, DESIGN-01/02/04.

---

## Mejoras propuestas

1. **Botón PANIC / All Notes Off** — CC123 + CC64/66/67/72=0 en los 3 canales, para desatascar notas colgadas sin reconectar (hoy solo se limpia al apagar toggles, `app.js:2362-2375`).
2. **Persistir `pcPartProgram` y `vkOctave`** en `casioAppState`/presets: el selector GM por parte vuelve a Grand Piano en cada recarga (`app.js:97`; `1920-1933` no los incluye).
3. **HARMONY no envía nada al teclado** — `harmony.js` solo pinta SVG; añadir "Enviar acorde a U1/L" reutilizando `CHANNEL`.
4. **Atajos de teclado en escritorio** (hoy no hay ningún `keydown` en el repo): `[`/`]` tono, `1/2/3` parte EQ, `S` sustain, `Space` START/STOP.
5. **Overlay de diagnóstico MIDI** (últimos 50 mensajes TX/RX con timestamp) — permitiría confirmar si el CT-S500 realmente resetea controladores tras 17-18 CC en lugar de seguir añadiendo taps a ciegas: la base empírica de `SUSTAIN_TAPS` sigue siendo una hipótesis.
6. **Vistas de `eqState` para VOL/RVB del rack** (cierra A4) y bind bidireccional panel EQ ↔ rack MIDI CTRL.
7. **Purga de tombstones** con `_ts` > 90 días y backup automático (Export) antes de un `syncPush` que reduzca la tienda (cierra A2).
8. **Mover `fix_swap.js` a `app.js`** (LOW-10 ya lo pedía) y ampliar el swap a `pcPartProgram`/`mctrlOct`/`.btn-swap.active`.

---

## Orden de ataque recomendado

1. **A1** — una línea (`resyncAllSustain()` siempre) que cierra la desincronización de sustain más visible; impacto directo en vivo.
2. **A3** — afinación del SF2 interno vs Casio; bug audible inmediato con una configuración normal.
3. **A10** — mismo dominio que A3 (VK + PC Synth); fix de 2 líneas.
4. **A6** — CCs de interpretación persistidos: al arrancar se mandan pedales congelados; un solo filtro `PERFORMANCE_CCS` compartido.
5. **A4 + A5** — mismo subdominio (CC7): unificar qué fuente manda y que `eqState` sea la única verdad.
6. **A2** — guardar la biblioteca antes de destruirla + validación en `_syncPushOnce`.
7. **A7** — `safeInit`/`?.` (bajo riesgo, elimina el modo de fallo permanente del arranque).
8. **A8 + A9** — debounce de PC y memoización de `requestMIDIAccess`, para cerrar de una vez HIGH-02 y CRIT-04.
