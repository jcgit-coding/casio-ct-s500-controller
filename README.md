# Casio CT-S500 Pro Controller

Una aplicación web profesional (Web MIDI) diseñada para controlar el teclado **Casio CT-S500** (y modelos compatibles de la línea CT-S) directamente desde el navegador. Convierte tu computadora, tablet o teléfono en un centro de control estilo DAW (Digital Audio Workstation) para actuaciones en vivo, ensayos y diseño sonoro.

## Características Principales

- **Gestión Multicanal:** Control independiente de las partes **Upper 1 (U1)**, **Upper 2 (U2)** y **Lower (L)**.
- **Buscador de Tones y Ritmos:** Acceso instantáneo a los más de 800 tonos y 243 ritmos del teclado mediante menús de búsqueda rápida, categorizados lógicamente.
- **Mezcladora y EQ Profesional:** Faders de 200px de recorrido que controlan en tiempo real (vía MIDI CC):
  - Volumen, Expresión y Panorámica.
  - Filtros (Cutoff, Resonancia).
  - Envolventes ADSR (Ataque, Decay).
  - Vibrato LFO (Rate, Depth, Delay).
  - Efectos Espaciales (Envíos de Reverb, Chorus, Delay).
  - Modulación, Portamento y Control de Pedales.
- **Perfiles Acústicos Inteligentes:** Al cambiar de categoría (ej. de Piano a Órgano o Sintetizador), la app reajusta automáticamente los parámetros del ecualizador para reflejar la acústica ideal del instrumento.
- **Control de Arranger:** Panel táctil para manejar ritmos, variaciones, fills, intros, endings y tempo.
- **Diseño Fluido (Responsive):** Tipografía Montserrat, modo claro/oscuro inteligente y una cuadrícula (grid) fluida que se estira y adapta desde monitores ultra-anchos hasta pantallas de teléfonos móviles.

---

## Lógica y Funcionamiento de la Conexión MIDI (Documentación Técnica)

Esta aplicación utiliza la **Web MIDI API** (`navigator.requestMIDIAccess`). Dado que la conexión MIDI en navegadores (especialmente en móviles) tiene políticas de seguridad estrictas, el sistema de conexión está programado con la siguiente arquitectura:

### 1. Detección y Enrutamiento (Evitando Puertos Fantasma)
- El código escanea todos los puertos MIDI de entrada y salida disponibles.
- **Prioridad Casio:** Busca palabras clave en el nombre del hardware (`CASIO`, `CT-S`, `WU-BT`, `BLE`, `BLUETOOTH`) para engancharse automáticamente al teclado si hay múltiples dispositivos.
- **Bloqueo de "MidiThrough":** En sistemas Android, el sistema operativo inyecta un puerto virtual inútil llamado `"MidiThrough"`. Si usamos un adaptador USB OTG genérico que no exponga la marca "Casio", un script básico se conectaría por error al `MidiThrough`. Esta app **ignora explícitamente** puertos que contengan la palabra `THROUGH` o `ANDROID` para forzar la conexión al adaptador USB real.

### 2. Permisos y Seguridad en Android Chrome
- **Requisito HTTPS:** La API Web MIDI exige que la página se cargue sobre un servidor seguro (`https://` o `localhost`).
- **Gesto de Usuario (User Gesture):** Las versiones modernas de Chrome en Android bloquean el acceso silencioso al MIDI arrojando un `SecurityError` o `NotAllowedError`. Si la auto-conexión falla, la app pide al usuario presionar manualmente el botón **"Reconectar"**. Este "clic" funciona como el gesto de usuario obligatorio que permite al navegador abrir el diálogo de permisos USB.
- **OTG Configuration:** Al conectar el teclado a un teléfono Android, la notificación del sistema ("Cargando dispositivo por USB") debe cambiarse manualmente a **"Dispositivo MIDI"** antes de que el navegador pueda detectarlo.

### 3. Evitando SysEx (System Exclusive) en la Conexión Inicial
- Aunque Casio usa mensajes SysEx para ciertas configuraciones profundas, solicitar `{ sysex: true }` en el `requestMIDIAccess` hace que Chrome aplique un nivel de seguridad mucho más restrictivo (a menudo bloqueando por completo la app en móviles).
- La inicialización se hace con `{ sysex: false }` para asegurar que el teclado sea reconocido y los mensajes estándar de Control Change (CC) y Program Change fluyan sin problemas de permisos.

---

## Uso

1. Conecta tu Casio CT-S500 a tu dispositivo mediante USB (o adaptador USB OTG).
2. Si estás en Android, abre tus notificaciones USB y selecciona **MIDI**.
3. Abre la aplicación en Google Chrome, Edge o cualquier navegador basado en Chromium.
4. Si la app dice "Acceso Denegado", presiona el botón **Reconectar** para forzar la validación de permisos.
5. ¡Empieza a mezclar y tocar!
