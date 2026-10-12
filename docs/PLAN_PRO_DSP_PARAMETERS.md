# Plan Maestro: Parámetros DSP Nombrados y Presets Acústicos en EQ Mixer

> **Objetivo:** Implementar en el EQ/Mixer del Casio CT-S500 barras de control virtuales con los **nombres reales de los parámetros de cada DSP** (en lugar de perillas genéricas "K1, K2, K3"), asociándolos dinámicamente a la biblioteca de instrumentos y presets para alcanzar la máxima fidelidad acústica y versatilidad profesional.

---

## 1. Justificación Sonora y Arquitectura del Motor AiX

En el hardware del CT-S500, el procesador de efectos AiX cuenta con un potente bloque de **Active DSP** (procesamiento digital de señal por inserción). Físicamente, el teclado asigna a sus tres perillas del panel (`K1`, `K2`, `K3`) diferentes funciones según el efecto que tenga asignado el tono.

Llamar a los controles "K1, K2, K3" no permite al músico saber qué está modificando en vivo. La aplicación debe **detectar o asignar el algoritmo DSP activo** y desplegar barras virtuales con sus **nombres acústicos reales y rangos musicales**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SECCIÓN DSP DINÁMICA EN EL EQ MIXER                  │
├────────────────────────────────────────────────────────────────────────┤
│  EFECTO ACTIVO: [ ROTARY SPEAKER (LESLIE) ▼ ]         DSP: [ ON / OFF ]│
│                                                                        │
│  [SPEED / VELOCIDAD]        [BRAKE / ACELERACIÓN]     [DRIVE / BALANCE]│
│  [========|========] (SLOW) [=============|===] (MED) [======|========]│
│                                                                        │
│  PRESETS RÁPIDOS DSP:                                                  │
│  [Leslie Slow]  [Leslie Fast (Chorale)]  [Gospel Brake]  [Overdrive]   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Catálogo de Algoritmos DSP y sus Parámetros Reales

A continuación se detalla la matriz de mapeo para las principales familias acústicas y eléctricas del CT-S500:

### A. Órganos (Drawbar, Percussive, Rock Organ)
* **Algoritmo DSP:** `Rotary Speaker (Leslie)`
* **Parámetros Reales:**
  1. **Speed (Velocidad):** Alterna entre *Slow (Chorale)* y *Fast (Tremolo)*. Es el alma expresiva del órgano Hammond.
  2. **Brake / Transition:** Tiempo de inercia que tardan los rotores mecánicos en acelerar o frenar.
  3. **Drive / Horn-Rotor Balance:** Nivel de saturación a válvulas y balance entre la bocina de agudos y el rotor de graves.

### B. Pianos Eléctricos (Rhodes, Wurlitzer, FM EP)
* **Algoritmo DSP:** `EP Tremolo & Auto-Pan` / `Phaser Vintage`
* **Parámetros Reales:**
  1. **Tremolo Rate (Velocidad LFO):** Frecuencia de oscilación (Hz).
  2. **Tremolo Depth (Profundidad):** Intensidad de la modulación de amplitud / espacialidad estéreo.
  3. **Drive / Character:** Calidez preamplificada del altavoz Suitcase.

### C. Guitarras Eléctricas y Acústicas
* **Algoritmo DSP:** `Amp Simulator & Cabinet`
* **Parámetros Reales:**
  1. **Drive / Gain:** Cantidad de saturación (limpio acústico vs. crunch blusero).
  2. **Tone / Brightness:** Brillo y presencia de los agudos en la pastilla.
  3. **Cabinet Level:** Nivel de respuesta de la caja de resonancia acústica / amplificador.

### D. Clavinet & Funk Bass
* **Algoritmo DSP:** `Touch / Auto-Wah`
* **Parámetros Reales:**
  1. **Sensitivity (Sensibilidad de Ataque):** Umbral dinámico en que se abre el filtro wah según la fuerza de la tecla.
  2. **Resonance (Pico Q):** Enfatización del timbre vocal.
  3. **Manual / Center Frequency:** Frecuencia central de reposo del filtro.

### E. Cuerdas y Ensambles Orquestales
* **Algoritmo DSP:** `Ensemble Chorus / Flanger`
* **Parámetros Reales:**
  1. **Chorus Rate:** Velocidad del ensamble orquestal.
  2. **Chorus Depth:** Grosor de la modulación de tono.
  3. **Stereo Spread / Feedback:** Amplitud del campo estereofónico sinfónico.

### F. Solos Acústicos y Sintetizadores Lead
* **Algoritmo DSP:** `Analog Delay / Tape Echo`
* **Parámetros Reales:**
  1. **Delay Time:** Tiempo del eco (ms).
  2. **Feedback:** Número de repeticiones antes de extinguirse.
  3. **Wet / Dry Mix:** Proporción de señal directa vs. eco.

### G. Pianos Acústicos y Pianos de Concierto
* **Algoritmo DSP:** `Acoustic Resonance & Compression`
* **Parámetros Reales:**
  1. **Damper Resonance:** Resonancia simpática de la tabla armónica al pisar pedal.
  2. **String Resonance:** Vibración de cuerdas alícuotas armónicas.
  3. **Dynamic Response / Threshold:** Control de pegada del macillo.

---

## 3. Matriz de Asociación Automática por Categoría (`DSP_PROFILES`)

