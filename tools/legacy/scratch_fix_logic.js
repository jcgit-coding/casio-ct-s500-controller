const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(/'WEB AUDIO: ON' : 'WEB AUDIO: OFF'/g, "'INTERNAL SF2: ON' : 'INTERNAL SF2: OFF'");

fs.writeFileSync('index.html', html);
console.log('Fixed js logic labels');
