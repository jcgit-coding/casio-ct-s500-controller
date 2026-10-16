# Reporte de Auditoría — Biblioteca CasioController

> **Ejecutado por:** Mimo (OpenCode) · **Fecha:** 2026-10-16
> **Base:** `AUDIT_BRIEF.md` · Biblioteca: 3939 → **3935 carpetas** tras limpieza
> **Herramientas creadas:** `tools/check-index.js`, `check-meta.js`, `rebuild-index.js`, `check-grouping.js`, `check-keys.js`, `check-manuals.js`, `check-multiversion.js`, `find-solfege.js`, `find-solfege-lines.js`, `find-notas.js`, `find-sections.js`, `find-short.js`, `find-dup-titles.js`, `find-dup-same-artist.js`, `parser-mirror.js`

---

## BLOQUE 3 — Integridad del índice

### TAREA 3A — index.json ↔ carpetas
```
TAREA 3A: Integridad de index.json
ESTADO: PROBLEMA GRAVE ENCONTRADO Y CORREGIDO
DETALLE: index.json tenía solo 714 de 3939 entradas. 3225 canciones existían en
  disco pero eran INVISIBLES para la app (library.js solo carga lo que está en
  index.json). Causa: regresión en commit d6fddfa ("importar Fernel Monroy y
  Juan Carlos Alvarado") — el índice cayó de 2920 a 51+4=55 entradas y los
  commits siguientes solo agregaron los artistas nuevos encima.
  ACCIÓN: creado tools/rebuild-index.js; índice reconstruido desde los 3935
  meta.json (orden: artista → título). Verificado: 0 errores, 0 id-mismatches.
PENDIENTE: commitear el index.json reconstruido + los tools/ nuevos.
```

### TAREA 3B — meta.json válido
```
TAREA 3B: meta.json válido
ESTADO: ok
DETALLE: 3939/3939 meta.json parsean correctamente; todos con title, artist y
  original_key. 0 keys vacías, 0 keys en solfège (solo inglés: C, Gm, etc.).
```

---

## BLOQUE 1 — Contenido de canciones

### TAREA 1A — Canciones en solfège (DO/RE/SI)
```
TAREA 1A: Notación española
ESTADO: problemas encontrados (propuesta, no autoconvertidas)
DETALLE: grep ingenuo da 1995 falsos positivos (letra en mayúsculas). Medida
  real (tokens de acorde en líneas que el parser clasifica como acordes):
  163 canciones usan solfège mayoritariamente. No es solo Marcos Witt:
  Marcos Witt 49, Twice 19, Jesús Adrián Romero 10, New Wine 10,
  Marco Barrientos 9, Marcos Brunet 8, Marcos Vidal 8, Hillsong 6,
  Marcela Gandara 6, Elevation 5, Miel San Marcos 5, + 14 artistas más.
  Lista completa: tools/solfege-real.json (los 5 más fuertes: 215/168/168/156/151 tokens ES).
PROPUESTA: script de conversión automática DO→C, RE→D, MI→E, FA→F, SOL→G,
  LA→A, SI→B (+accidentales SIb→Bb, FA#→F#…) operando SOLO sobre tokens en
  líneas de acordes (usando parser-mirror.js). Re-scrapear no vale la pena.
  Riesgo bajo: el parser ya acepta ambos sistemas; es consistencia, no bug.
PENDIENTE: decisión humana — ¿convertir las 163 automáticamente?
```

### TAREA 1B — Líneas con "(notas"
```
TAREA 1B: Líneas (notas …)
ESTADO: corregido
DETALLE: 16 archivos (el brief decía 8; el corpus creció). Con el parser real
  (tools/parser-mirror.js), solo 2 líneas se renderizaban MAL como acordes:
  - marcos_witt_al_rey_hosanna L40: "FINAL (notas): D# [D#-E-F-F#]…" → prefijada con //
  - miel_san_marcos_medley_evangelio L290: "(NOTAS: G F Eb F Eb C Bb" → prefijada con //
  Las otras 14 archivos se clasifican como letra (ok, solo estética).
PENDIENTE: ninguna.
```

