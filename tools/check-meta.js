// node tools/check-meta.js — TAREA 3B: meta.json válido en todas las carpetas
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
let issues = 0;
const sinKey = [];
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) { console.log(`SIN meta.json: ${dir}`); issues++; continue; }
  try {
    const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (!m.title) { console.log(`SIN TÍTULO: ${dir}`); issues++; }
    if (!m.artist) { console.log(`SIN ARTISTA: ${dir}`); issues++; }
    if (!m.original_key) sinKey.push(dir);
  } catch (e) { console.log(`JSON INVÁLIDO: ${dir} — ${e.message}`); issues++; }
}
console.log(`\nSIN original_key: ${sinKey.length}`);
sinKey.forEach(d => console.log(`  ${d}`));
console.log(`Otros issues: ${issues}`);
