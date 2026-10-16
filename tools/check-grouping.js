// node tools/check-grouping.js — TAREA 1E: detecta versiones mal agrupadas
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
let suspects = 0;
for (const dir of fs.readdirSync(LIB)) {
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) continue;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.versions || meta.versions.length < 2) continue;
  const srcs = meta.versions.map(v => v.source || '').filter(Boolean);
  if (srcs.length < 2) continue;
  const slugs = srcs.map(u => u.split('/').pop().replace('.shtml', ''));
  const base0 = slugs[0].replace(/\d+$/, '');
  const base1 = slugs[1].replace(/\d+$/, '');
  if (base0 !== base1) {
    suspects++;
    console.log(`SOSPECHOSO: ${dir}  [${meta.title} — ${meta.artist}]`);
    meta.versions.forEach((v, i) => console.log(`  v${i + 1}: ${v.file}  ← ${v.source || '(sin source)'}`));
  }
}
console.log(`\nTotal sospechosos: ${suspects}`);
