const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

css = css.replace(/font-size: 10px;/g, 'font-size: 11px;');
css = css.replace(/font-size: 10px !important;/g, 'font-size: 11px !important;');

fs.writeFileSync('style.css', css);
