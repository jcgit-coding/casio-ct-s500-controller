const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

const target = `        if (saved.pcSynthEnabled !== undefined) {
            pcSynthEnabled = saved.pcSynthEnabled;
            const pcToggle = document.getElementById('pcSynthToggle');
            if (pcToggle) pcToggle.checked = pcSynthEnabled;
        }`;

appJs = appJs.replace(target, '');
fs.writeFileSync('app.js', appJs);
console.log('Fixed');
