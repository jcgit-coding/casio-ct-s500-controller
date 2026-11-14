# CasioController — Plan único de desarrollo

> **Versión de referencia:** v296 · **Actualizado:** 11 nov 2026
> **Este es el ÚNICO plan vigente.** Sustituye y absorbe a `PLAN_v218.md`, `PLAN_PRO_DSP_PARAMETERS.md`, `PLAN_PRO_ACOUSTIC_MIXER.md` y `casio_task.md` (eliminados, ver §8).
> **Revisión vigente:** §9 — hallazgos de la revisión v297 con evidencia y PoC (13 nov 2026). El histórico de auditorías vive en `docs/archive/` y no es una lista de tareas.
> Los documentos de auditoría (`AUDITORIA_*.md`, `MIXER_AUDIT.md`, `AUDIT_*.md`, `RESUMEN_SESION_*.md`) se conservan como **histórico**, no como plan: contienen hallazgos ya cerrados y no deben usarse como lista de tareas.

---

## 0. Reglas del proyecto

1. **Nada se da por hecho sin verificación.** Un cambio se cierra cuando se ve el mensaje MIDI real (o el comportamiento en el CT-S500), no cuando "debería" funcionar. Los últimos tres falsos positivos (`globalOctave`, octava por pista, transpose) salieron exactamente de cambiar el *default* del código y no el **estado persistido**.
2. **Un solo dueño por responsabilidad.** Pitch en un módulo, sustain en otro, EQ en `eq.js`. Si dos sitios envían lo mismo con timers distintos, es un bug esperando a ocurrir.
3. **Persistencia versionada.** Todo snapshot en `localStorage` lleva versión y migración explícita. Nunca se restaura un valor sin validarlo.
4. **Si no está verificado contra el CT-S500 o el MIDI Implementation oficial, se marca como no verificado** en la UI o en este plan. No se presenta como hardware real.
5. **Cada cambio:** `node --check` de los JS tocados + prueba en navegador con `midiOutput` falso + bump de versión en `index.html` + commit descriptivo.

### Cómo se verifica sin el teclado conectado

En la consola del navegador, sustituyendo la salida MIDI por un espía:

```js
const cap = [];
midiOutput = { send: m => cap.push(m), open: () => Promise.resolve() };
// …ejecutar la acción…
cap.filter(m => (m[0] & 0xF0) === 0xB0 && m[1] === 6); // Data Entry por canal
```

Con eso se comprueba qué se envió de verdad, en qué canal y con qué valor. Es la base del `SELFTEST` propuesto en §1.3.

---

## 1. PITCH — OCTAVE + TRANSPOSE global (prioridad 1)

> **Estado: implementado en v297** (`pitch.js`, controles en el header, atajos, `SELFTEST` y diagnóstico) y **verificado en navegador** (8/8 escenarios, mismos valores en los 3 canales en connect/tono/perfil/CC121/preset/estado legacy). Pendiente: confirmación en el CT-S500 con hardware real (§6).

**Decisión tomada:** OCTAVE y TRANSPOSE son **globales para U1, U2 y L**. La octava por pista no vuelve. Se quedan en el Mixer porque son un control de ejecución que se usa en vivo.

**Por qué RPN y no notas:** el teclado físico se toca a sí mismo; la app no puede transponer sus notas. La única palanca es `RPN 0x0002` (Coarse Tuning) por canal: `valor = 64 + octave*12 + transpose`.

### 1.1 Módulo `pitch.js` — estado deseado + reconciliación ✅ v297

Problema actual: el envío está repartido en ~10 llamadas a `sendCoarseTuning` y 3 temporizadores distintos (80 ms en `changeTone`, 150 y 400 ms en `scheduleProfile`), más llamadas sueltas desde los resets. Ningún sitio sabe si otro ya envió.

Diseño:

```
Pitch.setOctave(n) / Pitch.setTranspose(n)
        ↓  (debounce 40 ms, un solo envío aunque lleguen ráfagas)
Pitch.apply(reason) → RPN 0:2 a U1/U2/L, espaciado ~10 ms entre canales
        ↓
Pitch.status() → { octave, transpose, lastSentAt, lastValue, channels }
```

