#!/usr/bin/env node
/**
 * validate-library.js — Audita la calidad de todos los archivos de acordes
 * Uso: node validate-library.js [--artist "marcos-witt"] [--verbose]
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const LIBRARY_DIR = path.resolve(__dirname, '..', 'library');
const INDEX_FILE  = path.join(LIBRARY_DIR, 'index.json');

const args    = process.argv.slice(2);
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const FILTER  = (() => { const i = args.indexOf('--artist'); return i !== -1 ? args[i+1].toLowerCase() : null; })();

// ── Mismas regexes que usa el parser del app ─────────────────────────────────
const ES_ROOT = '(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)';
const ES_QUAL = '(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+(?:\\(aug\\))?|sus[24]?|(?:\\((?:add|aug)\\d*\\))|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?(?:/\\d+)?';
const ES_BASS = '(?:\\/(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?(?:[A-G][#b]?)?)?';
const EN_ROOT = '[CDEFGAB]';
const EN_QUAL = '(?:#|b)?(?:m(?:aj)?|dim|aug|sus[24]?|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?(?:/\\d+)?';
const EN_BASS = '(?:\\/[CDEFGAB](?:#|b)?)?';

const CHORD_STRIP_RE = new RegExp(`(?:${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS})`, 'g');

const isChordLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return false;
    const noLabel = trimmed.replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '').trim();
    if (!noLabel) return false;
    const leftover = noLabel.replace(CHORD_STRIP_RE, '').replace(/[\s\-|./\\()\[\]x]+/gi, '').replace(/\d+/g,'').trim();
    return leftover.length === 0;
};

// ── Detección de portugués ────────────────────────────────────────────────────
const PT_WORDS = ['você','voce','não','então','também','coração','coracao',
    'minha','meus','minhas','teu','tua','teus','suas','nosso','nossa',
    'isso','essa','esse','muito','fazer','viver','quero','serei','posso',
    'quando eu','para mim','de mim','em mim'];

const isPortuguese = (text) => {
    const lower = (text||'').toLowerCase();
    let hits = 0;
    for (const w of PT_WORDS) { if (lower.includes(w)) hits++; if (hits >= 3) return true; }
    return false;
};

// ── Análisis de un archivo de acordes ────────────────────────────────────────
function analyzeFile(filePath) {
    let text;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return { error: 'cannot read' }; }

    const lines       = text.split('\n');
    const nonEmpty    = lines.filter(l => l.trim());
    const chordLines  = lines.filter(l => isChordLine(l));
    const lyricLines  = nonEmpty.filter(l => !isChordLine(l) && !l.trim().startsWith('//'));
    const chordRatio  = nonEmpty.length ? chordLines.length / nonEmpty.length : 0;

    // Detectar acordes concatenados (raíz de acorde después de letra minúscula sin espacio)
    const concatPattern = /[a-z0-9#b\)](?:DO|RE|MI|FA|SOL|LA|SI|[A-G])/;
    const concatLines   = chordLines.filter(l => concatPattern.test(l));

    // Detectar líneas que probablemente son acordes pero no fueron detectadas
    // (contienen mayúsculas separadas por espacios pero no pasan isChordLine)
    const suspectLyricLines = lyricLines.filter(l => {
        const t = l.trim();
        // Línea de mayúsculas con tokens cortos que parecen acordes
        if (t === t.toUpperCase() && t.length < 60 && /^[A-Z\s#bm79\/\-()]+$/.test(t)) return true;
        return false;
    });

    return {
        chars:      text.length,
        lines:      lines.length,
        chordLines: chordLines.length,
        lyricLines: lyricLines.length,
        chordRatio: chordRatio,
        isPortuguese: isPortuguese(text),
        hasConcat:  concatLines.length > 0,
        concatLines,
        suspectLines: suspectLyricLines,
        tooShort:   text.trim().length < 80,
        noChords:   chordLines.length === 0 && nonEmpty.length > 3,
    };
}

// ── Clasificar severidad de problemas ────────────────────────────────────────
function classify(result) {
    const issues = [];
    if (result.error)        issues.push({ sev: 'ERROR',   msg: result.error });
    if (result.isPortuguese) issues.push({ sev: 'ERROR',   msg: 'Contenido en portugués' });
    if (result.tooShort)     issues.push({ sev: 'ERROR',   msg: `Archivo muy corto (${result.chars} chars)` });
    if (result.noChords)     issues.push({ sev: 'WARNING', msg: `0 líneas de acordes detectadas (${result.lyricLines} de letra)` });
    if (result.hasConcat)    issues.push({ sev: 'WARNING', msg: `Acordes concatenados (${result.concatLines.length} líneas)` });
    if (result.chordRatio < 0.05 && result.lyricLines > 5)
                             issues.push({ sev: 'INFO',    msg: `Ratio acordes/letra muy bajo (${(result.chordRatio*100).toFixed(0)}%)` });
    if (result.suspectLines?.length > 0)
                             issues.push({ sev: 'INFO',    msg: `${result.suspectLines.length} líneas en MAYÚSCULAS no detectadas como acordes` });
    return issues;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
const entries = FILTER
    ? index.filter(e => e.artist?.toLowerCase().includes(FILTER) || e.id?.includes(FILTER.replace(/ /g,'-')))
    : index;

console.log(`\n🔍 Validando ${entries.length} canciones...\n`);

const summary = { ok: 0, info: 0, warnings: 0, errors: 0 };
const report  = [];

for (const entry of entries) {
    const songDir  = path.join(LIBRARY_DIR, entry.id);
    let metaVersions = [];
    try {
        const meta = JSON.parse(fs.readFileSync(path.join(songDir, 'meta.json'), 'utf8'));
        metaVersions = meta.versions || [];
    } catch { metaVersions = []; }

    // Si no hay versiones en meta, buscar archivos chords*.txt
    if (metaVersions.length === 0) {
        try {
            const files = fs.readdirSync(songDir).filter(f => f.startsWith('chords') && f.endsWith('.txt'));
            metaVersions = files.map(f => ({ file: f }));
        } catch {}
    }

    if (metaVersions.length === 0) {
        report.push({ entry, file: '—', issues: [{ sev: 'ERROR', msg: 'Sin archivos de acordes' }] });
        summary.errors++;
        continue;
    }

    for (const ver of metaVersions) {
        const filePath = path.join(songDir, ver.file);
        const result   = analyzeFile(filePath);
        const issues   = classify(result);

        const maxSev = issues.find(i => i.sev === 'ERROR') ? 'ERROR'
                     : issues.find(i => i.sev === 'WARNING') ? 'WARNING'
                     : issues.length > 0 ? 'INFO' : 'OK';

        if (maxSev === 'OK')      summary.ok++;
        else if (maxSev === 'INFO')    summary.info++;
        else if (maxSev === 'WARNING') summary.warnings++;
        else                           summary.errors++;

        if (maxSev !== 'OK' || VERBOSE) {
            report.push({ entry, file: ver.file, result, issues, maxSev });
        }
    }
}

// ── Imprimir reporte ──────────────────────────────────────────────────────────
const SEV_COLOR = { ERROR: '\x1b[31m', WARNING: '\x1b[33m', INFO: '\x1b[36m', OK: '\x1b[32m' };
const RESET = '\x1b[0m';

// Agrupar por severidad
const byArtist = {};
for (const row of report) {
    const key = row.entry.artist || 'Desconocido';
    if (!byArtist[key]) byArtist[key] = [];
    byArtist[key].push(row);
}

for (const [artist, rows] of Object.entries(byArtist)) {
    console.log(`\n── ${artist} ─────────────────────`);
    for (const row of rows) {
        const col = SEV_COLOR[row.maxSev] || '';
        console.log(`  ${col}[${row.maxSev}]${RESET} ${row.entry.title}  (${row.file})`);
        for (const issue of row.issues) {
            console.log(`         ${SEV_COLOR[issue.sev]}• ${issue.msg}${RESET}`);
        }
        if (VERBOSE && row.result?.concatLines?.length) {
            console.log('         Líneas concatenadas:');
            row.result.concatLines.slice(0,3).forEach(l => console.log(`           "${l.trim()}"`));
        }
    }
}

console.log(`\n${'═'.repeat(55)}`);
console.log(`  ✅ OK:       ${summary.ok}`);
console.log(`  ℹ️  Info:     ${summary.info}`);
console.log(`  ⚠️  Warnings: ${summary.warnings}`);
console.log(`  ❌ Errors:   ${summary.errors}`);
console.log(`  Total:       ${summary.ok + summary.info + summary.warnings + summary.errors}`);
console.log(`${'═'.repeat(55)}\n`);

// Guardar reporte JSON
const reportPath = path.join(__dirname, 'validation-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
    date: new Date().toISOString(), summary,
    issues: report.filter(r => r.maxSev !== 'OK').map(r => ({
        id: r.entry.id, title: r.entry.title, artist: r.entry.artist,
        file: r.file, severity: r.maxSev,
        issues: r.issues.map(i => i.msg)
    }))
}, null, 2));
console.log(`Reporte guardado en: tools/validation-report.json\n`);
