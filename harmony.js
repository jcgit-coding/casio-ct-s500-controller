document.addEventListener('DOMContentLoaded', () => {
    const harmKeySelect = document.getElementById('harm-key');
    const harmModeSelect = document.getElementById('harm-mode');
    const chordsContainer = document.getElementById('harm-chords-container');

    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    function getNoteIndex(note) {
        return NOTES.indexOf(note);
    }

    function getNoteOffset(baseNote, semitones) {
        const idx = getNoteIndex(baseNote);
        return NOTES[(idx + semitones) % 12];
    }

    // Diatonic chord data per mode
        const EXT_INTERVALS = {
        'Maj7': [0, 4, 7, 11],
        'Maj9': [0, 4, 7, 11, 14],
        'add9': [0, 4, 7, 14],
        'sus2': [0, 2, 7],
        'sus4': [0, 5, 7],
        'm7':   [0, 3, 7, 10],
        'm9':   [0, 3, 7, 10, 14],
        'm11':  [0, 3, 7, 10, 14, 17],
        'm11(b9)': [0, 3, 7, 10, 13, 17],
        '#11':  [0, 4, 7, 11, 18],
        'Maj13(#11)': [0, 4, 7, 11, 14, 18, 21],
        '7':    [0, 4, 7, 10],
        '9':    [0, 4, 7, 10, 14],
        '13':   [0, 4, 7, 10, 14, 21],
        'm7b5': [0, 3, 6, 10],
        'm7b5(b9)': [0, 3, 6, 10, 13]
    };

    function getChordNotes(rootNote, ext) {
        const intervals = EXT_INTERVALS[ext];
        if (!intervals) return '';
        return intervals.map(iv => getNoteOffset(rootNote, iv)).join('-');
    }


    function formatChordName(root, qual, ext) {
        if (!ext) {
            if (qual === 'm') return root + 'm';
            if (qual === 'dim') return root + 'dim';
            return root; 
        }
        if (ext === 'sus2' || ext === 'sus4') return root + ' ' + ext; 
        if (ext === '#11') return root + 'Maj7#11'; 
        if (ext.startsWith('m') || ext.startsWith('Maj') || ext === '7' || ext === '9' || ext === '13') return root + ext; 
        return root + ' ' + ext;
    }

    const DEG_EXTS = [
        ['Maj7', 'Maj9', 'add9', 'sus2', 'sus4'],                  // Ionian 1
        ['m7', 'm9', 'm11', 'sus2', 'sus4'],                        // Ionian 2
        ['m7', 'm11(b9)', 'sus4'],                                  // Ionian 3
        ['Maj7', 'Maj9', 'Maj13(#11)', '#11', 'sus2'],              // Ionian 4
        ['7', '9', '13', 'sus2', 'sus4'],                           // Ionian 5
        ['m7', 'm9', 'm11', 'sus2', 'sus4'],                        // Ionian 6
        ['m7b5', 'm7b5(b9)']                                        // Ionian 7
    ];

    const MODES = {
        ionian: {
            intervals:   [0, 2, 4, 5, 7, 9, 11],
            qualities:   ['Maj', 'm', 'm', 'Maj', 'Dom', 'm', 'dim'],
            degrees:     ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            extensions:  [DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6]]
        },
        dorian: {
            intervals:   [0, 2, 3, 5, 7, 9, 10],
            qualities:   ['m', 'm', 'Maj', 'Dom', 'm', 'dim', 'Maj'],
            degrees:     ['i', 'ii', 'bIII', 'IV', 'v', 'vi°', 'bVII'],
            extensions:  [DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0]]
        },
        phrygian: {
            intervals:   [0, 1, 3, 5, 7, 8, 10],
            qualities:   ['m', 'Maj', 'Dom', 'm', 'dim', 'Maj', 'm'],
            degrees:     ['i', 'bII', 'bIII', 'iv', 'v°', 'bVI', 'bvii'],
            extensions:  [DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1]]
        },
        lydian: {
            intervals:   [0, 2, 4, 6, 7, 9, 11],
            qualities:   ['Maj', 'Dom', 'm', 'dim', 'Maj', 'm', 'm'],
            degrees:     ['I', 'II', 'iii', '#iv°', 'V', 'vi', 'vii'],
            extensions:  [DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2]]
        },
        mixolydian: {
            intervals:   [0, 2, 4, 5, 7, 9, 10],
            qualities:   ['Dom', 'm', 'dim', 'Maj', 'm', 'm', 'Maj'],
            degrees:     ['I', 'ii', 'iii°', 'IV', 'v', 'vi', 'bVII'],
            extensions:  [DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3]]
        },
        aeolian: {
            intervals:   [0, 2, 3, 5, 7, 8, 10],
            qualities:   ['m', 'dim', 'Maj', 'm', 'm', 'Maj', 'Dom'],
            degrees:     ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'],
            extensions:  [DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4]]
        },
        locrian: {
            intervals:   [0, 1, 3, 5, 6, 8, 10],
            qualities:   ['dim', 'Maj', 'm', 'm', 'Maj', 'Dom', 'm'],
            degrees:     ['i°', 'bII', 'biii', 'iv', 'bV', 'bVI', 'bvii'],
            extensions:  [DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5]]
        }
    };

    function renderMasterKeyboard(rootNote, intervals, title, notesStr) {
        const svgContainer = document.getElementById('harm-keyboard-svg');
        const titleContainer = document.getElementById('harm-keyboard-title');
        
        if (!svgContainer) return;

        if (title && notesStr) {
            titleContainer.innerHTML = `<span style="color:var(--text);">${title}</span> <span style="font-weight:400; opacity:0.7;">(${notesStr})</span>`;
        } else {
            titleContainer.innerHTML = title || 'Select a chord or extension to view fingering';
        }

        let rootIdx = -1;
        const activeNotes = new Set();
        
        if (rootNote && intervals && intervals.length > 0) {
            rootIdx = getNoteIndex(rootNote);
            intervals.forEach(iv => {
                let note = rootIdx + iv;
                while (note >= 24) note -= 12;
                activeNotes.add(note);
            });
        }

        const whiteKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
        const blackKeys = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];
        const noteToWhiteIdx = { 1:1, 3:2, 6:4, 8:5, 10:6, 13:8, 15:9, 18:11, 20:12, 22:13 };

        let svg = `<svg width="100%" viewBox="0 0 336 100" style="max-width:550px; display:block; margin: 0 auto;">`;
        
        whiteKeys.forEach((note, i) => {
            const isActive = activeNotes.has(note);
            const fill = isActive ? '#4a90e2' : 'white';
            svg += `<rect x="${i * 24}" y="0" width="24" height="80" fill="${fill}" stroke="#333" stroke-width="1.5" rx="2" />`;
        });

        blackKeys.forEach(note => {
            const isActive = activeNotes.has(note);
            const fill = isActive ? '#4a90e2' : '#222';
            const wIdx = noteToWhiteIdx[note];
            const x = wIdx * 24 - 8;
            svg += `<rect x="${x}" y="0" width="16" height="50" fill="${fill}" stroke="#111" stroke-width="1.5" rx="1" />`;
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
                svg += `<text x="${cx}" y="95" font-family="sans-serif" font-size="12" font-weight="bold" fill="#e74c3c" text-anchor="middle">${name}</text>`;
            }
        });

        svg += `</svg>`;
        svgContainer.innerHTML = svg;
    }

    let globalActiveTag = null;

    function renderChords() {
        const key = harmKeySelect.value;
        const modeData = MODES[harmModeSelect.value];

        chordsContainer.innerHTML = '';
        renderMasterKeyboard(null, [], 'Select a chord or extension to view fingering', '');
        globalActiveTag = null;

        modeData.intervals.forEach((interval, idx) => {
            const rootNote = getNoteOffset(key, interval);
            const qual     = modeData.qualities[idx];
            const deg      = modeData.degrees[idx];
            const exts     = modeData.extensions[idx];

            let chordName = rootNote;
            if (qual === 'm')   chordName += 'm';
            if (qual === 'dim') chordName += 'dim';

            const card = document.createElement('div');
            card.style.cssText = `
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
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                border-bottom: 1px solid var(--border);
                padding-bottom: 5px;
                cursor: pointer;
            `;
            
            // Allow clicking the header to show the base chord!
            header.addEventListener('click', () => {
                if (globalActiveTag) {
                    globalActiveTag.style.background = 'var(--bg)';
                    globalActiveTag.style.color = 'var(--text)';
                    globalActiveTag = null;
                }
                let baseIntervals = [];
                if (qual === 'Maj' || qual === 'Dom') baseIntervals = [0, 4, 7];
                else if (qual === 'm') baseIntervals = [0, 3, 7];
                else if (qual === 'dim') baseIntervals = [0, 3, 6];
                
                const notesStr = baseIntervals.map(iv => getNoteOffset(rootNote, iv)).join('-');
                renderMasterKeyboard(rootNote, baseIntervals, chordName + ' (Base Triad)', notesStr);
            });

            const degSpan = document.createElement('span');
            degSpan.textContent = deg;
            degSpan.style.cssText = 'color: var(--accent); font-weight: 800; font-size: 14px; pointer-events:none;';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = chordName;
            nameSpan.style.cssText = 'font-size: 24px; font-weight: 800; pointer-events:none;';

            header.appendChild(degSpan);
            header.appendChild(nameSpan);
            card.appendChild(header);

            const extTitle = document.createElement('div');
            extTitle.textContent = 'Suggested extensions:';
            extTitle.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-top: 4px;';
            card.appendChild(extTitle);

            const tagsContainer = document.createElement('div');
            tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;';

            exts.forEach(ext => {
                const tag = document.createElement('span');
                tag.textContent = ext;
                tag.style.cssText = `
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
                `;

                tag.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (globalActiveTag === tag) {
                        tag.style.background = 'var(--bg)';
                        tag.style.color = 'var(--text)';
                        globalActiveTag = null;
                        renderMasterKeyboard(null, [], 'Select a chord or extension to view fingering', '');
                        return;
                    }

                    if (globalActiveTag) {
                        globalActiveTag.style.background = 'var(--bg)';
                        globalActiveTag.style.color = 'var(--text)';
                    }

                    tag.style.background = 'var(--accent)';
                    tag.style.color = '#000';
                    globalActiveTag = tag;

                    const intervals = EXT_INTERVALS[ext] || [];
                    const notesStr = getChordNotes(rootNote, ext);
                    const formattedTitle = formatChordName(rootNote, qual, ext);
                    renderMasterKeyboard(rootNote, intervals, formattedTitle, notesStr);
                });

                tagsContainer.appendChild(tag);
            });

            card.appendChild(tagsContainer);
            chordsContainer.appendChild(card);
        });
    }

    harmKeySelect.addEventListener('change', renderChords);
    harmModeSelect.addEventListener('change', renderChords);
    renderChords();
});
