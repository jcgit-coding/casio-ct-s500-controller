const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

harm = harm.replace('padding: 15px;', 'padding: 10px;');
fs.writeFileSync('harmony.js', harm);
console.log('Reduced card padding');
