// node tools/find-solfege-lines.js — TAREA 1A (refinado): acordes en solfège REALES (líneas que el parser clasifica como acordes)
const fs = require('fs'), path = require('path');
const { isChordLine, ES_ROOT, EN_ROOT } = require('./parser-mirror');
const LIB = path.resolve('library');

// Tokens de acorde tal como los extraería el highlight (replica de CHORD_RE)
const ES_PAREN = '(?:\\((?:add|maj|aug|\\d+)(?:[/,](?:add|maj|aug|\\d+))*\\))?';
const ES_QUAL  = `(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+(?:\\(aug\\))?|sus[24]?|(?:\\((?:add|aug)\\d*\\))|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?${ES_PAREN}(?:\\/\\d+)?`;
const ES_BASS  = '(?:\\/(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?(?:[A-G][#b]?)?)?';
const EN_PAREN = '(?:\\((?:add|maj|aug|\\d+)(?:[/,](?:add|maj|aug|\\d+))*\\))?';
const EN_QUAL  = `(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+|sus[24]?|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?${EN_PAREN}(?:\\/\\d+)?`;
const EN_BASS  = '(?:\\/[CDEFGAB](?:#|b)?)?';
const CHORD_FIND_RE = new RegExp(`${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS}`, 'g');
const ES_TOKEN_RE = new RegExp(`^${ES_ROOT}`);

const byArtist = new Map();
const results = [];
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const dirPath = path.join(LIB, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  let esTokens = 0, enTokens = 0;
  for (const f of fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const txt = fs.readFileSync(path.join(dirPath, f), 'utf8');
    for (const line of txt.split('\n')) {
      if (!isChordLine(line)) continue;
      CHORD_FIND_RE.lastIndex = 0;
      let m;
      while ((m = CHORD_FIND_RE.exec(line)) !== null) {
        if (ES_TOKEN_RE.test(m[0])) esTokens++; else enTokens++;
      }
    }
  }
  if (esTokens > 0 && esTokens >= enTokens) {
    let artist = dir;
    try { artist = JSON.parse(fs.readFileSync(path.join(dirPath, 'meta.json'), 'utf8')).artist || dir; } catch {}
    results.push({ id: dir, artist, esTokens, enTokens });
    if (!byArtist.has(artist)) byArtist.set(artist, { total: 0, es: 0, en: 0 });
    const a = byArtist.get(artist); a.total++; a.es += esTokens; a.en += enTokens;
  }
}
console.log('POR ARTISTA (canciones con acordes solfège ≥ ingleses en líneas de acordes):');
[...byArtist.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([a, v]) =>
  console.log(`  ${a}: ${v.total} canciones  (tokens ES=${v.es} EN=${v.en})`));
console.log(`\nTOTAL canciones主要 en solfège: ${results.length}`);
fs.writeFileSync(path.resolve('tools', 'solfege-real.json'), JSON.stringify(results, null, 2));
console.log('Lista: tools/solfege-real.json');
