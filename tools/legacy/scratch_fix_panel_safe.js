const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const targetRegex = /<div class="pro-routing-panel"[\s\S]*?<\/ol>\s*<\/div>/;
const match = html.match(targetRegex);
if (match) {
    const replacement = `<div class="pro-routing-panel" style="background: linear-gradient(135deg, rgba(30,34,42,0.9), rgba(20,22,28,0.9)); border: 1px solid var(--accent); border-radius: 8px; padding: 18px; margin: 20px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 10px;">
                    <span class="material-symbols-outlined" style="color:var(--accent); font-size:24px;">audio_file</span>
                    <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--text-light); text-transform:uppercase; letter-spacing:1px;">High-Quality Audio & Video-Call Routing</h3>
                </div>
                <p style="font-size: 13px; line-height: 1.5; color: #aaa; margin-bottom: 12px; font-weight:400;">
                    To play in Zoom/OBS with <b>ultra-realistic sounds</b> and <b>no lag</b>, you have two professional options depending on your setup:
                </p>
                <div style="display:flex; flex-direction:column; gap:15px;">
                    <!-- Option 1 -->
                    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; border-left:3px solid #ff5e99;">
                        <b style="color:#ff5e99; font-size:13px;">Option A: Use Downloaded Sounds (Internal SF2)</b>
                        <p style="margin:5px 0 0; font-size:12px; color:#ccc; line-height:1.5;">
                            If you downloaded high-quality .sf2 sound files, you don't need external programs! 
                            Click the <b>SF2</b> button above to load your sounds, turn <b>INTERNAL SF2: ON</b>, and play directly. 
                            Use a virtual patch like <b>Voicemeeter</b> to route the browser's audio into your video call.
                        </p>
                    </div>
                    <!-- Option 2 -->
                    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; border-left:3px solid #00d2ff;">
                        <b style="color:#00d2ff; font-size:13px;">Option B: External Virtual Instruments (LoopMIDI/rtpMIDI)</b>
                        <p style="margin:5px 0 0; font-size:12px; color:#ccc; line-height:1.5;">
                            If you prefer to use external plugins (Kontakt, Keyscape): Turn <b>EXT MIDI: ON</b>. 
                            Select <i>LoopMIDI</i> in the MIDI Output menu, receive it in your Standalone VST, and route the VST's audio to your video call.
                        </p>
                    </div>
                </div>
            </div>`;
    
    html = html.replace(targetRegex, replacement);
    // Bump version from 154 to 155
    html = html.replace(/v154/g, 'v155').replace(/v=154/g, 'v=155');
    fs.writeFileSync('index.html', html);
    console.log('Fixed panel and bumped to 155');
} else {
    console.log('Panel not found');
}