- **API pública:** `Pitch.get()`, `Pitch.setOctave(n)`, `Pitch.setTranspose(n)`, `Pitch.apply(reason)`, `Pitch.status()`, y compatibilidad con `window.sendCoarseTuning(part)`.
- **Contador de generación:** si llega un cambio nuevo mientras se está enviando, se descarta el envío viejo (nunca dos valores distintos para el mismo canal).
- **Disparadores de re-afirmación** (todos en un solo sitio): conectar/resync, Program Change (de la app o del teclado), `CC121`/`CC120` entrantes, carga de preset/estado, `visibilitychange`/`focus`, y botón manual.
- **Sustituye:** los `setTimeout` de `changeTone` (80 ms) y `scheduleProfile` (150/400 ms) pasan a ser responsabilidad del módulo, con los mismos retardos pero centralizados.
- **Orden de carga:** `pitch.js` entre `presets.js` y `app.js`.

### 1.2 Controles en el header (velocidad de uso) ✅ v297

- Mover los dos grupos `TRANSPOSE` / `OCTAVE` del `sub-header` del Mixer al **header fijo**, visibles desde LIBRARY, ARRANGER, TRAINER y HARMONY. **Mantener los IDs** (`gTrnVal`, `gOctVal`, `gTrnPlus`, …) para no tocar `loadPreset`/`loadAppState`.
- Atajos: `Alt+↑/↓` = transpose ±1; `Shift+Alt+↑/↓` = octava ±1. Mantener pulsado para repetir.
- Objetivos táctiles ≥ 44 px.
- Mostrar semitono + tonalidad resultante cuando haya tonalidad de referencia: `+2 (D)`. Si no la hay, solo `+2` (no inventar la tonalidad).

### 1.3 Diagnóstico y autotest (antídoto contra falsos positivos) ✅ v297

- Panel de debug (el que ya existe): línea `PITCH · UI: Oct 0 Trn +2 → enviado 76 (ch 0,1,2) · hace 0.4 s` y `Último reset detectado: PC ch2 → re-afirmado`.
- Botón `SELFTEST`: stubea `midiOutput` y corre la matriz de escenarios, mostrando ✅/❌ por caso. Escenarios:
  1. Arranque con estado legacy `v241 / octave -1` → todo neutro (64).
  2. Conectar (`pushAllToKeyboard`).
  3. Cambio de tono desde la app.
  4. Program Change desde el teclado.
  5. Carga de preset con transpose/octave a 0.
  6. Botones Reset.
  7. `CC121` entrante → re-afirmación.
  8. Octave +3 y transpose +12 (valores extremos).

### 1.4 Límites y bordes

- Rango: transpose −12..+12, octave −3..+3 → RPN 16..112.
- Validar el estado persistido: `NaN`, `null`, strings, valores fuera de rango → 0 (no solo el −1 legacy).
- Probar en hardware si el CT-S500 recorta el rango extremo (±48 semitonos).

**Criterios de aceptación:** los 8 escenarios del `SELFTEST` en verde; ningún envío con valor ≠ 64 cuando octave=0 y transpose=0; U1/U2/L siempre con el mismo valor.

### 1.5 Estilo visual del control PITCH (reportado 13 nov) ✅ v298

- **Problema:** la primera versión usaba colores literales (`rgba(59,130,246,…)`, `#93c5fd`). En tema claro se ve como una caja azul pálida que no encaja con el Mixer, cuyo lenguaje es acento cian (`--accent`) sobre superficies `--card-bg` / `--panel-bg`.
- **Regla del proyecto:** un componente nuevo no lleva colores literales. Usar `--accent`, `--card-bg`, `--panel-bg`, `--border-light`, `--text-muted`, `--input-bg`, `--surface-hover`.
- **Criterio:** revisar en tema oscuro **y** claro; la barra debe leerse como una tarjeta más del Mixer.
- **Estado:** CSS migrado a variables. Verificar en ambos temas al probar con el teclado.

### 1.6 Al transponer, el timbre se degrada (reportado 13 nov)

- **Síntoma:** al cambiar OCTAVE —y probablemente TRANSPOSE— los sonidos suenan "horribles".
- **Causa probable:** `RPN Coarse Tuning` no cambia de muestra: **re-muestrea** el tono completo. ±12 semitonos desplaza los formantes (efecto *chipmunk* hacia arriba, embarrado hacia abajo). Si además hay un perfil de EQ activo calibrado en el registro original, el resultado empeora.
- **Prueba que lo confirma:** comparar (a) RPN +12 sobre una tecla vs (b) tocar esa misma nota 12 semitonos más arriba en el teclado. Si (b) suena natural y (a) no, es re-muestreo.
- **Opciones a evaluar:**
  1. Limitar el rango por defecto (±1 octava / ±5 semitonos) y avisar fuera de ahí.
  2. "EQ neutro al transponer": no apilar perfil + transposición.
  3. Comprobar si los botones OCTAVE/TRANSPOSE del propio Casio cambian de muestra (no es detectable por MIDI estándar).
  4. SysEx GM2 Master Coarse Tuning **no** evita el re-muestreo: misma limitación.