### TAREA 1C — Etiquetas de sección no reconocidas
```
TAREA 1C: Etiquetas de sección mal formateadas
ESTADO: problemas encontrados (propuesta de fix en parser)
DETALLE: tools/find-sections.js (v2 sin falsos positivos) encontró cientos de
  variantes decoradas que SECTION_LABEL_RE no matchea. Las más frecuentes:
  [Coro] (71), (CORO) (44), (Coro) (31), [Puente] (29), [Intro] (25),
  ESTRIBILLO: (24), [Verso 1] (20), [Coro:] (20), [Chorus] (19), -CORO- (17),
  =Coro= (17), Coro. (16), [Estribillo] (14), --CORO-- (10), ::CORO:: (7),
  Verso1: (8), Estrofa I:/II: (6), /Coro/ (4), *CORO* (3), ---Coro--- (3)…
  Formatos: corchetes, paréntesis, asteriscos, guiones, = =, ::, punto final,
  barra, "Coro x2", "CORO-1:", "2.Pre-Coro:", "1 Estrofa".
  Detalle completo: tools/section-variants.json
PROPUESTA (mejor que limpiar 1700+ archivos): ampliar SECTION_LABEL_RE en
  library.js:215 para opcionalmente tolerar decoración de bordes
  [\[(\-=*~.]* … [\])\-=*~.]* y sufijos .… / xN / -N:, p. ej.:
  /^[\[\(\{=~*.\-\/]*\s*((?:Coro|Estrofa|…)(?:\s+\d+|\s*[-.#]\s*\d+)?)\s*(?:\([^)]*\))?\s*[xX]?\s*\d*\s*[\]\)\}=~*.\-\/]*:?\s*$/i
  Nota: ESTRIBILLO, INTERMEDIO, CODA, BAJADA, REFRÁN no están en la lista actual — agregarlos.
PENDIENTE: decisión humana — fix en regex (recomendado) vs limpieza de archivos.
```

### TAREA 1D — original_key vacío/incorrecto
```
TAREA 1D: original_key
ESTADO: ok
DETALLE: 0 canciones con key vacía o en solfège (tools/check-keys.js).
```

### TAREA 1E — Versiones mal agrupadas (bug de groupSongs)
```
TAREA 1E: Agrupación de versiones
ESTADO: ok (falsos positivos del detector)
DETALLE: tools/check-grouping.js marca 3 carpetas, pero las 3 comparan slugs
  de DOMINIOS DISTINTOS (cifraclub vs lacuerda) de la MISMA canción:
  marcos_witt_renuevame, marcos_witt_gracias, marcos_witt_poderoso_dios.
  Son multi-versión legítimas, no bug de agrupación. El regex viejo
  /\d+$/ no dejó daño detectado.
PENDIENTE: ninguna.
```

### TAREA 1F — Archivos vacíos o muy cortos
```
TAREA 1F: Contenido corto
ESTADO: ok
DETALLE: 0 archivos con <50 caracteres en toda la biblioteca.
```

### TAREA 1G — Títulos duplicados
```
TAREA 1G: Duplicados por título
ESTADO: ok
DETALLE: 128 grupos con 3+ títulos repetidos (744 canciones) — todos son
  versiones de distintos artistas del mismo himno/canción (normal: "Agnus Dei"
  en 5 artistas, "Aleluya" en 13…). 0 grupos con mismo título + mismo artista.
PENDIENTE: ninguno.
```

### TAREA 1H — Duplicados puntuales
```
TAREA 1H: Duplicados detectados
ESTADO: corregido (2 de 3) / 1 pendiente
DETALLE:
1. psalm126_cuando_senor vs ebenezer_me_gozare: MISMA canción
   ("Cuando el Señor hiciere volver…"), arreglos distintos (manual corto vs
   Ebenezer). NO eliminé la manual — es canción de setlist (TAREA 1J).
2. marco_barrientos_angus_dei ("Angus dei", typo) vs marco_barrientos_agnus_dei:
   misma canción (angus = agnus sin el intro de tablatura). ✅ ELIMINADA la de
   typo (carpeta borrada del disco e index.json).
3. new_wine_sacrifios_ofrecere vs new_wine_sacrificios_ofrecere: misma canción,
   arreglos distintos (3/4 en solfège vs 4/4 en inglés). ✅ FUSIONADAS:
   sacrifios movida como chords_v2_lacuerda.txt dentro de sacrificios
   (meta.versions actualizado con su source URL) y carpeta antigua eliminada.
PENDIENTE: ¿qué hacer con psalm126_cuando_senor (manual del setlist) vs
  ebenezer_me_gozare? Recomendación: mantener ambas (títulos distintos) o
  agregar ebenezer_me_gozare como v2 de la manual.
```

