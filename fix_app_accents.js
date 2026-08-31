const fs = require('fs');
let js = fs.readFileSync('app.js', 'utf8');

js = js.replace(/Expresi\xEF\xBF\xBDn/g, 'Expresión');
js = js.replace(/Expresi\uFFFDn/g, 'Expresión');
js = js.replace(/din\xEF\xBF\xBDmico/g, 'dinámico');
js = js.replace(/din\uFFFDmico/g, 'dinámico');
js = js.replace(/org\xEF\xBF\xBDnicos/g, 'orgánicos');
js = js.replace(/org\uFFFDnicos/g, 'orgánicos');
js = js.replace(/c\xEF\xBF\xBDlido/g, 'cálido');
js = js.replace(/c\uFFFDlido/g, 'cálido');
js = js.replace(/\xEF\xBF\xBD\?tnicos/g, 'Étnicos');
js = js.replace(/\uFFFD\?tnicos/g, 'Étnicos');
js = js.replace(/ǟ/g, ''); // Blanket fallback if needed
js = js.replace(/Expresi..n/g, 'Expresión');
js = js.replace(/din..mico/g, 'dinámico');
js = js.replace(/org..nicos/g, 'orgánicos');
js = js.replace(/c..lido/g, 'cálido');
js = js.replace(/..tnicos/g, 'Étnicos');

// Let's use strict match for those lines to be perfectly sure.
js = js.replace(/\{ label: 'EXP',  cc: 11, def: 127, tip: 'Expresi[^']+mico\)' \},/g, "{ label: 'EXP',  cc: 11, def: 127, tip: 'Expresión (dinámico)' },");
js = js.replace(/\/\/ Cuerdas y Coros \(Pads org[^)]+\)/g, "// Cuerdas y Coros (Pads orgánicos)");
js = js.replace(/Ataque suave, c[^l]+lido/g, "Ataque suave, cálido");
js = js.replace(/\/\/ [^t]+tnicos y Mundo/g, "// Étnicos y Mundo");

fs.writeFileSync('app.js', js, 'utf8');
console.log("Fixed app.js accents");