- **Decisión pendiente:** ¿priorizamos calidad de timbre (transponer en el hardware) o comodidad (transponer desde la app)?

### 1.7 El Casio NO tiene mensaje MIDI para su Transpose/Octave (verificado 14 nov)

- **Fuente:** *CT-S500/CT-S1000V MIDI Implementation* oficial de Casio (firmware 1.06+). Líneas del texto extraído: Note On/Off (357, 370), RPN (709-750), SysEx universal (923-1015), SysEx Casio §13.3 (1049-1280).
- **Transpose y Octave Shift:** solo aparecen como efecto de **salida** (el teclado transmite otro número de nota). No hay mensaje de **entrada** que los active.
- **§14.15 "Octave Shift"** (ID 12H) es del *vocalist* de la CT-S1000V; no existe en el CT-S500.
- **Lo único aceptado para afinar:** Channel Coarse Tune (RPN 0:2, MSB 28H-58H) y Master Coarse Tuning (`F0 7F 7F 04 04 ll mm F7`). Ambos afinan el generador y se ignoran en tonos Drum.
- **Consecuencia:** no se puede "activar el Transpose del Casio" por MIDI. §1.6 sigue abierta: que RPN **re-muestree** es hipótesis, no está confirmado; la prueba A/B lo decide.
- **Nota:** no hay emulador oficial del CT-S500. Para pruebas sin teclado: puerto virtual (loopMIDI) + sintetizador GM + monitor de bytes; el timbre real solo se valida en hardware.

### 1.8 Conexión Bluetooth (WU-BT10) sin romper el cable ✅ v299

- **Antes:** el puerto se elegía por nombre; con cable y BT a la vez ambos puntuaban 5 y ganaba el primero de la lista (no determinista). Cada `statechange` (los puertos BLE parpadean) reenviaba el estado completo a las 3 partes (R2).
- **Ahora:** transporte BT/cable por nombre; **Auto = cable primero**, Bluetooth como alternativa; selector manual (Auto / Solo cable / Solo Bluetooth) persistido en `casioMidiTransport`; la entrada sigue al transporte de la salida; el estado completo solo se reenvía si **cambió el puerto** o se pulsa Reconnect.
- **Con solo cable conectado el comportamiento es el mismo que antes.**
- **Windows (14 nov, verificado):** el WU-BT10 **solo empareja como audio** (`WU-BT10 AUDIO`); no se crea ningún puerto MIDI. Foro Casio 2021-2023: nadie logró BLE MIDI en Windows; el controlador de Korg no lo reconoce; según soporte (de segunda mano) el MIDI Bluetooth es solo Android/iOS con Chordana. **No hay ruta documentada.** Alternativas: cable USB (funciona), adaptador BLE MIDI estándar por USB (no probado con el CT-S500), o puente rtpMIDI por Wi-Fi. El selector de §1.8 se queda por si Windows llega a exponer un puerto.
- **Pendiente en hardware:** nombre real del puerto BT (si no contiene WU-BT/BLE/BLUETOOTH se tratará como cable), latencia, y si las ráfagas de CC necesitan más espaciado por BLE.
- **Pendiente (decidido 14 nov, no empezar sin orden):** probar **Web Bluetooth** como vía alternativa a Web MIDI, en PC y en Android. Paso 1: página de diagnóstico (~40 líneas) que pida el WU-BT10 y compruebe si expone el servicio BLE MIDI estándar `03B80E5A-EDE8-4B33-A751-6CE34EC4C700` y su característica. Si lo expone → implementar conexión directa (paquetes BLE MIDI con timestamp). Si no (hay un reporte de foro de que no cumple el estándar) → cerrar el tema y quedarse con cable USB. En Android, Chrome ya no lista el WU-BT10 por Web MIDI; Casio solo lo documenta con Chordana / Music Space.
- **Cierra parcialmente R2 / L11** (el reenvío por reconexión); queda leer `_lastMidiOutputId` también al cargar.

---

## 2. Mixer / EQ (prioridad 2)

