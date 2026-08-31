const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add Material Symbols Link
const linkTag = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />\n    <link rel="stylesheet" href="style.css?v=8">';
html = html.replace('<link rel="stylesheet" href="style.css?v=8">', linkTag);

// 2. Add PC Synth Tab to Nav
html = html.replace(/<button class="nav-tab" data-target="view-settings">.*?<\/button>/, 
'$&\n                <button class="nav-tab" data-target="view-synth"><span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">piano</span> PC SYNTH</button>');

// 3. Add PC Synth View
const synthView = `
        <!-- VIEW: PC SYNTH -->
        <div class="app-view" id="view-synth">
            <div class="panel">
                <div class="panel-header">
                    <h2>Módulo de Sonido de PC (SoundFonts)</h2>
                </div>
                <div style="padding: 1rem; color: #ccc;">
                    <p>Aquí puedes cargar archivos <strong>.sf2</strong> para que suenen directamente desde los parlantes de tu PC, usando tu Casio como teclado controlador. Ideal para videollamadas.</p>
                    
                    <div style="margin: 1.5rem 0; padding: 1.5rem; background: #222; border-radius: 8px; text-align: center;">
                        <input type="file" id="sf2-file" accept=".sf2" style="display: none;">
                        <label for="sf2-file" style="background: var(--accent); color: #fff; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">
                            <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 5px;">folder_open</span> Cargar Archivo .sf2
                        </label>
                        <p id="sf2-status" style="margin-top: 15px; color: #888;">Ningún sonido cargado.</p>
                    </div>

                    <div class="eq-row">
                        <div class="slider-group">
                            <label>Volumen PC Synth</label>
                            <input type="range" class="eq-fader" id="sf2-vol" min="0" max="100" value="100">
                            <div class="val-display" id="sf2-vol-val">100</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div><!-- /main-console -->`;
html = html.replace('    </div><!-- /main-console -->', synthView);

// 4. Clean Placeholders
html = html.replace(/placeholder=".*? Buscar/gu, 'placeholder="Buscar');
html = html.replace(/placeholder=".*? Nombre/gu, 'placeholder="Nombre');

// Replace general emojis inside UI using unicode blocks so we don't miss anything
// Light mode
html = html.replace(/\u2600\uFE0F?/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">light_mode</span>');
// Play arrow
html = html.replace(/\u25B6\uFE0F?/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">play_arrow</span>');
// Arrow left (solid)
html = html.replace(/\u25C0\uFE0F?/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">arrow_left</span>');
// Hourglass
html = html.replace(/\u23F3\uFE0F?/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">hourglass_empty</span>');
// Skip prev
html = html.replace(/\u23EE\uFE0F?/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">skip_previous</span>');
// Skip next
html = html.replace(/\u23ED\uFE0F?/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">skip_next</span>');
// Number 1
html = html.replace(/1\uFE0F\u20E3/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">looks_one</span>');
// Number 2
html = html.replace(/2\uFE0F\u20E3/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">looks_two</span>');
// Piano
html = html.replace(/\uD83C\uDFB9/gu, '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle; margin-right:5px;">piano</span>');
// Knobs
html = html.replace(/\uD83C\uDF9B\uFE0F?/gu, '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">tune</span>');
// Drums
html = html.replace(/\uD83E\uDD41/gu, '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">queue_music</span>');
// Settings
html = html.replace(/\u2699\uFE0F?/gu, '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">settings</span>');
// Folder
html = html.replace(/\uD83D\uDCC1/gu, '<span class="material-symbols-outlined" style="vertical-align:middle; margin-right:5px;">folder</span>');
// Search
html = html.replace(/\uD83D\uDD0D/gu, ''); // just remove since we fixed placeholder

// ACOMPAÑ Piano button fix (since piano icon is inserted with margin-right now, we can remove it or keep it)
html = html.replace(/>piano<\/span><\/div>\s*<div class="text">ACOMPAÑ/, '>piano</span></div>\n                        <div class="text">ACOMPAÑ');

// Bump version
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=30');

// Save the fixed HTML
fs.writeFileSync('index.html', html, 'utf8');
console.log("Rebuild complete");
