const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('id="view-synth"'));
if (start !== -1) {
    const end = lines.findIndex((l, i) => i > start && l.includes('</section>'));
    console.log(lines.slice(start, end + 1).join('\n'));
} else {
    console.log('Not found');
}
