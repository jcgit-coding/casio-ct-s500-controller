// node tools/find-sections.js — TAREA 1C: etiquetas de sección NO reconocidas (v2, sin falsos positivos de letra)
const fs = require('fs'), path = require('path');
const { SECTION_LABEL_RE } = require('./parser-mirror');
const LIB = path.resolve('library');

const KEY = 'Coro|Estrofa|Verso|Puente|Intro|Outro|Bridge|Chorus|Verse|Pre-?[Cc]oro|Pre-?[Cc]horus|Pre-?[Ee]stribillo|Estribillo|Vamp|Tag|Interludio|Intermedio|Instrumental|Solo|Final|Llave|Refr[óo]n|Coda|Bajada|Adorno';
// Tras quitar decoración de bordes, la línea debe ser: [núm/romano] KEY [núm/romano/xN/(xN)/veces] [puntuación]
const EXTENDED = new RegExp(
  `^(?:(?:\\d+|\\d+\\.|\\d+º)[\\s.:#-]*)?(?:${KEY})(?:[\\s.:#\\-–]*\\d+|[\\s.:#\\-–]*[IVX]{1,4}|\\s+x\\s*\\d+|\\s+X\\s*\\d+|\\s*\\(\\s*x?\\s*\\d+\\s*\\)|\\s+\\d+\\s+veces)?\\s*[:.\\-–=]*$`,
  'i'
);

const stripEdges = (t) => t
  .replace(/^[\[\(\{~*+=\-\.:#\/]+[\s]*/, '')
  .replace(/[\s]*[\]\)\}~*+=\-\.:#\/]+$/, '')
  .trim();

const variants = new Map();
let files = 0;
for (const dir of fs.readdirSync(LIB)) {
  if (dir === 'index.json') continue;
  const dirPath = path.join(LIB, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const f of fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const txt = fs.readFileSync(path.join(dirPath, f), 'utf8');
    let hitFile = false;
    txt.split('\n').forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('//') || SECTION_LABEL_RE.test(t)) return;
      if (t.length > 50) return;
      const core = stripEdges(t);
      if (!core || core === t) return;          // solo etiquetas "decoradas" que el regex actual no matchea
      if (!EXTENDED.test(core)) return;
      hitFile = true;
      if (!variants.has(t)) variants.set(t, { count: 0, examples: [] });
      const v = variants.get(t);
      v.count++;
      if (v.examples.length < 2) v.examples.push(`${dir}/${f}`);
    });
    if (hitFile) files++;
  }
}
console.log('Etiquetas decoradas NO reconocidas por SECTION_LABEL_RE:');
[...variants.entries()].sort((a, b) => b[1].count - a[1].count).forEach(([k, v]) => {
  console.log(`  (${v.count}x) "${k}"  ej: ${v.examples.join(', ')}`);
});
console.log(`\nArchivos afectados: ${files}`);
console.log(`Variantes distintas: ${variants.size}`);
console.log(`Ocurrencias totales: ${[...variants.values()].reduce((s, v) => s + v.count, 0)}`);
fs.writeFileSync(path.resolve('tools', 'section-variants.json'),
  JSON.stringify([...variants.entries()].map(([label, v]) => ({ label, ...v })), null, 2));
console.log('Detalle: tools/section-variants.json');
