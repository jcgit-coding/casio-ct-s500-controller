const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

const reps = {
    'Sin conexión — usando presets locales': 'Offline — using local presets',
    '✓ Presets actualizados': '✓ Presets updated',
    'Error: No se pudo cargar SF2': 'Error: Could not load SF2',
    'Escribe un nombre para el preset.': 'Enter a name for the preset.'
};

for (const [spa, eng] of Object.entries(reps)) {
    appJs = appJs.split(spa).join(eng);
}

fs.writeFileSync('app.js', appJs);
console.log('Translated app.js to English');
