const fs = require('fs');
let js = fs.readFileSync('app.js', 'utf8');

js = js.replace(/Expresi[^n]{1,3}n/g, 'Expresión');
js = js.replace(/din[^m]{1,3}mico/g, 'dinámico');
js = js.replace(/org[^n]{1,3}nicos/g, 'orgánicos');
js = js.replace(/c[^l]{1,3}lido/g, 'cálido');
js = js.replace(/Ac[^s]{1,4}stica/g, 'Acústica');
js = js.replace(/Saxof[^n]{1,3}n/g, 'Saxofón');
js = js.replace(/\/\/ [^t]+tnicos y Mundo/g, '// Étnicos y Mundo');
js = js.replace(/Categor[^A]{1,3}A/g, 'Categoría');
js = js.replace(/CATEGOR[^A]{1,3}A/g, 'CATEGORÍA');

// Clean up weird CSS comments in app.js like "ǽ??'"
js = js.replace(/[ǽ\?']+/g, '=');

// Let's use strict match for those lines to be perfectly sure.
js = js.replace(/\{ label: 'EXP',  cc: 11, def: 127, tip: 'Expresión \(dinámico\)' \},/g, "{ label: 'EXP',  cc: 11, def: 127, tip: 'Expresión (dinámico)' },");
js = js.replace(/\/\/ Cuerdas y Coros \(Pads orgánicos\)/g, "// Cuerdas y Coros (Pads orgánicos)");
js = js.replace(/Ataque suave, cálido/g, "Ataque suave, cálido");

// Write back
fs.writeFileSync('app.js', js, 'utf8');
console.log("Fixed app.js properly");
