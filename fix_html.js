const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');
c = c.replace(/class="eq-fader rc-fader"/g, 'class="rc-fader"');
fs.writeFileSync('index.html', c);
