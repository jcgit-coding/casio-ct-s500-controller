# Casio CT-S500 Pro Controller - Documentación Técnica Detallada

Una aplicación web (Web MIDI API) diseñada para transformar el teclado **Casio CT-S500** (y la serie compatible CT-S y WU-BT10) en un instrumento de diseño sonoro completo. Esta app expone parámetros ocultos del motor AiX de Casio, permitiendo usar el teclado con la fluidez y profundidad de un DAW (Digital Audio Workstation) o un sintetizador profesional.

---

## 1. Arquitectura del Sistema

La aplicación está construida sin frameworks de terceros (Vanilla HTML/CSS/JS) para garantizar un rendimiento instantáneo, compatibilidad absoluta con Web MIDI y cero latencia al procesar eventos musicales.

### Estructura de Archivos
- `index.html`: La estructura visual, construida semánticamente. Carga iconos Material UI y la tipografía Montserrat.
- `style.css`: Motor de diseño. Utiliza CSS Variables (`--panel-bg`, `--accent`, etc.) para gestionar dinámicamente un Tema Claro / Tema Oscuro. Usa una arquitectura puramente basada en Flexbox para lograr un diseño "Responsive" extremo (funciona igual de bien en monitores 4K que en smartphones verticales).
- `app.js`: El cerebro de la aplicación. Gestiona la conexión MIDI, el "State Management" global, los listeners de la interfaz y la inyección en el DOM.
- `raw_tones.js` y `raw_rhythms.js`: Bases de datos crudas del manual oficial de Casio. Contienen listas de texto sin formato que `app.js` "parsea" al arrancar para construir los catálogos lógicos.

---

## 2. Gestión de Estado y Persistencia (State Management)

Dado que la comunicación MIDI es a menudo unidireccional (el teclado no siempre reporta la posición de todos sus parámetros internos al encenderse), la app mantiene un árbol de estado estricto:

- `eqState`: Un objeto que almacena los valores (0-127) de 18 parámetros CC (Control Change) independientes para cada canal o parte (`U1`, `U2`, `L`).
- `tuning`: Mantiene registro de la octava y el estado del pedal Sustain por cada parte.
- `globalTranspose`: Almacena la transposición maestra del teclado.
- **LocalStorage (`casioState`)**: Un `setInterval` captura y guarda todo el estado de la mesa de mezclas y los instrumentos seleccionados cada 1000ms. Al recargar la página, la función `loadAppState()` inyecta silenciosamente estos valores de regreso a los faders sin bombardear de inmediato al teclado, permitiendo retomar el ensayo exactamente donde se dejó.

---

## 3. Motor Web MIDI y Mitigación de Errores

El módulo MIDI de la aplicación fue diseñado para sortear las extremas limitaciones de seguridad impuestas por navegadores modernos, especialmente en ecosistemas móviles (Android/Chrome).

### Bloqueo de Puertos "Fantasma" (MidiThrough)
En Android, el sistema operativo inyecta rutinariamente un puerto virtual llamado `Android MIDI` o `MidiThrough`. Adaptadores USB OTG genéricos a menudo se reportan como "Dispositivo USB genérico" en lugar de "Casio".
- **La Solución:** La función `scanAndConnect()` rastrea todos los puertos. Prioriza nombres que contengan `CASIO`, `CT-S`, `WU-BT`, `BLE`. Si no los encuentra, filtra y expulsa agresivamente cualquier puerto que contenga la palabra `THROUGH` o `ANDROID`, obligando a la app a engancharse al cable físico USB real.

### Seguridad y SysEx en Chrome Móvil
Solicitar acceso exclusivo de sistema (`{ sysex: true }`) provoca que Chrome bloquee el acceso silencioso al hardware.
- El código se inicializa con `{ sysex: false }` para asegurar que el teclado sea reconocido para mensajes estándar (Notas, CC, PC).
- Si Chrome en Android bloquea la conexión inicial (`NotAllowedError` / `SecurityError`), la app captura el error y redirige al usuario a utilizar el botón manual de **Reconectar**. Presionar este botón cuenta como un "Gesto de Usuario" (User Gesture), lo que obliga al navegador móvil a abrir el pop-up de permisos USB.

### Prevención de Desbordamiento del Búfer Casio (Throttling)
Cuando se cambia un instrumento (Program Change), Casio tarda unos milisegundos en cargar el nuevo DSP. Si la aplicación dispara inmediatamente un aluvión de 18 mensajes de ecualización (CC), el teclado ignora el comando de cambio de instrumento.
- **La Solución:** `setTimeout(() => applySmartProfile(...), 100);`. La app espera estratégicamente 100ms después de solicitar un nuevo Tono antes de enviar el paquete masivo de configuraciones de ecualización.

---

## 4. Perfiles Acústicos Inteligentes (Smart Acoustic Profiles)

Seleccionar un sonido no es suficiente; un Órgano necesita distorsión y rotary, mientras que un Piano necesita Reverb profunda. 
La constante `CATEGORY_PROFILES` en `app.js` es un motor de diseño sonoro automatizado.
- Cuando la aplicación detecta que el usuario seleccionó un tono desde un `optgroup` (ej. cambió de "PIANO" a "ELEC.ORGAN"), inyecta automáticamente una matriz de valores predefinidos:
  - *String Ensemble:* Ataques lentos, liberación larga, Reverb profunda.
  - *Synth Lead:* Filtros (Cutoff) cerrados, alta resonancia, vibrato activo y Portamento.
  - *Elec. Organ:* Activación del DSP Rotatorio, cero resonancia.
Esto emula el comportamiento de los "Registrations" de alta gama, haciendo que cualquier sonido suene profesional y "mezclado" al instante de ser seleccionado.

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

*Creado para llevar las capacidades del motor de sonido Casio AiX a un entorno visual táctil, profesional y sin interrupciones.*
