const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');

const regex = /\.rack-channel \{[\s\S]*?box-shadow: inset 0 2px 10px rgba\(0,0,0,0\.1\);\r?\n\}/;
const replacement = `.rack-channel {
    background: linear-gradient(180deg, #242933 0%, #17191e 100%);
    border: 1px solid #3b4252;
    border-top: 1px solid #4c566a;
    border-left-width: 5px; /* Color accent */
    border-radius: 8px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 20px;
    box-shadow: 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
    position: relative;
}`;

if (regex.test(css)) {
    css = css.replace(regex, replacement);
    fs.writeFileSync('style.css', css);
    console.log('Fixed CSS rack-channel via simple regex');
} else {
    console.log('Regex still failed');
}