| ID | Tema | Evidencia / detalle |
|---|---|---|
| M1 | **CC77 `def: 0` es un bug (confirmado por el spec, 14 nov)** | MIDI Implementation §7.17 + tabla 14.4: Vibrato Depth usa −64…0…+63, con **40H (64) = neutro**. `eq.js:33` define `def: 0` = **−64**, el extremo negativo, y los ROLES usan 64. Cambiar `def` a 64. Efecto probable en el sonido de todos los tonos que reseteen el fader. |
| M2 | **Recalibrar ROLES con `globalOctave = 0`** | Los ROLES se oyeron con la octava vieja (−1). Revisar cutoff/attack/reverb por rol. Prompt de trabajo en el anexo A. |
| M3 | **Override permanente del tono** (`MED-07`) | `saveToneEQForPart` copia el perfil completo: mover un fader congela los ~18 CC de ese tono y las mejoras futuras de la matriz ya no le llegan. **Medido en v297:** mover solo CUTOFF guardó 11 CCs. Guardar solo el **diff** contra el perfil base. |
| M4 | ~~Ramas muertas / secuestros de perfil en `eq.js`~~ ✅ **Obsoleto (v297)** | El resolver es exacto: `TONE_ROLE[nombre] \|\| CAT_ROLE[cat]`. Verificado con `MELLOW E.PIANO`→`ep`, `MELLOW/BRIGHT STRINGS`→`strings_ens`, `SYNTH STRINGS`→pad, `BRIGHTNESS`→pad. Ya no hay secuestros por substring. |
| M5 | **`_faderPart` se refresca en cada `input`** (`MED-05`) | `eq.js`: cambiar de parte a mitad de un drag escribe MIDI en una parte y persiste en otra. |
| M6 | **DETUNE** (RPN 0:1) | Verificar rango real en el CT-S500 y si 64 = 0 cents. Añadir doble clic para reset si no existe. Es el único control del EQ que no es CC: no debe quedar fuera del modelo de estado. |
| M7 | **Rendimiento del EQ** (`MED-06`) | ~40 `querySelectorAll` globales por cambio de perfil y 2 por tick de drag. Precomputar un `Map` en `buildEQ`. |
| M8 | **CC verificados contra el spec (14 nov)** | Documentados por Casio: CC71 resonancia (47H, valor 0-127 sin tabla de neutro), CC72 release (48H), CC73 attack (49H), CC74 cutoff (4AH), CC76/77/78 vibrato rate/depth/delay (4CH/4DH/4EH), CC91/93/94 sends de reverb/chorus/delay (5BH/5DH/5EH). **CC72/73/74/76/77/78 son relativos −64…+63 con 64 = neutro**: un ROLE que ponga 90 en CC74 son +26, no "brillo": mover cutoff/attack con tanta amplitud explica sonidos artificiales (M10). Ya no hay CC "no verificados"; quitar esa marca. Falta verificar en hardware el neutro de CC71 (sin tabla). |
| M9 | **El preset no guarda el ambiente** (`A2`) | `captureAndSavePreset` no incluye `currentEnv` → un preset guardado en Hall se carga en Studio con los CC de Hall. Añadir `environment` al snapshot y restaurarlo. |
| M10 | **Los perfiles tono+ambiente suenan artificiales** (reportado 13 nov) | Hipótesis: (a) los ROLES son por rol, no por tono, y 764 tonos comparten ~40 perfiles; (b) se calibraron con `globalOctave = -1`; (c) desviaciones grandes en CC74/71 que el CT-S500 interpreta como filtro; (d) `derive()` mueve ataque/cutoff por ambiente, no solo reverb; (e) no hay bypass para comparar. **Plan:** toggle `BYPASS EQ`, tope de desviación ±6 (reverb/chorus aparte), auditar familia por familia con hardware (Anexo A) y dejar los ambientes solo en reverb/chorus. **Spec (14 nov):** los CC 72-78 son *relativos* (64 = 0), no absolutos: las desviaciones de ROLES/`derive()` se suman al ajuste interno de cada tono, por eso 764 tonos con ~40 perfiles se oyen planos o exagerados. Además M1 (CC77 en −64) afecta a todos. Prioridad: corregir M1 → BYPASS EQ → tope ±6. |

---

## 3. SysEx — investigación (prioridad 3)

Solo se implementa **después** de probarlo en el aparato. No se inventan estructuras.

| ID | Tema | Nota |
|---|---|---|
| S1 | **GM2 Master Coarse Tuning** `F0 7F 7F 04 04 ll mm ff F7` | Un solo mensaje para todos los canales: atómico, sin ráfagas. Si el CT-S500 lo acepta, sustituye el RPN por canal para OCTAVE/TRANSPOSE (el spec §13.1.3 lo documenta como Receive; no cambia el re-muestreo, solo elimina ráfagas). Contra: afecta también al canal 10 (ritmo). |
| S2 | **Active DSP / Reverb real (Casio SysEx)** | Requiere el *MIDI Implementation* oficial del CT-S500, sección 13.3. El antiguo plan usaba `F0 44 19 01 ...` como placeholder: **no es una especificación**. |
| S3 | **Habilitar `sysex: true` de forma opt-in** | Hoy se pide `sysex:false`. Si se habilita, solo en escritorio y con fallback claro si el usuario rechaza el permiso. |

