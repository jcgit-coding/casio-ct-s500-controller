const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

const newCss = `.harmony-grid {
    display: flex !important;
    flex-direction: row !important;
    overflow-x: auto !important;
    gap: 10px;
    padding-bottom: 15px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    width: 100%;
}
.harmony-grid > div {
    flex: 0 0 auto !important;
    width: 160px !important;
    min-width: 160px !important;
    scroll-snap-align: start;
}
.harmony-grid::-webkit-scrollbar {
    height: 8px;
}
.harmony-grid::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
}`;

css = css.replace(/\.harmony-grid \{[\s\S]*?\}\s*\}\s*/, newCss + '\n');
fs.writeFileSync('style.css', css);
console.log('Fixed style.css via regex');
