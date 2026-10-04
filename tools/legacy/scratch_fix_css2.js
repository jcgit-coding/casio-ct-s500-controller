const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

css = css.replace(/\\n\.harmony-grid/g, '.harmony-grid');

// Let's also completely clean up the end of the file.
const idx = css.lastIndexOf('.harmony-grid');
if (idx !== -1) {
    const fixedCss = css.substring(0, idx) + `.harmony-grid {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
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
}
`;
    fs.writeFileSync('style.css', fixedCss);
    console.log('Fixed CSS syntax error');
}