---

## 4. Fuera del foco actual (prioridad 4)

| ID | Tema | Estado real a v296 |
|---|---|---|
| T1 | **Trainer sin archivos MIDI** | 15 piezas, **0 archivos `.mid`**: `fetch('trainer/{id}/{id}.mid')` → 404 siempre. O se generan los 15, o el índice marca `available:false`. |
| T2 | **Trainer: tempo / Pitch / Wait Mode** | `HIGH-03` (el tempo elegido antes de Play se ignora: `_applySpeed()` se llama antes de `isPlaying = true`), `HIGH-04` (Pitch no aplica nada), `HIGH-05` (Wait Mode es estado muerto). **Confirmado en v297.** |
| T3 | **Seguridad de Library** | `library.js` sigue construyendo `innerHTML` con nombres de canción/artista/evento. **PoC en v297:** un `title` con `<img onerror>` ejecuta JS (`window.__xss=1`). Tokens en `localStorage` en texto claro (`HIGH-27`). Es el hallazgo A1 de la auditoría. |
| T4 | **Partir `app.js`** | Sigue siendo el orquestador de ~1.600 líneas. Solo se hará si el pitch/sustain lo justifican; no es prioridad. |
| T5 | **Botón Import de Library roto** (`A3`) | `importFromText()` lee 3 IDs que no existen (`lib-song-title-input`, `lib-song-artist-input`, `lib-raw-text-input`) → `TypeError` al pulsar Import. Añadir los campos o quitar el botón. |

---

## 5. Deuda técnica / limpieza (prioridad 5)

| ID | Acción | Por qué |
|---|---|---|
| L1 | `git rm midi.js` | Código muerto desde v228, duplicado divergente de `app.js`. Ya provocó que un comentario falso ("sendCoarseTuning ignora tuning.oct") pareciera verdad. |
| L2 | ~~Borrar `window.setGlobalTranspose`~~ ✅ v297 | Sin llamadores; resto del experimento de sync transpose (v289). Eliminado. |
| L3 | `mctrl-oct` (pestaña VIRTUAL, antes MIDI CTRL) | Es placebo: `mctrlOct` se muestra pero no entra en ningún cálculo. O se conecta a `Pitch`, o se elimina. |
| L4 | `soundfont.sf2` trackeado (31 MB) | `git rm --cached` y servir por release/CDN. |
| L5 | `presets.json` trackeado | Está en `.gitignore` pero ya trackeado: los presets del usuario quedan públicos. |
| L6 | `package.json` + `npm run check` | `node --check` de todos los JS + `tools/validate_raw.js` + CI. Hoy la única validación es manual. |
| L7 | `.editorconfig` UTF-8 sin BOM | Cerrar el mojibake de comentarios (~100 en `eq.js`). |
| L8 | README y changelog | Sigue en **v288** con ~9 versiones de retraso. |
| L9 | **Rate limit de GitHub en el badge** | Cada carga pide `api.github.com/.../commits/main`; sin caché, un 403 deja el badge sin fecha. Usar `raw.githubusercontent` o cachear. |
| L10 | **PC Synth no carga** | `import('esm.sh/spessasynth_lib@4.3.14')` falla con `KeyModifier` ausente en `spessasynth_core`. Fijar también la versión del core. (Fuera del foco, pero roto.) |
| L11 | **Reconexión MIDI recarga los tonos** (`R2` de §9) | `_lastMidiOutputId` se escribe y nunca se lee: `pushAllToKeyboard(!same)` restauraría el comportamiento documentado (mismo puerto → solo CCs). |
| L12 | **Unificar el token de GitHub** (`R4` de §9) | `casioGhToken` y `github_pat` conviven; migrar a una sola clave. |

---

## 6. Verificación en hardware (checklist)

- [ ] **CC77**: piano, enviar 0 y 64 → ¿hay vibrato en alguno? (define M1)
- [ ] **OCTAVE ±3** y **TRANSPOSE ±12**: ¿el CT-S500 recorta? ¿suena igual en U1/U2/L?
- [ ] **CC121** (Reset All Controllers) desde un dispositivo externo → ¿se pierde el pitch? (debe re-afirmarse)
- [ ] **GM2 Master Coarse Tuning** por SysEx → ¿responde? (S1)
- [ ] **DETUNE** ±50 cents → ¿cuánto desafina de verdad? (M6)
- [ ] **CC94 (Echo)** de 0 a 127 → ¿efecto audible? (M8)
- [ ] **Trainer** con un `.mid` importado → ¿el tempo elegido se respeta? (T2)

