const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacement = `<!-- Chords will be injected here by JS -->
                </div>

                <div id="harm-master-keyboard" style="margin-top:20px; padding:20px; background:var(--panel-bg); border-radius:8px; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center;">
                    <div id="harm-keyboard-title" style="font-size:16px; font-weight:bold; margin-bottom:15px; color:var(--text-muted);">Select a chord or extension to view fingering</div>
                    <div id="harm-keyboard-svg" style="width:100%; display:flex; justify-content:center;"></div>
                </div>`;

html = html.replace(/<!-- Chords will be injected here by JS -->\r?\n\s*<\/div>/, replacement);
fs.writeFileSync('index.html', html);
console.log('Fixed index.html properly');
