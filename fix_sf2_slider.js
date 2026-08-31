const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The sf2 volume fader should just be a normal range slider
html = html.replace('class="eq-fader" id="sf2-vol"', 'id="sf2-vol" style="width:100%; margin: 15px 0;"');

fs.writeFileSync('index.html', html, 'utf8');
console.log("Fixed SF2 Fader");
