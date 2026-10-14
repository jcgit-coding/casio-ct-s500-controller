#!/usr/bin/env node
/**
 * scrape-artist.js  — CasioController personal library builder
 * SIN dependencias externas — solo módulos built-in de Node.js
 *
 * Uso:
 *   node scrape-artist.js --artist "marcos-witt" --site cifraclub
 *   node scrape-artist.js --artist "marcos-witt" --site lacuerda
 *   node scrape-artist.js --url "https://www.cifraclub.com.co/marcos-witt/"
 *
 * Opciones:
 *   --artist    slug del artista (ej: marcos-witt, grupo-grace)
 *   --site      cifraclub (default) | lacuerda
 *   --url       URL directa de la página del artista
 *   --delay     ms entre requests (default 1400)
 *   --max       máximo de canciones (default: todas)
 *   --versions  versiones por canción (default: 3)
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
const args   = process.argv.slice(2);
const get    = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : def; };

const SITE       = get('--site', 'cifraclub');
const ARTIST     = get('--artist', '');
const CUSTOM_URL = get('--url', '');
const DELAY      = parseInt(get('--delay', '1400'), 10);
const MAX        = parseInt(get('--max', '9999'), 10);
const MAX_VER    = parseInt(get('--versions', '3'), 10);

if (!ARTIST && !CUSTOM_URL) {
    console.error('Uso: node scrape-artist.js --artist "marcos-witt" --site cifraclub');
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
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-CO,es;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'identity',
                'Referer': 'https://www.google.com/',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Upgrade-Insecure-Requests': '1',
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

// ── HTML utils (no cheerio) ───────────────────────────────────────────────────
function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/&[a-z]+;/g, '');
}

function stripTags(str) {
    return str.replace(/<[^>]+>/g, '');
}

function between(str, open, close) {
    const s = str.indexOf(open);
    if (s === -1) return null;
    const e = str.indexOf(close, s + open.length);
    if (e === -1) return null;
    return str.slice(s + open.length, e);
}

// Extract all href+text pairs from <a> tags
function extractLinks(html) {
    const links = [];
    const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        links.push({ href: m[1], text: decodeEntities(stripTags(m[2])).trim() });
    }
    return links;
}

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

// ── CIFRACLUB ─────────────────────────────────────────────────────────────────
const CC_BASE = 'https://www.cifraclub.com';

async function ccArtistPage(artistSlug) {
    const pageUrl = `${CC_BASE}/${artistSlug}/`;
    console.log(`\n[cifraclub] ${pageUrl}`);
    const html = await fetchHTML(pageUrl);

    // Artist name — try JSON-LD first (most reliable), then og:title, then h1
    let name = '';
    const jsonLd = between(html, '"@type":"MusicGroup"', '}') || between(html, '"@type": "MusicGroup"', '}') || '';
    const nameM  = jsonLd.match(/"name"\s*:\s*"([^"]+)"/) || html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    if (nameM) name = decodeEntities(nameM[1]).replace(/\s*[-–|].*$/, '').trim();
    if (!name) {
        const h1 = between(html, '<h1', '</h1>') || '';
        name = decodeEntities(stripTags(h1)).trim();
    }
    name = name || artistSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Song links: /{artist}/{song}/ — extract from raw href attributes (Next.js pages inline data)
    const SKIP = new Set(['discografia','videos','fotos','bio','letras','?instrument=lyrics',
                          '?instrument=guitarpro','?instrument=sheet','imprimir','tabs']);
    const seen  = new Set();
    const songs = [];

    // Match all href values that follow the pattern /{artistSlug}/{song}/
    const hrefRe = new RegExp(`href=["']\\/(${artistSlug.replace(/[-]/g,'[-]')}\\/([^"'/\\?#]+)\\/)["']`, 'gi');
    let hm;
    while ((hm = hrefRe.exec(html)) !== null) {
        const songSlug = hm[2];
        if (!songSlug || seen.has(songSlug) || SKIP.has(songSlug)) continue;
        seen.add(songSlug);
        // Try to find associated text (title) near this href — look for data-title or aria-label or nearby text
        const pos   = hm.index;
        const chunk = html.slice(pos, pos + 400);
        const titleM = chunk.match(/(?:title|aria-label|data-title)=["']([^"']+)["']/) ||
                       chunk.match(/>([^<]{3,80})<\/a>/) ||
                       chunk.match(/>([^<]{3,80})<\/span>/);
        const title = titleM
            ? decodeEntities(titleM[1]).trim()
            : songSlug.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
        songs.push({ slug: songSlug, title });
    }

    console.log(`  Artista: "${name}"  |  Canciones encontradas: ${songs.length}`);
    return { artistName: name, songs: songs.slice(0, MAX), artistSlug };
}

function extractCifraclubText(html) {
    // Try <pre> blocks — cifraclub stores chord sheets in pre tags
    const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    let best = '';
    let m;
    while ((m = preRe.exec(html)) !== null) {
        const txt = decodeEntities(stripTags(m[1])).trim();
        if (txt.length > best.length) best = txt;
    }
    if (best.length > 50) return best;

    // Fallback: look for div.cifra_cnt
    const block = between(html, 'class="cifra_cnt"', '</div>') ||
                  between(html, "class='cifra_cnt'", '</div>') || '';
    if (block) {
        const t = decodeEntities(stripTags(block)).trim();
        if (t.length > 50) return t;
    }
    return null;
}

async function ccSongVersions(artistSlug, songSlug) {
    const baseUrl  = `${CC_BASE}/${artistSlug}/${songSlug}/`;
    const versions = [];
    try {
        const html = await fetchHTML(baseUrl);
        const text = extractCifraclubText(html);
        if (text) versions.push({ source: baseUrl, text, version: 1 });

        if (MAX_VER > 1) {
            // Look for "outras versões" / version links on page
            const altSeen = new Set([baseUrl]);
            for (const { href } of extractLinks(html)) {
                if (versions.length >= MAX_VER) break;
                const full = href.startsWith('http') ? href : CC_BASE + href;
                if (!altSeen.has(full) && full.includes(`/${artistSlug}/${songSlug}`)) {
                    altSeen.add(full);
                    await sleep(DELAY);
                    try {
                        const h2  = await fetchHTML(full);
                        const t2  = extractCifraclubText(h2);
                        if (t2) versions.push({ source: full, text: t2, version: versions.length + 1 });
                    } catch {}
                }
            }
        }
    } catch (e) { console.warn(`  [error] ${songSlug}: ${e.message}`); }
    return versions;
}

// ── LACUERDA ──────────────────────────────────────────────────────────────────
const LC_BASE = 'https://www.lacuerda.net';

async function lcArtistPage(artistSlug) {
    const pageUrl = `${LC_BASE}/${artistSlug}/`;
    console.log(`\n[lacuerda] ${pageUrl}`);
    const html = await fetchHTML(pageUrl);

    const h1   = between(html, '<h1', '</h1>') || '';
    const name = decodeEntities(stripTags(h1)).trim() || artistSlug.replace(/-/g,' ');

    const seen  = new Set();
    const songs = [];
    for (const { href, text } of extractLinks(html)) {
        if (!text || !href.includes(`/${artistSlug}/`)) continue;
        const slug = path.basename(href).replace(/\.html?$/, '');
        if (!slug || slug === artistSlug || seen.has(slug)) continue;
        seen.add(slug);
        songs.push({ slug, title: text });
    }

    console.log(`  Artista: "${name}"  |  Canciones encontradas: ${songs.length}`);
    return { artistName: name, songs: songs.slice(0, MAX), artistSlug };
}

function extractLacuerdaText(html) {
    const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    let best = '';
    let m;
    while ((m = preRe.exec(html)) !== null) {
        const txt = decodeEntities(stripTags(m[1])).trim();
        if (txt.length > best.length) best = txt;
    }
    return best.length > 50 ? best : null;
}

async function lcSongVersions(artistSlug, songSlug) {
    const baseUrl  = `${LC_BASE}/${artistSlug}/${songSlug}.html`;
    const versions = [];
    try {
        const html = await fetchHTML(baseUrl);
        const text = extractLacuerdaText(html);
        if (text) versions.push({ source: baseUrl, text, version: 1 });
    } catch (e) { console.warn(`  [error] ${songSlug}: ${e.message}`); }
    return versions;
}

// ── SAVE TO LIBRARY ───────────────────────────────────────────────────────────
function detectKey(text) {
    const m = (text || '').match(/[Tt]ono[:\s]+([A-G][#b]?m?)/);
    if (m) return m[1];
    // First chord-like token on a chord line
    const lines = text.split('\n');
    for (const line of lines) {
        const chord = line.trim().match(/^([A-G][#b]?m?)\s/);
        if (chord) return chord[1];
    }
    return 'C';
}

function saveSong(artistName, artistSlug, title, songSlug, versions, site) {
    const id      = `${slugify(artistSlug)}_${slugify(songSlug)}`;
    const songDir = path.join(LIBRARY_DIR, id);
    if (!fs.existsSync(songDir)) fs.mkdirSync(songDir, { recursive: true });

    const savedVersions = [];
    for (const v of versions) {
        if (!v.text) continue;
        const fname = `chords_v${v.version}_${site}.txt`;
        fs.writeFileSync(path.join(songDir, fname), v.text, 'utf8');
        savedVersions.push({ file: fname, source: v.source });
    }

    const metaPath = path.join(songDir, 'meta.json');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}

    const existing = meta.versions || [];
    for (const sv of savedVersions) {
        if (!existing.find(e => e.file === sv.file)) existing.push(sv);
    }

    meta = {
        id,
        title: meta.title || title,
        artist: meta.artist || artistName,
        genre: meta.genre || 'Worship',
        original_key: meta.original_key || detectKey(versions[0]?.text || ''),
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
    const site = CUSTOM_URL
        ? (CUSTOM_URL.includes('lacuerda') ? 'lacuerda' : 'cifraclub')
        : SITE;

    let artistSlug = ARTIST;
    if (CUSTOM_URL) {
        const m = CUSTOM_URL.match(/(?:cifraclub\.com\.co|lacuerda\.net)\/([^/?#]+)/);
        if (m) artistSlug = m[1];
    }

    let info;
    try {
        info = site === 'lacuerda'
            ? await lcArtistPage(artistSlug)
            : await ccArtistPage(artistSlug);
    } catch (e) {
        console.error(`Error leyendo artista: ${e.message}`);
        process.exit(1);
    }

    const { artistName, songs } = info;
    console.log(`\nDescargando ${songs.length} canciones...\n`);

    let saved = 0, skipped = 0;
    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        process.stdout.write(`  [${i+1}/${songs.length}] ${song.title} ... `);
        await sleep(DELAY);

        const versions = site === 'lacuerda'
            ? await lcSongVersions(artistSlug, song.slug)
            : await ccSongVersions(artistSlug, song.slug);

        if (!versions.length) { console.log('sin contenido, saltada'); skipped++; continue; }

        const entry = saveSong(artistName, artistSlug, song.title, song.slug, versions, site);
        upsertIndex(entry);
        console.log(`✓  (${versions.length} versión${versions.length > 1 ? 'es' : ''})`);
        saved++;
    }

    console.log(`\n✅  ${saved} guardadas · ${skipped} saltadas`);
    console.log(`   Librería: ${LIBRARY_DIR}`);
})();
