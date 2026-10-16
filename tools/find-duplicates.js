#!/usr/bin/env node
/**
 * find-duplicates.js — Detecta canciones manuales que ya existen en canciones importadas
 * Compara por contenido textual (letras), no por título ni artista.
 *
 * Uso:
 *   node tools/find-duplicates.js
 *   node tools/find-duplicates.js --threshold 0.5   (default: 0.6)
 *   node tools/find-duplicates.js --verbose
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const LIBRARY_DIR = path.resolve(__dirname, '..', 'library');
const THRESHOLD   = parseFloat(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0.6');
const VERBOSE     = process.argv.includes('--verbose');

// ── Normalizar texto para comparación ────────────────────────────────────────
function normalize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar tildes
        .replace(/[^a-z0-9\s]/g, ' ')                      // solo letras y números
        .replace(/\s+/g, ' ')
        .trim();
}

// Extrae solo las líneas de letra (sin acordes) para comparación más limpia
function extractLyrics(text) {
    return text.split('\n')
        .map(l => l.trim())
        .filter(l => {
            if (!l) return false;
            // Línea de acordes: contiene patrones de acorde pero poca letra
            const chordPattern = /\b[A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)?\b/g;
            const chords = l.match(chordPattern) || [];
            const words  = l.replace(chordPattern, '').trim().split(/\s+/).filter(Boolean);
            // Si más de la mitad del contenido son acordes, es línea de acordes
            return words.length > chords.length;
        })
        .join(' ');
}

// Similitud de Jaccard sobre bigramas de palabras
function similarity(a, b) {
    const bigrams = str => {
        const words = str.split(' ').filter(Boolean);
        const set = new Set();
        for (let i = 0; i < words.length - 1; i++) set.add(words[i] + ' ' + words[i+1]);
        if (words.length === 1) set.add(words[0]);
        return set;
    };
    const sa = bigrams(a);
    const sb = bigrams(b);
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const g of sa) if (sb.has(g)) inter++;
    return inter / (sa.size + sb.size - inter);
}

// ── Cargar biblioteca ─────────────────────────────────────────────────────────
const songs = [];
const dirs  = fs.readdirSync(LIBRARY_DIR).filter(d => {
    const p = path.join(LIBRARY_DIR, d);
    return fs.statSync(p).isDirectory();
});

for (const dir of dirs) {
    const dirPath  = path.join(LIBRARY_DIR, dir);
    const metaPath = path.join(dirPath, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;

    let meta;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { continue; }

    const hasManual   = fs.existsSync(path.join(dirPath, 'chords.txt'));
    const hasImported = fs.existsSync(path.join(dirPath, 'chords_v1_lacuerda.txt'));

    let text = '';
    if (hasManual)   text = fs.readFileSync(path.join(dirPath, 'chords.txt'), 'utf8');
    else if (hasImported) text = fs.readFileSync(path.join(dirPath, 'chords_v1_lacuerda.txt'), 'utf8');
    else continue;

    const lyrics = normalize(extractLyrics(text));
    if (!lyrics || lyrics.length < 30) continue;

    songs.push({ id: dir, title: meta.title, artist: meta.artist, isManual: hasManual && !hasImported, lyrics });
}

const manual   = songs.filter(s => s.isManual);
const imported = songs.filter(s => !s.isManual);

console.log(`\nCanciones manuales:  ${manual.length}`);
console.log(`Canciones importadas: ${imported.length}`);
console.log(`Umbral de similitud: ${THRESHOLD}`);
console.log(`\n${'─'.repeat(70)}`);

const duplicates = [];

for (const m of manual) {
    let best = null;
    let bestScore = 0;

    for (const imp of imported) {
        const score = similarity(m.lyrics, imp.lyrics);
        if (score > bestScore) { bestScore = score; best = imp; }
    }

    if (best && bestScore >= THRESHOLD) {
        duplicates.push({ manual: m, match: best, score: bestScore });
    } else if (VERBOSE && best) {
        console.log(`[ok]  ${m.id}  →  mejor: ${best.id} (${(bestScore*100).toFixed(0)}%)`);
    }
}

if (!duplicates.length) {
    console.log('\n✅  No se encontraron duplicados.\n');
} else {
    console.log(`\n⚠️  ${duplicates.length} posible${duplicates.length > 1 ? 's' : ''} duplicado${duplicates.length > 1 ? 's' : ''}:\n`);
    duplicates.sort((a, b) => b.score - a.score);
    for (const d of duplicates) {
        console.log(`  [${(d.score*100).toFixed(0)}%] MANUAL   ${d.manual.id}`);
        console.log(`         "${d.manual.title}" — ${d.manual.artist}`);
        console.log(`       IMPORTADA ${d.match.id}`);
        console.log(`         "${d.match.title}" — ${d.match.artist}`);
        console.log();
    }
    console.log(`  Sugerencia: elimina las manuales si el contenido es equivalente.`);
}
