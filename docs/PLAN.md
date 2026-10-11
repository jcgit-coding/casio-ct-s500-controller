# CasioController — Plan de desarrollo pendiente

Última actualización: dom 11 oct 2026

---

## Item A — Presets tono+ambiente por instrumento individual

**Qué es:** `getToneEnvPreset()` en `app.js` resuelve los parámetros de EQ+ambiente para cada combinación tono × ambiente (4 ambientes: Room, Hall, Stage, Outdoor). Hoy tiene dos niveles:
1. Modelos por nombre de tono (ej. "STAGE PIANO", "VIOLIN") — solo ~9 grupos cubiertos.
2. Fallback de categoría (33 categorías del TONE_ENV_MATRIX) — valores poco diferenciados.

**Qué falta:** ir tono por tono (instrumento por instrumento) en el CT-S500 y definir un perfil acústico fiel para cada uno × sus 4 ambientes. El objetivo es que al cambiar de instrumento el EQ suene lo más realista posible, no solo por categoría amplia.

**Cómo se hace:**
- Listar todos los tonos del CT-S500 por familia (Piano, Strings, Brass, Wind, etc.).
- Para cada tono importante, definir en `getToneEnvPreset()` un bloque `if (name.includes('...'))` con sus CCs específicos.
- Parámetros clave: cutoff (74), resonance (71), attack (73), release (72), reverb (91), chorus (93), vibrato depth (77), vibrato rate (76), vibrato delay (78), brightness (75).
- Por cada ambiente: ajustar principalmente reverb (91) y chorus (93); el resto varía menos entre ambientes y más entre timbres.

**Prioridad de tonos a cubrir:** los más usados primero — Grand Piano, Electric Piano, Strings, Pad, Choir, Organ, Flute, Violin, Trumpet, Guitar, Bass.

**Tamaño estimado del trabajo:** sesión larga. Hacer por familias en múltiples conversaciones.

---

## Item B — Trainer: funcionalidad real de práctica

**Qué falta:** los controles de Play/Stop/Wait son decorativos — no reproducen nada, el piano roll está vacío.

**Decisión previa necesaria (del usuario):**
- ¿Play reproduce audio de la pieza? (requiere archivos MIDI por canción en `trainer/{id}/`)
- ¿O solo sirve como metrónomo visual con tempo configurable?

**Si es metrónomo:** implementar click de tempo con Web Audio API, indicador de compás visual. Trabajo medio.

**Si es reproducción MIDI:** cada canción necesita un archivo `.mid` en `trainer/{id}/`. La app ya carga SpessaSynth — se puede conectar. Trabajo grande pero viable.

---

## Item C — Partir app.js por módulos/tabs

**Qué implica:** `app.js` tiene ~2200 líneas. Dividirlo en:
- `midi.js` — conexión MIDI, handlers de PC/CC/Note
- `mixer.js` — lógica de partes U1/U2/L, changeTone, scheduleProfile
- `eq.js` — TONE_ENV_MATRIX, getToneEnvPreset, applySmartProfile, faders
- `sustain.js` — lógica de sustain CC72, resyncAllSustain
- `presets.js` — savePreset, loadPreset, loadAppState
- `app.js` — orquestador: init, imports, estado global compartido

**Riesgo:** refactor estructural. Si algo se rompe afecta toda la app.
**Prerequisito:** todos los bugs críticos resueltos primero (Items A y B).
**Recomendación:** dedicar una sesión solo a esto, con pruebas manuales al final.

---

## Estado de items originales

| # | Item | Estado |
|---|------|--------|
| 1 | Presets tono+ambiente | ✅ Resuelto en v217–v218 — 50+ familias de instrumentos cubiertas con 4 ambientes cada una |
| 2 | Trainer UI/UX | ✅ Resuelto en v218 — Reproducción MIDI via SpessaSynth MIDIFileSequencer, progress bar, import .mid |
| 3 | Search chips — no auto-cambiar, guardar último, EQ desde Casio | ✅ Resuelto en v215 |
| 4 | Sustain isolation | ✅ Confirmado sólido — CC72 excluido de eqState y re-asertado post-profile |
| 5 | Partir app.js | ✅ Resuelto en v218 — 4 módulos: midi.js, eq.js, presets.js, app.js |
| — | Category prioritization (nunca pedida) | ✅ Revertida en v214 |
| — | Library transpose por nombre de nota | ✅ Resuelto en v216 |
| — | Library Maximize/Transpose sin listeners | ✅ Resuelto en v216 |
| — | Android localStorage crash en search presets | ✅ Resuelto en v216 |
