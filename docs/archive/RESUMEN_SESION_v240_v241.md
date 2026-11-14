# Registro de Ejecución: Sesión de Mejoras Acústicas y Corrección de Arranque (v240 - v241)

> **Fecha:** 12 de Octubre de 2026  
> **Entorno:** Casio CT-S500 Pro Controller (Web MIDI, GitHub Pages)  
> **Versiones desplegadas:** `v240` (Commit `9ce69f8`) y `v241` (Commit `b2e2c64`)

---

## 1. Contexto de la Sesión

En esta sesión se resolvieron dos objetivos fundamentales:
1. **Ejecutar el Plan de Transformación Acústica Profesional:** Incorporar los controles continuos físicos y de modo oficial del Casio CT-S500 (CC 72 continuo, RPN 00 01H Detune, CC 126/127 Mono/Poly y Botón Panic).
2. **Diagnosticar y Corregir el Arranque de la App (Opción A):** Resolver por qué la aplicación nunca iniciaba con los tres instrumentos y chips de búsqueda predeterminados de fábrica.

---

## 2. Lo Implementado en la Versión v240

### A. RELEASE Continuo Analógico (CC 72)
* **Ubicación:** `eq.js` en la sección `Envelope`.
* **Detalle técnico:**
  * Restaurado como fader analógico independiente (0–127).
  * Se desacopló de la sobreescritura accidental del botón SUSTAIN (`susRelease`) y de los perfiles acústicos, respetando el ajuste fino manual del usuario.

### B. Microafinación Orgánica DETUNE (RPN 00 01H)
* **Ubicación:** `eq.js` y `app.js` en la sección `Pitch & Tuning`.
* **Detalle técnico:**
  * Implementada la secuencia RPN estándar oficial del CT-S500:
    ```javascript
    midiOutput.send([0xB0 | ch, 101, 0x00]); // RPN MSB
    midiOutput.send([0xB0 | ch, 100, 0x01]); // RPN LSB (Fine Tuning)
    midiOutput.send([0xB0 | ch,   6,  data]); // Data Entry (64 = 0 cents)
    midiOutput.send([0xB0 | ch, 101, 0x7F]); // RPN Reset
    midiOutput.send([0xB0 | ch, 100, 0x7F]);
    ```
  * Mapeo bipolar de $-50$ a $+50$ cents con visualización en pantalla (`0c`, `+12c`, `-8c`). Crucial para ensanchar capas de piano + pad o dobles cuerdas con batimiento armónico natural.

### C. Articulación de Fraseo MONO / POLY (CC 126 / CC 127)
* **Ubicación:** `eq.js` en `Modulation & Voicing`.
* **Detalle técnico:**
  * Envío de `CC 126` (Mono On) y `CC 127` (Poly On) al canal de la parte activa.
  * Permite interpretación solista realista de instrumentos de viento (saxofones, trompetas, flautas) y sintes solistas con legato auténtico.

### D. Botón de Emergencia PANIC
* **Ubicación:** `index.html` (cabecera superior) y `app.js`.
* **Detalle técnico:**
  * Transmisión en los 3 canales de `CC 120` (All Sound Off), `CC 123` (All Notes Off), `CC 64` (Damper = 0) y `allNotesOff` en el sintetizador interno para matar notas colgadas inmediatamente.

### E. Limpieza de CCs Fantasma
* Eliminación definitiva de CCs inexistentes en el CT-S500 (`CC 75 Decay`, `CC 95`, `CC 102/103/104 Master EQ`) en `presets.js` y `eq.js`.

---

## 3. Lo Implementado en la Versión v241 (Arranque Limpio - Opción A)

### Diagnóstico de la Causa Raíz:
* `saveAppState()` ejecutaba cada 1000ms un volcado a `localStorage` guardando `tones` y `searchFilters`.
* En cada recarga o visita a GitHub Pages, `loadAppState()` leía la sesión previa y sobreescribía los instrumentos por defecto.
* Además, si un tono guardado no coincidía con el filtro de búsqueda, `selectToneInList()` borraba el texto de búsqueda (`searchEl.value = ''`), apagando los chips de presets.

### Solución Aplicada:
1. **Garantía de Arranque en Limpio en `presets.js`:**
   * En `loadAppState()`, se eliminó la restauración forzada de tonos viejos desde `localStorage`.
   * Se fuerza siempre en el arranque:
     * **Instrument 1 (`U1`):** Chip `Piano` activo $\rightarrow$ `1. STAGE PIANO` (ID 1).
     * **Instrument 2 (`U2`):** Chip `Pad` activo $\rightarrow$ `8. ADV PIANO PAD` (ID 8).
     * **Instrument 3 (`L`):** Chip `Strings` activo $\rightarrow$ `24. STRINGS PIANO` (ID 24).
   * En `saveAppState()`, se excluyó `tones` y `searchFilters` del autoguardado periódico para que la sesión no secuestre el inicio en visitas posteriores.
2. **Inicialización Explícita en `app.js`:**
   * En `initToneSearch()`, se fijó la selección por ID numérico exacto (`{ U1: 1, U2: 8, L: 24 }`).
3. **Limpieza de Placeholders en `index.html`:**
   * Sustitución de caracteres corruptos ` sin instrumento ` por los nombres oficiales predeterminados y categoría `PIANO`.
4. **Cache-Buster y Despliegue:**
   * `node bump.js 241` ejecutado con éxito.
   * Compilado, verificado con `node --check`, commiteado y pusheado a la rama `main` en GitHub Pages.
