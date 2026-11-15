'use strict';
/**
 * lacuerda-parse.js — Utilidades de scraping/parseo de acordes.lacuerda.net
 *
 * Corrige los problemas detectados en el importador antiguo:
 *  - La página base (sin .shtml) contiene TODAS las versiones en <li onclick='tOpen(N)'>
 *  - Cada versión trae su tipo en <div class='tipoIcon tiR|tiT|tiB|tiK'>
 *  - Los acordes reales vienen marcados por <A>acorde</A> dentro del <pre>
 *  - Hay versiones en cifrado español (DO/RE/MI…) que deben convertirse a C/D/E…
 *  - Las líneas de tablatura y las etiquetas C1)/V1)/Coro: no deben tratarse como acordes
 */

const https = require('https');
const http = require('http');

const LC_BASE = 'https://acordes.lacuerda.net';

// ── HTTP ──────────────────────────────────────────────────────────────────────
function fetchHTML(rawUrl, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        let parsed;
        try { parsed = new URL(rawUrl); } catch (e) { return reject(e); }
        const mod = parsed.protocol === 'https:' ? https : http;
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
            timeout: 18000,
        };
        const req = mod.request(options, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
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
    return String(str || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
        .replace(/&[a-z]+;/gi, '');
}

function stripTags(str) { return String(str || '').replace(/<[^>]*>/g, ''); }

function slugify(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Notación ──────────────────────────────────────────────────────────────────
const SOLFEGE_MAP = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };

// Sufijo de acorde válido (después de la raíz). Acepta m, maj7, sus4, add9,
// (add2), +, (aug), /E, /F#, 7, 9, 11, 13, b, #, etc.
const CHORD_SUFFIX_RE = /^(?:[#b])?(?:(?:m(?:aj|in|ajor|inor)?|M(?:aj|ajor)?|dim|aug|sus|add|alt|no|°|ø|\+|-|\d|\/(?:SOL|DO|RE|MI|FA|LA|SI|[A-G])(?:#|b)?|\(|\)|,|'|[#b])*)$/i;

function isChordSuffix(rest) { return CHORD_SUFFIX_RE.test(rest || ''); }

function normalizeQualityCase(t) {
    return String(t)
        .replace(/♭/g, 'b').replace(/♯/g, '#')
        .replace(/[–—]/g, '-')
        .replace(/([A-G](?:#|b)?)(MAJOR|MINOR|MAJ|MIN|SUS|ADD|DIM|AUG|ALT)/g, (_, r, q) => r + q.toLowerCase());
}

/** Convierte una raíz/bajo en solfège a cifrado americano, conservando sufijo. */
function convertChordNotation(tok) {
    if (!tok) return tok;
    let t = normalizeQualityCase(String(tok).trim());

    const m = t.match(/^(SOL|DO|RE|MI|FA|LA|SI)([#b]?)([\s\S]*)$/i);
    if (m) {
        const base = SOLFEGE_MAP[m[1].toUpperCase()];
        const acc = m[2] || '';
        const rest = m[3] || '';
        if (base && isChordSuffix(rest)) t = base + acc + rest;
    }
    // Bajo en solfège: SOL/RE → G/D
    t = t.replace(/\/(SOL|DO|RE|MI|FA|LA|SI)([#b]?)/gi,
        (_, b, a) => '/' + (SOLFEGE_MAP[b.toUpperCase()] || b) + (a || ''));
    return t;
}

/** ¿El token completo es un acorde? (inglés o solfège) */
function isChordToken(tok) {
    if (!tok) return false;
    const t = normalizeQualityCase(String(tok).trim());
    if (!t) return false;
    let m = t.match(/^([A-G])([#b]?)([\s\S]*)$/);
    if (m && isChordSuffix(m[3])) return true;
    m = t.match(/^(SOL|DO|RE|MI|FA|LA|SI)([#b]?)([\s\S]*)$/i);
    return !!(m && isChordSuffix(m[3]));
}

// ── Líneas de tablatura ───────────────────────────────────────────────────────
function isTabLine(line) {
    const s = String(line || '').trim();
    if (!s) return false;
    // Cuerda etiquetada: E|--, G]:---, e/----, B>---
    if (/^[eEBGDAa-g]\s*[|>\]\/:]\s*[-–—0-9]/.test(s)) return true;
    // Solo caracteres de tablatura
    if (/^[\s\-–—|0-9phbr~\/\\:\[\]]+$/.test(s) && (s.match(/[-|]/g) || []).length >= 5) return true;
    // Densidad alta de guiones (tablatura sin etiqueta)
    const dashes = (s.match(/[-–—]/g) || []).length;
    if (dashes >= 8 && dashes / s.length > 0.30) return true;
    return false;
}

function stripTabLines(text) {
    return String(text || '').split('\n').filter(l => !isTabLine(l)).join('\n');
}

// ── Etiquetas de sección ──────────────────────────────────────────────────────
const SECTION_WORDS = 'Intro(?:ducci[oó]n)?|Outro|Coro|Estribillo|Verso|Estrofa|Puente|Pre[\\s-]?Coro|Bridge|Chorus|Verse|Pre[\\s-]?Chorus|Inter(?:ludio|medio)?|Instrumental|Solo|Riff|Final|Coda|Vamp|Tag|Bajada|Refr[aá]n';

const SECTION_ONLY_RE = new RegExp(
    `^\\[?\\s*(?:(${SECTION_WORDS})\\s*(\\d+)?)\\s*[.:)\\]]?\\s*$`, 'i');

const SECTION_WITH_TEXT_RE = new RegExp(
    `^(${SECTION_WORDS})\\s*(\\d+)?\\s*[.:)\\]]\\s*(.*)$`, 'i');

const REPEAT_RE = /^\(?\s*x\s*\d+\s*\)?$/i;

/** ¿La línea es una etiqueta de sección pura? */
function isSectionLabel(line) {
    const t = String(line || '').trim();
    if (!t) return false;
    // C1), V2., C3:  (Coro/Verso abreviados de lacuerda)
    if (/^[CV]\s*\d+\s*[).:]?$/i.test(t)) return true;
    if (REPEAT_RE.test(t)) return true;
    const clean = t.replace(/^[<>\[(\-=*~./+#:\s]+|[<\])>\-=*~./+#:\s]+$/g, '').trim();
    if (SECTION_ONLY_RE.test(clean)) return true;
    return false;
}

/**
 * Convierte marcadores de lacuerda a etiquetas reconocidas por el parser:
 *   C1) Al Rey...      → [Coro 1] + "Al Rey..."
 *   V2) Me ha...       → [Verso 2] + "Me ha..."
 *   Intro: SOLm, FA    → [Intro] + "SOLm, FA"
 *   Coro:              → [Coro]
 *   :Intro:            → [Intro]
 */
function normalizeSections(text) {
    const out = [];
    for (const line of String(text || '').split('\n')) {
        const t = line.trim();
        if (!t) { out.push(line); continue; }

        // C1) / V1) / C1: / V2.  (siempre con texto o solas)
        let m = t.match(/^([CV])\s*(\d+)\s*[).:\-–]\s*(.*)$/i);
        if (m) {
            const kind = m[1].toUpperCase() === 'C' ? 'Coro' : 'Verso';
            out.push(`[${kind} ${m[2]}]`);
            if (m[3].trim()) out.push(m[3].replace(/\s+$/, ''));
            continue;
        }

        // Etiqueta seguida de dos puntos/punto/paréntesis y contenido
        m = t.match(SECTION_WITH_TEXT_RE);
        if (m) {
            out.push(`[${capitalize(m[1].trim())}${m[2] ? ' ' + m[2] : ''}]`);
            if (m[3].trim()) out.push(m[3].replace(/\s+$/, ''));
            continue;
        }

        // Etiqueta sola (incluye :Intro:, [Coro], **Puente**)
        const clean = t.replace(/^[<>\[(\-=*~./+#:\s]+|[<\])>\-=*~./+#:\s]+$/g, '').trim();
        if (SECTION_ONLY_RE.test(clean)) {
            out.push(`[${capitalize(clean.replace(/[.:)\]]+$/g, '').trim())}]`);
            continue;
        }

        out.push(line);
    }
    return out.join('\n');
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Acordes en una línea ──────────────────────────────────────────────────────
// Buscador de acordes para separar concatenaciones (SOLmFA → SOLm FA).
// No se usa sobre letras, solo sobre líneas que ya parecen de acordes.
const CHORD_FIND_RE = /(?:SOL|DO|RE|MI|FA|LA|SI|[A-G])(?:#|b)?(?:m(?:aj|in)?|M(?:aj)?|dim|aug|sus|add|alt|no|°|ø|\+|-|\d|\/[A-G](?:#|b)?|\([^)]*\))*/g;

function splitConcatenatedChords(line) {
    let result = '', lastEnd = 0, prevEnd = -1, m;
    CHORD_FIND_RE.lastIndex = 0;
    while ((m = CHORD_FIND_RE.exec(line)) !== null) {
        if (!m[0]) { CHORD_FIND_RE.lastIndex++; continue; }
        const gap = line.slice(lastEnd, m.index);
        result += gap + (m.index === prevEnd ? ' ' : '') + m[0];
        lastEnd = m.index + m[0].length;
        prevEnd = lastEnd;
    }
    result += line.slice(lastEnd);
    return result;
}

function stripEdgePunct(tok) {
    let t = String(tok || '').trim();
    t = t.replace(/^[\[({]+/, '');
    // Conservar los paréntesis que forman parte del acorde: add9), (add9), etc.
    const open = (t.match(/\(/g) || []).length;
    const close = (t.match(/\)/g) || []).length;
    if (close > open) {
        let excess = close - open;
        t = t.replace(/\)+$/, m => m.slice(0, Math.max(0, m.length - excess)));
    }
    t = t.replace(/[,;:|]+$/, '');
    return t;
}

/** ¿La línea es una línea de acordes? */
function isChordLine(line) {
    const t = String(line || '').trim();
    if (!t) return false;
    if (t.startsWith('//')) return false;
    if (isSectionLabel(t)) return false;
    if (isTabLine(t)) return false;

    // Quita etiqueta inicial tipo "Intro:" si la hay
    const noLabel = t.replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '').trim();
    if (!noLabel) return false;

    const tokens = noLabel.split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;

    let actual = 0;
    for (const raw of tokens) {
        const core = stripEdgePunct(raw);
        if (!core) continue;                       // separadores sueltos
        if (REPEAT_RE.test(core)) continue;        // (x2), x2
        if (/^[|/\\\-–—]+$/.test(core)) continue;  // separadores
        if (isChordToken(core)) { actual++; continue; }
        return false;
    }
    return actual > 0;
}

/** Convierte los acordes de una línea (solo si es línea de acordes). */
function convertLineChords(line) {
    return String(line || '').replace(/\S+/g, tok => {
        const core = stripEdgePunct(tok);
        if (!core || !isChordToken(core)) return tok;
        return tok.replace(core, convertChordNotation(core));
    });
}

// ── Anclas de acordes <A>…</A> (incluye anclas anidadas mal formadas) ─────────
/**
 * Lacuerda marca los acordes con <A>acorde</A>. Algunas versiones tienen
 * anclas anidadas por errores del sitio:
 *     <A>SO<A>SIb</A></A>   → debe quedar SIb (Bb)
 *     <A>D<A>DO</A>         → debe quedar DO (C)
 * En esos casos el contenido interno es el acorde completo y el externo es
 * un fragmento; se conserva el interno. Un parser de pila lo resuelve.
 */
function processAnchors(raw) {
    let out = '';
    let anchorStack = [];
    const tagRe = /<a\b[^>]*>|<\/a>/gi;
    let last = 0, m;

    const emit = txt => {
        if (!txt) return;
        if (anchorStack.length) anchorStack[anchorStack.length - 1].buf.push(txt);
        else out += txt;
    };

    const closeAnchor = () => {
        if (!anchorStack.length) return;
        const node = anchorStack.pop();
        const content = decodeEntities(stripTags(node.buf.join(''))).trim();
        const replacement = isChordToken(content) ? convertChordNotation(content) : content;
        if (anchorStack.length) anchorStack[anchorStack.length - 1].buf.push(replacement);
        else out += replacement;
    };

    while ((m = tagRe.exec(raw)) !== null) {
        emit(raw.slice(last, m.index));
        last = m.index + m[0].length;
        if (/^<a\b/i.test(m[0])) {
            // Ancla anidada (HTML corrupto de lacuerda): el contenido externo
            // suele ser un fragmento; se descarta y gana el ancla interna.
            anchorStack = [{ buf: [] }];
        } else {
            closeAnchor();
        }
    }
    emit(raw.slice(last));
    while (anchorStack.length) closeAnchor();
    return out;
}

// ── Limpieza de contenido ─────────────────────────────────────────────────────
const BOILERPLATE_RE = [
    /^este fichero es trabajo propio/i,
    /^el material contenido en esta p[aá]gina/i,
    /^mostrar comentarios/i,
    /^otras canciones de inter[eé]s/i,
    /^todos los derechos reservados/i,
    /^aviso legal/i,
    /^privacidad/i,
    /lacuerda\.net/i,
];

function isBoilerplate(line) {
    const t = String(line || '').trim();
    if (!t) return false;
    return BOILERPLATE_RE.some(re => re.test(t));
}

/** Quita fragmentos de tablatura pegados al final de una línea de acordes. */
function removeInlineTab(line) {
    return String(line || '')
        // B|-1-3-5-1   e/---3---   G]:--0--
        .replace(/\s*[eEBGDAa-g]\s*[|>\]\/:]\s*[-–—0-9][-–—0-9|/\s]{2,}/g, '')
        .replace(/[ \t]+$/, '');
}

/** Convierte anotaciones de lacuerda en texto seguro para el parser. */
function stripAnnotations(line) {
    return String(line || '')
        // "Am/G Fmaj7 (C-B-E-F):Notas Solas" → "Am/G Fmaj7"
        .replace(/\s*\([^)]*\)\s*:\s*notas?\b.*$/i, '')
        // "(notas: ...)" o "(notas ...)"
        .replace(/\s*\(notas?\b[^)]*\).*$/i, '')
        .replace(/[ \t]+$/, '');
}

/** Normaliza espacios alrededor de la barra de bajo: F/ A → F/A */
function normalizeSlashSpacing(line) {
    return String(line || '').replace(/([A-G](?:#|b)?\d*)\s*\/\s*([A-G](?:#|b)?)/g, '$1/$2');
}

/**
 * Deja una línea de acordes en una sintaxis que library.js entiende:
 *  - guiones tipográficos → "-"
 *  - "x2"/"X2" → "(x2)" (library.js solo elimina "(xN)")
 *  - comas finales tras acordes → "G, Bm," → "G Bm"
 *  - "m7add4" → "m7(add4)" (library.js no acepta addN tras la calidad)
 */
function normalizeChordLineSyntax(line) {
    let out = String(line || '').replace(/[–—]/g, '-');

    // Se conservan los espacios originales (split con grupo de captura): los acordes de lacuerda
    // se alinean con espacios sobre la sílaba donde cambian, y colapsarlos los separa de la letra.
    out = out.split(/(\s+)/).map(tok => {
        if (/^\s*$/.test(tok)) return tok;
        const core = stripEdgePunct(tok);
        if (!core) return tok;

        // Repeticiones: x2, X2, 2x, (x2)
        const rep = core.match(/^\(?([xX]\s*(\d+)|(\d+)\s*[xX])\)?$/);
        if (rep) return `(x${rep[2] || rep[3]})`;

        if (!isChordToken(core)) return tok;

        // Comas/separadores pegados al acorde
        let t = tok.replace(/([,;])+$/, '');

        // addN tras una calidad: Cm7add4 → Cm7(add4)
        t = t.replace(/^([A-G](?:#|b)?(?:m|M|maj|min|dim|aug|sus[24]?|\+)?\d*)(add\d+)$/,
            '$1($2)');

        // Comas internas de una progresión se convierten en espacio; se rellena para no mover
        // los acordes siguientes de la línea.
        t = t.replace(/,+$/, '');
        return t.length < tok.length ? t + ' '.repeat(tok.length - t.length) : t;
    }).join('');

    return out.replace(/[ \t]+$/, '');
}

/**
 * Normaliza el contenido de una versión:
 *  - Convierte <A>acorde</A> a texto plano en cifrado americano
 *  - Elimina <div></div>, decodifica entidades
 *  - Elimina tablaturas y boilerplate
 *  - Normaliza etiquetas de sección
 *  - Separa acordes concatenados y convierte solfège restante
 */
function normalizeContent(raw, type = 'R') {
    let text = String(raw || '').replace(/\r\n?/g, '\n');

    // 1) Acordes marcados por <A>...</A> (incluye anclas anidadas)
    text = processAnchors(text);

    // 2) Divs vacíos (marcadores de lacuerda) y saltos
    text = text.replace(/<div[^>]*>\s*<\/div>/gi, '');
    text = text.replace(/<\/?div[^>]*>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // 3) Resto de etiquetas y entidades
    text = decodeEntities(stripTags(text));
    text = text.replace(/\u00a0/g, ' ');

    // 3b) Anotaciones y separación de barras (F/ A → F/A)
    text = text.split('\n')
        .map(l => normalizeSlashSpacing(stripAnnotations(removeInlineTab(l))))
        .join('\n');

    // 4) Tablaturas y boilerplate
    text = text.split('\n').filter(l => !isTabLine(l) && !isBoilerplate(l)).join('\n');

    // 5) Etiquetas de sección
    text = normalizeSections(text);

    // 6) Separar acordes concatenados y convertir solfège restante
    text = text.split('\n').map(l => {
        if (!isChordLine(l)) return l;
        return normalizeChordLineSyntax(convertLineChords(splitConcatenatedChords(l)));
    }).join('\n');

    // 7) Limpieza final
    text = text.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // Si es tablatura pura y no quedaron acordes, descartar
    if (type === 'T') {
        const hasChords = text.split('\n').some(l => isChordLine(l));
        if (!hasChords) return '';
    }
    return text;
}

// ── Detección de tonalidad ────────────────────────────────────────────────────
function chordRootAndQuality(tok) {
    const t = convertChordNotation(tok);
    let m = t.match(/^([A-G](?:#|b)?)([\s\S]*)$/);
    if (!m) return null;
    const root = m[1];
    const quality = m[2] || '';
    const minor = /^m(?!aj)/i.test(quality) || /^min/i.test(quality);
    return { root, quality, minor };
}

function detectKey(text) {
    const tokens = [];
    for (const line of String(text || '').split('\n')) {
        if (!isChordLine(line)) continue;
        for (const raw of line.split(/\s+/)) {
            const core = stripEdgePunct(raw);
            if (!core || !isChordToken(core)) continue;
            const rq = chordRootAndQuality(core);
            if (rq) tokens.push(rq);
        }
    }
    if (!tokens.length) return null;

    const counts = {};
    for (const t of tokens) counts[t.root] = (counts[t.root] || 0) + 1;

    // La primera línea de acordes suele empezar en la tónica. Solo se descarta
    // si es un acorde de paso (aparece una vez) y otro domina claramente.
    let top = tokens[0].root, topN = counts[top] || 1;
    for (const [root, n] of Object.entries(counts)) {
        if (n > topN) { top = root; topN = n; }
    }
    const first = tokens[0].root;
    const firstCount = counts[first] || 1;
    const chosen = (firstCount <= 1 && topN >= 4 && top !== first) ? top : first;

    // ¿Menor o mayor? Votar entre los acordes de esa raíz.
    let minor = 0, major = 0;
    for (const t of tokens) {
        if (t.root !== chosen) continue;
        if (t.minor) minor++; else major++;
    }
    return chosen + (minor > major ? 'm' : '');
}

// ── Parseo de páginas ─────────────────────────────────────────────────────────
function parseLcd(lcd) {
    const s = String(lcd || '').trim();
    const m = s.match(/^([A-Z]+)(?:-(\d+))?$/);
    if (!m) return { types: [], order: [], raw: s };
    const types = m[1].split('').map((type, i) => ({ num: i + 1, type }));
    const order = (m[2] || '').split('').map(Number).filter(n => !Number.isNaN(n));
    return { types, order, raw: s };
}

function parseArtistPage(html, lcSlug) {
    const songs = [];
    const seen = new Set();

    let block = html;
    const start = html.indexOf('id=b_main');
    if (start !== -1) {
        const end = html.indexOf('</ul>', start);
        block = html.slice(start, end === -1 ? start + 300000 : end);
    }

    const re = /<li\b[^>]*lcd=['"]([^'"]*)['"][^>]*>\s*<a\s+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(block)) !== null) {
        const lcd = m[1];
        const slug = m[2].trim();
        const title = decodeEntities(stripTags(m[3])).replace(/\s+acordes\s*$/i, '').trim();
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        songs.push({ slug, title, lcd, lcSlug, versionInfo: parseLcd(lcd) });
    }

    // Fallback: sin atributo lcd
    if (!songs.length) {
        const re2 = /<li\b[^>]*>\s*<a\s+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
        while ((m = re2.exec(block)) !== null) {
            const slug = m[1].trim();
            const title = decodeEntities(stripTags(m[2])).replace(/\s+acordes\s*$/i, '').trim();
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            songs.push({ slug, title, lcd: '', lcSlug, versionInfo: { types: [], order: [], raw: '' } });
        }
    }
    return songs;
}

/**
 * Extrae TODAS las versiones de la página base de una canción.
 * Devuelve [{ num, type, label, href, best, raw }] ordenadas por num.
 * type: R=Letra y Acordes, T=Tablatura, B=Bajo, K=Piano/Teclados
 */
function parseSongPage(html) {
    const versions = [];
    const liRe = /<li\b[^>]*onclick=['"]tOpen\((\d+)\)['"][^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(html)) !== null) {
        const num = parseInt(m[1], 10);
        const inner = m[2];
        const type = ((inner.match(/tipoIcon\s+ti(\w+)/i) || [])[1] || '').toUpperCase();
        const href = (inner.match(/href=['"]([^'"]+)['"]/i) || [])[1] || '';
        const label = decodeEntities(stripTags((inner.match(/rtLabel[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '')).trim();
        const best = /rtMejor/.test(inner);
        const preM = inner.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        const raw = preM ? preM[1] : '';
        versions.push({ num, type, href, label, best, raw });
    }

    // Fallback: página antigua sin selector de versiones
    if (!versions.length) {
        const rtRe = /<div[^>]*class=['"]?rtBody['"]?[^>]*>([\s\S]*?)<\/div>/gi;
        let rm;
        while ((rm = rtRe.exec(html)) !== null) {
            const preM = rm[1].match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
            if (preM) versions.push({ num: versions.length + 1, type: 'R', href: '', label: '', best: versions.length === 0, raw: preM[1] });
        }
    }

    versions.sort((a, b) => a.num - b.num);
    return versions;
}

// La página BASE de una canción solo trae una VISTA PREVIA recortada de cada versión dentro de su <li>
// (p. ej. 423 de 1684 caracteres). El texto completo está en la página propia de la versión
// (`cancion.shtml`, `cancion-2.shtml`…), dentro de <div id=t_body><PRE>…</PRE>.
function extractFullBody(html) {
    const start = String(html || '').search(/<div id=['"]?t_body['"]?>/i);
    if (start < 0) return '';
    const rest = html.slice(start);
    const m = rest.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    return m ? m[1] : '';
}

module.exports = {
    extractFullBody,
    LC_BASE,
    fetchHTML,
    sleep,
    decodeEntities,
    stripTags,
    slugify,
    convertChordNotation,
    isChordToken,
    isTabLine,
    stripTabLines,
    isSectionLabel,
    normalizeSections,
    isChordLine,
    splitConcatenatedChords,
    convertLineChords,
    normalizeContent,
    processAnchors,
    detectKey,
    parseLcd,
    parseArtistPage,
    parseSongPage,
};
