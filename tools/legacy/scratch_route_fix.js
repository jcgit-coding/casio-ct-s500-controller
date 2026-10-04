const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const target = "Route your DAW's ASIO audio to your video call using a virtual audio patch (e.g. <b>Voicemeeter</b> or <b>BlackHole</b>).";
const replacement = "Route your Instrument's audio output to your video call microphone input using a virtual audio patch (like <b>Voicemeeter</b>).";

html = html.replace(target, replacement);
fs.writeFileSync('index.html', html);
console.log('Replaced routing');
