// node tools/find-solfege.js — TAREA 1A: canciones con notación DO/RE/SI
const fs = require('fs'), path = require('path');
const LIB = path.resolve('library');
const ES_ROOT = '(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)';
const ES_QUAL = '(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|sus[24]?|add\\d?|[79]|11|13)?(?:\\d+)?';
const ES_BASS = '(?:\\/(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?)?';
const CHORD_RE = new RegExp(`\\b${ES_ROOT}${ES_QUAL}${ES_BASS}\\b`);
// Solo raíces inequívocas: DO, SOL, SI, RE (evita FAs/LAs falsos en letra)
const STRONG = /\b(?:DO|SOL|SI|RE|Do|Sol|Si|Re)(?:#|b)?(?:m(?:aj7?)?|dim|sus[24]?|[79])?\b/;

const byArtist = new Map();
const results = [];
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const files = fs.existsSync(path.join(LIB, dir))
    ? fs.readdirSync(path.join(LIB, dir)).filter(f => f.endsWith('.txt')) : [];
  let hit = false, strongHit = false;
  for (const f of files) {
    const txt = fs.readFileSync(path.join(LIB, dir, f), 'utf8');
    if (CHORD_RE.test(txt)) hit = true;
    if (STRONG.test(txt)) strongHit = true;
  }
  if (hit) {
    let artist = dir;
    try { artist = JSON.parse(fs.readFileSync(path.join(LIB, dir, 'meta.json'), 'utf8')).artist || dir; } catch {}
    results.push({ id: dir, artist, strong: strongHit });
    if (!byArtist.has(artist)) byArtist.set(artist, { total: 0, strong: 0 });
    byArtist.get(artist).total++;
    if (strongHit) byArtist.get(artist).strong++;
  }
}
console.log('Por artista (total con solfège / con raíces fuertes DO-SOL-SI-RE):');
[...byArtist.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([a, v]) =>
  console.log(`  ${a}: ${v.total} (${v.strong} fuertes)`));
console.log(`\nTotal archivos-canción con solfège: ${results.length}`);
console.log(`Solo raíces fuertes: ${results.filter(r => r.strong).length}`);
fs.writeFileSync(path.resolve('tools', 'solfege-list.json'), JSON.stringify(results, null, 2));
console.log('Lista guardada en tools/solfege-list.json');
