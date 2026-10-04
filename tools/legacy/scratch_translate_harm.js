const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace('value="mayor">Mayor', 'value="major">Major');
html = html.replace('value="menor">Menor', 'value="minor">Minor');
html = html.replace('value="mayor">Major', 'value="major">Major');
html = html.replace('value="menor">Minor', 'value="minor">Minor');

fs.writeFileSync('index.html', html);

let harm = fs.readFileSync('harmony.js', 'utf8');
harm = harm.replace('mayor:', 'major:');
harm = harm.replace('menor:', 'minor:');
fs.writeFileSync('harmony.js', harm);

console.log('Translated harmony keys to English');
