const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('accept=".sf2"', 'accept=".sf2,audio/*,application/*,*/*"');
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=32');
fs.writeFileSync('index.html', html, 'utf8');
console.log("Fixed index.html");
