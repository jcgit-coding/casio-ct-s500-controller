// npm run check -- syntax of every app script + every <script src> / stylesheet referenced by index.html exists.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
let bad = 0;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(r => !/^(https?:|data:|#|\/\/)/.test(r));
for (const r of new Set(refs)) {
    if (!fs.existsSync(path.join(root, r))) { console.log('MISSING referenced file:', r); bad++; }
}
const files = fs.readdirSync(root).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));
for (const f of files) {
    const r = cp.spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
    if (r.status !== 0) { console.log('SYNTAX ERROR in', f + '\n' + r.stderr); bad++; }
}
console.log(bad ? ('FAILED: ' + bad + ' problem(s)') : ('OK: ' + files.length + ' scripts, ' + new Set(refs).size + ' references'));
process.exit(bad ? 1 : 0);
