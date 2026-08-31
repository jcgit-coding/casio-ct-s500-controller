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

// Theme button logic
js = js.replace(`btnThemeToggle.innerText = '🌙';`, `btnThemeToggle.innerHTML = '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">dark_mode</span>';`);
js = js.replace(`btnThemeToggle.innerText = next === 'light' ? '🌙' : '☀️';`, `btnThemeToggle.innerHTML = '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">' + (next === 'light' ? 'dark_mode' : 'light_mode') + '</span>';`);

// Fallbacks for mojibake theme icons
js = js.replace(/btnThemeToggle\.innerText = '.*';/g, `btnThemeToggle.innerHTML = '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">dark_mode</span>';`);
js = js.replace(/btnThemeToggle\.innerText = next === 'light' \? '.*' : '.*';/g, `btnThemeToggle.innerHTML = '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">' + (next === 'light' ? 'dark_mode' : 'light_mode') + '</span>';`);

fs.writeFileSync('app.js', js, 'utf8');
console.log("Cleaned up app.js perfectly");
