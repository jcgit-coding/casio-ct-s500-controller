const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Undo the previous change
css = css.replace(/input\.eq-fader/g, '.eq-fader');

// Now do the correct one with high specificity
css = css.replace(/\.eq-fader\b/g, 'input[type="range"].eq-fader');

fs.writeFileSync('style.css', css);
