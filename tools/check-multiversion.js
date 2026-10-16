// node tools/check-multiversion.js — TAREA 1K: carpetas con 2+ versiones en artistas nuevos
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const ARTISTS = ['marcela_gandara','israel_houghton','upperroom','averly_morillo','barak','coalo_zamorano','en_espiritu_y_en_verdad','elevation_worship','ibi','ingrid_rosario','montesanto','art_aguilera','twice','jaime_murrell'];
let total = 0;
for (const dir of fs.readdirSync(LIB)) {
  if (!ARTISTS.some(a => dir.startsWith(a + '_'))) continue;
  const metaPath = path.join(LIB, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) continue;
  const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!m.versions || m.versions.length < 2) continue;
  total++;
  console.log(`\n${dir} — "${m.title}"`);
  m.versions.forEach((v, i) => console.log(`  v${i+1}: ${v.file} ← ${v.source || '(sin source)'}`));
}
console.log(`\nTotal carpetas multi-versión en artistas nuevos: ${total}`);
