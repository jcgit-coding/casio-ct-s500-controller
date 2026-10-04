const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Replace literal "\n" with actual newlines
css = css.replace(/\\n/g, '\n');

fs.writeFileSync('style.css', css);
console.log('Fixed literal newlines');
