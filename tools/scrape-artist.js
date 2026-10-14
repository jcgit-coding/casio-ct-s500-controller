#!/usr/bin/env node
/**
 * scrape-artist.js  — CasioController personal library builder
 * SIN dependencias externas — solo módulos built-in de Node.js
 *
 * Uso:
 *   node scrape-artist.js --artist "marcos-witt"              # dual (lacuerda primero, cifraclub de respaldo)
 *   node scrape-artist.js --artist "marcos-witt" --site lacuerda
 *   node scrape-artist.js --artist "marcos-witt" --site cifraclub
 *
 * Opciones:
 *   --artist    slug del artista (ej: marcos-witt, grupo-grace)
 *   --site      dual (default) | lacuerda | cifraclub
 *   --url       URL directa de la página del artista (omite --artist)
 *   --delay     ms entre requests (default 1400)
 *   --max       máximo de canciones (default: todas)
 *   --versions  versiones por canción en cifraclub (default: 2)
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

const SITE       = get('--site', 'dual');
const ARTIST     = get('--artist', '');
const CUSTOM_URL = get('--url', '');
const DELAY      = parseInt(get('--delay', '1400'), 10);
const MAX        = parseInt(get('--max', '9999'), 10);
const MAX_VER    = parseInt(get('--versions', '2'), 10);

if (!ARTIST && !CUSTOM_URL) {
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

// ── Detección de portugués ────────────────────────────────────────────────────
// Palabras comunes en portugués que raramente aparecen en español
const PT_WORDS = [
    'você', 'voce', 'não', 'então', 'também', 'coração', 'coracao',
    'minha', 'meu', 'meus', 'minhas', 'teu', 'tua', 'teus', 'suas',
    'nosso', 'nossa', 'isso', 'essa', 'esse', 'aqui', 'muito',
    'fazer', 'viver', 'quero', 'serei', 'posso', 'tenho',
    'quando eu', 'para mim', 'de mim', 'em mim', 'por mim',
];

function isPortuguese(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    let hits = 0;
    for (const w of PT_WORDS) {
        if (lower.includes(w)) hits++;
        if (hits >= 3) return true;
    }
    return false;
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
    // lacuerda usa guion_bajo en slugs (marcos_witt, no marcos-witt)
    const lcSlug  = artistSlug.replace(/-/g, '_');
    const pageUrl = `${LC_BASE}/${lcSlug}/`;
    console.log(`\n[lacuerda] ${pageUrl}`);
    const html = await fetchHTML(pageUrl);

    const h1Raw = between(html, '<h1', '</h1>') || '';
    const name  = decodeEntities(stripTags(h1Raw)).replace(/^[>\s]+/, '').trim()
                  || artistSlug.replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    const seen  = new Set();
    const songs = [];

    // La lista completa está en <ul id=b_main class=b_main ...>
    // Cada entrada: <li id='rNNN' lcd='...'><a href="slug">Título <em>acordes</em></a></li>
    const mainListStart = html.indexOf('id=b_main');
    if (mainListStart !== -1) {
        const mainListEnd = html.indexOf('</ul>', mainListStart);
        const block = html.slice(mainListStart, mainListEnd > -1 ? mainListEnd : mainListStart + 200000);
        const re = /<li[^>]*><a href="([^"]+)">([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = re.exec(block)) !== null) {
            const slug  = m[1].trim();
            const title = decodeEntities(stripTags(m[2])).replace(/\s+acordes\s*$/i, '').trim();
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            songs.push({ slug, title, lcSlug });
        }
    }

    // Fallback: lista de populares (rList) si no encontramos b_main
    if (songs.length === 0) {
        const songListRe = /<li[^>]*onclick='[^']*location="([^"]+)"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
        let slm;
        while ((slm = songListRe.exec(html)) !== null) {
            const slug  = slm[1].replace(/^\/+/, '').replace(/\.html?$/, '').split('/').pop();
            const title = decodeEntities(stripTags(slm[2])).trim();
            if (!slug || slug.startsWith('/') || slug.startsWith('http') || seen.has(slug)) continue;
            seen.add(slug);
            songs.push({ slug, title, lcSlug });
        }
    }

    console.log(`  Artista: "${name}"  |  Canciones en lacuerda: ${songs.length}`);
    return { artistName: name, songs: songs.slice(0, MAX), artistSlug, lcSlug };
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

async function lcSongVersions(artistSlug, songSlug, lcSlug) {
    const artist  = lcSlug || artistSlug.replace(/-/g, '_');
    const baseUrl = `${LC_BASE}/${artist}/${songSlug}`;
    const versions = [];
    try {
        const html = await fetchHTML(baseUrl);
        const text = extractLacuerdaText(html);
        if (text) versions.push({ source: baseUrl, text, version: 1 });
    } catch (e) { console.warn(`  [error lc] ${songSlug}: ${e.message}`); }
    return versions;
}

// ── CIFRACLUB ─────────────────────────────────────────────────────────────────
const CC_BASE = 'https://www.cifraclub.com';

async function ccArtistPage(artistSlug) {
    const pageUrl = `${CC_BASE}/${artistSlug}/`;
    console.log(`\n[cifraclub] ${pageUrl}`);
    const html = await fetchHTML(pageUrl);

    // Artist name — JSON-LD first, then og:title
    let name = '';
    const jsonLd = between(html, '"@type":"MusicGroup"', '}') || between(html, '"@type": "MusicGroup"', '}') || '';
    const nameM  = jsonLd.match(/"name"\s*:\s*"([^"]+)"/) || html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    if (nameM) name = decodeEntities(nameM[1]).replace(/\s*[-–|].*$/, '').trim();
    if (!name) {
        const h1 = between(html, '<h1', '</h1>') || '';
        name = decodeEntities(stripTags(h1)).trim();
    }
    name = name || artistSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const SKIP = new Set(['discografia','videos','fotos','bio','letras','?instrument=lyrics',
                          '?instrument=guitarpro','?instrument=sheet','imprimir','tabs']);
    const seen  = new Set();
    const songs = [];

    const hrefRe = new RegExp(`href=["']\\/(${artistSlug.replace(/[-]/g,'[-]')}\\/([^"'/\\?#]+)\\/)["']`, 'gi');
    let hm;
    while ((hm = hrefRe.exec(html)) !== null) {
        const songSlug = hm[2];
        if (!songSlug || seen.has(songSlug) || SKIP.has(songSlug)) continue;
        seen.add(songSlug);
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

    console.log(`  Artista: "${name}"  |  Canciones en cifraclub: ${songs.length}`);
    return { artistName: name, songs: songs.slice(0, MAX), artistSlug };
}

function extractCifraclubText(html) {
    const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    let best = '';
    let m;
    while ((m = preRe.exec(html)) !== null) {
        const txt = decodeEntities(stripTags(m[1])).trim();
        if (txt.length > best.length) best = txt;
    }
    if (best.length > 50) return best;

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
    } catch (e) { console.warn(`  [error cc] ${songSlug}: ${e.message}`); }
    return versions;
}

// ── SAVE TO LIBRARY ───────────────────────────────────────────────────────────
function detectKey(text) {
    const m = (text || '').match(/[Tt]ono[:\s]+([A-G][#b]?m?)/);
    if (m) return m[1];
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

// ── MODO DUAL: lacuerda primero, cifraclub de respaldo ────────────────────────
async function runDual(artistSlug) {
    // 1. Obtener listas de ambos sitios en paralelo
    let lcInfo = { artistName: '', songs: [], artistSlug, lcSlug: artistSlug.replace(/-/g,'_') };
    let ccInfo = { artistName: '', songs: [], artistSlug };

    try { lcInfo = await lcArtistPage(artistSlug); } catch (e) { console.warn(`[lacuerda] Error: ${e.message}`); }
    await sleep(DELAY);
    try { ccInfo = await ccArtistPage(artistSlug); } catch (e) { console.warn(`[cifraclub] Error: ${e.message}`); }

    const artistName = lcInfo.artistName || ccInfo.artistName
        || artistSlug.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    // 2. Construir mapa normalizado de canciones
    //    lcuerda tiene prioridad; cifraclub solo se usa si la canción no está en lacuerda
    const normalize = t => slugify(t || '').replace(/_+/g,'');

    const lcMap = new Map(); // normTitle -> { slug, title }
    for (const s of lcInfo.songs) lcMap.set(normalize(s.title), s);

    // Index de lacuerda por slug también (para buscar por slug)
    const lcSlugMap = new Map();
    for (const s of lcInfo.songs) lcSlugMap.set(s.slug, s);

    // Canciones de cifraclub que NO están en lacuerda
    const ccOnly = [];
    for (const s of ccInfo.songs) {
        const key = normalize(s.title);
        if (!lcMap.has(key)) {
            // También revisar por slug (slugs de ambos sitios suelen coincidir)
            if (!lcSlugMap.has(s.slug)) {
                ccOnly.push(s);
            }
        }
    }

    const allLc = lcInfo.songs;
    console.log(`\n── Resumen ──────────────────────────────────────────`);
    console.log(`   lacuerda:  ${allLc.length} canciones`);
    console.log(`   cifraclub solo: ${ccOnly.length} canciones nuevas`);
    console.log(`   Total: ${allLc.length + ccOnly.length} canciones`);
    console.log(`─────────────────────────────────────────────────────\n`);

    let saved = 0, skipped = 0, ptSkipped = 0;

    // 3. Descargar de lacuerda
    console.log(`\n[1/2] Descargando de lacuerda (${allLc.length} canciones)...`);
    for (let i = 0; i < allLc.length; i++) {
        const song = allLc[i];
        process.stdout.write(`  [${i+1}/${allLc.length}] ${song.title} ... `);
        await sleep(DELAY);

        const versions = await lcSongVersions(artistSlug, song.slug, lcInfo.lcSlug);
        if (!versions.length) { console.log('sin contenido, saltada'); skipped++; continue; }

        const entry = saveSong(artistName, artistSlug, song.title, song.slug, versions, 'lacuerda');
        upsertIndex(entry);
        console.log(`✓ lacuerda`);
        saved++;
    }

    // 4. Descargar de cifraclub solo las que no están en lacuerda
    if (ccOnly.length > 0) {
        console.log(`\n[2/2] Descargando de cifraclub (${ccOnly.length} canciones no encontradas en lacuerda)...`);
        for (let i = 0; i < ccOnly.length; i++) {
            const song = ccOnly[i];
            process.stdout.write(`  [${i+1}/${ccOnly.length}] ${song.title} ... `);
            await sleep(DELAY);

            const versions = await ccSongVersions(artistSlug, song.slug);
            if (!versions.length) { console.log('sin contenido, saltada'); skipped++; continue; }

            // Filtrar versiones en portugués
            const spanishVersions = versions.filter(v => {
                if (isPortuguese(v.text)) return false;
                return true;
            });

            if (!spanishVersions.length) {
                console.log('en portugués, saltada');
                ptSkipped++;
                continue;
            }

            // Renumerar versiones
            spanishVersions.forEach((v, idx) => { v.version = idx + 1; });

            const entry = saveSong(artistName, artistSlug, song.title, song.slug, spanishVersions, 'cifraclub');
            upsertIndex(entry);
            console.log(`✓ cifraclub (${spanishVersions.length} versión${spanishVersions.length > 1 ? 'es' : ''})`);
            saved++;
        }
    }

    console.log(`\n✅  ${saved} guardadas · ${skipped} sin contenido · ${ptSkipped} en portugués (ignoradas)`);
    console.log(`   Librería: ${LIBRARY_DIR}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
    const site = CUSTOM_URL
        ? (CUSTOM_URL.includes('lacuerda') ? 'lacuerda' : 'cifraclub')
        : SITE;

    let artistSlug = ARTIST;
    if (CUSTOM_URL) {
        const m = CUSTOM_URL.match(/(?:cifraclub\.com|lacuerda\.net)\/([^/?#]+)/);
        if (m) artistSlug = m[1];
    }

    if (!artistSlug) {
        console.error('No se pudo determinar el slug del artista.');
        process.exit(1);
    }

    if (site === 'dual') {
        await runDual(artistSlug);
        return;
    }

    // Modo single-site (lacuerda o cifraclub)
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

    let saved = 0, skipped = 0, ptSkipped = 0;
    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        process.stdout.write(`  [${i+1}/${songs.length}] ${song.title} ... `);
        await sleep(DELAY);

        const versions = site === 'lacuerda'
            ? await lcSongVersions(artistSlug, song.slug, info.lcSlug)
            : await ccSongVersions(artistSlug, song.slug);

        if (!versions.length) { console.log('sin contenido, saltada'); skipped++; continue; }

        if (site === 'cifraclub') {
            const spanishVersions = versions.filter(v => !isPortuguese(v.text));
            if (!spanishVersions.length) {
                console.log('en portugués, saltada');
                ptSkipped++;
                continue;
            }
            spanishVersions.forEach((v, idx) => { v.version = idx + 1; });
            const entry = saveSong(artistName, artistSlug, song.title, song.slug, spanishVersions, site);
            upsertIndex(entry);
            console.log(`✓  (${spanishVersions.length} versión${spanishVersions.length > 1 ? 'es' : ''})`);
        } else {
            const entry = saveSong(artistName, artistSlug, song.title, song.slug, versions, site);
            upsertIndex(entry);
            console.log(`✓`);
        }
        saved++;
    }

    console.log(`\n✅  ${saved} guardadas · ${skipped} sin contenido · ${ptSkipped} en portugués (ignoradas)`);
    console.log(`   Librería: ${LIBRARY_DIR}`);
})();
