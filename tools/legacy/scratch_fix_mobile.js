const fs = require('fs');

// 1. Update style.css
let css = fs.readFileSync('style.css', 'utf8');
const oldCss = `.harmony-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
@media (max-width: 1100px) { .harmony-grid { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); } }`;

const newCss = `.harmony-grid {
    display: flex;
    overflow-x: auto;
    gap: 10px;
    padding-bottom: 15px; /* For scrollbar */
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
}
/* Hide scrollbar for a cleaner look on mobile if desired, but padding-bottom leaves room for it on desktop */
.harmony-grid::-webkit-scrollbar {
    height: 8px;
}
.harmony-grid::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
}`;

if (css.includes('.harmony-grid { display: grid;')) {
    css = css.replace(oldCss, newCss);
    fs.writeFileSync('style.css', css);
    console.log('Fixed style.css');
}

// 2. Update harmony.js
let harm = fs.readFileSync('harmony.js', 'utf8');
const oldCardStyle = `            const card = document.createElement('div');
            card.style.cssText = \`
                background: var(--panel-bg);
                border-radius: 8px;
                padding: 10px;
                border: 1px solid var(--border);
                display: flex;
                flex-direction: column;
                gap: 8px;
            \`;`;

const newCardStyle = `            const card = document.createElement('div');
            card.style.cssText = \`
                background: var(--panel-bg);
                border-radius: 8px;
                padding: 10px;
                border: 1px solid var(--border);
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex: 0 0 auto;
                min-width: 150px;
                scroll-snap-align: start;
            \`;`;

harm = harm.replace(oldCardStyle, newCardStyle);
fs.writeFileSync('harmony.js', harm);
console.log('Fixed harmony.js');
