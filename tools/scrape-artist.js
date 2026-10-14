#!/usr/bin/env node
/**
 * scrape-artist.js  — CasioController personal library builder
 *
 * Descarga TODAS las canciones de un artista desde cifraclub.com.co o lacuerda.net
 * y las guarda en library/ en el formato estándar (meta.json + chords_v{N}.txt).
 *
 * Uso:
 *   node scrape-artist.js --artist "grupo-grace" --site cifraclub
 *   node scrape-artist.js --artist "marcos-witt"  --site cifraclub
 *   node scrape-artist.js --artist "marcos-witt"  --site lacuerda
 *   node scrape-artist.js --url "https://www.cifraclub.com.co/grupo-grace/"
 *
 * Opciones:
 *   --artist   slug del artista tal como aparece en la URL del sitio
 *   --site     cifraclub (default) | lacuerda
 *   --url      URL directa de la página del artista (sobreescribe --artist/--site)
 *   --delay    ms entre requests (default 1200, no bajar de 800)
 *   --max      máximo de canciones a bajar (default: todas)
 *   --versions cuántas versiones por canción (default: 3)
 */

'use strict';

const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const LIBRARY_DIR = path.resolve(__dirname, '..', 'library');
const INDEX_FILE  = path.join(LIBRARY_DIR, 'index.json');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : def; };

const SITE     = get('--site', 'cifraclub');
const ARTIST   = get('--artist', '');
const CUSTOM_URL = get('--url', '');
const DELAY    = parseInt(get('--delay', '1200'), 10);
const MAX      = parseInt(get('--max', '9999'), 10);
const MAX_VER  = parseInt(get('--versions', '3'), 10);

if (!ARTIST && !CUSTOM_URL) {
    console.error('Uso: node scrape-artist.js --artist "grupo-grace" --site cifraclub');
    process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchHTML(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.text();
}

function slugify(str) {
    return str.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

function loadIndex() {
    try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
    catch { return []; }
}

function saveIndex(index) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

// ── CIFRACLUB ─────────────────────────────────────────────────────────────────
const CC_BASE = 'https://www.cifraclub.com.co';

async function ccGetArtistSongs(artistSlug) {
    const url  = `${CC_BASE}/${artistSlug}/`;
    console.log(`\n[cifraclub] Leyendo artista: ${url}`);
    const html = await fetchHTML(url);
    const $    = cheerio.load(html);

    // Artist display name
    const artistName = $('h1.artist-name, h1.art_name, h1').first().text().trim()
                    || artistSlug.replace(/-/g, ' ');

    // Song links: /artist-slug/song-slug/
    const links = new Map();
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m    = href.match(/^\/([^/]+)\/([^/]+)\/?$/);
        if (m && m[1] === artistSlug && m[2] !== 'discografia' && m[2] !== 'videos') {
            const title = $(el).text().trim();
            if (title) links.set(href, { slug: m[2], title });
        }
    });

    console.log(`  Encontradas ${links.size} canciones para "${artistName}"`);
    return { artistName, songs: [...links.values()].slice(0, MAX), artistSlug };
}

async function ccGetSongVersions(artistSlug, songSlug, maxVersions) {
    // Version 1: the canonical page
    const baseUrl = `${CC_BASE}/${artistSlug}/${songSlug}/`;
    const versions = [];

    try {
        const html = await fetchHTML(baseUrl);
        const $    = cheerio.load(html);

        // Extract chord text from <pre> inside .cifra_cnt or #cifra_cnt
        const chordText = extractCifraclubChords($, html);
        if (chordText) versions.push({ source: baseUrl, text: chordText, version: 1 });

        // Look for alternate versions linked on the page
        if (maxVersions > 1) {
            const altLinks = [];
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href') || '';
                if (href.includes(`/${artistSlug}/${songSlug}/`) && href !== baseUrl && !href.endsWith('#')) {
                    altLinks.push(CC_BASE + href.replace(CC_BASE, ''));
                }
            });
            for (const altUrl of [...new Set(altLinks)].slice(0, maxVersions - 1)) {
                await sleep(DELAY);
                try {
                    const altHtml = await fetchHTML(altUrl);
                    const $2      = cheerio.load(altHtml);
                    const txt     = extractCifraclubChords($2, altHtml);
                    if (txt) versions.push({ source: altUrl, text: txt, version: versions.length + 1 });
                } catch (e) { console.warn(`    [skip alt version] ${e.message}`); }
            }
        }
    } catch (e) {
        console.warn(`  [skip] ${songSlug}: ${e.message}`);
    }
    return versions;
}

