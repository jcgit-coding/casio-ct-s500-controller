const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const reps = {
    'Control de Ritmo': 'Rhythm Control',
    'title="Enviar MIDI Clock al teclado"': 'title="Send MIDI Clock to keyboard"',
    'Si no detecta el teclado en Android:<br>': 'If keyboard is not detected on Android:<br>',
    '1. Usa <b>cable USB-OTG</b> (el adaptador Bluetooth WU-BT10 no es visible para Chrome Android).<br>': '1. Use a <b>USB-OTG cable</b> (the WU-BT10 Bluetooth adapter is not visible to Chrome Android).<br>',
    '2. Abre la page por <b>HTTPS</b>.<br>': '2. Open the page via <b>HTTPS</b>.<br>',
    '3. Si negaste el permiso antes: toca el candado junto a la direction &rarr; Permisos &rarr; <b>MIDI &rarr; Permitir</b>.': '3. If you denied permission before: tap the lock icon next to the URL &rarr; Permissions &rarr; <b>MIDI &rarr; Allow</b>.',
    '<b style="color:#ff3366;">Permiso MIDI bloqueado</b><br>': '<b style="color:#ff3366;">MIDI Permission Blocked</b><br>',
    'Chrome recorded tu negativa anterior y ya no muestra el aviso. Para restablecerlo:<br>': 'Chrome saved your previous denial. To reset it:<br>',
    '1. Toca el <b>lock</b> junto a la direction del sitio.<br>': '1. Tap the <b>lock</b> icon next to the site URL.<br>',
    '2. Entra en <b>Permisos</b> y activa <b>Dispositivos MIDI &rarr; Permitir</b>.<br>': '2. Go to <b>Permissions</b> and enable <b>MIDI Devices &rarr; Allow</b>.<br>',
    '3. Si no aparece, usa <b>Restablecer permisos</b>, recarga y acepta el aviso.': '3. If it does not appear, use <b>Reset permissions</b>, reload and accept the prompt.',
    '>Reconectar MIDI<': '>Reconnect MIDI<'
};

for (const [spa, eng] of Object.entries(reps)) {
    html = html.split(spa).join(eng);
}

fs.writeFileSync('index.html', html);
console.log('Translated index.html');
