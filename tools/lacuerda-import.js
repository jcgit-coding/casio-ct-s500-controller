#!/usr/bin/env node
/**
 * lacuerda-import.js — CasioController: importa acordes de lacuerda.net a la biblioteca local
 * Solo lacuerda.net — sin dependencias externas
 *
 * Uso:
 *   node lacuerda-import.js --artist "marcos-witt"
 *   node lacuerda-import.js --artist "marcos-witt" --dry-run
 *   node lacuerda-import.js --artist "marcos-witt" --max 50
 *   node lacuerda-import.js --artist "marcos-witt" --song al_rey
 *   node lacuerda-import.js --artist "toma_tu_lugar" --display-name "Marcos Brunet" --artist-id "marcos_brunet"
 *
 * Opciones:
 *   --artist        slug del artista en lacuerda.net (ej: marcos-witt, grupo-grace)
 *   --display-name  nombre para mostrar en la biblioteca (sobreescribe el de lacuerda)
 *   --artist-id     prefijo de carpeta en library/ (sobreescribe el slug)
 *   --delay         ms entre requests (default 1400)
 *   --max           máximo de canciones base (default: todas)
 *   --song          importar solo una canción (slug de lacuerda, ej: al_rey)
 *   --dry-run       no escribe nada; muestra qué versiones se elegirían
 *   --keep-old      no borra archivos chords_v*_lacuerda.txt antiguos
 *   --keep-keys     no recalcula original_key
 *   --verbose       muestra el contenido normalizado de cada versión
 *
 * Correcciones frente a la versión anterior:
 *   - Usa la página BASE (sin .shtml), que contiene TODAS las versiones.
 *   - Lee el tipo de cada versión (R=acordes, T=tablatura, B=bajo, K=piano).
 *   - Descarta bajo/piano; usa tablatura solo como fallback.
 *   - Convierte cifrado español (DO/RE/MI…) a americano (C/D/E…).
 *   - Elimina tablaturas, <div></div>, boilerplate y normaliza C1)/V1)/Coro:.
 *   - Calcula original_key a partir de los acordes reales.
 *   - Actualiza index.json una sola vez al final (antes se reescribía por canción).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const {
    LC_BASE,
    fetchHTML,
    sleep,
    decodeEntities,
    stripTags,
    slugify,
    convertChordNotation,
    isChordToken,
    isChordLine,
    normalizeContent,
    detectKey,
    parseArtistPage,
    parseSongPage,
} = require('./lacuerda-parse');

// ── Paths ─────────────────────────────────────────────────────────────────────
const LIBRARY_DIR = path.resolve(__dirname, '..', 'library');
const INDEX_FILE  = path.join(LIBRARY_DIR, 'index.json');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const get   = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const has   = flag => args.includes(flag);

const ARTIST       = get('--artist', '');
const DISPLAY_NAME = get('--display-name', '');
const ARTIST_ID    = get('--artist-id', '');
const DELAY        = parseInt(get('--delay', '1400'), 10);
const MAX          = parseInt(get('--max', '9999'), 10);
const ONLY_SONG    = get('--song', '');
const DRY_RUN      = has('--dry-run');
const KEEP_OLD     = has('--keep-old');
const KEEP_KEYS    = has('--keep-keys');
const VERBOSE      = has('--verbose') || has('-v');

if (!ARTIST) {
    console.error('Uso: node lacuerda-import.js --artist "marcos-witt" [--dry-run] [--max 50] [--song al_rey]');
    process.exit(1);
}

// ── Index helpers ─────────────────────────────────────────────────────────────
function loadIndex() {
    try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return []; }
}
function saveIndex(index) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

function upsertIndexEntry(index, entry) {
    const rec = {
        id: entry.id,
        title: entry.title,
        artist: entry.artist,
        genre: entry.genre || 'Worship',
        original_key: entry.original_key || 'C',
    };
    const i = index.findIndex(e => e.id === rec.id);
    if (i !== -1) index[i] = rec; else index.push(rec);
}

// ── Artist page ───────────────────────────────────────────────────────────────
async function lcArtistPage(artistSlug) {
    const lcSlug  = artistSlug.replace(/-/g, '_');
    const pageUrl = `${LC_BASE}/${lcSlug}/`;
    console.log(`\n[lacuerda] ${pageUrl}`);
    const html = await fetchHTML(pageUrl);

    // El primer <h1> suele ser el nombre del artista; el segundo es descriptivo.
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
        .map(m => decodeEntities(stripTags(m[1])).replace(/^[>\s]+/, '').trim())
        .filter(Boolean);
    let name = h1s.find(s => !/letras,\s*tablaturas/i.test(s)) || h1s[0] || '';
    if (!name) {
        const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
        name = decodeEntities(stripTags(title)).split(':')[0].trim();
    }
    if (!name) name = artistSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const songs = parseArtistPage(html, lcSlug);
    console.log(`  Artista: "${name}"  |  Canciones en lacuerda: ${songs.length}`);
    return { artistName: name, songs, artistSlug, lcSlug };
}

// ── Song page ─────────────────────────────────────────────────────────────────
function pickVersions(versions) {
    const r = versions.filter(v => v.type === 'R');
    if (r.length) return { selected: r, mode: 'R' };
    const t = versions.filter(v => v.type === 'T');
    if (t.length) return { selected: t, mode: 'T-fallback' };
    return { selected: [], mode: 'none' };
}

function notationStats(raw) {
    const tags = [...String(raw || '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => decodeEntities(stripTags(m[1])).trim())
        .filter(Boolean);
    const es = tags.filter(t => /^(SOL|DO|RE|MI|FA|LA|SI)([#b]?)(?:m|maj|min|sus|add|dim|aug|\d|$)/i.test(t)).length;
    return { total: tags.length, es };
}

// ── Save ──────────────────────────────────────────────────────────────────────
function saveSong({ artistName, artistSlug, title, songSlug, versionFiles, detectedKey }) {
    const id      = `${slugify(artistSlug)}_${slugify(songSlug)}`;
    const songDir = path.join(LIBRARY_DIR, id);
    if (!fs.existsSync(songDir)) fs.mkdirSync(songDir, { recursive: true });

    const metaPath = path.join(songDir, 'meta.json');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}

    const existing = Array.isArray(meta.versions) ? meta.versions : [];
    const oldLacuerda = existing.filter(v => v.file && /^chords_v\d+_lacuerda\.txt$/.test(v.file));
    const kept = existing.filter(v => !(v.file && /^chords_v\d+_lacuerda\.txt$/.test(v.file)));

    const newEntries = [];
    for (const vf of versionFiles) {
        fs.writeFileSync(path.join(songDir, vf.file), vf.text, 'utf8');
        const entry = {
            file: vf.file,
            source: vf.source,
            lacuerda_version: vf.lacuerda_version,
            type: vf.type,
        };
        if (vf.label) entry.label = vf.label;
        newEntries.push(entry);
    }

    // Borrar archivos antiguos que ya no forman parte de la importación
    if (!KEEP_OLD) {
        const keepFiles = new Set(newEntries.map(e => e.file));
        for (const old of oldLacuerda) {
            if (!keepFiles.has(old.file) && fs.existsSync(path.join(songDir, old.file))) {
                try { fs.unlinkSync(path.join(songDir, old.file)); } catch {}
            }
        }
    }

    const versions = KEEP_OLD
        ? mergeVersions(existing, newEntries)
        : [...kept, ...newEntries];

    const newKey = KEEP_KEYS
        ? (meta.original_key || detectedKey || 'C')
        : (detectedKey || meta.original_key || 'C');

    meta = {
        id,
        title: meta.title || title,
        artist: meta.artist || artistName,
        genre: meta.genre || 'Worship',
        original_key: newKey,
        versions,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    return meta;
}

function mergeVersions(existing, incoming) {
    const out = existing.slice();
    for (const nv of incoming) {
        const i = out.findIndex(e => e.file === nv.file);
        if (i !== -1) out[i] = nv; else out.push(nv);
    }
    return out;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
    let info;
    try {
        info = await lcArtistPage(ARTIST);
    } catch (e) {
        console.error(`Error leyendo artista: ${e.message}`);
        process.exit(1);
    }

    let { artistName, songs, lcSlug } = info;
    let artistSlug = ARTIST;

    if (DISPLAY_NAME) artistName = DISPLAY_NAME;
    if (ARTIST_ID)    artistSlug = ARTIST_ID;

    if (ONLY_SONG) songs = songs.filter(s => s.slug === ONLY_SONG || s.slug.replace(/\d+$/, '') === ONLY_SONG);
    songs = songs.slice(0, MAX);

    console.log(`\n── Resumen ──────────────────────────────────────────`);
    console.log(`   Artista en biblioteca: "${artistName}" (id: ${slugify(artistSlug)})`);
    console.log(`   Canciones a procesar: ${songs.length}`);
    console.log(`   Modo: ${DRY_RUN ? 'DRY-RUN (no escribe)' : 'ESCRITURA'}`);
    console.log(`────────────────────────────────────────────────────\n`);

    const index = DRY_RUN ? [] : loadIndex();
    let saved = 0, skipped = 0, failed = 0;
    const report = [];

    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        const baseUrl = `${LC_BASE}/${lcSlug}/${song.slug}`;
        process.stdout.write(`  [${i + 1}/${songs.length}] "${song.title}" ... `);

        let html;
        try {
            await sleep(DELAY);
            html = await fetchHTML(baseUrl);
        } catch (e) {
            console.log(`[error: ${e.message}]`);
            failed++;
            continue;
        }

        const versions = parseSongPage(html);
        if (!versions.length) {
            console.log('[sin versiones / página no válida, saltada]');
            skipped++;
            continue;
        }

        const { selected, mode } = pickVersions(versions);
        if (!selected.length) {
            const types = [...new Set(versions.map(v => v.type || '?'))].join(',');
            console.log(`[sin acordes utilizables; tipos: ${types}, saltada]`);
            skipped++;
            continue;
        }

        const versionFiles = [];
        let vNum = 1;
        const details = [];

        for (const v of selected) {
            const text = normalizeContent(v.raw, v.type);
            if (!text || text.length < 50) {
                details.push(`v${v.num} ${v.type} vacía`);
                continue;
            }
            const st = notationStats(v.raw);
            const source = v.href
                ? `${LC_BASE}/${lcSlug}/${v.href.replace(/^\/+/, '')}`
                : baseUrl;
            versionFiles.push({
                file: `chords_v${vNum}_lacuerda.txt`,
                text,
                source,
                lacuerda_version: v.num,
                type: v.type,
                label: v.label,
            });
            details.push(`v${v.num} ${v.type}${v.best ? '*' : ''} ${text.length}c${st.es ? ` (ES:${st.es})` : ''}`);
            vNum++;
        }

        if (!versionFiles.length) {
            console.log(`[sin contenido útil, saltada] ${details.join(' | ')}`);
            skipped++;
            continue;
        }

        // Tonalidad: votar entre todas las versiones normalizadas.
        // Así una versión corrupta no impone una tonalidad errónea.
        const keyVotes = {};
        for (const vf of versionFiles) {
            const k = detectKey(vf.text);
            if (k) keyVotes[k] = (keyVotes[k] || 0) + 1;
        }
        const key = Object.keys(keyVotes).sort((a, b) => keyVotes[b] - keyVotes[a])[0] || null;

        if (DRY_RUN) {
            console.log(`✓ ${versionFiles.length} archivo(s) [${mode}] key=${key || '?'}  ${details.join(' | ')}`);
            if (VERBOSE) {
                for (const vf of versionFiles) {
                    console.log(`\n      ── ${vf.file} (v${vf.lacuerda_version} ${vf.type}) ──`);
                    console.log(vf.text.split('\n').slice(0, 25).map(l => '      | ' + l).join('\n'));
                    console.log('');
                }
            }
        } else {
            const meta = saveSong({
                artistName, artistSlug, title: song.title, songSlug: song.slug,
                versionFiles, detectedKey: key,
            });
            upsertIndexEntry(index, meta);
            console.log(`✓ ${versionFiles.length} archivo(s) [${mode}] key=${meta.original_key}  ${details.join(' | ')}`);
            saved++;
        }

        report.push({
            id: `${slugify(artistSlug)}_${slugify(song.slug)}`,
            title: song.title,
            key,
            mode,
            files: versionFiles.map(v => ({
                file: v.file,
                lacuerda_version: v.lacuerda_version,
                type: v.type,
                chars: v.text.length,
            })),
        });
    }

    if (!DRY_RUN) {
        saveIndex(index);
        console.log(`\n✅  ${saved} guardadas · ${skipped} saltadas · ${failed} con error`);
        console.log(`   index.json actualizado (${index.length} entradas)`);
    } else {
        console.log(`\n[DRY-RUN] ${report.length} canciones listas · ${skipped} saltadas · ${failed} con error`);
        console.log('   No se escribió nada.');
    }

    const reportFile = path.join(__dirname, DRY_RUN ? 'lacuerda-dry-run.json' : 'lacuerda-import-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`   Reporte: ${reportFile}`);
})();
