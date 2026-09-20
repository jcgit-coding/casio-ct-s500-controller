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
    const MODES = {
        mayor: {
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
        menor: {
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
            tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px;';

            exts.forEach(ext => {
                const tag = document.createElement('span');
                tag.textContent = ext;
                tag.style.cssText = `
                    background: var(--bg);
                    padding: 3px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text);
                    border: 1px solid var(--border);
                `;
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
