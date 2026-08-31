const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

const lightFaders = `
[data-theme="light"] input[type=range][orient=vertical]::-webkit-slider-runnable-track {
    background: #e5e7eb;
    border: 1px solid #d1d5db;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
}
[data-theme="light"] input[type=range][orient=vertical]::-webkit-slider-thumb {
    background: linear-gradient(to bottom, #ffffff, #e5e7eb);
    border: 1px solid #ccc;
    border-top: 1px solid #fff;
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    background-image: linear-gradient(transparent 15px, var(--accent) 15px, var(--accent) 18px, transparent 18px);
}
`;

if (!css.includes('[data-theme="light"] input[type=range][orient=vertical]::-webkit-slider-thumb')) {
    fs.writeFileSync('style.css', css + lightFaders, 'utf8');
}
