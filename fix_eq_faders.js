const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Remove old fader css entirely
css = css.replace(/input\[type=range\]\[orient=vertical\] \{[\s\S]*?\}\n/g, '');
css = css.replace(/input\[type=range\]\[orient=vertical\]::-webkit-slider-runnable-track \{[\s\S]*?\}\n/g, '');
css = css.replace(/input\[type=range\]\[orient=vertical\]::-webkit-slider-thumb \{[\s\S]*?\}\n/g, '');
css = css.replace(/\[data-theme="light"\] input\[type=range\]\[orient=vertical\]::-webkit-slider-runnable-track \{[\s\S]*?\}\n/g, '');
css = css.replace(/\[data-theme="light"\] input\[type=range\]\[orient=vertical\]::-webkit-slider-thumb \{[\s\S]*?\}\n/g, '');

const perfectFaders = `
/* FADER STYLES */
.fader-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    min-width: 44px;
}
.eq-fader {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    width: 160px;
    height: 32px;
    margin: 64px -64px; /* Adjust spacing because of rotation */
    transform: rotate(-90deg);
    outline: none;
    position: relative;
    border-radius: 8px;
}

.eq-fader::-webkit-slider-runnable-track {
    width: 100%;
    height: 8px;
    background: var(--fader-track);
    border: 1px solid var(--panel-border);
    border-radius: 4px;
    box-shadow: inset 0 2px 4px var(--shadow-color);
}

.eq-fader::-moz-range-track {
    width: 100%;
    height: 8px;
    background: var(--fader-track);
    border: 1px solid var(--panel-border);
    border-radius: 4px;
    box-shadow: inset 0 2px 4px var(--shadow-color);
}

.eq-fader::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 36px;
    width: 24px;
    border-radius: 4px;
    background: var(--panel-bg);
    border: 2px solid var(--panel-border);
    box-shadow: 0 4px 8px var(--shadow-color), inset 0 1px 1px rgba(255,255,255,0.2);
    margin-top: -15px; /* Center thumb on track */
    /* Fader grip line (horizontal line on the rotated thumb, which becomes vertical... wait, if the slider is rotated, the thumb is also rotated! */
    /* The thumb needs a vertical line across it, so when rotated it's horizontal! */
    background-image: linear-gradient(to right, transparent 10px, var(--accent) 10px, var(--accent) 14px, transparent 14px);
    transition: transform 0.1s;
}

.eq-fader::-moz-range-thumb {
    height: 36px;
    width: 24px;
    border-radius: 4px;
    background: var(--panel-bg);
    border: 2px solid var(--panel-border);
    box-shadow: 0 4px 8px var(--shadow-color), inset 0 1px 1px rgba(255,255,255,0.2);
    background-image: linear-gradient(to right, transparent 10px, var(--accent) 10px, var(--accent) 14px, transparent 14px);
    transition: transform 0.1s;
}

.eq-fader:active::-webkit-slider-thumb {
    transform: scale(1.05);
    border-color: var(--accent);
}
.eq-fader:active::-moz-range-thumb {
    transform: scale(1.05);
    border-color: var(--accent);
}

/* Fix values and labels for better contrast and size */
.fader-value {
    font-size: 13px !important;
    font-weight: bold;
    color: var(--fader-val-text);
    background: var(--fader-val-bg);
    border: 1px solid var(--panel-border);
    box-shadow: inset 0 1px 3px var(--shadow-color);
    padding: 4px 8px !important;
    border-radius: 6px !important;
    min-width: 40px !important;
    min-height: unset !important;
}

.fader-label {
    font-size: 11px !important;
    font-weight: 800;
    color: var(--fader-label) !important;
    text-transform: uppercase;
    letter-spacing: .5px;
    text-align: center;
    white-space: nowrap;
}

.fader-section {
    background: var(--panel-bg) !important;
    border-radius: 12px !important;
    padding: 16px 20px !important;
    margin-right: 12px !important;
    box-shadow: 0 4px 15px var(--shadow-color) !important;
    border: 1px solid var(--panel-border) !important;
}

.fader-section-title {
    font-size: 11px !important;
    color: var(--text) !important;
    opacity: 0.8;
}

[data-theme="light"] .fader-value {
    background: #fff;
    color: #000;
}
[data-theme="light"] .fader-label {
    color: #444 !important;
}
[data-theme="light"] .fader-section-title {
    color: #222 !important;
    border-bottom: 2px solid var(--accent) !important;
}
`;

css += perfectFaders;

fs.writeFileSync('style.css', css, 'utf8');

// Also fix app.js so it removes orient="vertical" since we are rotating it!
let js = fs.readFileSync('app.js', 'utf8');
js = js.replace(/fader\.setAttribute\('orient', 'vertical'\);/g, '// fader.setAttribute("orient", "vertical"); // Removed in favor of CSS transform');
fs.writeFileSync('app.js', js, 'utf8');

// Update index.html version
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/style\.css\?v=\d+/, 'style.css?v=38');
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=38');
fs.writeFileSync('index.html', html, 'utf8');

console.log("Faders modernized.");
