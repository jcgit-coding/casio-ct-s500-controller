const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const regexCtrl = /<span class="rack-btn-label" style="min-width:110px;">MIDI CTRL: OFF<\/span>/;
const regexSynth = /<span class="rack-btn-label" style="min-width:110px;">PC SYNTH: OFF<\/span>/;

html = html.replace(regexCtrl, `<span class="rack-btn-label" id="mctrlLabel" style="min-width:110px;">EXT MIDI: OFF</span>`);
html = html.replace(regexSynth, `<span class="rack-btn-label" id="synthLabel" style="min-width:110px;">WEB AUDIO: OFF</span>`);

// Add script to handle toggle text
const headIdx = html.indexOf('</head>');
if (headIdx !== -1) {
    const script = `
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const mctrlToggle = document.getElementById('mctrlToggle');
            const synthToggle = document.getElementById('pcSynthToggle');
            const mctrlLabel = document.getElementById('mctrlLabel');
            const synthLabel = document.getElementById('synthLabel');

            if (mctrlToggle && mctrlLabel) {
                mctrlToggle.addEventListener('change', e => {
                    mctrlLabel.innerText = e.target.checked ? 'EXT MIDI: ON' : 'EXT MIDI: OFF';
                });
                // Initialize
                mctrlLabel.innerText = mctrlToggle.checked ? 'EXT MIDI: ON' : 'EXT MIDI: OFF';
            }
            if (synthToggle && synthLabel) {
                synthToggle.addEventListener('change', e => {
                    synthLabel.innerText = e.target.checked ? 'WEB AUDIO: ON' : 'WEB AUDIO: OFF';
                });
                // Initialize
                synthLabel.innerText = synthToggle.checked ? 'WEB AUDIO: ON' : 'WEB AUDIO: OFF';
            }
        });
    </script>
`;
    html = html.slice(0, headIdx) + script + html.slice(headIdx);
}

fs.writeFileSync('index.html', html);
console.log('Fixed button text labels and added toggle script');
