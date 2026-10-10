/**
 * CasioController Pro - Módulo de Repertorio
 * Maneja la lógica de extracción de canciones, transposición de acordes y calendario de eventos.
 */

const RepertorioApp = {
    db: { canciones: [], calendario: [] },
    currentSong: null,
    
    // Escala cromática para el motor matemático de transposición
    notes: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],

    init() {
        this.bindEvents();
        this.populateTransposeDropdown();
        console.log("Módulo Repertorio Iniciado.");
    },

    bindEvents() {
        document.getElementById('lib-btn-import').addEventListener('click', () => this.importFromText());
        document.getElementById('lib-transpose-select').addEventListener('change', (e) => this.applyTranspose(parseInt(e.target.value)));
        document.getElementById('lib-btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    },

    populateTransposeDropdown() {
        const select = document.getElementById('lib-transpose-select');
        select.innerHTML = '<option value="0">Tono Original</option>';
        for(let i=1; i<=11; i++) select.innerHTML += `<option value="${i}">+${i} Semitonos</option>`;
        for(let i=-1; i>=-11; i--) select.innerHTML += `<option value="${i}">${i} Semitonos</option>`;
    },

    importFromText() {
        const title = document.getElementById('lib-song-title-input').value.trim() || "Canción Personalizada";
        const artist = document.getElementById('lib-song-artist-input').value.trim() || "Artista Desconocido";
        const rawText = document.getElementById('lib-raw-text-input').value;
        
        if (!rawText.trim()) {
            return alert("Por favor pega la letra y acordes en el cuadro de texto.");
        }

        const titleEl = document.getElementById('lib-song-title');
        const artistEl = document.getElementById('lib-song-artist');
        const chordsEl = document.getElementById('lib-chords-view');

        // Parsear el texto crudo y detectar acordes para envolverlos
        let parsedHTML = this.parseRawTextToChords(rawText);

        this.currentSong = {
            title: title,
            artist: artist,
            originalContent: parsedHTML
        };

        titleEl.innerText = this.currentSong.title;
        artistEl.innerText = this.currentSong.artist;
        document.getElementById('lib-transpose-select').value = "0";
        this.renderChords(this.currentSong.originalContent);
    },

    parseRawTextToChords(text) {
        // Diccionario de conversión de notación latina a inglesa
        const latinToEnglish = {
            'DO': 'C', 'RE': 'D', 'MI': 'E', 'FA': 'F', 'SOL': 'G', 'LA': 'A', 'SI': 'B',
            'Do': 'C', 'Re': 'D', 'Mi': 'E', 'Fa': 'F', 'Sol': 'G', 'La': 'A', 'Si': 'B',
            'do': 'C', 're': 'D', 'mi': 'E', 'fa': 'F', 'sol': 'G', 'la': 'A', 'si': 'B'
        };

        let lines = text.split('\n');
        let htmlLines = lines.map(line => {
            // Regex completo que captura notación inglesa o latina
            const chordRegex = /(^|\s)([CDEFGAB]|DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si|do|re|mi|fa|sol|la|si)([#b]?)(m|maj|dim|aug|sus|add)?(\d*)(\/([CDEFGAB]|DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si|do|re|mi|fa|sol|la|si)[#b]?)?(?=\s|$)/g;
            
            let parsedLine = line.replace(chordRegex, (match, prefix, root, acc, type, num, bass) => {
                // Letras como "A", "Y", "LA" podrían ser palabras sueltas de la letra de la canción.
                // Es arriesgado, pero normalmente los acordes están en líneas con muchos espacios.
                let engRoot = latinToEnglish[root] || root.toUpperCase();
                let engBass = "";
                if (bass) {
                    let rawBassNote = bass.substring(1); // remover slash
                    let bassAcc = rawBassNote.match(/[#b]$/) ? rawBassNote.slice(-1) : "";
                    let bassBase = rawBassNote.replace(/[#b]$/, "");
                    let engBassBase = latinToEnglish[bassBase] || bassBase.toUpperCase();
                    engBass = "/" + engBassBase + bassAcc;
                }
                
                let chord = engRoot + (acc||"") + (type||"") + (num||"") + engBass;
                return prefix + `<span class='chord' style='color:var(--accent); font-weight:bold;'>${chord}</span>`;
            });

            // Conservar espacios usando &nbsp; para que no colapse
            parsedLine = parsedLine.replace(/ {2}/g, '&nbsp;&nbsp;');
            return parsedLine;
        });

        return htmlLines.join('<br>');
    },

    applyTranspose(steps) {
        if(!this.currentSong) return;
        
        if (steps === 0) {
            this.renderChords(this.currentSong.originalContent);
            return;
        }

        let newContent = this.currentSong.originalContent.replace(/(<span[^>]*class=['"]chord['"][^>]*>)(.*?)(<\/span>)/gi, (match, openTag, chordText, closeTag) => {
            let transposedChord = chordText.replace(/[CDEFGAB]#?/g, note => {
                let idx = this.notes.indexOf(note);
                if (idx === -1) return note; 
                let newIdx = (idx + steps) % 12;
                if (newIdx < 0) newIdx += 12;
                return this.notes[newIdx];
            });
            return openTag + transposedChord + closeTag;
        });

        this.renderChords(newContent);
    },

    renderChords(htmlContent) {
        document.getElementById('lib-chords-view').innerHTML = htmlContent;
    },

    toggleFullscreen() {
        const viewer = document.getElementById('lib-chords-view');
        if (!document.fullscreenElement) {
            viewer.requestFullscreen().catch(err => {
                alert(`Error al intentar modo pantalla completa: ${err.message}`);
            });
            viewer.style.height = "100vh";
            viewer.style.padding = "50px";
        } else {
            document.exitFullscreen();
            viewer.style.height = "450px";
            viewer.style.padding = "30px";
        }
    }
};