### TAREA 1I — Atribuciones sospechosas
```
TAREA 1I: Atribuciones
ESTADO: corregido
DETALLE: ambas eran páginas de lacuerda tituladas con el NOMBRE DEL TRANSCRIPTOR:
1. ebenezer_hannah_ponce = copia casi byte-identica de ebenezer_que_todos_alaben
   (30/31 líneas iguales). ✅ ELIMINADA hannah_ponce (el título correcto es
   "Que todos alaben").
2. marcela_gandara_misael_jimenez = duplicado de marcela_gandara_tu_eres_mi_amor
   (38/38 líneas iguales; la buena tiene el encabezado
   "Misael Jimenez (feat. Marcela Gandara)"). ✅ ELIMINADA misael_jimenez.
PENDIENTE: ninguna.
```

### TAREA 1J — Canciones manuales
```
TAREA 1J: Integridad de manuales
ESTADO: ok
DETALLE: las 9 tienen carpeta, chords.txt no vacío (214–1094 chars), meta
  completo con título/artista/key, sin source (correcto). Ver
  tools/check-manuals.js.
```

### TAREA 1K — Multi-versiones en artistas nuevos
```
TAREA 1K: Spot-check multi-versiones
ESTADO: ok (nada que verificar)
DETALLE: 0 carpetas con 2+ versiones entre los 14 artistas nuevos
  (tools/check-multiversion.js). El importador nunca creó v2 para ellos.
PENDIENTE: ninguno.
```

---

## BLOQUE 2 — UI/UX de Library

### TAREA 2A — Inventario funcional
```
FUNCIONES HOY:
1. Búsqueda en vivo por título/artista con highlight      → ok (bug de acentos, ver 2C)
2. Pantalla de artistas con conteos + índice alfabético   → ok
3. Lista de canciones por artista (vuelta con ‹ ARTISTAS) → ok
4. Apertura de canción (meta + archivo de versión)        → ok
5. Selector de versiones (si ≥2) con ↗ fuente             → ok (botones pequeños)
6. Transposición: − / + / Reset / select a tono destino   → ok, respeta solfège/inglés
7. Link "↗ lacuerda.net" bajo el título                   → parcial (siempre v1, ver 2C)
8. Fullscreen "Maximize"                                  → parcial (bug de altura, ver 2C)
9. Integración con Eventos: banner "+ Agregar" y botón +
  en listas con evento activo                             → ok
10. Save to Cloud (GitHub PAT)                            → oculto; sync manual
11. importFromText (pegar acordes)                        → CÓDIGO MUERTO: los inputs
   lib-song-title-input / lib-raw-text-input NO existen en index.html
```

