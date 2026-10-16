// node tools/find-dup-same-artist.js — títulos repetidos dentro del MISMO artista
const fs = require('fs');
const txt = fs.readFileSync('tools/dup-titles.txt', 'utf8');
const blocks = txt.split(/^=== /m).slice(1);
let n = 0;
for (const b of blocks) {
  const m = b.match(/"(.+?)" \((\d+) veces\)/);
  if (!m) continue;
  const title = m[1];
  const lines = b.split('\n').slice(1).filter(l => l.includes('—'));
  const artists = {};
  for (const l of lines) {
    const a = l.split('—').pop().trim();
    (artists[a] = artists[a] || []).push(l.trim());
  }
  for (const [a, arr] of Object.entries(artists)) {
    if (arr.length >= 2) {
      n++;
      console.log(`\n"${title}" — ${a} (${arr.length})`);
      arr.forEach(x => console.log('  ' + x));
    }
  }
}
console.log(`\nGrupos mismo título + mismo artista: ${n}`);
