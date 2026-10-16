# Brief de Auditoría Completa — Biblioteca CasioController

> **Para:** Mimo / OpenCode  
> **De:** Claude  
> **Repo:** `jcgit-coding/casio-ct-s500-controller` — rama `main`  
> **Biblioteca:** `library/` — ~3939 canciones  
> **Regla principal:** No asumir que nada está bien. Revisar hasta el último signo.

---

## Estructura de archivos (leer primero)

```
library/
  {id}/
    meta.json              ← título, artista, original_key, versions[]
    chords_v1_lacuerda.txt ← importadas desde lacuerda.net
    chords_v2_lacuerda.txt ← segunda versión (cuando existe)
    chords.txt             ← SOLO canciones manuales (9 en total)

library/index.json         ← array plano [{id, title, artist, original_key}]
tools/lacuerda-import.js   ← importador principal
tools/find-duplicates.js   ← detector de duplicados por contenido
library.js                 ← lógica UI de la biblioteca
index.html                 ← interfaz completa
README.md                  ← reglas del proyecto
```

El parser de acordes (`library.js → parseRawTextToChords`) reconoce:
- **Notación inglesa:** C D E F G A B (con sufijos: m, maj7, dim, sus4, etc.)
- **Notación española/solfège:** DO RE MI FA SOL LA SI (idem sufijos)
- **Etiquetas de sección:** Coro, Estrofa, Verso, Puente, Intro, Outro, Bridge, Chorus, Vamp, Interludio, Instrumental, Solo, Final, Llave (con número opcional, con/sin dos puntos)

Una línea es "línea de acordes" si después de quitar todos los acordes y separadores no queda texto de letra. Las etiquetas de sección se renderizan diferente (badge de color).

---

## BLOQUE 1 — Auditoría de contenido de canciones

### TAREA 1A — Canciones con notación española (DO/RE/MI/SOL) que deberían estar en inglés

**Problema:** La app está pensada para cifrado americano. Canciones con `DO RE MI FA SOL LA SI` funcionan en el parser PERO crean inconsistencia al transponer y al tocar (el músico usa cifrado americano). Idealmente todas deberían estar en inglés.

**Dato conocido:** Un grep preliminar mostró que los primeros 10 resultados son todos de `marcos_witt_*`. Es probable que toda la colección de Marcos Witt esté en solfège (55+ canciones). El grep fue truncado a 10 resultados por timeout — el script Node abajo da el número real.

**Qué hacer:**
1. Correr el script Node para obtener la lista completa y el conteo real.
2. Determinar si es solo Marcos Witt o también otros artistas.
3. Proponer si vale la pena convertirlos automáticamente (tabla de conversión: DO→C, RE→D, MI→E, FA→F, SOL→G, LA→A, SI→B, SIb→Bb, etc.) o re-scrapear esos artistas.

**Script Node para identificarlos:**
```js
// Correr: node tools/find-solfege.js
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const SOLFEGE = /\b(DO|RE|SOL|SI)(?:#|b)?(?:m|maj|dim|sus)?\b/;
const results = [];
for (const dir of fs.readdirSync(LIB)) {
  const files = fs.readdirSync(path.join(LIB, dir)).filter(f => f.endsWith('.txt'));
  for (const f of files) {
    const txt = fs.readFileSync(path.join(LIB, dir, f), 'utf8');
    if (SOLFEGE.test(txt)) results.push({ id: dir, file: f });
  }
}
console.log(JSON.stringify(results, null, 2));
console.log(`\nTotal: ${results.length}`);
```

---

### TAREA 1B — Líneas con "(notas ...)" que confunden el parser

**Dato conocido:** Solo **8 archivos** en toda la biblioteca tienen el patrón `(notas`. Listados:
```
marcos_witt_25_aniversario, marcos_witt_al_rey_hosanna, marcos_witt_es_navidad,
danilo_montero_porque_para_siempre, marco_barrientos_la_cosecha,
hillsong_united_amor_inexplicable, juan_carlos_alvarado_glorificate,
ibi_mas_grande_de_lo_que_imagino
```
Problema menor pero localizado — vale la pena limpiarlos.

**Problema observado** (ejemplo real en `marcos_witt_25_aniversario`):
```
INTRO:   Gm7  C7  Gm7        (notas finales: C#-D-C-A#-D-F-Bb-G)
                              (notas C#-D-C-A#-D-F-Bb-G )
```
Las notas individuales como `C#-D-C-A#` mezcladas en la misma línea que acordes pueden hacer que el parser clasifique la línea como "línea de acordes" cuando en realidad contiene instrucción textual. El resultado visual es incorrecto.

