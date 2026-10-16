// node tools/find-dup-titles.js — TAREA 1G: títulos repetidos (3+)
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const byTitle = new Map();
for (const dir of fs.readdirSync(LIB)) {
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) continue;
  const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!m.title) continue;
  const key = m.title.toLowerCase().trim();
  if (!byTitle.has(key)) byTitle.set(key, []);
  byTitle.get(key).push({ id: dir, artist: m.artist });
}
let groups = 0;
for (const [title, arr] of [...byTitle.entries()].filter(([, a]) => a.length >= 3).sort((a, b) => b[1].length - a[1].length)) {
  groups++;
  console.log(`\n=== "${title}" (${arr.length} veces) ===`);
  arr.forEach(x => console.log(`  ${x.id} — ${x.artist}`));
}
console.log(`\nGrupos con 3+ repeticiones: ${groups}`);