function extractCifraclubChords($, html) {
    // Try known containers
    let text = '';
    const candidates = [
        '#cifra_cnt pre',
        '.cifra_cnt pre',
        'pre.cifra',
        'pre',
        '#cifra_cnt',
        '.cifra_cnt',
    ];
    for (const sel of candidates) {
        const el = $(sel).first();
        if (el.length && el.text().trim().length > 30) {
            text = el.text().trim();
            break;
        }
    }
    // Fallback: grab large text blocks
    if (!text) {
        $('div, section').each((_, el) => {
            const t = $(el).text().trim();
            if (t.length > 200 && /[CDEFGAB][#b]?m?\s/.test(t) && !text) text = t;
        });
    }
    return text || null;
}

// ── LACUERDA ──────────────────────────────────────────────────────────────────
const LC_BASE = 'https://www.lacuerda.net';

async function lcGetArtistSongs(artistSlug) {
    const url  = `${LC_BASE}/${artistSlug}/`;
    console.log(`\n[lacuerda] Leyendo artista: ${url}`);
    const html = await fetchHTML(url);
    const $    = cheerio.load(html);

    const artistName = $('h1').first().text().trim() || artistSlug.replace(/-/g, ' ');

    const links = new Map();
    $('a[href]').each((_, el) => {
        const href  = $(el).attr('href') || '';
        const title = $(el).text().trim();
        // lacuerda song links: /{artist}/{song}.html or /{artist}/{song}/
        if ((href.includes(`/${artistSlug}/`) && href !== `/${artistSlug}/`) && title) {
            links.set(href, { slug: path.basename(href).replace('.html',''), title });
        }
    });

    console.log(`  Encontradas ${links.size} canciones para "${artistName}"`);
    return { artistName, songs: [...links.values()].slice(0, MAX), artistSlug };
}

async function lcGetSongVersions(artistSlug, songSlug, maxVersions) {
    const baseUrl = `${LC_BASE}/${artistSlug}/${songSlug}.html`;
    const versions = [];
    try {
        const html = await fetchHTML(baseUrl);
        const $    = cheerio.load(html);
        const text = extractLacuerdaChords($);
        if (text) versions.push({ source: baseUrl, text, version: 1 });

        // lacuerda may list other versions
        if (maxVersions > 1) {
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href') || '';
                if (href.includes(songSlug) && href !== baseUrl && versions.length < maxVersions) {
                    versions.push({ source: LC_BASE + href, _pending: true, version: versions.length + 1 });
                }
            });
            for (let i = 0; i < versions.length; i++) {
                if (versions[i]._pending) {
                    await sleep(DELAY);
                    try {
                        const h2 = await fetchHTML(versions[i].source);
                        const $2 = cheerio.load(h2);
                        versions[i].text = extractLacuerdaChords($2);
                        delete versions[i]._pending;
                        if (!versions[i].text) versions.splice(i--, 1);
                    } catch { versions.splice(i--, 1); }
                }
            }
        }
    } catch (e) {
        console.warn(`  [skip] ${songSlug}: ${e.message}`);
    }
    return versions;
}

function extractLacuerdaChords($) {
    // lacuerda puts chords in <pre> or .cifra divs
    for (const sel of ['pre.cifra', 'pre', '.partitura', '.cifra']) {
        const el = $(sel).first();
        if (el.length && el.text().trim().length > 30) return el.text().trim();
    }
    return null;
}

