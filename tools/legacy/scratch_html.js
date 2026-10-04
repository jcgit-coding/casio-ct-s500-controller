const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Mixer Octaves
html = html.replace(
    /<button class="step-btn" data-part="([^"]+)" data-action="oct\+">\+<\/button>/g,
    '<button class="step-btn" data-part="$1" data-action="oct+">+</button>\n                                <button class="btn-reset-small" data-part="$1" data-action="oct-reset" style="margin-left:5px; padding:2px 5px; font-size:10px;">Reset</button>'
);

// Synth Rack Octaves
html = html.replace(
    /<button class="step-btn" data-part="([^"]+)" data-mctrl-oct="1">\+<\/button>/g,
    '<button class="step-btn" data-part="$1" data-mctrl-oct="1">+</button>\n                                <button class="btn-reset-small" data-part="$1" data-mctrl-oct="reset" style="margin-left:5px; padding:2px 5px; font-size:10px;">Rst</button>'
);

// VK Octave
html = html.replace(
    /<button class="step-btn" id="vk-oct-plus">\+<\/button>/g,
    '<button class="step-btn" id="vk-oct-plus">+</button>\n                                <button class="btn-reset-small" id="vk-oct-reset" style="margin-left:5px; padding:2px 5px; font-size:10px;">Reset</button>'
);

// Increase app version
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=114');
html = html.replace(/style\.css\?v=\d+/, 'style.css?v=114');
html = html.replace(/id="appVersionBadge"[^>]*>v\d+<\/span>/, 'id="appVersionBadge" style="font-size: 12px; color: var(--text-dim); font-weight: 600; opacity: 0.5; padding-left: 5px; cursor: default;" title="Versión de la App">v114</span>');

fs.writeFileSync('index.html', html);
