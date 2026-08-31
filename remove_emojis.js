const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The emojis to replace
const replacements = [
    { regex: /☀️/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">light_mode</span>' },
    { regex: /🔍/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle; margin-right:4px;">search</span>' },
    { regex: /🎛️/gu, html: '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">tune</span>' },
    { regex: /▶/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">play_arrow</span>' },
    { regex: /⏳/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">hourglass_empty</span>' },
    { regex: /🎹/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">piano</span>' },
    { regex: /⏮/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">skip_previous</span>' },
    { regex: /1️⃣/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">looks_one</span>' },
    { regex: /2️⃣/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">looks_two</span>' },
    { regex: /⏭/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">skip_next</span>' },
    { regex: /📁/gu, html: '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">folder</span>' },
    { regex: /🥁/gu, html: '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">queue_music</span>' },
    { regex: /⚙️/gu, html: '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">settings</span>' },
    { regex: /◀/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">arrow_left</span>' },
    { regex: /▶/gu, html: '<span class="material-symbols-outlined" style="font-size:inherit;">arrow_right</span>' }
];

// Emojis that might have variation selectors or missing them
html = html.replace(/\u2600\uFE0F?/g, replacements[0].html); // sun
html = html.replace(/\uD83D\uDD0D/g, replacements[1].html); // search
html = html.replace(/\uD83C\uDF9B\uFE0F?/g, replacements[2].html); // knobs
html = html.replace(/\u25B6\uFE0F?/g, replacements[3].html); // play
html = html.replace(/\u23F3\uFE0F?/g, replacements[4].html); // hourglass
html = html.replace(/\uD83C\uDFB9/g, replacements[5].html); // piano
html = html.replace(/\u23EE\uFE0F?/g, replacements[6].html); // skip prev
html = html.replace(/1\uFE0F\u20E3/g, replacements[7].html); // 1
html = html.replace(/2\uFE0F\u20E3/g, replacements[8].html); // 2
html = html.replace(/\u23ED\uFE0F?/g, replacements[9].html); // skip next
html = html.replace(/\uD83D\uDCC1/g, replacements[10].html); // folder
html = html.replace(/\uD83E\uDD41/g, replacements[11].html); // drum
html = html.replace(/\u2699\uFE0F?/g, replacements[12].html); // settings
html = html.replace(/\u25C0\uFE0F?/g, replacements[13].html); // arrow left
html = html.replace(/\u25B6\uFE0F?/g, replacements[14].html); // arrow right

// Let's also do a blanket replacement using string matches
for (let r of replacements) {
    html = html.replace(r.regex, r.html);
}

html = html.replace(/app\.js\?v=\d+/, 'app.js?v=27');
fs.writeFileSync('index.html', html, 'utf8');
