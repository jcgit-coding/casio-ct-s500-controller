// node tools/rebuild-index.js — Reconstruye library/index.json desde todos los meta.json
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const INDEX_FILE = path.join(LIB, 'index.json');

const existing = (() => { try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return []; } })();

const entries = [];
const idMismatches = [];
const skipped = [];
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const stat = fs.statSync(path.join(LIB, dir));
  if (!stat.isDirectory()) continue;
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) { skipped.push(dir + ' (sin meta.json)'); continue; }
  let m;
  try { m = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { skipped.push(dir + ' (json inválido)'); continue; }
  if (m.id && m.id !== dir) idMismatches.push(`${dir} (meta.id=${m.id})`);
  if (!m.title || !m.artist) { skipped.push(dir + ' (sin título/artista)'); continue; }
  entries.push({
    id: dir,
    title: m.title,
    artist: m.artist,
    genre: m.genre || 'Worship',
    original_key: m.original_key || ''
  });
}

entries.sort((a, b) =>
  a.artist.localeCompare(b.artist, 'es', { sensitivity: 'base' }) ||
  a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) ||
  a.id.localeCompare(b.id)
);

fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf8');

console.log(`Entradas previas: ${existing.length}`);
console.log(`Entradas nuevas:  ${entries.length}`);
console.log(`Id mismatches (meta.id ≠ carpeta): ${idMismatches.length}`);
idMismatches.slice(0, 20).forEach(x => console.log('  ' + x));
console.log(`Omitidas: ${skipped.length}`);
skipped.slice(0, 20).forEach(x => console.log('  ' + x));
