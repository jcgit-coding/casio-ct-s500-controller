# Brief de Auditoría — Biblioteca CasioController

> **Para:** Mimo / OpenCode  
> **De:** Claude (cerebro del plan)  
> **Repositorio:** `jcgit-coding/casio-ct-s500-controller`  
> **Biblioteca:** `library/` — ~3939 carpetas (canciones)

---

## Contexto rápido

Esta app controla un teclado Casio CT-S500 vía Web MIDI y tiene una biblioteca de canciones con acordes. Las canciones se importan desde **lacuerda.net** con `tools/lacuerda-import.js` y se guardan en `library/{id}/`. Cada canción tiene:
- `meta.json` — título, artista, clave, versiones (`versions: [{file, source, lcd}]`)
- `chords_v1_lacuerda.txt`, `chords_v2_lacuerda.txt`, ... — letras con acordes (importadas)
- `chords.txt` — canciones manuales (sin scraper)

El `library/index.json` es el índice plano de todas las canciones.

---

## Trabajo reciente que necesita validación

### 1. Fix de `groupSongs` (crítico)
**Bug antiguo:** el regex `/\d+$/` quitaba TODOS los dígitos finales del slug:
- `salmo_126` → base `salmo_` 
- `salmo_274` → base `salmo_`
- Resultado: se agrupaban como versiones del mismo salmo ❌

**Fix aplicado:** nuevo regex `/^(.+[a-z])(\d)$/` — solo agrupa si el dígito está precedido de LETRA:
- `tu_fidelidad2` → base `tu_fidelidad` ✓ (versión legítima)
- `salmo_126` → no hace match → base `salmo_126` ✓ (canción separada)

**Artistas importados ANTES del fix** (pueden tener canciones incorrectamente agrupadas):
- New Wine, Marcos Witt, Rojo, Ebenezer, Marco Barrientos, Danilo Montero, Miel San Marcos, Hillsong United, Marcos Brunet, Marcos Vidal, Jesús Adrián Romero, Majo y Dan, Grupo Grace, Bethel Music, Chris Tomlin, Christine d'Clario, Abel Zavala, Fernel Monroy, Juan Carlos Alvarado

---

## Tareas de auditoría — ejecutar en orden

### 🔴 TAREA A — Detectar versiones mal agrupadas (artistas viejos)

Buscar carpetas donde `meta.json.versions.length >= 2`. Para cada una, mostrar el `id`, los `source` URLs de cada versión, y el `lcd` de cada una. Esto permite identificar si las 2 versiones son realmente versiones distintas del mismo arreglo, o si son canciones distintas que se agruparon por el bug.

**Script PowerShell sugerido:**
```powershell
$lib = "library"
Get-ChildItem $lib -Directory | ForEach-Object {
    $m = Get-Content "$($_.FullName)/meta.json" -Raw | ConvertFrom-Json
    if ($m.versions.Count -ge 2) {
        [PSCustomObject]@{
            id       = $_.Name
            title    = $m.title
            versions = $m.versions.Count
            sources  = ($m.versions | ForEach-Object { $_.source }) -join " | "
        }
    }
} | Format-Table -AutoSize
```

**Qué buscar:** si los dos `source` URLs son del mismo artista pero slugs completamente distintos (ej. `salmo_3` y `salmo_126`), eso es un falso agrupamiento. Si son slugs como `tu_fidelidad` y `tu_fidelidad2`, es correcto.

---

### 🔴 TAREA B — Resolver duplicado detectado por find-duplicates.js

El script `tools/find-duplicates.js` encontró una posible canción manual duplicada:

```
[62%] MANUAL   psalm126_cuando_senor
       "Cuando el Señor hiciere volver" — Tradicional
     IMPORTADA ebenezer_me_gozare
       "Me Gozaré" — Ebenezer
```

**Acción:** Leer ambas letras y comparar:
- `library/psalm126_cuando_senor/chords.txt`
- `library/ebenezer_me_gozare/chords_v1_lacuerda.txt`