---

## 7. Descartado — no implementar

| Idea | Origen | Por qué no |
|---|---|---|
| Master EQ por CC102/103/104 (LOWS/MIDS/HIGHS) | PLAN_v218 / PLAN_PRO_ACOUSTIC_MIXER | Verificado: el CT-S500 los ignora. Ya eliminados de `eq.js`. |
| CC95 "DSP Drive" y CC94 "Echo" como EQ | PLAN_v218 | CC95 ya eliminado (nunca se enviaba, `HIGH-13`). CC94 sigue como fader, sin verificar contra el hardware. El efecto real es SysEx (§3). |
| Nombres DSP reales (Rotary, Tremolo, Auto-Wah…) mapeados a **CC16/17/18** | PLAN_PRO_DSP_PARAMETERS | Mapeo inventado, sin fuente en el manual. El Active DSP real es SysEx. |
| Octava por pista (`tuning[part].oct`) | código previo | Eliminada en v296: hacía que U1/U2/L divergieran de octava y no tenía UI para corregirla. |
| Sync automático canción → Mixer transpose | v289 (revertido) | La tonalidad de una canción es independiente del transpose de ejecución. Solo botón explícito, nunca automático. |
| Mostrar CC no verificados como si fueran hardware | — | Placebo silencioso. Se marcan como no verificados (§2 M8). |

---

## 8. Revisión de los planes anteriores

| Documento | Veredicto | Qué se hizo |
|---|---|---|
| `docs/PLAN.md` (11 oct) | Autocontradictorio (`MED-37`: marca cosas como ✅ y en el cuerpo dice "qué falta"; cita `getToneEnvPreset` en `app.js` cuando está en `eq.js`; ambientes que no existen) | **Reescrito** como este documento. |
| `docs/PLAN_v218.md` | Era una auditoría, no un plan; `MED-36`: 8 de sus 17 hallazgos ya eran falsos en v235 | **Eliminado.** Lo que seguía abierto se absorbe en §2/§4/§5. |
| `docs/PLAN_PRO_DSP_PARAMETERS.md` | Especulativo: CC16/17/18 y `F0 44 19 01` sin fuente | **Eliminado.** Solo sobrevive la línea de investigación SysEx (§3 S2). |
| `docs/PLAN_PRO_ACOUSTIC_MIXER.md` | Fases 1 y 2 ya implementadas (CC72/sustain, DETUNE RPN, MONO/POLY, Panic); el Master EQ por CC es falso | **Eliminado.** La Fase 3 (SysEx) se absorbe en §3. |
| `casio_task.md` | Lista de tareas suelta | **Eliminado.** CC77 → §2 M1; recalibración de ROLES → §2 M2 + anexo A. |
| `docs/AUDITORIA_*.md`, `MIXER_AUDIT.md`, `AUDIT_*.md` | Histórico | **Movidos a `docs/archive/`**: son registro, no tareas. |
| `docs/RESUMEN_SESION_*.md` | Registro de sesión | **Se conserva** como histórico. |

---

## 9. Hallazgos abiertos — revisión v297 (evidencia)

> Método: análisis estático (IDs, globales, `localStorage`, `fetch`, sintaxis) + navegador real con `midiOutput` interceptado. **No probado contra el CT-S500**: lo que depende del hardware está en §6.
> Cada hallazgo indica dónde se resuelve en este plan. El detalle de método está al final de la sección.

### 9.1 🔴 Alto

| ID | Hallazgo | Evidencia | Se resuelve en |
|---|---|---|---|
| **A1** | **XSS almacenado en Library** | `hl()` (`library.js:625`) no escapa el texto y los títulos/artistas se interpolan en `innerHTML` (`:642`, `:650`); los `id` van dentro de `onclick` (`:515/598/649`). **PoC ejecutado:** un `title` con `<img src=x onerror="window.__xss=1">` ejecutó JS (`window.__xss === 1`). Con el PAT en `localStorage`, permite robar el token. | §4 T3 |
| **A2** | **El preset no guarda el ambiente** | `captureAndSavePreset` (`presets.js:193-210`) no incluye `currentEnv`; `loadPreset` tampoco lo restaura. Guardar en Hall y cargar en Studio deja los CC de Hall con el selector en Studio. | §2 M9 |
| **A3** | **El botón Import de Library lanza excepción** | `importFromText()` (`library.js:57, 160-163`) lee `lib-song-title-input`, `lib-song-artist-input` y `lib-raw-text-input`, que no existen en `index.html`. Probado: `TypeError: Cannot read properties of null (reading 'value')`. | §4 T5 |

