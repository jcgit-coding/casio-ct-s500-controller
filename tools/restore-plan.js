// tools/restore-plan.js — restaura desde HEAD los archivos de un plan JSON (con reintentos por locks de Drive)
const fs = require('fs'), { execSync } = require('child_process');
const planPath = process.argv[2] || 'tools/solfege-convert-plan.json';
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
let ok = 0, fail = [];
for (const p of plan) {
  for (const f of p.files) {
    const spec = `HEAD:library/${p.id}/${f}`;
    let done = false;
    for (let attempt = 0; attempt < 5 && !done; attempt++) {
      try {
        const content = execSync(`git show "${spec}"`, { maxBuffer: 10 * 1024 * 1024 });
        fs.writeFileSync(`library/${p.id}/${f}`, content);
        done = true; ok++;
      } catch (e) {
        sleep(300);
      }
    }
    if (!done) fail.push(`${p.id}/${f}`);
  }
}
console.log(`restaurados ${ok} archivos; fallos: ${fail.length}`);
fail.forEach(f => console.log('  FALLO ' + f));
process.exit(fail.length ? 1 : 0);
