const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');

// Replace .rack-channel
const targetCssRegex = /\.rack-channel \{[\s\S]*?box-shadow: inset 0 2px 10px rgba\(0,0,0,0\.1\);\n\}/;
const replacementCss = `.rack-channel {
    background: linear-gradient(to bottom, #23272f 0%, #17191e 100%);
    border: 1px solid #333;
    border-top: 1px solid #444;
    border-left-width: 5px; /* Color accent */
    border-radius: 8px;
    padding: 12px 18px;
    display: flex;
    align-items: center;
    gap: 18px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
    position: relative;
    overflow: hidden;
}`;

if (targetCssRegex.test(css)) {
    css = css.replace(targetCssRegex, replacementCss);
    fs.writeFileSync('style.css', css);
    console.log('Fixed CSS rack-channel');
} else {
    console.log('Failed CSS regex');
}