### 9.2 🟠 Medio

| ID | Hallazgo | Evidencia | Se resuelve en |
|---|---|---|---|
| **R1** | **Tempo del Trainer ignorado antes de Play** | `_applySpeed()` (`trainer.js:318`) exige `isPlaying`, que se pone en `:321`. El tempo elegido antes de Play nunca se aplica. | §4 T2 |
| **R2** | **La reconexión MIDI recarga los 3 tonos** | `_lastMidiOutputId` se escribe (`app.js:318`) y nunca se lee: cada reconexión manda Program Change a las 3 partes y corta notas (`HIGH-07`). | §5 L11 (nuevo) |
| **R3** | **Un fader congela el perfil completo del tono** | Medido: mover solo CUTOFF guardó 11 CCs en `toneEQ` (`{10,71,73,74,76,77,78,91,93,94,999}`) en vez de `{74:101}` (`MED-07`). | §2 M3 |
| **R4** | **Dos claves para el token de GitHub** | `casioGhToken` (`presets.js:14`) y `github_pat` (`library.js:422`): el usuario pega el PAT dos veces (`HIGH-09`). | §5 L12 (nuevo) |
| **R5** | **El PC Synth no carga** | `import('https://esm.sh/spessasynth_lib@4.3.14')` → `KeyModifier` ausente en `spessasynth_core` (`app.js:1336`). | §5 L10 |
| **R6** | **Pitch y Wait Mode del Trainer sin lógica** | `this.pitch` solo pinta la UI (`trainer.js:90-100`); `waitMode` solo cambia CSS (`:111-114`). | §4 T2 |
| **R7** | **Los perfiles tono+ambiente suenan artificiales** | Reportado en uso real: "horribles, poco profesionales ni reales". ROLES por rol (no por tono), calibrados a otra octava, desviaciones grandes en CC74/71 y sin bypass para comparar. | §2 M10 |
| **R8** | **OCTAVE/TRANSPOSE degradan el timbre** | El RPN re-muestrea el tono: ±12 semitonos desplaza los formantes y, sumado al perfil de EQ, empeora. Es inherente al mecanismo, no un bug de envío. | §1.6 |

### 9.3 🟡 Bajo / ⚪ Nits

| ID | Hallazgo | Evidencia | Se resuelve en |
|---|---|---|---|
| B1 | Rate limit de GitHub en el badge | Cada carga pide `api.github.com/.../commits/main`; un 403 deja el badge sin fecha. | §5 L9 |
| B2 | `mctrl-oct` es placebo | `mctrlOct` se pinta pero no entra en ningún cálculo (`app.js:1445-1490`). | §5 L3 |
| B3 | `midi.js` muerto pero trackeado | No está en `index.html`; duplicado divergente de `app.js`. | §5 L1 |
| B4 | `soundfont.sf2` (31 MB) y `presets.json` trackeados | `git ls-files` los lista pese a `.gitignore`. | §5 L4 / L5 |
| B5 | README en v288 | 9 versiones de retraso. | §5 L8 |
| B6 | **La barra PITCH no seguía el tema visual** | Colores literales (`rgba(59,130,246,…)`, `#93c5fd`) en vez de variables: en tema claro se ve como una caja azul pálida, ajena al Mixer. | §1.5 (corregido v298) |
| N1 | `activeRhythmBadge` inexistente | `app.js:1110`, con guarda: código muerto. | limpieza |
| N2 | Autosave cada 1 s sin dirty-flag | `saveAppState` → ~86 400 escrituras/día. | limpieza |
| N3 | `sendCC` sin clamp defensivo | Confía en los llamadores. | limpieza |
| N4 | Reloj MIDI por `setInterval` | Medido 50 `F8`/s a 121 BPM (±3 %); en segundo plano colapsa a ~1 s. | §6 / limpieza |

### 9.4 ✅ Verificado correcto (navegador real)

