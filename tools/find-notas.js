// node tools/find-notas.js — TAREA 1B: líneas con "(notas" y clasificación real del parser
const fs = require('fs'), path = require('path');
const { isChordLine } = require('./parser-mirror');
const LIB = path.resolve('library');

let files = 0;
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const dirPath = path.join(LIB, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const f of fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const txt = fs.readFileSync(path.join(dirPath, f), 'utf8');
    if (!/\(notas/i.test(txt)) continue;
    files++;
    console.log(`\n=== ${dir}/${f} ===`);
    txt.split('\n').forEach((line, i) => {
      if (/\(notas/i.test(line)) {
        const cls = isChordLine(line) ? 'ACORDES (renderiza mal)' : 'LETRA (ok)';
        console.log(`  L${i + 1} [${cls}]: ${line.trim()}`);
      }
    });
  }
}
console.log(`\nArchivos con "(notas": ${files}`);
