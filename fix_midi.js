const fs = require('fs');
let js = fs.readFileSync('app.js', 'utf8');

// Fix SysEx request for Android
js = js.replace(/requestMIDIAccess\(\{ sysex: true \}\)/g, "requestMIDIAccess({ sysex: false })");

// Clean up those dirty status strings
js = js.replace(/setStatus\("Web MIDI no soportado[^"]+", false\);/g, 'setStatus("Web MIDI no soportado (Usa Chrome o Edge)", false);');
js = js.replace(/setStatus\("Conectando[^"]+", false\);/g, 'setStatus("Conectando...", false);');
js = js.replace(/setStatus\("Acceso MIDI denegado[^"]+", false\);/g, 'setStatus("Acceso MIDI denegado (Revisa permisos)", false);');

// Clean up the weird comment blocks at the MIDI init
js = js.replace(/\/\/ [ǽ\?']+(.*)/g, '// $1');
js = js.replace(/\/\/[ǽ\?']+/g, '');

fs.writeFileSync('app.js', js, 'utf8');
console.log("Fixed MIDI init for Android");
