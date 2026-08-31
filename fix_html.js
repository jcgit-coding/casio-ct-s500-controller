const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Fix broken accents
html = html.replace(/CATEGOR\xEF\xBF\xBD\?A/g, 'CATEGORÍA');
html = html.replace(/CATEGOR\uFFFDA/g, 'CATEGORÍA');
html = html.replace(/CATEGOR\?\?A/g, 'CATEGORÍA');
html = html.replace(/M\xEF\xBF\xBDdulo/g, 'Módulo');
html = html.replace(/M\uFFFDdulo/g, 'Módulo');
html = html.replace(/Aqu\xEF\xBF\xBD/g, 'Aquí');
html = html.replace(/Aqu\uFFFD/g, 'Aquí');
html = html.replace(/Ning\xEF\xBF\xBDn/g, 'Ningún');
html = html.replace(/Ning\uFFFDn/g, 'Ningún');
html = html.replace(/Din\xEF\xBF\xBDmico/g, 'Dinámico');
html = html.replace(/Din\uFFFDmico/g, 'Dinámico');
html = html.replace(/\xEF\xBF\xBDNICO/g, 'ÚNICO');
html = html.replace(/\uFFFDNICO/g, 'ÚNICO');
html = html.replace(/Conexi\xEF\xBF\xBDn/g, 'Conexión');
html = html.replace(/Conexi\uFFFDn/g, 'Conexión');
html = html.replace(/aplicaci\xEF\xBF\xBDn/g, 'aplicación');
html = html.replace(/aplicaci\uFFFDn/g, 'aplicación');
html = html.replace(/autom\xEF\xBF\xBDticamente/g, 'automáticamente');
html = html.replace(/autom\uFFFDticamente/g, 'automáticamente');
html = html.replace(/suspensi\xEF\xBF\xBDn/g, 'suspensión');
html = html.replace(/suspensi\uFFFDn/g, 'suspensión');
html = html.replace(/n\xEF\xBF\xBDmero/g, 'número');
html = html.replace(/n\uFFFDmero/g, 'número');
html = html.replace(/\xEF\xBF\xBD\?" sin instrumento \xEF\xBF\xBD\?"/g, '— sin instrumento —');
html = html.replace(/\uFFFD" sin instrumento \uFFFD"/g, '— sin instrumento —');

// Fix HTML inside placeholders
html = html.replace(/placeholder="<span class=\\"material-symbols-outlined\\" style=\\"font-size:inherit; vertical-align:middle; margin-right:4px;\\">search<\/span> /g, 'placeholder="');
html = html.replace(/placeholder='<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle; margin-right:4px;">search<\/span> /g, 'placeholder="');

// Fix generic placeholder mismatches if regex failed
html = html.replace(/placeholder="<[^>]+>search<\/span>\s*/g, 'placeholder="');

fs.writeFileSync('index.html', html, 'utf8');
console.log("Done");
