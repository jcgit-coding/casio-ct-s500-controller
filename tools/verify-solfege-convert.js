// tools/verify-solfege-convert.js — verifica la conversión contra HEAD
const { execSync } = require('child_process');
const fs = require('fs');
const { isChordLine, SECTION_LABEL_RE, CHORD_STRIP_RE, CHORD_FIND_RE } = require('./parser-mirror');

function isConvertibleLine(line) {
  if (isChordLine(line)) return true;
  const t = line.trim();
  if (!t || t.startsWith('//')) return false;
  if (SECTION_LABEL_RE.test(t)) return false;
  const noLabel = t.replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '').replace(/\(x\s*\d+\)/gi, '').trim();
  if (!noLabel) return false;
  const leftover = noLabel.replace(CHORD_STRIP_RE, '')
    .replace(/[\s\-|./\\()\[\],;|]+/gi, '').replace(/\d+/g, '').trim();
  if (leftover.length > 0) return false;
  CHORD_FIND_RE.lastIndex = 0;
  return CHORD_FIND_RE.test(noLabel);
}
function countTok(line) {
  CHORD_FIND_RE.lastIndex = 0;
  let n = 0;
  while (CHORD_FIND_RE.exec(line)) n++;
  return n;
}
const ES_ROOT = /^(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)/;
const plan = JSON.parse(fs.readFileSync('tools/solfege-convert-plan.json', 'utf8'));
let broken = 0, esLeft = 0, merged = 0, checked = 0;
for (const p of plan) {
  for (const fname of p.files) {
    const spec = `HEAD:library/${p.id}/${fname}`;
    const before = execSync(`git show "${spec}"`, { maxBuffer: 10 * 1024 * 1024 }).toString().split('\n');
    const after = fs.readFileSync(`library/${p.id}/${fname}`, 'utf8').split('\n');
    checked++;
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const b = before[i] ?? '', a = after[i] ?? '';
      if (isConvertibleLine(b) && !isConvertibleLine(a)) { broken++; if (broken <= 5) console.log(`ROTO ${p.id}/${fname} L${i + 1}`); }
      if (isConvertibleLine(b) && isConvertibleLine(a) && countTok(a) !== countTok(b)) { merged++; if (merged <= 5) console.log(`TOKS ${p.id}/${fname} L${i + 1}: ${countTok(b)}->${countTok(a)}`); }
      if (isConvertibleLine(a)) {
        CHORD_FIND_RE.lastIndex = 0; let m;
        while ((m = CHORD_FIND_RE.exec(a)) !== null) {
          if (ES_ROOT.test(m[0])) { esLeft++; if (esLeft <= 5) console.log(`ES ${p.id}/${fname} L${i + 1}: ${m[0]}`); break; }
        }
      }
    }
  }
}
console.log(`archivos: ${checked} | lineas rotas: ${broken} | mergeos: ${merged} | ES restantes: ${esLeft}`);
process.exit(broken + esLeft + merged ? 1 : 0);
