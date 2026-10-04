const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const target = 'style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;"';
const replacement = 'class="harmony-grid"';

if (html.includes(target)) {
    html = html.replace(target, replacement);
    fs.writeFileSync('index.html', html);
    console.log('Fixed index.html');
} else {
    console.log('Target string not found in index.html');
}
