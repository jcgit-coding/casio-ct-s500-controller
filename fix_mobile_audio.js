const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const fix = `
// Mobile Web Audio API fix: AudioContext MUST be resumed via user gesture
['click', 'touchstart', 'touchend'].forEach(evt => {
    document.addEventListener(evt, () => {
        if (window.pcSynth && window.pcSynth.synth && window.pcSynth.synth.ctx && window.pcSynth.synth.ctx.state === 'suspended') {
            window.pcSynth.synth.ctx.resume();
        }
    }, { once: false, passive: true });
});
`;

if (!code.includes('touchstart')) {
    fs.writeFileSync('app.js', code + fix, 'utf8');
    console.log("Fixed app.js");
} else {
    console.log("Already fixed");
}
