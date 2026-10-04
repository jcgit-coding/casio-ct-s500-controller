const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Remove inline styles from the reset buttons I added
html = html.replace(/style="margin-left:5px; padding:2px 5px; font-size:10px;"/g, 'style="margin-left: 8px; font-size: 11px;"');

// Bump cache buster
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=115');
html = html.replace(/style\.css\?v=\d+/, 'style.css?v=115');
html = html.replace(/id="appVersionBadge"[^>]*>v\d+<\/span>/, 'id="appVersionBadge" style="font-size: 12px; color: var(--text-dim); font-weight: 600; opacity: 0.5; padding-left: 5px; cursor: default;" title="Versión de la App">v115</span>');

fs.writeFileSync('index.html', html);

let css = fs.readFileSync('style.css', 'utf8');
css = css.replace(/font-size: 9\.5px !important;/g, 'font-size: 11px !important;');
css = css.replace(/width: 50px; \/\* Constrain label width \*\//g, 'width: 60px; /* Constrain label width */');
css = css.replace(/min-width: 50px;/g, 'min-width: 60px;');
fs.writeFileSync('style.css', css);
