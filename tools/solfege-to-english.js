#!/usr/bin/env node
// tools/solfege-to-english.js — Convierte acordes DO/RE/MI… a cifrado americano C/D/E…
// Uso:
//   node tools/solfege-to-english.js --dry-run   (solo reporta, no escribe)
//   node tools/solfege-to-english.js --apply     (escribe los cambios)
//
// Alcance (aprobado en auditoría): canciones donde los tokens de acorde en
// líneas de acordes son mayormente solfège (ES >= EN). Convierte TODOS los
// tokens solfège de esas canciones, solo en líneas que el parser trata como
// acordes (o "etiqueta: acordes,acordes,acordes").
'use strict';

const fs = require('fs'), path = require('path');
const { isChordLine, SECTION_LABEL_RE, CHORD_STRIP_RE, CHORD_FIND_RE } = require('./parser-mirror');

const LIB = path.resolve(__dirname, '..', 'library');
const APPLY = process.argv.includes('--apply');
const DRY = process.argv.includes('--dry-run') || !APPLY;

const ROOT_MAP = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
const ES_ROOT_RE  = /^(DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(#|b)?/;
const ES_BASS_RE  = /\/(DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(#|b)?/;
const ES_TOKEN_ROOT = /^(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)/;

function convertToken(tok) {
  let out = tok;
  const m = out.match(ES_ROOT_RE);
  if (m) out = ROOT_MAP[m[1].toUpperCase()] + (m[2] || '') + out.slice(m[0].length);
  out = out.replace(ES_BASS_RE, (_, r, a) => '/' + ROOT_MAP[r.toUpperCase()] + (a || ''));
  return out;
}

function isConvertibleLine(line) {
  if (isChordLine(line)) return true;
  const t = line.trim();
  if (!t || t.startsWith('//')) return false;
  if (SECTION_LABEL_RE.test(t)) return false;
  const noLabel = t
    .replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '')
    .replace(/\(x\s*\d+\)/gi, '')
    .trim();
  if (!noLabel) return false;
  // Como línea de acordes pero tolerando , ; | como separadores ("INTRO: RE,LA,SIm")
  const leftover = noLabel.replace(CHORD_STRIP_RE, '')
    .replace(/[\s\-|./\\()\[\],;|]+/gi, '').replace(/\d+/g, '').trim();
  if (leftover.length > 0) return false;
  CHORD_FIND_RE.lastIndex = 0;
  return CHORD_FIND_RE.test(noLabel);
}

function tokenize(line) {
  CHORD_FIND_RE.lastIndex = 0;
  const toks = [];
  let m;
  while ((m = CHORD_FIND_RE.exec(line)) !== null) toks.push(m[0]);
  return toks;
}

function convertLine(line) {
  if (!isConvertibleLine(line)) return line;
  // Convierte tokens y separa con espacio los que estaban concatenados
  // ("FALA7" → "F A7"); si no, "F"+"A7" se re-leería como acorde FA7.
  CHORD_FIND_RE.lastIndex = 0;
  let result = '', lastEnd = 0, prevEnd = -1, prevChanged = false, m;
  while ((m = CHORD_FIND_RE.exec(line)) !== null) {
    const gap = line.slice(lastEnd, m.index);
    const converted = convertToken(m[0]);
    const changed = converted !== m[0];
    const sep = (m.index === prevEnd && (changed || prevChanged)) ? ' ' : '';
    result += gap + sep + converted;
    lastEnd = m.index + m[0].length;
    prevEnd = lastEnd;
    prevChanged = changed;
  }
  result += line.slice(lastEnd);
  return result;
}

// ── Scan ──────────────────────────────────────────────────────────────────────
const report = [];
let totalSongs = 0, totalFiles = 0, totalTokens = 0;

for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const dirPath = path.join(LIB, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));
  if (!files.length) continue;
  totalSongs++;

  let songES = 0, songEN = 0;
  const fileData = files.map(f => {
    const text = fs.readFileSync(path.join(dirPath, f), 'utf8');
    const lines = text.split('\n');
    let es = 0, en = 0;
    for (const line of lines) {
      if (!isConvertibleLine(line)) continue;
      for (const tok of tokenize(line)) {
        if (ES_TOKEN_ROOT.test(tok)) es++; else en++;
      }
    }
    return { f, text, lines, es, en };
  });
  for (const fd of fileData) { songES += fd.es; songEN += fd.en; }
  if (songES === 0 || songES < songEN) continue;   // alcance aprobado: ES >= EN

  const entry = { id: dir, es: songES, en: songEN, files: [], samples: [] };
  for (const fd of fileData) {
    let changedLines = 0, tokens = 0;
    const newLines = fd.lines.map(line => {
      const conv = convertLine(line);
      if (conv !== line) {
        changedLines++;
        tokens += tokenize(line).filter(t => ES_TOKEN_ROOT.test(t)).length;
        if (entry.samples.length < 2) entry.samples.push({ file: fd.f, before: line.trim(), after: conv.trim() });
      }
      return conv;
    });
    if (changedLines > 0) {
      entry.files.push({ file: fd.f, changedLines, tokens, newLines, oldText: fd.text });
      totalFiles++;
      totalTokens += tokens;
    }
  }
  if (entry.files.length) report.push(entry);
}

// ── Output ────────────────────────────────────────────────────────────────────
console.log(`\nCanciones en alcance (solfège ≥ inglés): ${report.length}`);
console.log(`Archivos a modificar: ${totalFiles}`);
console.log(`Tokens solfège a convertir: ${totalTokens}`);
console.log('\nPor artista (top):');
const byPrefix = {};
for (const r of report) {
  const p = r.id.split('_')[0] + '_' + (r.id.split('_')[1] || '');
  byPrefix[p] = (byPrefix[p] || 0) + 1;
}
Object.entries(byPrefix).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([p, n]) => console.log(`  ${p}: ${n}`));

