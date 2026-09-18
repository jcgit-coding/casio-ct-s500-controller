document.addEventListener('DOMContentLoaded', () => {
    const harmKeySelect = document.getElementById('harm-key');
    const harmModeSelect = document.getElementById('harm-mode');
    const chordsContainer = document.getElementById('harm-chords-container');

    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // Funciones de utilidad para teoría musical
    function getNoteIndex(note) {
        return NOTES.indexOf(note);
    }

    function getNoteOffset(baseNote, semitones) {
        const idx = getNoteIndex(baseNote);
        const newIdx = (idx + semitones) % 12;
        return NOTES[newIdx];
    }

    function renderChords() {
        const key = harmKeySelect.value;
        const mode = harmModeSelect.value;
        
        // Determinar las distancias de semitonos para la escala
        const scaleIntervals = mode === 'mayor' 
            ? [0, 2, 4, 5, 7, 9, 11]  // Mayor (Jónica)
            : [0, 2, 3, 5, 7, 8, 10]; // Menor (Eólica)

        // Tipos de acordes diatónicos según el grado (1 a 7)
        let qualities = [];
        let degreeNames = [];
        
        if (mode === 'mayor') {
            qualities = ['Maj', 'm', 'm', 'Maj', 'Dom', 'm', 'dim'];
            degreeNames = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
            extensions = [
                ['Maj7', 'Maj9', 'add9', 'sus2', 'sus4'],   // I
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],        // ii
                ['m7', 'm11', 'sus4'],                      // iii
                ['Maj7', 'Maj9', '#11', 'sus2'],            // IV
                ['7', '9', '13', 'sus2', 'sus4'],           // V
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],        // vi
                ['m7b5 (semi-dim)']                         // vii°
            ];
        } else {
            // Escala menor natural
            qualities = ['m', 'dim', 'Maj', 'm', 'm', 'Maj', 'Dom'];
            degreeNames = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
            extensions = [
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],        // i
                ['m7b5 (semi-dim)'],                        // ii°
                ['Maj7', 'Maj9', 'add9', 'sus2', 'sus4'],   // III
                ['m7', 'm9', 'm11', 'sus2', 'sus4'],        // iv
                ['m7', 'm11', 'sus4'],                      // v
                ['Maj7', 'Maj9', '#11', 'sus2'],            // VI
                ['7', '9', '13', 'sus2', 'sus4']            // VII
            ];
        }

        chordsContainer.innerHTML = '';

        scaleIntervals.forEach((interval, idx) => {
            const rootNote = getNoteOffset(key, interval);
            const qual = qualities[idx];
            const deg = degreeNames[idx];
            const exts = extensions[idx];

            let chordName = rootNote;
            if (qual === 'm') chordName += 'm';
            if (qual === 'dim') chordName += 'dim';

            const card = document.createElement('div');
            card.style.background = 'var(--panel-bg)';
            card.style.borderRadius = '8px';
            card.style.padding = '15px';
            card.style.border = '1px solid var(--border)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '8px';

            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'baseline';
            header.style.borderBottom = '1px solid var(--border)';
            header.style.paddingBottom = '5px';

            const degSpan = document.createElement('span');
            degSpan.textContent = deg;
            degSpan.style.color = 'var(--accent)';
            degSpan.style.fontWeight = '800';
            degSpan.style.fontSize = '14px';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = chordName;
            nameSpan.style.fontSize = '24px';
            nameSpan.style.fontWeight = '800';

            header.appendChild(degSpan);
            header.appendChild(nameSpan);
            card.appendChild(header);

            const extTitle = document.createElement('div');
            extTitle.textContent = 'Extensiones sugeridas:';
            extTitle.style.fontSize = '12px';
            extTitle.style.color = 'var(--text-dim)';
            extTitle.style.marginTop = '4px';
            card.appendChild(extTitle);

            const tagsContainer = document.createElement('div');
            tagsContainer.style.display = 'flex';
            tagsContainer.style.flexWrap = 'wrap';
            tagsContainer.style.gap = '5px';

            exts.forEach(ext => {
                const tag = document.createElement('span');
                tag.textContent = ext;
                tag.style.background = 'var(--bg)';
                tag.style.padding = '3px 8px';
                tag.style.borderRadius = '12px';
                tag.style.fontSize = '12px';
                tag.style.fontWeight = '600';
                tag.style.color = 'var(--text)';
                tag.style.border = '1px solid var(--border)';
                tagsContainer.appendChild(tag);
            });

            card.appendChild(tagsContainer);
            chordsContainer.appendChild(card);
        });
    }

    harmKeySelect.addEventListener('change', renderChords);
    harmModeSelect.addEventListener('change', renderChords);

    // Initial render
    renderChords();
});
