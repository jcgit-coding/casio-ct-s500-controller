const fs = require('fs');
let c = fs.readFileSync('style.css', 'utf8');

const newCSS = \
/* Custom horizontal fader for Rack Channels */
input[type="range"].rc-fader {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    max-width: 120px;
    height: 24px;
    outline: none;
}
input[type="range"].rc-fader::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    background: var(--fader-track);
    border: 1px solid var(--panel-border);
    border-radius: 3px;
    box-shadow: inset 0 1px 3px var(--shadow-color);
}
input[type="range"].rc-fader::-moz-range-track {
    width: 100%;
    height: 6px;
    background: var(--fader-track);
    border: 1px solid var(--panel-border);
    border-radius: 3px;
    box-shadow: inset 0 1px 3px var(--shadow-color);
}
input[type="range"].rc-fader::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--panel-bg);
    box-shadow: 0 2px 4px var(--shadow-color);
    margin-top: -6px;
    transition: transform 0.1s;
}
input[type="range"].rc-fader::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--panel-bg);
    box-shadow: 0 2px 4px var(--shadow-color);
    transition: transform 0.1s;
}
input[type="range"].rc-fader:active::-webkit-slider-thumb {
    transform: scale(1.15);
}
input[type="range"].rc-fader:active::-moz-range-thumb {
    transform: scale(1.15);
}
\;

c += newCSS;
fs.writeFileSync('style.css', c);