console.log('\nEjemplos de conversión:');
for (const r of report.slice(0, 8)) {
  console.log(`  ${r.id}`);
  for (const s of r.samples) console.log(`    - ${s.before}\n    + ${s.after}`);
}

if (DRY) {
  console.log('\n[DRY-RUN] No se escribió nada. Correr con --apply para convertir.');
  fs.writeFileSync(path.resolve(__dirname, 'solfege-convert-plan.json'),
    JSON.stringify(report.map(r => ({ id: r.id, es: r.es, en: r.en, files: r.files.map(f => f.file) })), null, 2));
  console.log('Plan guardado en tools/solfege-convert-plan.json');
} else {
  let written = 0;
  for (const r of report) {
    for (const fd of r.files) {
      const out = fd.newLines.join('\n');
      if (out !== fd.oldText) {
        fs.writeFileSync(path.join(LIB, r.id, fd.file), out);
        written++;
      }
    }
  }
  console.log(`\n[APPLY] ${written} archivos escritos.`);

  // Verificación: contar líneas de acordes antes/después por archivo modificado
  let bad = 0;
  for (const r of report) {
    for (const fd of r.files) {
      const now = fs.readFileSync(path.join(LIB, r.id, fd.file), 'utf8').split('\n');
      const before = fd.oldText.split('\n');
      const cb = before.filter(isConvertibleLine).length;
      const ca = now.filter(isConvertibleLine).length;
      if (cb !== ca) { console.log(`  WARN convertible-lines ${r.id}/${fd.file}: ${cb} -> ${ca}`); bad++; }
      const remaining = now.filter(isConvertibleLine)
        .flatMap(tokenize).filter(t => ES_TOKEN_ROOT.test(t));
      if (remaining.length) { console.log(`  WARN tokens ES restantes ${r.id}/${fd.file}: ${remaining.slice(0,5).join(' ')}`); bad++; }
    }
  }
  console.log(bad === 0 ? 'Verificación: OK (líneas de acordes invariantes, 0 tokens ES restantes)' : `Verificación: ${bad} warnings`);
}