| Área | Resultado |
|---|---|
| Carga de la app | 7 vistas renderizan; sin errores JS propios (solo `AudioWorklet` y permiso MIDI del entorno) |
| Sintaxis | `node --check` OK en los 9 JS de raíz |
| DOM / globales | 186 IDs, 0 duplicados; 0 globales duplicados entre scripts |
| **Pitch (v297)** | `SELFTEST 8/8`; connect, cambio de tono, PC del teclado, `CC121`, preset y estado legacy → mismo valor en canales 0,1,2 |
| Persistencia | `oct -1 / trn +3 / sustain U2 ON` sobrevive recarga; UI = valor RPN |
| Cambio de tono | PC + 55 CC + RPN correctos; `currentTone` y UI sincronizados |
| Faders EQ | Escriben `eqState` de la parte activa y envían al canal correcto; Reset re-aplica 18 CC |
| Sustain | ON → CC72=100; OFF → CC72=64 + CC64=0; CC72 entrante no contamina `eqState`; CC64 físico se espeja a las 3 partes |
| Teclado virtual | Note-off usa canal y nota originales (`HIGH-01` corregido) |
| Reloj MIDI | 50 `F8`/s a 121 BPM |
| Library | 3937 canciones; abre con acentos UTF-8 correctos; transpose de canción no toca el del Mixer |
| `ROLES` | `MELLOW E.PIANO`→`ep`, `MELLOW/BRIGHT STRINGS`→`strings_ens`, `SYNTH STRINGS`→pad, `BRIGHTNESS`→pad |
| Datos | `trainer/index.json` 15/15 meta; muestra de 25 canciones con sus `versions[].file` existentes |
| Ambientes | Studio/Live/Hall/Jazz distintos (reverb 22/16/52/28) |

### 9.5 Hallazgos anteriores ya obsoletos

| Hallazgo viejo | Estado en v297 |
|---|---|
| `HIGH-14`, `HIGH-15`, `MED-08`, `MED-09`, `MED-10`, `MED-31`, `V7` (cascada de substrings) | **Obsoleto**: resolver exacto `TONE_ROLE[nombre] \|\| CAT_ROLE[cat]` (verificado con 8 tonos) |
| `CRIT-04` (doble `initMIDI`) | Corregido: `midiInitAttempted` cubre badge y botón |
| `HIGH-01` (`noteOff` del VK) | Corregido: guarda `{ch, shiftedNote}` |
| CC102/103/104 y CC95 | Eliminados de `eq.js` |
| `.gitignore`, `fix_*.js`, `repertorio.js`, `.OBSIDIANTEST` | Resueltos |
| `V3`/`V4` (sustain tras ráfagas) | Mitigado en v294 |

### 9.6 Orden recomendado dentro de la revisión

1. **A1 (XSS)** — único hallazgo de seguridad explotable.
2. **A3 + A2** — features visibles rotas o inconsistentes.
3. **R2 + R4** — uso en vivo y token duplicado.
4. **R3** — para que las mejoras de perfiles sigan llegando a los tonos.
5. **R7 + R8** — calidad sonora de los perfiles y de la transposición (lo más audible para el usuario).
6. **R1 / R6** — cuando existan los `.mid` del Trainer.

---

## Anexo A — Prompt de recalibración de ROLES (§2 M2)

```
Contexto: app web para Casio CT-S500 vía Web MIDI. globalOctave ya es 0
(registro MIDI estándar). Los ROLES de eq.js se calibraron oyendo el
instrumento una octava más abajo.

Para cada rol (piano, ep, clav, mallet, organ, organ_pipe, bass, synth_pad,
sax, reed, …) escucha en el CT-S500 y propón ajustes solo si el timbre o el
espacio suenan mal respecto al calibrado anterior:
- CC74 Cutoff: a registro más alto suele sonar más brillante → bajar 2-4.
- CC73 Attack: el ataque se percibe más rápido → subir 2-3.
- CC91 Reverb: el reverb "mancha" menos → valorar subir levemente.
- CC77 Vibrato Depth: verificar primero el neutro (§2 M1).
Documenta el delta (ej. piano CC74: 72→70) y el ambiente afectado.
```

## Anexo B — Orden de ejecución sugerido

1. ~~§1.1 `pitch.js`~~ ✅ v297
2. ~~§1.2 header + atajos~~ ✅ v297
3. ~~§1.3 `SELFTEST` y diagnóstico~~ ✅ v297
4. **§9 A1** (XSS de Library) — seguridad.
5. **§9 A3 + A2** (Import roto, ambiente en presets).
6. **§9 R2 + R4** (reconexión, token único).
7. **§2 M3 / §9 R3** (overrides por diff) y **§2 M5** (`_faderPart`).
8. **§9 R7 + R8 + §2 M10** (calidad sonora: perfiles y transposición).
9. **§2 M1/M2/M6** con el teclado conectado (verificación en hardware, §6).
10. **§3 S1** (SysEx master tuning) → decidir si sustituye el RPN.
11. **§5 limpieza** (L1-L4, L11, L12) y **§4 T1/T2**.
