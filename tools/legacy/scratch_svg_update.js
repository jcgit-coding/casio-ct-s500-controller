const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

const newSvgLogic = `
                    // Generate keyboard SVG
                    const rootIdx = getNoteIndex(rootNote);
                    const intervals = EXT_INTERVALS[ext] || [];
                    const activeNotes = new Set();
                    intervals.forEach(iv => {
                        let note = rootIdx + iv;
                        while (note >= 24) note -= 12;
                        activeNotes.add(note);
                    });

                    const whiteKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
                    const blackKeys = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];
                    const noteToWhiteIdx = { 1:1, 3:2, 6:4, 8:5, 10:6, 13:8, 15:9, 18:11, 20:12, 22:13 };

                    let svg = \`<svg width="100%" viewBox="0 0 336 100" style="max-width:380px; display:block; margin: 5px auto;">\`;
                    
                    whiteKeys.forEach((note, i) => {
                        const isActive = activeNotes.has(note);
                        const fill = isActive ? '#4a90e2' : 'white';
                        svg += \`<rect x="\${i * 24}" y="0" width="24" height="80" fill="\${fill}" stroke="#333" stroke-width="1.5" rx="2" />\`;
                    });

                    blackKeys.forEach(note => {
                        const isActive = activeNotes.has(note);
                        const fill = isActive ? '#4a90e2' : '#222';
                        const wIdx = noteToWhiteIdx[note];
                        const x = wIdx * 24 - 8;
                        svg += \`<rect x="\${x}" y="0" width="16" height="50" fill="\${fill}" stroke="#111" stroke-width="1.5" rx="1" />\`;
                    });

                    const noteNamesArr = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const allKeys = [...whiteKeys, ...blackKeys];
                    allKeys.forEach(note => {
                        if (activeNotes.has(note)) {
                            let cx;
                            if (whiteKeys.includes(note)) {
                                cx = whiteKeys.indexOf(note) * 24 + 12;
                            } else {
                                cx = noteToWhiteIdx[note] * 24;
                            }
                            const name = noteNamesArr[note % 12];
                            svg += \`<text x="\${cx}" y="95" font-family="sans-serif" font-size="12" font-weight="bold" fill="#e74c3c" text-anchor="middle">\${name}</text>\`;
                        }
                    });

                    svg += \`</svg>\`;

                    displayDiv.innerHTML = \`
                        <div style="font-size:14px; font-weight:bold; margin-bottom:10px; color:var(--text);">\${chordName} \${ext} <span style="font-weight:400; opacity:0.7;">(\${getChordNotes(rootNote, ext)})</span></div>
                        \${svg}
                    \`;
`;

const replaceTarget = /                    \/\/ Generate keyboard SVG[\s\S]*?                    `;/m;

harm = harm.replace(replaceTarget, newSvgLogic.trim());

fs.writeFileSync('harmony.js', harm);
console.log('Fixed SVG');
