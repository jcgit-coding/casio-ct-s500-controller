const fs = require('fs');

// --- FIX HTML ---
let html = fs.readFileSync('index.html', 'utf8');
// Remove inline color: #ccc and color: #888
html = html.replace(/color:\s*#[a-f0-9]{3,6};?/gi, '');
html = html.replace(/background:\s*#222;?/g, 'background: var(--card-bg); border: 1px solid var(--panel-border);');
fs.writeFileSync('index.html', html, 'utf8');

// --- FIX CSS ---
let css = fs.readFileSync('style.css', 'utf8');

// 1. ADD MISSING VARIABLES TO :root (Dark Mode)
const rootUpdates = `
    --bg: #18181d;
    --panel-bg: #23232a;
    --panel-border: #32323e;
    --accent: #00d2ff;
    --accent-glow: rgba(0, 210, 255, 0.25);
    --accent-dim: rgba(0, 210, 255, 0.15);
    --blue: #4facfe;
    --blue-glow: rgba(79, 172, 254, 0.3);
    --danger: #ff4d4d;
    --danger-glow: rgba(255, 77, 77, 0.3);
    --text: #e4e4eb;
    --text-muted: #888899; /* Changed from muted to text-muted to avoid conflicts if any */
    --fader-track: #0e0e12;
    --card-bg: #282830;
    --card-active: #2f2f38;
    --card-border-active: #00d2ff;
    
    /* New Variables for semantic colors instead of hardcoded RGBA */
    --fader-label: #aab;
    --fader-val-bg: rgba(0,0,0,0.6);
    --fader-val-text: #fff;
    --border-light: rgba(255,255,255,0.07);
    --border-strong: rgba(255,255,255,0.12);
    --shadow-color: rgba(0,0,0,0.2);
    --cat-color: rgba(0,210,255,0.55);
`;

css = css.replace(/--bg:\s*#18181d;[\s\S]*?--card-border-active:\s*#00d2ff;/, rootUpdates.trim());

// 2. ADD MISSING VARIABLES TO [data-theme="light"]
const lightUpdates = `
    --bg: #e9ecef;
    --panel-bg: #f8f9fa;
    --panel-border: #ced4da;
    --accent: #0077cc;
    --accent-glow: rgba(0, 119, 204, 0.2);
    --accent-dim: rgba(0, 119, 204, 0.1);
    --blue: #0055ff;
    --blue-glow: rgba(0, 85, 255, 0.2);
    --danger: #e11d48;
    --danger-glow: rgba(225, 29, 72, 0.2);
    --text: #212529;
    --text-muted: #6c757d;
    --fader-track: #dee2e6;
    --card-bg: #ffffff;
    --card-active: #e3f2fd;
    --card-border-active: #0077cc;
    
    /* Light Mode Overrides for hardcoded elements */
    --fader-label: #495057;
    --fader-val-bg: #e9ecef;
    --fader-val-text: #212529;
    --border-light: #dee2e6;
    --border-strong: #ced4da;
    --shadow-color: rgba(0,0,0,0.08);
    --cat-color: #0077cc;
`;

css = css.replace(/--bg:\s*#e9ecef;[\s\S]*?--card-border-active:\s*#0088cc;/, lightUpdates.trim());

// 3. REPLACE HARDCODED COLORS IN CLASSES WITH VARIABLES
css = css.replace(/color:\s*#aab;/g, 'color: var(--fader-label);');
css = css.replace(/color:\s*rgba\(0,255,204,0\.55\);/g, 'color: var(--cat-color);');
css = css.replace(/background:\s*rgba\(0,0,0,0\.6\);[\s\S]*?color:\s*var\(--text\);/g, 'background: var(--fader-val-bg); color: var(--fader-val-text);');
css = css.replace(/background:\s*rgba\(0,0,0,0\.6\);/g, 'background: var(--fader-val-bg);');
css = css.replace(/border-right:\s*1px solid rgba\(255,255,255,0\.07\);/g, 'border-right: 1px solid var(--border-light);');
css = css.replace(/border-bottom:\s*1px solid rgba\(0,255,204,0\.12\);/g, 'border-bottom: 1px solid var(--border-strong);');
css = css.replace(/background:\s*rgba\(255,255,255,0\.08\);/g, 'background: var(--border-strong);');

// Shadows
css = css.replace(/box-shadow:\s*0 4px 15px rgba\(0,0,0,0\.2\);/g, 'box-shadow: 0 4px 15px var(--shadow-color);');
css = css.replace(/box-shadow:\s*0 4px 15px rgba\(0,0,0,0\.15\);/g, 'box-shadow: 0 4px 15px var(--shadow-color);');
css = css.replace(/box-shadow:\s*inset 0 0 10px rgba\(0,0,0,0\.2\);/g, 'box-shadow: inset 0 0 10px var(--shadow-color);');

// Make track card borders and backgrounds obey light mode instead of hardcoded Light Overrides
css = css.replace(/\[data-theme="light"\] \.track-card\.active-track \{[^\}]+\}/g, '');

// Fader light overrides
css = css.replace(/\[data-theme="light"\] \.fader-section \{[^\}]+\}/g, '');
css = css.replace(/\[data-theme="light"\] \.fader-thumb \{[^\}]+\}/g, '');
css = css.replace(/\[data-theme="light"\] \.fader-fill \{[^\}]+\}/g, '');

// Text muted
css = css.replace(/var\(--muted\)/g, 'var(--text-muted)');

// Save css
fs.writeFileSync('style.css', css, 'utf8');

// Bump version in index.html
html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/style\.css\?v=\d+/, 'style.css?v=37');
html = html.replace(/app\.js\?v=\d+/, 'app.js?v=37');
fs.writeFileSync('index.html', html, 'utf8');

console.log("Fixed Light Mode Completely");