**Qué hacer:**
1. Buscar archivos con el patrón `(notas` en cualquier línea.
2. Para cada uno: ver si el parser renderiza esa línea como acordes o como letra. Si la renderiza mal → limpiar o comentar la línea con `//` al inicio (las líneas con `//` se ignoran por el parser).

---

### TAREA 1C — Etiquetas de sección mal formateadas que no se detectan

**Problema:** El parser reconoce `coro:`, `Coro:`, `CORO:`, `Estrofa 1:`, etc. Pero algunas canciones usan variantes que no matchean:
- `[Coro]` (con corchetes)
- `** CORO **`
- `---ESTROFA---`
- `(Coro)`
- `Pre-Coro` sin dos puntos

Cuando una etiqueta de sección no se reconoce, la línea se intenta parsear como acordes o como letra, produciendo resultados incorrectos.

**Qué hacer:**
1. Recorrer todos los `.txt` y buscar líneas que sean "solo texto corto sin letra real" pero que no estén en la lista de etiquetas reconocidas.
2. Listar variantes encontradas.
3. Proponer: ¿ampliar el regex en `library.js` para cubrir `[Coro]`, `(Coro)`, `**...**`, etc.? O ¿limpiar los archivos?

**Regex actual de sección** (en `library.js` línea ~215):
```js
/^((?:Coro|Estrofa|Verso|Puente|Intro|Outro|Bridge|Chorus|Verse|Pre-?[Cc]oro|Pre-?[Cc]horus|Vamp|Tag|Interludio|Instrumental|Solo|Final|Llave)(?:\s+\d+)?)\s*(?:\([^)]*\))?\s*:?\s*$/i
```

---

### TAREA 1D — Canciones con `original_key` vacío o incorrecto en meta.json

**Problema:** Si `original_key` es `null`, `""`, o está en solfège (`SOL`, `DO`), el selector de transposición en la UI parte de `C` por defecto, lo que confunde al músico.

**Script PowerShell:**
```powershell
$lib = "library"
Get-ChildItem $lib -Directory | ForEach-Object {
    $m = Get-Content "$($_.FullName)/meta.json" -Raw | ConvertFrom-Json
    $k = $m.original_key
    if (-not $k -or $k -eq "" -or $k -match "^(DO|RE|MI|FA|SOL|LA|SI)") {
        [PSCustomObject]@{ id=$_.Name; title=$m.title; original_key=$k }
    }
} | Format-Table -AutoSize
```

---

### TAREA 1E — Canciones con versiones mal agrupadas (bug antiguo de groupSongs)

**Contexto del bug:** El regex `/\d+$/` quitaba TODOS los dígitos finales del slug antes del fix. Ejemplo:
- `salmo_126` → base `salmo_` 
- `salmo_274` → base `salmo_` → se guardaban como v1 y v2 de la misma carpeta ❌

**Fix aplicado:** nuevo regex solo agrupa si el dígito está precedido de LETRA (`/^(.+[a-z])(\d)$/`).

**Artistas importados ANTES del fix** (pueden tener pares incorrectos):
New Wine, Marcos Witt, Rojo, Ebenezer, Marco Barrientos, Danilo Montero, Miel San Marcos, Hillsong United, Marcos Brunet, Marcos Vidal, Jesús Adrián Romero, Majo y Dan, Grupo Grace, Bethel Music, Chris Tomlin, Christine d'Clario, Abel Zavala, Fernel Monroy, Juan Carlos Alvarado

**Script Node para detectar:**
```js
// node tools/check-grouping.js
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
for (const dir of fs.readdirSync(LIB)) {
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) continue;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.versions || meta.versions.length < 2) continue;
  // Mostrar solo si los source URLs tienen slugs muy distintos (no solo un dígito de diferencia)
  const srcs = meta.versions.map(v => v.source || '').filter(Boolean);
  if (srcs.length < 2) continue;
  // Extraer slugs de las URLs
  const slugs = srcs.map(u => u.split('/').pop().replace('.shtml',''));
  // Si los slugs difieren en más que un dígito final, sospechoso
  const base0 = slugs[0].replace(/\d+$/, '');
  const base1 = slugs[1].replace(/\d+$/, '');
  if (base0 !== base1) {
    console.log(`SOSPECHOSO: ${dir}`);
    console.log(`  v1: ${slugs[0]}`);
    console.log(`  v2: ${slugs[1]}`);
  }
}
```

Para cada par sospechoso: leer las letras de ambas versiones y confirmar si son la misma canción con distinto arreglo, o canciones completamente distintas. Si son distintas → crear carpeta separada para la segunda.