### TAREA 2B/2C — Problemas y propuestas para uso en vivo
```
PROBLEMA: Fullscreen no restaura la altura CSS original (fija 450px/30px al salir;
  el CSS dice min-height:520px, padding:28px, height:calc(100vh-280px)).
ARCHIVO: library.js:339-351 (toggleFullscreen)
PROPUESTA: al salir, limpiar los estilos inline (viewer.style.height='' y
  padding='') en vez de hardcodear; en fullscreen subir font-size a ~28px.
PRIORIDAD: alta

PROBLEMA: Fuente 20px (style.css:1916) es justa para leer desde ~50 cm en
  tablet; en fullscreen no crece.
ARCHIVO: style.css:1912-1927 (.chords-canvas)
PROPUESTA: clase .fullscreen-song con font-size 26-30px y control A-/A+
  persistido en localStorage.
PRIORIDAD: alta

PROBLEMA: Sin navegación por teclado (← →) para pasar de canción en canción
  dentro de un evento — obliga a tocar la lista.
ARCHIVO: library.js (RepertorioApp / EventsMgr)
PROPUESTA: keydown global: ← → cambian a la canción anterior/siguiente del
  repertorio del evento activo (usando EventsMgr canciones).
PRIORIDAD: alta (uso en vivo)

PROBLEMA: Búsqueda no busca con acentos: "jesus" no encuentra "Jesús",
  "senor" no encuentra "Señor" (critical en biblioteca en español).
ARCHIVO: library.js:417-420 (initSearchFilter)
PROPUESTA: normalizar con .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  tanto el query como title/artist antes de comparar.
PRIORIDAD: alta

PROBLEMA: No hay forma de ir directo a una sección (Coro/Estrofa) en canciones
  largas — scroll manual desde arriba.
ARCHIVO: library.js parseRawTextToChords / index.html lib-chords-view
PROPUESTA: generar TOC sticky con los badges de sección detectados al parsear;
  click = scrollIntoView al id de la sección.
PRIORIDAD: media

PROBLEMA: La lista no resalta la canción abierta ni permite siguiente/anterior
  rápida; tampoco hay "recientes" (en vivo se tocan siempre las mismas).
ARCHIVO: library.js _renderArtistSongs / _renderSearchResults
PROPUESTA: marcar currentSong en la lista; sección "Recientes" (últimas 10
  abiertas, localStorage).
PRIORIDAD: media

PROBLEMA: Botones del selector de versión de 10px/3px padding — difíciles con
  dedos en tablet.
ARCHIVO: library.js:646 (_renderVersionPicker)
PROPUESTA: min-height 36px, font-size 12px, padding 8px 12px.
PRIORIDAD: media

PROBLEMA: El link "↗ lacuerda.net" del header siempre apunta a versions[0].source
  aunque estés viendo la v2 (la v2 solo tiene su ↗ pequeño en el picker).
ARCHIVO: library.js:126-135 (setSong) + _renderVersionPicker
PROPUESTA: setSong/setSong actualizar href con la source del archivo activo.
PRIORIDAD: media

PROBLEMA: Errores de carga con alert() modal — en vivo bloquea todo.
ARCHIVO: library.js:612 (openSong)
PROPUESTA: toast no bloqueante en el viewer.
PRIORIDAD: baja

PROBLEMA: importFromText es código muerto (referencia inputs inexistentes).
ARCHIVO: library.js:166-192, bindEvents lib-btn-import
PROPUESTA: eliminar o implementar. Recomendación: eliminar.
PRIORIDAD: baja

PROBLEMA: body{user-select:none} (conocido de auditorías previas) impide copiar
  la letra desde .chords-canvas.
ARCHIVO: style.css
PROPUESTA: user-select:text dentro de .chords-canvas.
PRIORIDAD: baja
```

### TAREA 2D — Rendering de acordes
```
ESTADO: ok con observaciones
DETALLE:
1. Acordes resaltados en <span class='chord'> color accent bold → correcto.
2. Etiquetas de sección → span uppercase 10px accent — funciona pero 10px es
   muy pequeño en escenario (ver 2C fuente). Sin badge de fondo real.
3. Líneas de solo letra → correctas; espacios dobles preservados (&nbsp;).
4. Líneas de acordes flotantes → se ven bien (pre + mono).
5. Transposición → modifica solo tokens dentro de span.chord; respeta el
   sistema original (solfège transpone en solfège, inglés en inglés).
   Los 2 casos que se renderizaban mal por "(notas" ya fueron comentados (1B).
6. Observación: parsedHTML se inyecta con innerHTML — un título/letra con "<"
   rompería el render (bajo riesgo, slugs controlados).
```

---

## Resumen de acciones ejecutadas

| Acción | Detalle |
|---|---|
| ✅ index.json reconstruido | 714 → 3935 entradas (`tools/rebuild-index.js`) |
| ✅ Eliminada `marco_barrientos_angus_dei` | typo duplicado de `agnus_dei` |
| ✅ Eliminada `ebenezer_hannah_ponce` | duplicado de `que_todos_alaben` |
| ✅ Eliminada `marcela_gandara_misael_jimenez` | duplicado de `tu_eres_mi_amor` |
| ✅ Fusionado `new_wine_sacrifios_ofrecere` | como `chords_v2_lacuerda.txt` en `sacrificios_ofrecere` |
| ✅ 2 líneas "(notas" comentadas | al_rey_hosanna L40, medley_evangelio L290 |
| ✅ 15 tools de auditoría creados | reutilizables para futuras corridas |

## Pendientes que requieren decisión humana

1. **Conversión solfège → inglés** de las 163 canciones (propuesta 1A).
2. **Ampliar SECTION_LABEL_RE** en library.js para `[Coro]`, `(Coro)`, `=Coro=`, `ESTRIBILLO:`, etc. (propuesta 1C — el fix de parser cubre ~1700 archivos de una vez).
3. **psalm126_cuando_senor vs ebenezer_me_gozare**: mantener ambas, o merge como versiones (1H.1).
4. **Mejoras UX en vivo** del Bloque 2 (las de prioridad alta: fullscreen, fuente, teclado ←→, búsqueda sin acentos).
5. Commitear todo lo anterior (no se hizo commit — no se pidió).
