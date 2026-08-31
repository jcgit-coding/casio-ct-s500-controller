const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// 1. Better Dark Theme (Pro Audio Slate/Teal)
css = css.replace(/--bg:\s*#0b0b10;/, '--bg: #18181d;');
css = css.replace(/--panel-bg:\s*rgba\(255,255,255,0\.03\);/, '--panel-bg: #23232a;');
css = css.replace(/--panel-border:\s*rgba\(255,255,255,0\.07\);/, '--panel-border: #32323e;');
css = css.replace(/--accent:\s*#00ffcc;/, '--accent: #00d2ff;');
css = css.replace(/--accent-glow:\s*rgba\(0,255,204,0\.25\);/, '--accent-glow: rgba(0, 210, 255, 0.25);');
css = css.replace(/--accent-dim:\s*rgba\(0,255,204,0\.15\);/, '--accent-dim: rgba(0, 210, 255, 0.15);');
css = css.replace(/--text:\s*#eeeef5;/, '--text: #e4e4eb;');
css = css.replace(/--muted:\s*#666677;/, '--muted: #888899;');
css = css.replace(/--fader-track:\s*#151520;/, '--fader-track: #0e0e12;');
css = css.replace(/--card-bg:\s*rgba\(255,255,255,0\.04\);/, '--card-bg: #282830;');
css = css.replace(/--card-active:\s*rgba\(0,255,204,0\.06\);/, '--card-active: #2f2f38;');
css = css.replace(/--card-border-active:\s*rgba\(0,255,204,0\.35\);/, '--card-border-active: #00d2ff;');

// Add better typography and global font tweaks
css = css.replace(/font-family: 'Inter', sans-serif;/g, "font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;");

// Enhance borders and shadows on track cards and panels
css = css.replace(/\.track-card \{([^}]*)\}/, `.track-card {$1 box-shadow: 0 4px 15px rgba(0,0,0,0.2); }`);
css = css.replace(/\.panel \{([^}]*)\}/, `.panel {$1 box-shadow: 0 4px 15px rgba(0,0,0,0.15); }`);

// 2. Pro EQ Faders Style
const oldFaderStyles = `input\\[type=range\\]\\[orient=vertical\\] \\{[\\s\\S]*?input\\[type=range\\]\\[orient=vertical\\]::-webkit-slider-thumb \\{[\\s\\S]*?\\}`;
const newFaderStyles = `input[type=range][orient=vertical] {
    writing-mode: bt-lr;
    -webkit-appearance: slider-vertical;
    appearance: slider-vertical;
    width: 32px;
    height: 180px;
    background: transparent;
    outline: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    position: relative;
}

input[type=range][orient=vertical]::-webkit-slider-runnable-track {
    width: 6px;
    background: var(--fader-track);
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.5);
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.8);
    margin: 0 13px;
}

input[type=range][orient=vertical]::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 34px;
    width: 32px;
    background: linear-gradient(to bottom, #444, #2a2a30);
    border: 1px solid #111;
    border-top: 1px solid #555;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.6), inset 0 0 4px rgba(255,255,255,0.1);
    position: relative;
    left: -13px;
    /* Create the horizontal line on the fader thumb */
    background-image: linear-gradient(transparent 15px, var(--accent) 15px, var(--accent) 18px, transparent 18px);
}`;

css = css.replace(/input\[type=range\]\[orient=vertical\] \{[\s\S]*?input\[type=range\]\[orient=vertical\]::-webkit-slider-thumb \{[\s\S]*?\}/, newFaderStyles);

// Enhance EQ Layout
css = css.replace(/\.fader-section \{([^}]*)\}/, `.fader-section {$1 background: var(--panel-bg); border-radius: 8px; padding: 12px 18px; margin-right: 8px; box-shadow: inset 0 0 10px rgba(0,0,0,0.2); border: 1px solid var(--panel-border); }`);
css = css.replace(/\.eq-faders \{([^}]*)\}/, `.eq-faders {$1 padding: 15px 5px; gap: 4px; }`);

// 3. Improve Light Mode UI (Make it look like a sleek modern daw, e.g. Studio One light theme)
css = css.replace(/--bg:\s*#f3f4f6;/g, '--bg: #e9ecef;');
css = css.replace(/--panel-bg:\s*#ffffff;/g, '--panel-bg: #f8f9fa;');
css = css.replace(/--panel-border:\s*#d1d5db;/g, '--panel-border: #ced4da;');
css = css.replace(/--accent:\s*#059669;/g, '--accent: #0088cc;');
css = css.replace(/--card-bg:\s*#ffffff;/g, '--card-bg: #f8f9fa;');
css = css.replace(/--card-active:\s*#ecfdf5;/g, '--card-active: #e3f2fd;');
css = css.replace(/--card-border-active:\s*#34d399;/g, '--card-border-active: #0088cc;');

// Soften buttons
css = css.replace(/\.btn \{([^}]*)\}/, `.btn {$1 box-shadow: 0 2px 4px rgba(0,0,0,0.1); font-weight: 600; letter-spacing: 0.3px; }`);
css = css.replace(/\.step-btn \{([^}]*)\}/, `.step-btn {$1 box-shadow: 0 1px 3px rgba(0,0,0,0.15); border: 1px solid var(--panel-border); background: linear-gradient(to bottom, var(--panel-bg), var(--bg)); }`);

// 4. Any remaining mojibake removal
css = css.replace(/===/g, '');

fs.writeFileSync('style.css', css, 'utf8');

// Also update index.html to bump version to 33
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=33');
html = html.replace(/style\.css\?v=\d+/, 'style.css?v=33');
fs.writeFileSync('index.html', html, 'utf8');
console.log("Improved UI");