Si son la misma canción → eliminar `psalm126_cuando_senor` (carpeta + entrada en `library/index.json`).
Si son distintas → ignorar la alerta (62% puede ser coincidencia en letras de salmos).

---

### 🔴 TAREA C — Verificar posibles duplicados por typo de slug

Estos pares necesitan revisión manual:

1. `marco_barrientos_angus_dei` (título: "Angus dei") vs `marco_barrientos_agnus_dei` (título: "Agnus Dei")
   - Leer ambas letras → si son iguales, eliminar el de typo (`angus_dei`) y actualizar `index.json`

2. `new_wine_sacrifios_ofrecere` vs `new_wine_sacrificios_ofrecere`
   - Mismo análisis → eliminar el duplicado si las letras son idénticas o casi idénticas

---

### 🟡 TAREA D — Verificar artistas sospechosos detectados en el listado

Estas canciones tienen títulos que parecen ser nombres de personas (colaboraciones o error de scraping):

- `ebenezer_hannah_ponce` → title: "Hannah Ponce", artist: "Ebenezer"
- `marcela_gandara_misael_jimenez` → title: "Misael Jiménez", artist: "Marcela Gandara"

**Acción:** Abrir la URL `source` del `meta.json` de cada una para confirmar si la canción existe en lacuerda.net con ese título, o si es un error.

---

### 🟡 TAREA E — Spot-check de multi-versiones en artistas nuevos

Para los 14 artistas nuevos (importados con el importer corregido), verificar que canciones que tienen múltiples versiones en lacuerda.net realmente tienen `chords_v2_lacuerda.txt` en la carpeta.

**Script PowerShell:**
```powershell
$lib = "library"
$prefixes = @("marcela_gandara","israel_houghton","upperroom","averly_morillo","barak","coalo_zamorano","en_espiritu_y_en_verdad","elevation_worship","ibi","ingrid_rosario","montesanto","art_aguilera","twice","jaime_murrell")
Get-ChildItem $lib -Directory | Where-Object {
    $p = $_.Name; $prefixes | Where-Object { $p.StartsWith($_) }
} | ForEach-Object {
    $v2 = Test-Path "$($_.FullName)/chords_v2_lacuerda.txt"
    if ($v2) { [PSCustomObject]@{ id=$_.Name; multi_version=$true } }
} | Format-Table
```

Si hay canciones con v2, confirmar abriendo el source URL de v1 y v2 para ver que son versiones distintas y no el mismo contenido.

---

### 🟢 TAREA F — Verificar integridad de las 9 canciones manuales

Las canciones manuales no tienen `source` en versions. Verificar que:
1. El `chords.txt` no está vacío
2. El `meta.json` tiene `title` y `artist` correctos
3. No están duplicadas en el índice

Canciones manuales conocidas:
```
kabed_inundanos
artag_hay_libertad
misioneros_remolineando
coritos_asi_se_alaba_a_dios
coritos_vamos_alabar_jehova
coritos_el_maestro_de_galilea
coritos_ya_llego_el_espiritu_santo
coritos_paseate_nazareno
psalm126_cuando_senor
```

---

## Cómo correr las herramientas

```bash
# Detector de duplicados por contenido (compara letras)
node tools/find-duplicates.js --verbose

# Importar un artista específico
node tools/lacuerda-import.js --artist nombre_artista

# Ver ayuda del importador
node tools/lacuerda-import.js --help
```

---

## Reglas clave del importador (READ FIRST)

Ver `README.md` sección "lacuerda-import.js" para las reglas completas. Lo más crítico:

> **REGLA OBLIGATORIA:** Importar TODAS las versiones tipo "Letra y Acordes" (tipo R). Solo usar tab/otros si NO existe ninguna versión R. Guardar como `chords_v1_lacuerda.txt`, `chords_v2_lacuerda.txt`, etc.

---

## Al terminar

1. Reportar qué encontraste en cada tarea (ok / problema / acción tomada)
2. Si eliminaste canciones → verificar que `library/index.json` fue actualizado
3. Si encontraste más artistas con versiones mal agrupadas → documentar los ids para re-scraping
