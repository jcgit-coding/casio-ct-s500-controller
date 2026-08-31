
const fs = require('fs');
let css = fs.readFileSync('I:/My Drive/3 Music/PIANO/CasioController/style.css', 'utf8');

css = css.replace('.fader-section {\n    flex: 0 0 auto;', '.fader-section {\n    flex: 0 0 auto; flex-shrink: 0;');
css = css.replace('min-width: 44px;\n    justify-content: flex-start;', 'min-width: 44px;\n    flex-shrink: 0;\n    justify-content: flex-start;');

fs.writeFileSync('I:/My Drive/3 Music/PIANO/CasioController/style.css', css, 'utf8');
