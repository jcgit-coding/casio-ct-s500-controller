const fs = require('fs');
let lines = fs.readFileSync('index.html', 'utf8').split('\n');

const insertIdx = lines.findIndex(l => l.includes('id="view-synth"'));

if (insertIdx !== -1) {
    const block = `
            <!-- PROFESSIONAL DAW ROUTING PANEL -->
            <div class="pro-routing-panel" style="background: linear-gradient(135deg, rgba(30,34,42,0.9), rgba(20,22,28,0.9)); border: 1px solid var(--accent); border-radius: 8px; padding: 18px; margin: 20px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 10px;">
                    <span class="material-symbols-outlined" style="color:var(--accent); font-size:24px;">podcasts</span>
                    <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--text-light); text-transform:uppercase; letter-spacing:1px;">Pro Video-Call Routing (Zero Latency & Realistic VSTs)</h3>
                </div>
                <p style="font-size: 13px; line-height: 1.5; color: #aaa; margin-bottom: 12px; font-weight:400;">
                    To play in Zoom/OBS with <b>ultra-realistic sounds</b> (like Keyscape, Kontakt, or Spitfire) and <b>no lag</b>, avoid using the built-in browser PC Synth. Instead, use a professional DAW workflow:
                </p>
                <ol style="font-size: 13px; line-height: 1.6; color: #ccc; margin: 0 0 0 20px; padding: 0; font-weight:500;">
                    <li>Install a Virtual MIDI Cable (<b>LoopMIDI</b> on Windows or <b>IAC Driver</b> on Mac).</li>
                    <li>In this app, select the Virtual MIDI port in the MIDI Connection output.</li>
                    <li>Open your DAW (Ableton, Logic) and load your high-end VSTs, receiving from the Virtual MIDI port.</li>
                    <li>Route your DAW's ASIO audio to your video call using a virtual audio patch (e.g. <b>Voicemeeter</b> or <b>BlackHole</b>).</li>
                </ol>
            </div>
`;
    lines.splice(insertIdx + 1, 0, block);
    
    // Also bump version 150 to 151
    let content = lines.join('\n');
    content = content.replace(/v150/g, 'v151').replace(/v=150/g, 'v=151');
    content = content.replace(/v149/g, 'v151').replace(/v=149/g, 'v=151');
    fs.writeFileSync('index.html', content);
    console.log('Successfully inserted safely via array splice');
}
