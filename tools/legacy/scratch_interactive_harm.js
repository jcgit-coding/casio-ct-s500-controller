const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

const replacement = `            const tagsContainer = document.createElement('div');
            tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;';

            const displayDiv = document.createElement('div');
            displayDiv.style.cssText = 'margin-top: 5px; display: none; flex-direction: column; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px;';

            let activeTag = null;

            exts.forEach(ext => {
                const tag = document.createElement('span');
                tag.textContent = ext;
                tag.style.cssText = \`
                    background: var(--bg);
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text);
                    border: 1px solid var(--border);
                    cursor: pointer;
                    transition: all 0.2s;
                    user-select: none;
                \`;

                tag.addEventListener('click', () => {
                    if (activeTag === tag) {
                        // Toggle off
                        tag.style.background = 'var(--bg)';
                        tag.style.color = 'var(--text)';
                        displayDiv.style.display = 'none';
                        activeTag = null;
                        return;
                    }

                    if (activeTag) {
                        activeTag.style.background = 'var(--bg)';
                        activeTag.style.color = 'var(--text)';
                    }

                    tag.style.background = 'var(--accent)';
                    tag.style.color = '#000';
                    activeTag = tag;

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

                    let svg = \`<svg width="100%" viewBox="0 0 224 60" style="max-width:224px; display:block;">\`;
                    whiteKeys.forEach((note, i) => {
                        const isActive = activeNotes.has(note);
                        const isRoot = note === rootIdx || note === rootIdx + 12;
                        const fill = isActive ? (isRoot ? '#ff3366' : '#4caf50') : 'white';
                        svg += \`<rect x="\${i * 16}" y="0" width="16" height="60" fill="\${fill}" stroke="#333" stroke-width="1" rx="2" />\`;
                    });

                    blackKeys.forEach(note => {
                        const isActive = activeNotes.has(note);
                        const isRoot = note === rootIdx || note === rootIdx + 12;
                        const fill = isActive ? (isRoot ? '#ff3366' : '#4caf50') : '#222';
                        const wIdx = noteToWhiteIdx[note];
                        const x = wIdx * 16 - 5;
                        svg += \`<rect x="\${x}" y="0" width="10" height="36" fill="\${fill}" stroke="#111" stroke-width="1" rx="1" />\`;
                    });
                    svg += \`</svg>\`;

                    displayDiv.innerHTML = \`
                        <div style="font-size:13px; font-weight:bold; margin-bottom:8px; color:var(--text);">\${chordName} \${ext} <span style="font-weight:400; opacity:0.7;">(\${getChordNotes(rootNote, ext)})</span></div>
                        \${svg}
                    \`;
                    displayDiv.style.display = 'flex';
                });

                tagsContainer.appendChild(tag);
            });

            card.appendChild(tagsContainer);
            card.appendChild(displayDiv);
            chordsContainer.appendChild(card);`;

const regex = /            const tagsContainer = document\.createElement\('div'\);[\s\S]*?chordsContainer\.appendChild\(card\);/;

harm = harm.replace(regex, replacement);
fs.writeFileSync('harmony.js', harm);
console.log('Fixed interactive harmony.js');