Para que la app configure automáticamente los nombres correctos al seleccionar un instrumento en la biblioteca:

```javascript
const DSP_PROFILES = {
    'ELEC.ORGAN': {
        name: 'Rotary Speaker',
        p1: { name: 'Speed', def: 20, min: 0, max: 127, unit: '' },
        p2: { name: 'Transition', def: 64, min: 0, max: 127, unit: '' },
        p3: { name: 'Drive/Bal', def: 40, min: 0, max: 127, unit: '' },
        presets: [
            { label: 'Slow Chorale', p1: 20, p2: 64, p3: 30 },
            { label: 'Fast Gospel', p1: 110, p2: 80, p3: 65 },
            { label: 'Brake Stop', p1: 0, p2: 127, p3: 40 }
        ]
    },
    'ELEC.PIANO': {
        name: 'Vintage Tremolo',
        p1: { name: 'Rate', def: 45, min: 0, max: 127, unit: 'Hz' },
        p2: { name: 'Depth', def: 70, min: 0, max: 127, unit: '%' },
        p3: { name: 'Drive', def: 25, min: 0, max: 127, unit: '' },
        presets: [
            { label: 'Suitcase Soft', p1: 35, p2: 50, p3: 15 },
            { label: 'Deep Pan', p1: 65, p2: 100, p3: 30 },
            { label: 'Bypass Dry', p1: 0, p2: 0, p3: 0 }
        ]
    },
    'ACOUS.GUITAR': {
        name: 'Body Resonance',
        p1: { name: 'Warmth', def: 64, min: 0, max: 127, unit: '' },
        p2: { name: 'Wood Air', def: 50, min: 0, max: 127, unit: '' },
        p3: { name: 'Body Level', def: 75, min: 0, max: 127, unit: '' },
        presets: [
            { label: 'Studio Natural', p1: 64, p2: 50, p3: 70 },
            { label: 'Bright Nylon', p1: 85, p2: 65, p3: 60 }
        ]
    },
    'CLAVI': {
        name: 'Auto-Wah',
        p1: { name: 'Sens', def: 75, min: 0, max: 127, unit: '' },
        p2: { name: 'Peak Q', def: 80, min: 0, max: 127, unit: '' },
        p3: { name: 'Frequency', def: 40, min: 0, max: 127, unit: '' },
        presets: [
            { label: 'Funky Quack', p1: 85, p2: 90, p3: 50 },
            { label: 'Mellow Filter', p1: 50, p2: 60, p3: 35 }
        ]
    }
    // ... configurable para las 33 categorías
};
```

---

## 4. Estrategia de Comunicación MIDI (Híbrida: CCs + SysEx)

### Protocolo A: CC Asignables de Canal (Rápido y Universal)
El CT-S500 permite enlazar parámetros a controladores continuos:
* **DSP Parameter 1:** Asignado a `CC 16` (General Purpose Controller 1) o `CC 1` (Modulation).
* **DSP Parameter 2:** Asignado a `CC 17` (General Purpose Controller 2) o `CC 12` (Effect Control 1).
* **DSP Parameter 3:** Asignado a `CC 18` (General Purpose Controller 3) o `CC 13` (Effect Control 2).
* **DSP Bypass / Active:** Controlado vía `CC 68` o SysEx.

### Protocolo B: Casio System Exclusive (Acceso Profundo AiX)
Para el control exacto del bloque de efectos de inserción:
* **Estructura SysEx Casio AiX:**
  ```
  F0 44 19 01 [Command] [Part/Block: U1/U2/L] [Param Index] [Data MSB/LSB] F7
  ```
* Se activa el envío SysEx validando compatibilidad del navegador y permitiendo fallback transparente a CCs para navegadores móviles.

---

## 5. Integración con la Interfaz de Usuario y Presets

1. **Panel en `eq.js`:**
   - Crear la subsección `DSP FX & Parameters` en el panel de EQ expandido.
   - Cuando cambias de instrumento en U1, U2 o L, los labels de las 3 barras se actualizan automáticamente según `DSP_PROFILES`.
2. **Presets de Usuario en `presets.js`:**
   - La estructura de guardado de presets (`captureAndSavePreset`) incluirá:
     ```javascript
     dsp: {
         enabled: true,
         effect: 'Rotary Speaker',
         p1: 110,
         p2: 80,
         p3: 65
     }
     ```
   - Al cargar un preset, se restauran las posiciones exactas de las barras virtuales.

---

## 6. Plan de Ejecución por Pasos

| Paso | Tarea | Archivo |
|---|---|---|
| **1** | Definir diccionario `DSP_PROFILES` con nombres reales y presets rápidos por categoría | `eq.js` |
| **2** | Diseñar el contenedor visual de barras virtuales DSP con labels dinámicos en el DOM | `index.html`, `style.css` |
| **3** | Implementar la función de envío `sendDSPParam(part, paramIndex, value)` y `toggleDSP(part, state)` | `app.js` |
| **4** | Conectar eventos de cambio de tono para repintar los nombres de parámetros según la categoría activa | `app.js`, `eq.js` |
| **5** | Integrar parámetros DSP en el motor de Presets (`presets.js`) | `presets.js` |
| **6** | Pruebas de campo con el teclado conectado por USB/Bluetooth | Verificación física |
