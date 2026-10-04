const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

harm = harm.replace(/'#ff3366'/g, "'var(--accent)'");
harm = harm.replace(/'#4caf50'/g, "'#4caf50'"); // keep green for the rest of the notes

fs.writeFileSync('harmony.js', harm);
console.log('Fixed SVG colors');
