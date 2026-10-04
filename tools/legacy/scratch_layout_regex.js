const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const regex = /<div id="harm-mode-info" [\s\S]*?<div id="harm-keyboard-svg" style="width:100%; display:flex; justify-content:center;"><\/div>\s*<\/div>/;

const replacement = `<div id="harm-chords-container" class="harmony-grid" style="margin-bottom:20px;">
                    <!-- Chords will be injected here by JS -->
                </div>

                <div id="harm-bottom-section" style="display:flex; gap:20px; flex-wrap:wrap; align-items: stretch;">
                    <div id="harm-master-keyboard" style="flex:1.5; min-width:350px; padding:20px; background:var(--panel-bg); border-radius:8px; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center; justify-content:center;">
                        <div id="harm-keyboard-title" style="font-size:18px; font-weight:bold; margin-bottom:15px; color:var(--text-muted); text-align:center;">Select a chord or extension to view fingering</div>
                        <div id="harm-keyboard-svg" style="width:100%; display:flex; justify-content:center;"></div>
                    </div>
                    
                    <div id="harm-mode-info" style="flex:1; min-width:300px; padding:20px; background:var(--panel-bg); border-radius:8px; border:1px solid var(--border); border-left:4px solid var(--accent); display:none; font-size:14px; line-height:1.6; color:var(--text);"></div>
                </div>`;

if (regex.test(html)) {
    html = html.replace(regex, replacement);
    fs.writeFileSync('index.html', html);
    console.log('Fixed via regex');
} else {
    console.log('Regex failed');
}
