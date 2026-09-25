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
        '#11':  [0, 4, 7, 11, 18],
        '7':    [0, 4, 7, 10],
        '9':    [0, 4, 7, 10, 14],
        '13':   [0, 4, 7, 10, 14, 21],
        'm7b5': [0, 3, 6, 10]
    };

    function getChordNotes(rootNote, ext) {
        const intervals = EXT_INTERVALS[ext];
        if (!intervals) return '';
        return intervals.map(iv => getNoteOffset(rootNote, iv)).join('-');
    }

    const MODES = {
        major: {
            intervals:   [0, 2, 4, 5, 7, 9, 11],
            qualities:   ['Maj', 'm', 'm', 'Maj', 'Dom', 'm', 'dim'],
            degrees:     ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            extensions: [
                ['Maj7', 'Maj9', 'add9', 'sus2', 'sus4'],    // I
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],          // ii
                ['m7', 'm11', 'sus4'],                        // iii
                ['Maj7', 'Maj9', '#11', 'sus2'],              // IV
                ['7', '9', '13', 'sus2', 'sus4'],             // V
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],          // vi
                ['m7b5']                                       // vii°
            ]
        },
        minor: {
            intervals:   [0, 2, 3, 5, 7, 8, 10],
            qualities:   ['m', 'dim', 'Maj', 'm', 'm', 'Maj', 'Maj'],
            degrees:     ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
            extensions: [
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],          // i
                ['m7b5'],                                      // ii°
                ['Maj7', 'Maj9', 'add9', 'sus2', 'sus4'],     // III
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],          // iv
                ['m7', 'm11', 'sus4'],                        // v
                ['Maj7', 'Maj9', '#11', 'sus2'],              // VI
                ['7', '9', '13', 'sus2', 'sus4']              // VII
            ]
        }
    };

    function renderChords() {
        const key = harmKeySelect.value;
        const modeData = MODES[harmModeSelect.value];

        chordsContainer.innerHTML = '';

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
                padding: 15px;
                border: 1px solid var(--border);
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                border-bottom: 1px solid var(--border);
                padding-bottom: 5px;
            `;

            const degSpan = document.createElement('span');
            degSpan.textContent = deg;
            degSpan.style.cssText = 'color: var(--accent); font-weight: 800; font-size: 14px;';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = chordName;
            nameSpan.style.cssText = 'font-size: 24px; font-weight: 800;';

            header.appendChild(degSpan);
            header.appendChild(nameSpan);
            card.appendChild(header);

            const extTitle = document.createElement('div');
            extTitle.textContent = 'Suggested extensions:';
            extTitle.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-top: 4px;';
            card.appendChild(extTitle);

            const tagsContainer = document.createElement('div');
            tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;';

            const displayDiv = document.createElement('div');
            displayDiv.style.cssText = 'margin-top: 5px; display: none; flex-direction: column; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px;';

            let activeTag = null;

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

                    let svg = `<svg width="100%" viewBox="0 0 224 60" style="max-width:224px; display:block;">`;
                    whiteKeys.forEach((note, i) => {
                        const isActive = activeNotes.has(note);
                        const isRoot = note === rootIdx || note === rootIdx + 12;
                        const fill = isActive ? (isRoot ? 'var(--accent)' : '#4caf50') : 'white';
                        svg += `<rect x="${i * 16}" y="0" width="16" height="60" fill="${fill}" stroke="#333" stroke-width="1" rx="2" />`;
                    });

                    blackKeys.forEach(note => {
                        const isActive = activeNotes.has(note);
                        const isRoot = note === rootIdx || note === rootIdx + 12;
                        const fill = isActive ? (isRoot ? 'var(--accent)' : '#4caf50') : '#222';
                        const wIdx = noteToWhiteIdx[note];
                        const x = wIdx * 16 - 5;
                        svg += `<rect x="${x}" y="0" width="10" height="36" fill="${fill}" stroke="#111" stroke-width="1" rx="1" />`;
                    });
                    svg += `</svg>`;

                    displayDiv.innerHTML = `
                        <div style="font-size:13px; font-weight:bold; margin-bottom:8px; color:var(--text);">${chordName} ${ext} <span style="font-weight:400; opacity:0.7;">(${getChordNotes(rootNote, ext)})</span></div>
                        ${svg}
                    `;
                    displayDiv.style.display = 'flex';
                });

                tagsContainer.appendChild(tag);
            });

            card.appendChild(tagsContainer);
            card.appendChild(displayDiv);
            chordsContainer.appendChild(card);
        });
    }

    harmKeySelect.addEventListener('change', renderChords);
    harmModeSelect.addEventListener('change', renderChords);
    renderChords();
});
