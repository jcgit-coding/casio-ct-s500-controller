#!/usr/bin/env node
/**
 * scrape-artist.js  — CasioController personal library builder
 * Solo lacuerda.net — sin dependencias externas
 *
 * Uso:
 *   node scrape-artist.js --artist "marcos-witt"
 *   node scrape-artist.js --artist "marcos-witt" --delay 2000
 *   node scrape-artist.js --artist "marcos-witt" --max 50
 *
 * Opciones:
 *   --artist    slug del artista (ej: marcos-witt, grupo-grace)
 *   --delay     ms entre requests (default 1400)
 *   --max       máximo de canciones base (default: todas)
 */

'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');

const LIBRARY_DIR = path.resolve(__dirname, '..', 'library');
const INDEX_FILE  = path.join(LIBRARY_DIR, 'index.json');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const get   = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : def; };

const ARTIST = get('--artist', '');
const DELAY  = parseInt(get('--delay', '1400'), 10);
const MAX    = parseInt(get('--max', '9999'), 10);

if (!ARTIST) {
    console.error('Uso: node scrape-artist.js --artist "marcos-witt"');
    process.exit(1);
}

// ── HTTP fetch ────────────────────────────────────────────────────────────────
function fetchHTML(rawUrl, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        const parsed  = new url.URL(rawUrl);
        const mod     = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-CO,es;q=0.9,en-US;q=0.8',
                'Accept-Encoding': 'identity',
                'Referer': 'https://www.google.com/',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
            timeout: 18000
        };
        const req = mod.request(options, res => {
            if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : parsed.origin + res.headers.location;
                return resolve(fetchHTML(next, redirects + 1));
            }
            if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HTML utils ────────────────────────────────────────────────────────────────
function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/&[a-z]+;/g, '');
}

function stripTags(str) { return str.replace(/<[^>]+>/g, ''); }

function slugify(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Index helpers ─────────────────────────────────────────────────────────────
function loadIndex() {
    try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return []; }
}
function saveIndex(index) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

// ── LACUERDA ──────────────────────────────────────────────────────────────────
const LC_BASE = 'https://acordes.lacuerda.net';

async function lcArtistPage(artistSlug) {
    const lcSlug  = artistSlug.replace(/-/g, '_');
    const pageUrl = `${LC_BASE}/${lcSlug}/`;
    console.log(`\n[lacuerda] ${pageUrl}`);
    const html = await fetchHTML(pageUrl);

    const h1Raw = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name  = h1Raw
        ? decodeEntities(stripTags(h1Raw[1])).replace(/^[>\s]+/, '').trim()
        : artistSlug.replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    // Extraer lista completa de canciones: <ul id=b_main class=b_main>
    // Cada <li id='rNNN' lcd='RATING'><a href="slug">Título <em>acordes</em></a></li>
    const mainStart = html.indexOf('id=b_main');
    const songs = [];
    const seen  = new Set();

    if (mainStart !== -1) {
        const mainEnd = html.indexOf('</ul>', mainStart);
        const block   = html.slice(mainStart, mainEnd > -1 ? mainEnd : mainStart + 300000);

        // Captura también el atributo lcd (rating/votos) para ordenar versiones
        const re = /<li[^>]*lcd='([^']*)'[^>]*><a href="([^"]+)">([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = re.exec(block)) !== null) {
            const lcd   = parseInt(m[1], 10) || 0;
            const slug  = m[2].trim();
            const title = decodeEntities(stripTags(m[3])).replace(/\s+acordes\s*$/i, '').trim();
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            songs.push({ slug, title, lcd, lcSlug });
        }

        // Fallback sin atributo lcd
        if (songs.length === 0) {
            const re2 = /<li[^>]*><a href="([^"]+)">([\s\S]*?)<\/a>/gi;
            while ((m = re2.exec(block)) !== null) {
                const slug  = m[1].trim();
                const title = decodeEntities(stripTags(m[2])).replace(/\s+acordes\s*$/i, '').trim();
                if (!slug || seen.has(slug)) continue;
                seen.add(slug);
                songs.push({ slug, title, lcd: 0, lcSlug });
            }
        }
    }

    console.log(`  Artista: "${name}"  |  Entradas en lacuerda: ${songs.length}`);
    return { artistName: name, songs, artistSlug, lcSlug };
}

/**
 * Agrupa canciones por canción base: slug sin dígito final.
 * Ejemplo: "tu_fidelidad", "tu_fidelidad2", "tu_fidelidad3" → un solo grupo.
 * Dentro del grupo, ordena por lcd descendente (más votos = mejor calidad).
 * Retorna Map<baseSlug, {title, versions:[{slug, lcd}]}>
 */
function groupSongs(songs) {
    const groups = new Map();
    for (const song of songs) {
        const baseSlug = song.slug.replace(/\d+$/, '');
        if (!groups.has(baseSlug)) {
            groups.set(baseSlug, { title: song.title, versions: [] });
        }
        groups.get(baseSlug).versions.push({ slug: song.slug, lcd: song.lcd, title: song.title });
    }
    // Ordenar cada grupo por lcd descendente (más votos primero)
    for (const g of groups.values()) {
        g.versions.sort((a, b) => b.lcd - a.lcd);
        // Usar como título el de la versión con más votos
        g.title = g.versions[0].title;
    }
    return groups;
}