// ── SAVE TO LIBRARY ───────────────────────────────────────────────────────────
function saveSong(artistName, artistSlug, songTitle, songSlug, versions, site) {
    const id      = `${slugify(artistSlug)}_${slugify(songSlug)}`;
    const songDir = path.join(LIBRARY_DIR, id);

    if (!fs.existsSync(songDir)) fs.mkdirSync(songDir, { recursive: true });

    // Save each version as chords_v{N}_{site}.txt
    const savedVersions = [];
    for (const v of versions) {
        if (!v.text) continue;
        const fname = `chords_v${v.version}_${site}.txt`;
        fs.writeFileSync(path.join(songDir, fname), v.text, 'utf8');
        savedVersions.push({ file: fname, source: v.source });
    }

    // Detect key from first version (look for "Tono:" or first chord)
    let key = 'C';
    const firstText = versions[0]?.text || '';
    const tonoMatch = firstText.match(/[Tt]ono[:\s]+([A-G][#b]?m?)/);
    if (tonoMatch) key = tonoMatch[1];

    // Write / update meta.json
    const metaPath = path.join(songDir, 'meta.json');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}

    // Merge versions list
    const existing = meta.versions || [];
    for (const sv of savedVersions) {
        if (!existing.find(e => e.file === sv.file)) existing.push(sv);
    }

    meta = {
        id,
        title: meta.title || songTitle,
        artist: meta.artist || artistName,
        genre: meta.genre || 'Worship',
        original_key: meta.original_key || key,
        versions: existing
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

    return { id, title: meta.title, artist: meta.artist, original_key: meta.original_key };
}

function updateIndex(entry) {
    const index = loadIndex();
    const existing = index.findIndex(e => e.id === entry.id);
    const record = { id: entry.id, title: entry.title, artist: entry.artist,
                     genre: entry.genre || 'Worship', original_key: entry.original_key };
    if (existing !== -1) index[existing] = record;
    else index.push(record);
    saveIndex(index);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
    const site = CUSTOM_URL
        ? (CUSTOM_URL.includes('lacuerda') ? 'lacuerda' : 'cifraclub')
        : SITE;

    let artistSlug = ARTIST;
    if (CUSTOM_URL) {
        const m = CUSTOM_URL.match(/(?:cifraclub\.com\.co|lacuerda\.net)\/([^/]+)/);
        artistSlug = m ? m[1] : ARTIST;
    }

    let info;
    try {
        info = site === 'lacuerda'
            ? await lcGetArtistSongs(artistSlug)
            : await ccGetArtistSongs(artistSlug);
    } catch (e) {
        console.error(`Error leyendo artista: ${e.message}`);
        process.exit(1);
    }

    const { artistName, songs } = info;
    console.log(`\nDescargando ${songs.length} canciones de "${artistName}" (${site})...\n`);

    let saved = 0, skipped = 0;
    for (const song of songs) {
        process.stdout.write(`  [${saved + skipped + 1}/${songs.length}] ${song.title} ... `);
        await sleep(DELAY);

        const versions = site === 'lacuerda'
            ? await lcGetSongVersions(artistSlug, song.slug, MAX_VER)
            : await ccGetSongVersions(artistSlug, song.slug, MAX_VER);

        if (!versions.length) {
            console.log('sin contenido, saltada');
            skipped++;
            continue;
        }

        const entry = saveSong(artistName, artistSlug, song.title, song.slug, versions, site);
        updateIndex(entry);
        console.log(`✓ (${versions.length} versión${versions.length > 1 ? 'es' : ''})`);
        saved++;
    }

    console.log(`\n✅ Listo: ${saved} canciones guardadas, ${skipped} saltadas.`);
    console.log(`   Librería actualizada en: ${LIBRARY_DIR}`);
})();
