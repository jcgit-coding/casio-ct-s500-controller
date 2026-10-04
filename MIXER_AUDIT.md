# Auditoría del Mixer — CasioController v170

> Fecha: 2026-10-03  
> Alcance: `app.js` — Mixer completo (tone search, EQ, quick controls, presets, state)  
> Estado: solo hallazgos, **sin cambios al código**

---

## Bugs Confirmados

### 🔴 BUG-01 — Chip de búsqueda no envía MIDI cuando cambia el tono (CRÍTICO)

**Archivo:** `app.js` línea ~1002  
**Función:** chip click listener dentro de `initToneSearch`

Cuando el usuario hace click en un chip (Piano / Pad / String / etc.) y el tono actual **no está en el nuevo filtro**, el código llama:
```js
selectToneInList(part, () => true, true);
```
`selectToneInList` selecciona el primer tono en la lista (`currentTone[part]` se actualiza, la UI cambia), pero **no llama `changeTone` ni `applySmartProfile`**. El Casio sigue tocando el tono anterior — hay desync entre lo que muestra la app y lo que suena.

Cuando el tono actual SÍ está en el nuevo filtro no hay problema — el chip solo cambia el filtro visual, el tono no cambia.

**Impacto:** El usuario cambia de chip, ve un tono distinto seleccionado, pero el Casio no cambia. Confuso e inconsistente.

**Fix propuesto:** Después de `selectToneInList` en el chip click, disparar el mismo flujo que el `listEl.change` event: llamar `changeTone` + `setTimeout(() => applySmartProfile(...), 150)`.

---

### 🟠 BUG-02 — `envSelector` atrapado dentro del `if (btnThemeToggle)` (MEDIO)

**Archivo:** `app.js` líneas 233–268  
**Función:** `DOMContentLoaded`

```js
const btnThemeToggle = document.getElementById('btnThemeToggle');
if (btnThemeToggle) {
    // ← envSelector binding está AQUÍ ADENTRO
    const envSel = document.getElementById('envSelector');
    if (envSel) { /* ... */ }
    
    // theme toggle logic
}
```

El selector de ambiente (Estudio / Vivo / Sala / Jazz) solo se inicializa si `btnThemeToggle` existe en el DOM. Son dos controles completamente independientes que no deberían estar anidados.

**Impacto:** Si algún refactor elimina o renombra el botón de tema, el selector de ambiente deja de funcionar silenciosamente. En el estado actual del HTML no rompe, pero es una trampa para cambios futuros.

**Fix propuesto:** Mover el bloque `envSel` a nivel raíz del `DOMContentLoaded`, fuera del `if (btnThemeToggle)`.

---

### 🟠 BUG-03 — Display de octava por parte no se restaura en `loadAppState` (MEDIO)

**Archivo:** `app.js` línea 1695  
**Función:** `loadAppState`

`loadAppState` restaura `tuning[part]` (que incluye `.oct`) via `Object.assign`, pero **no actualiza los elementos UI `oct-{part}`**. El display visual muestra el valor del HTML (probablemente `0`), aunque en memoria `.oct` está correctamente restaurado.

El botón SUSTAIN sí se actualiza (líneas 1724–1727), pero el octave no:
```js
// ← Esto existe para sus:
susBtn.innerText = tuning[part].sus ? 'ON' : 'OFF';
// ← Esto NO existe para oct:
// octEl.innerText = tuning[part].oct > 0 ? '+' + tuning[part].oct : tuning[part].oct;
```

**Impacto:** Después de recargar la página, el indicador de octava por parte muestra `0` aunque la octava guardada sea diferente. El sonido es correcto (la tuning se envía en el próximo `pushAllToKeyboard`), pero el display engaña al usuario.

**Fix propuesto:** Agregar el mismo patrón del sus button para el oct display dentro del loop de `saved.tones`:
```js
const octEl = document.getElementById('oct-' + part);
if (octEl) octEl.innerText = tuning[part].oct > 0 ? '+' + tuning[part].oct : (tuning[part].oct || 0);
```

---

### 🟡 BUG-04 — `tuning[part].oct` inicia como `undefined` — botones oct+/oct- no funcionan en primera sesión (BAJO)

**Archivo:** `app.js` línea 112  
**Función:** inicialización de `tuning`

```js
const tuning = {
    U1: { sus: false },
    U2: { sus: false },
    L:  { sus: false }
    // ← .oct no inicializado
};
```

En `initQuickControls`:
```js
if (action === 'oct+' && tuning[part].oct < 3)  tuning[part].oct++;
if (action === 'oct-' && tuning[part].oct > -3) tuning[part].oct--;
```

`undefined < 3` → `false` y `undefined > -3` → `false`. Los botones oct+ y oct- no hacen nada hasta que se presiona oct-reset primero.

Solo afecta la primera vez que se usa la app (sin estado guardado). Si `loadAppState` ya restauró `.oct`, funciona bien.

**Fix propuesto:** Inicializar `tuning` con `.oct`:
```js
const tuning = {
    U1: { sus: false, oct: 0 },
    U2: { sus: false, oct: 0 },
    L:  { sus: false, oct: 0 }
};
```