// Tipos de versión en lacuerda (campo otipo en el HTML de la canción):
//   R = Guitarra / Letra y Acordes  ← solo este nos interesa
//   B = Bajo (tab de bajo)
//   P = Piano / Teclados
//   U = Ukulele
// Si no hay otipo (página antigua), asumimos que es guitarra.
const LC_CHORD_TIPOS = new Set(['R', '']);

async function lcFetchVersion(lcSlug, songSlug) {
    const shtmlUrl = `${LC_BASE}/${lcSlug}/${songSlug}.shtml`;
    const baseUrl  = `${LC_BASE}/${lcSlug}/${songSlug}`;
    let html, usedUrl;
    try {
        html = await fetchHTML(shtmlUrl); usedUrl = shtmlUrl;
    } catch {
        html = await fetchHTML(baseUrl);  usedUrl = baseUrl;
    }

    // Filtrar por tipo: solo Letra y Acordes (guitarra, otipo='R')
    const otipoM = html.match(/otipo='([^']*)'/);
    const otipo  = otipoM ? otipoM[1].toUpperCase() : '';
    if (otipoM && !LC_CHORD_TIPOS.has(otipo)) {
        return { usedUrl, texts: [], skippedType: otipo };
    }

    const texts = [];

    // Extraer rtBody divs
    const rtBodies = [...html.matchAll(/<div[^>]*class=['"]?rtBody['"]?[^>]*>([\s\S]*?)<\/div>/gi)];
    for (const m of rtBodies) {
        const preM = m[1].match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        if (preM) {
            const txt = decodeEntities(stripTags(preM[1])).trim();
            if (txt.length > 50) texts.push(txt);
        }
    }

    // Fallback: el <pre> más largo de la página
    if (texts.length === 0) {
        const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
        let best = '';
        let pm;
        while ((pm = preRe.exec(html)) !== null) {
            const t = decodeEntities(stripTags(pm[1])).trim();
            if (t.length > best.length) best = t;
        }
        if (best.length > 50) texts.push(best);
    }

    return { usedUrl, texts };
}

// ── SAVE ──────────────────────────────────────────────────────────────────────
function detectKey(text) {
    const m = (text || '').match(/[Tt]ono[:\s]+([A-G][#b]?m?)/);
    if (m) return m[1];
    return 'C';
}

function saveSong(artistName, artistSlug, title, baseSlug, versionFiles) {
    const id      = `${slugify(artistSlug)}_${slugify(baseSlug)}`;
    const songDir = path.join(LIBRARY_DIR, id);
    if (!fs.existsSync(songDir)) fs.mkdirSync(songDir, { recursive: true });

    const metaPath = path.join(songDir, 'meta.json');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}

    const existing = meta.versions || [];

    for (const vf of versionFiles) {
        const fname = vf.file;
        fs.writeFileSync(path.join(songDir, fname), vf.text, 'utf8');
        if (!existing.find(e => e.file === fname)) {
            existing.push({ file: fname, source: vf.source });
        }
    }

    meta = {
        id,
        title: meta.title || title,
        artist: meta.artist || artistName,
        genre: meta.genre || 'Worship',
        original_key: meta.original_key || detectKey(versionFiles[0]?.text || ''),
        versions: existing
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    return meta;
}

function upsertIndex(entry) {
    const index = loadIndex();
    const i     = index.findIndex(e => e.id === entry.id);
    const rec   = { id: entry.id, title: entry.title, artist: entry.artist,
                    genre: entry.genre || 'Worship', original_key: entry.original_key };
    if (i !== -1) index[i] = rec; else index.push(rec);
    saveIndex(index);
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

    const { artistName, songs, artistSlug, lcSlug } = info;
    const groups = groupSongs(songs);
    const groupList = [...groups.entries()].slice(0, MAX);

    console.log(`\n── Resumen ──────────────────────────────────────────`);
    console.log(`   Canciones únicas: ${groupList.length}`);
    const totalVersionEntries = groupList.reduce((s, [, g]) => s + g.versions.length, 0);
    console.log(`   Entradas totales (versiones): ${totalVersionEntries}`);
    console.log(`────────────────────────────────────────────────────\n`);

    let saved = 0, skipped = 0;

    for (let i = 0; i < groupList.length; i++) {
        const [baseSlug, group] = groupList[i];
        const vCount = group.versions.length;
        process.stdout.write(`  [${i+1}/${groupList.length}] "${group.title}" (${vCount} versión${vCount > 1 ? 'es' : ''}) ... `);

        const versionFiles = [];
        let vNum = 1;

        for (const ver of group.versions) {
            await sleep(DELAY);
            try {
                const { usedUrl, texts, skippedType } = await lcFetchVersion(lcSlug, ver.slug);
                if (skippedType) {
                    process.stdout.write(`[tipo ${skippedType} ignorado] `);
                    continue;
                }
                for (const txt of texts) {
                    versionFiles.push({
                        file: `chords_v${vNum}_lacuerda.txt`,
                        text: txt,
                        source: usedUrl
                    });
                    vNum++;
                }
            } catch (e) {
                process.stdout.write(`[error v${vNum}: ${e.message}] `);
            }
        }

        if (!versionFiles.length) {
            console.log('sin contenido, saltada');
            skipped++;
            continue;
        }

        const entry = saveSong(artistName, artistSlug, group.title, baseSlug, versionFiles);
        upsertIndex(entry);
        console.log(`✓  ${versionFiles.length} archivo${versionFiles.length > 1 ? 's' : ''}`);
        saved++;
    }

    console.log(`\n✅  ${saved} guardadas · ${skipped} sin contenido`);
    console.log(`   Librería: ${LIBRARY_DIR}`);
})();
