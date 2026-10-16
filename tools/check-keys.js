// node tools/check-keys.js — TAREA 1D: original_key vacío o en solfège
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const SOLFEGE_KEY = /^(DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)/;
const bad = [];
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) continue;
  const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const k = m.original_key;
  if (!k || k === '' || SOLFEGE_KEY.test(k)) {
    bad.push({ id: dir, title: m.title, key: k });
  }
}
console.log(`Keys vacías o en solfège: ${bad.length}`);
const empty = bad.filter(b => !b.key);
const solf = bad.filter(b => b.key && SOLFEGE_KEY.test(b.key));
console.log(`  vacías: ${empty.length}`);
console.log(`  solfège: ${solf.length}`);
solf.slice(0, 40).forEach(b => console.log(`    ${b.id} — "${b.title}" key=${b.key}`));
if (empty.length) { console.log('  ejemplos vacíos:'); empty.slice(0, 20).forEach(b => console.log(`    ${b.id}`)); }
