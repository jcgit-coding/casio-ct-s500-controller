// node tools/find-short.js — TAREA 1F: archivos vacíos o muy cortos
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
let n = 0;
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const dirPath = path.join(LIB, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const f of fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const txt = fs.readFileSync(path.join(dirPath, f), 'utf8').trim();
    if (txt.length < 50) { console.log(`CORTO (${txt.length} chars): ${dir}/${f}`); n++; }
  }
}
console.log(`\nTotal: ${n}`);
