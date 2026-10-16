// node tools/check-index.js — TAREA 3A: integridad index.json ↔ carpetas
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const index = JSON.parse(fs.readFileSync(path.join(LIB, 'index.json'), 'utf8'));
let errors = 0;
for (const song of index) {
  const dir = path.join(LIB, song.id);
  if (!fs.existsSync(dir)) { console.log(`FALTA CARPETA: ${song.id}`); errors++; continue; }
  const meta = path.join(dir, 'meta.json');
  if (!fs.existsSync(meta)) { console.log(`FALTA meta.json: ${song.id}`); errors++; }
}
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const stat = fs.statSync(path.join(LIB, dir));
  if (!stat.isDirectory()) continue;
  if (!index.find(s => s.id === dir)) { console.log(`SIN ENTRADA EN INDEX: ${dir}`); errors++; }
}
console.log(`\nEntradas en index: ${index.length}`);
console.log(`Errores: ${errors}`);