---

### TAREA 1F — Canciones con contenido vacío o muy corto

**Script Node:**
```js
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
for (const dir of fs.readdirSync(LIB)) {
  const files = fs.readdirSync(path.join(LIB, dir)).filter(f => f.endsWith('.txt'));
  for (const f of files) {
    const txt = fs.readFileSync(path.join(LIB, dir, f), 'utf8').trim();
    if (txt.length < 50) console.log(`CORTO (${txt.length} chars): ${dir}/${f}`);
  }
}
```

---

### TAREA 1G — Duplicados por nombre similar entre artistas distintos

Canciones con el mismo título y artista distinto pueden ser:
1. La misma canción mal atribuida → problema de artista
2. Versiones de distintos artistas del mismo himno → normal (ej. "Agnus Dei" aparece en 5 artistas)
3. Un error de scraping donde se asignó a la carpeta de otro artista

**Script PowerShell para detectar títulos duplicados:**
```powershell
$lib = "library"
$titles = Get-ChildItem $lib -Directory | ForEach-Object {
    $m = Get-Content "$($_.FullName)/meta.json" -Raw | ConvertFrom-Json
    [PSCustomObject]@{ id=$_.Name; title=$m.title.ToLower().Trim(); artist=$m.artist }
} | Group-Object title | Where-Object { $_.Count -ge 3 }
$titles | ForEach-Object {
    Write-Host "`n=== '$($_.Name)' ($($_.Count) veces) ==="
    $_.Group | ForEach-Object { Write-Host "  $($_.id) — $($_.artist)" }
}
```

Revisar los grupos de 3+ canciones con el mismo título. Si algún artista no debería tener esa canción, investigar.

---

### TAREA 1H — Verificar los duplicados puntuales ya detectados

1. **`psalm126_cuando_senor`** (manual, "Cuando el Señor" — Tradicional) vs **`ebenezer_me_gozare`** (importada, "Me Gozaré" — Ebenezer): similitud 62% por contenido. Leer ambas letras. Si son la misma canción → eliminar la manual + actualizar `index.json`.

2. **`marco_barrientos_angus_dei`** ("Agnus Dei") vs **`marco_barrientos_angus_dei`** ("Angus dei" — typo): leer ambas. Si son iguales → eliminar el de typo.

3. **`new_wine_sacrifios_ofrecere`** vs **`new_wine_sacrificios_ofrecere`**: mismo análisis.

---

### TAREA 1I — Validar atribuciones sospechosas

Canciones con títulos que parecen nombres de persona (posible error de scraping):
- `ebenezer_hannah_ponce` → title: "Hannah Ponce", artist: "Ebenezer"
- `marcela_gandara_misael_jimenez` → title: "Misael Jiménez", artist: "Marcela Gandara"

Abrir la URL `source` del `meta.json` y confirmar. Si es error → corregir título o eliminar.

---

### TAREA 1J — Verificar integridad de las 9 canciones manuales

Las manuales NO tienen `source` en versions. Verificar que `chords.txt` no está vacío y que `meta.json` es correcto:
```
kabed_inundanos, artag_hay_libertad, misioneros_remolineando,
coritos_asi_se_alaba_a_dios, coritos_vamos_alabar_jehova,
coritos_el_maestro_de_galilea, coritos_ya_llego_el_espiritu_santo,
coritos_paseate_nazareno, psalm126_cuando_senor
```

---

### TAREA 1K — Spot-check multi-versiones en artistas nuevos

Para los 14 artistas nuevos (prefijos: `marcela_gandara`, `israel_houghton`, `upperroom`, `averly_morillo`, `barak`, `coalo_zamorano`, `en_espiritu_y_en_verdad`, `elevation_worship`, `ibi`, `ingrid_rosario`, `montesanto`, `art_aguilera`, `twice`, `jaime_murrell`):

Listar carpetas con `chords_v2_lacuerda.txt`. Para cada una: confirmar en el source URL que realmente hay 2 versiones distintas en lacuerda.net.

---

## BLOQUE 2 — Auditoría de la UI/UX de Library

Leer el código de `library.js` y `index.html` (sección Library, a partir de la línea que tenga `lib-song-title`) de punta a punta. El objetivo es entender el estado actual y proponer mejoras concretas para uso **en vivo / en práctica**.

### TAREA 2A — Inventario funcional actual

Listar TODAS las funciones disponibles hoy en la pestaña Library:
- Búsqueda
- Selección de canción
- Transposición
- Selector de versiones
- Link a fuente
- Integración con Eventos (Repertorio)
- Etc.

Para cada función: ¿funciona correctamente? ¿tiene bugs? ¿es difícil de usar en un móvil/tablet?

---

### TAREA 2B — Problemas específicos de UX para uso en vivo

Evaluar:
1. **Tamaño de fuente** de los acordes y la letra: ¿es legible desde 50 cm de distancia (teclado en escenario)?
2. **Contraste** en modo oscuro y modo claro
3. **Scroll en canción larga**: ¿hay forma de ir a una sección (Coro, Estrofa) directamente?
4. **Cambio rápido de canción**: ¿cuántos taps/clicks se necesitan para pasar de una canción a la siguiente en un evento?
5. **Transposición**: ¿el selector de tonalidad es fácil de usar con dedos grandes en tablet?
6. **Acceso al buscador**: ¿desde una canción abierta, a cuántos taps está el buscador?
7. **Fullscreen / modo presentación**: ¿existe? ¿falta?
8. **Navegación con teclado** (← → para cambiar canción en evento)

---

### TAREA 2C — Propuestas de mejora concretas

Por cada problema encontrado en 2B, proponer una solución específica con referencia al elemento HTML o función JS. Formato:

```
PROBLEMA: [descripción]
ARCHIVO: library.js línea XX / index.html línea XX
PROPUESTA: [cambio concreto]
PRIORIDAD: alta / media / baja
```

---

### TAREA 2D — Revisar el rendering de acordes en la UI

1. ¿Se están renderizando correctamente los acordes resaltados (en span con clase chord)?
2. ¿Las etiquetas de sección (`Coro:`, `Estrofa:`) aparecen como badges distinguibles?
3. ¿Las líneas de solo letra (sin acordes) tienen el estilo correcto?
4. ¿Las líneas de acordes "flotantes" (sin letra debajo) se ven bien o quedan raras?
5. ¿El modo de transposición modifica correctamente los acordes tanto en inglés como en solfège?

Para verificar: abrir la app en el browser (`index.html`), seleccionar 5 canciones distintas (al menos una de cada artista principal) y documentar cualquier rendering incorrecto con screenshot o descripción.

---

## BLOQUE 3 — Integridad del índice

### TAREA 3A — Verificar que index.json no tiene entradas sin carpeta

```js
// node tools/check-index.js
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const index = JSON.parse(fs.readFileSync(path.join(LIB, 'index.json'), 'utf8'));
let errors = 0;
for (const song of index) {
  const dir = path.join(LIB, song.id);
  if (!fs.existsSync(dir)) { console.log(`FALTA CARPETA: ${song.id}`); errors++; }
  const meta = path.join(dir, 'meta.json');
  if (!fs.existsSync(meta)) { console.log(`FALTA meta.json: ${song.id}`); errors++; }
}
// Carpetas sin entrada en index
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const stat = fs.statSync(path.join(LIB, dir));
  if (!stat.isDirectory()) continue;
  if (!index.find(s => s.id === dir)) console.log(`SIN ENTRADA EN INDEX: ${dir}`);
}
console.log(`\nErrores: ${errors}`);
```

---

### TAREA 3B — Verificar que meta.json es válido en todas las carpetas

```js
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
for (const dir of fs.readdirSync(LIB)) {
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) { console.log(`SIN meta.json: ${dir}`); continue; }
  try {
    const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (!m.title) console.log(`SIN TÍTULO: ${dir}`);
    if (!m.artist) console.log(`SIN ARTISTA: ${dir}`);
    if (!m.original_key) console.log(`SIN KEY: ${dir}`);
  } catch(e) { console.log(`JSON INVÁLIDO: ${dir} — ${e.message}`); }
}
```

---

## Flujo de trabajo recomendado para Mimo

1. **Primero** correr los scripts de Bloque 3 (integridad del índice) — rápidos y dan el panorama
2. **Luego** Bloque 1 tareas E, G, H, I — los problemas ya identificados
3. **Luego** Bloque 1 tareas A, B, C, D, F — requieren grep sobre 3939 archivos (usar Node, no PowerShell grep para evitar timeouts)
4. **Al final** Bloque 2 — requiere abrir la app en browser y revisar UI

**IMPORTANTE sobre rendimiento:** Nunca usar `grep -r` o `Select-String -Recurse` sobre toda la biblioteca — hace timeout en 120s. Siempre usar scripts Node que lean y filtren en memoria.

## Al terminar cada tarea

Documentar en formato:
```
TAREA X: [título]
ESTADO: ok / problemas encontrados / corregido
DETALLE: [qué encontraste, qué hiciste]
PENDIENTE: [qué requiere decisión humana]
```