---

### 🟡 BUG-05 — Sustain guardado en appState: desync hardware si Casio ya estaba conectado al recargar (BAJO)

**Archivo:** `app.js` línea 1668 (`saveAppState`)

`saveAppState` persiste `tuning` incluyendo `sus: true/false`. En el próximo `loadAppState`, el botón se restaura como ON. Si el Casio **ya estaba conectado** cuando la página recargó (USB sigue enchufado), el event `onstatechange` no se dispara de nuevo y `pushAllToKeyboard` no se llama — el Casio no recibe CC72=100 aunque la app diga sustain ON.

Si el Casio se desconecta y reconecta, `pushAllToKeyboard` sí sincroniza correctamente.

**Impacto:** Solo visible en reload sin desconexión física. Workaround: presionar el botón SUSTAIN dos veces (OFF → ON).

**Fix propuesto (opción A):** Como se hizo con `mctrlEnabled`, no guardar `sus` en appState — siempre arranca OFF.  
**Fix propuesto (opción B):** Al final de `loadAppState`, llamar `pushAllToKeyboard(true)` (skipTones=true) para resincronizar solo los CCs si hay output MIDI disponible.  
Opción B es mejor UX — el usuario no pierde su estado de sustain al recargar.

---

## Inconsistencias de Diseño (no rompen, pero morder en el futuro)

### ⚪ DESIGN-01 — Identidad de tono: `text` en presets vs `id` en appState

`captureAndSavePreset` guarda tones como:
```js
U1: currentTone.U1?.text || ''   // "1. STAGE PIANO"
```
`saveAppState` guarda como:
```js
U1: currentTone.U1?.id           // 1
```

`loadPreset` busca por `o.text === data.tones[part]` y `loadAppState` busca por `d.id === saved.tones[part]`. Dos sistemas distintos para la misma información. Si dos tones tienen el mismo nombre de texto (y los hay — e.g. variantes en distintos banks), `loadPreset` podría cargar el incorrecto. Unificar a ID numérico.

### ⚪ DESIGN-02 — `applySmartProfile` en `onMIDIMessage` sin delay

Cuando el Casio envía un Program Change (usuario cambia tono en el teclado físico), `applySmartProfile` se llama sincrónicamente (0ms delay). Funciona porque el Casio ya procesó su propio PC, pero difiere de los 150ms que usa el change event de la lista. Si el Casio emite un burst de CCs después del PC (algunos teclados lo hacen como reset), el EQ podría ser sobreescrito. Bajo riesgo pero asimétrico.

### ⚪ DESIGN-03 — `EQ_CONTROLS` switch: `eq-val-{cc}` no existe para switches pero `switchEQ` lo busca

`buildEQ` solo crea `valSpan` con id `eq-val-{cc}` para controles tipo fader, no para switches. `switchEQ` hace `getElementById('eq-val-' + ctrl.cc)` para todos los controles incluyendo switches — resultado null, sin crash. Código muerto.

### ⚪ DESIGN-04 — `sReedndConnect` — nombre de función confuso

La función principal de conexión MIDI se llama `sReedndConnect` — parece un error tipográfico de una sesión anterior que quedó. No rompe nada pero reduce legibilidad.

---

## Resumen de Prioridades

| ID | Severidad | Descripción | Impacto en el usuario |
|----|-----------|-------------|----------------------|
| BUG-01 | 🔴 Crítico | Chip de filtro no cambia tono en Casio | Tono visual ≠ tono real — confuso al tocar |
| BUG-02 | 🟠 Medio | `envSelector` dentro de `if (btnThemeToggle)` | Trampa de refactor silenciosa |
| BUG-03 | 🟠 Medio | Octava por parte no se muestra al recargar | Display incorrecto tras reload |
| BUG-04 | 🟡 Bajo | `oct` inicia como `undefined` | oct+/oct- no funciona en primera sesión |
| BUG-05 | 🟡 Bajo | Sustain desynced si Casio no se reconecta | Sustain ON en UI pero no en Casio |
| DESIGN-01 | ⚪ | Identidad de tono inconsistente presets vs appState | Posible carga incorrecta de preset |
| DESIGN-02 | ⚪ | PC externo sin delay | Teórico — nunca reportado |
| DESIGN-03 | ⚪ | `eq-val-{cc}` buscado para switches | Código muerto, sin impacto |
| DESIGN-04 | ⚪ | Nombre `sReedndConnect` confuso | Solo legibilidad |

---

## Orden de Ataque Recomendado

1. **BUG-01** — El más visible musicalmente. Fix de ~5 líneas en el chip click listener.
2. **BUG-03 + BUG-04** — Se pueden hacer en el mismo commit (ambos en `loadAppState` y la inicialización de `tuning`).
3. **BUG-05** — Decidir entre opción A (no guardar sus) o B (resync CCs en load).
4. **BUG-02** — Mover `envSelector` fuera del if. Cambio seguro.
5. **DESIGN-01** — Migración de `text` a `id` en presets. Requiere migración de datos guardados — hacer con cuidado.
