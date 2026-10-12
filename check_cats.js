const s = require('fs').readFileSync('I:/My Drive/3 Music/PIANO/CasioController/raw_tones.js', 'utf8');
const m = s.match(/const rawTonesText = `([\s\S]*?)`;/);
const lines = m[1].split('\n');
const cats = [];
for (const l of lines) {
  const t = l.trim();
  if (t && !/^\d/.test(t) && !t.startsWith('//')) cats.push(t);
}
console.log([...new Set(cats)].join(' | '));

// Also test if 'Piano', 'Pad', 'String' match any category or name
const allTones = [];
for (const l of lines) {
  const t = l.trim();
  if (!t || !/^\d/.test(t)) continue;
  const tokens = t.split(/\s+/);
  const id = parseInt(tokens.shift());
  const tail = [];
  for (let i = 0; i < 3; i++) if (tokens.length) tail.unshift(tokens.pop());
  const name = tokens.join(' ');
  allTones.push({ id, name });
}

const searchTerms = ['Piano', 'Pad', 'String'];
for (const term of searchTerms) {
  const matches = allTones.filter(t => t.name.toLowerCase().includes(term.toLowerCase())).slice(0, 5);
  console.log(`\n"${term}" matches in NAME:`, matches.map(m => m.name));
}