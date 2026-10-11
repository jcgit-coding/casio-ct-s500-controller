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
        this.initSubTabs();
        this.populateTransposeDropdown();
        console.log("Library Module Initialized.");
    },

    initSubTabs() {
        const btnSongs = document.getElementById('lib-tab-btn-songs');
        const btnEvents = document.getElementById('lib-tab-btn-events');
        const panelSongs = document.getElementById('lib-subpanel-songs');
        const panelEvents = document.getElementById('lib-subpanel-events');

        if (btnSongs && btnEvents) {
            btnSongs.addEventListener('click', () => {
                btnSongs.classList.add('active-tab');
                btnEvents.classList.remove('active-tab');
                if (panelSongs) panelSongs.style.display = 'flex';
                if (panelEvents) panelEvents.style.display = 'none';
            });

            btnEvents.addEventListener('click', () => {
                btnEvents.classList.add('active-tab');
                btnSongs.classList.remove('active-tab');
                if (panelSongs) panelSongs.style.display = 'none';
                if (panelEvents) panelEvents.style.display = 'flex';
            });
        }
    },

    bindEvents() {
        document.getElementById('lib-btn-import')?.addEventListener('click', () => this.importFromText());
        document.getElementById('lib-transpose-select').addEventListener('change', (e) => this.applyTranspose(parseInt(e.target.value)));
        document.getElementById('lib-btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    },

    populateTransposeDropdown() {
        const select = document.getElementById('lib-transpose-select');
        select.innerHTML = '<option value="0">Tono Original</option>';
        for(let i=1; i<=11; i++) select.innerHTML += `<option value="${i}">+${i} Semitonos</option>`;
        for(let i=-1; i>=-11; i--) select.innerHTML += `<option value="${i}">${i} Semitonos</option>`;
    },

    setSong(title, artist, rawText) {
        const titleEl = document.getElementById('lib-song-title');
        const artistEl = document.getElementById('lib-song-artist');
        let parsedHTML = this.parseRawTextToChords(rawText);

        this.currentSong = {
            title: title || "Canción",
            artist: artist || "Artista",
            rawText: rawText,
            originalContent: parsedHTML
        };

        if (titleEl) titleEl.innerText = this.currentSong.title;
        if (artistEl) artistEl.innerText = this.currentSong.artist;
        const trSelect = document.getElementById('lib-transpose-select');
        if (trSelect) trSelect.value = "0";
        this.renderChords(this.currentSong.originalContent);

        const btnSave = document.getElementById('lib-btn-save-cloud');
        if (btnSave) btnSave.style.display = 'inline-block';
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

// ================= CLOUD SYNC & AI =================
function initCloudSync() {
    const btnSaveKeys = document.getElementById('btnSaveApiKeys');
    if(btnSaveKeys) {
        // Cargar llaves
        document.getElementById('api-key-gemini').value = localStorage.getItem('gemini_api_key') || '';
        document.getElementById('api-key-github').value = localStorage.getItem('github_pat') || '';
        
        btnSaveKeys.addEventListener('click', () => {
            localStorage.setItem('gemini_api_key', document.getElementById('api-key-gemini').value.trim());
            localStorage.setItem('github_pat', document.getElementById('api-key-github').value.trim());
            btnSaveKeys.innerText = 'Saved!';
            btnSaveKeys.style.background = '#00ffcc';
            btnSaveKeys.style.color = '#000';
            setTimeout(() => {
                btnSaveKeys.innerText = 'Save Keys';
                btnSaveKeys.style.background = '';
                btnSaveKeys.style.color = '';
            }, 2000);
        });
    }
    
    // Cargar repertorio de GitHub al inicio
    if(typeof RepertoireSync !== 'undefined') {
        RepertoireSync.loadIndex();
    }
}


const RepertoireSync = {
    repoPath: 'jcgit-coding/casio-ct-s500-controller',
    allSongs: [],
    
    async loadIndex() {
        const container = document.getElementById('cloud-song-list-container');
        try {
            const res = await fetch('library/index.json?v=' + Date.now());
            if(!res.ok) throw new Error('No index found');
            const songs = await res.json();
            this.allSongs = Array.isArray(songs) ? songs : [];
            this.renderSongList(this.allSongs);
            this.initSearchFilter();
        } catch(e) {
            console.error('Error cargando catálogo:', e);
            if (container) container.innerHTML = "<div style='color:var(--text-muted); font-size:12px; padding:10px;'>Aún no hay canciones en la base de datos.</div>";
        }
    },

    initSearchFilter() {
        const input = document.getElementById('lib-song-search-filter');
        if (!input || input._bound) return;
        input._bound = true;
        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            if (!q) {
                this.renderSongList(this.allSongs);
            } else {
                const filtered = this.allSongs.filter(s => 
                    (s.title && s.title.toLowerCase().includes(q)) || 
                    (s.artist && s.artist.toLowerCase().includes(q))
                );
                this.renderSongList(filtered);
            }
        });
    },
    
    renderSongList(songs) {
        const container = document.getElementById('cloud-song-list-container');
        if (!container) return;
        
        if (!songs || songs.length === 0) {
            container.innerHTML = "<div style='color:var(--text-muted); font-size:12px; padding:8px;'>Sin canciones coincidentes.</div>";
            return;
        }

        container.innerHTML = songs.map(s => `
            <div class='song-item' style='padding:8px 10px; border-radius:6px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); cursor:pointer; transition:all .2s;' onclick='RepertoireSync.openSong("${s.id}")'>
                <div style='font-weight:600; font-size:13px; color:var(--text);'>${s.title}</div>
                <div style='font-size:11px; color:var(--text-muted);'>${s.artist || "Desconocido"}</div>
            </div>
        `).join('');
    },
    
    async openSong(id) {
        try {
            const res = await fetch(`library/${id}/chords.txt?v=` + Date.now());
            const text = await res.text();
            let title = "Canción";
            let artist = "Artista";
            
            const metaRes = await fetch(`library/${id}/meta.json?v=` + Date.now());
            if(metaRes.ok) {
                const meta = await metaRes.json();
                title = meta.title;
                artist = meta.artist;
            }
            
            RepertorioApp.setSong(title, artist, text);
        } catch(e) {
            alert('Error abriendo canción desde la nube');
        }
    }
};
window.RepertoireSync = RepertoireSync;
initCloudSync();


// ================= AI GENERATOR & CLOUD SAVE =================
const btnAi = document.getElementById('lib-btn-ai');
if (btnAi) {
    btnAi.addEventListener('click', async () => {
        const queryInput = document.getElementById('lib-ai-query');
        const query = queryInput ? queryInput.value.trim() : '';
        if (!query) return alert("Please enter a song name or paste a YouTube link.");
        
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            alert("Please go to PRESETS and configure your free Gemini API Key.");
            document.querySelector('[data-target="view-settings"]')?.click();
            return;
        }
        
        btnAi.innerText = "Searching...";
        btnAi.disabled = true;
        
        try {
            const prompt = `Analiza la siguiente búsqueda o enlace de YouTube: "${query}".
Determina el título exacto de la canción y el artista.
Luego escribe la letra completa con sus acordes encima de cada verso (acordes en inglés: C, D, Em, F#m, G/B).
Devuelve únicamente un JSON con este formato exacto, sin explicaciones ni formato markdown extra:
{
  "title": "Título de la canción",
  "artist": "Nombre del Artista",
  "chords": "Letra completa con acordes encima..."
}`;
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            
            if (!response.ok) throw new Error("Error en la respuesta de la API");
            const data = await response.json();
            let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            aiText = aiText.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
            let parsed;
            try {
                parsed = JSON.parse(aiText);
            } catch(err) {
                parsed = {
                    title: query,
                    artist: "Desconocido",
                    chords: aiText
                };
            }
            
            RepertorioApp.setSong(parsed.title, parsed.artist, parsed.chords);
            if (queryInput) queryInput.value = '';
            
        } catch(e) {
            console.error(e);
            alert("Error al buscar o procesar la canción. Verifica tu conexión o API Key.");
        } finally {
            btnAi.innerText = "Search Song";
            btnAi.disabled = false;
        }
    });
}

const btnSaveCloud = document.getElementById('lib-btn-save-cloud');
if (btnSaveCloud) {
    btnSaveCloud.addEventListener('click', async () => {
        const pat = localStorage.getItem('github_pat');
        if (!pat) {
            alert("Please go to PRESETS and configure your GitHub PAT to save to the cloud.");
            document.querySelector('[data-target="view-settings"]')?.click();
            return;
        }
        
        if (!RepertorioApp.currentSong || !RepertorioApp.currentSong.title) {
            return alert("No active song loaded to save.");
        }
        
        const title = RepertorioApp.currentSong.title;
        const artist = RepertorioApp.currentSong.artist;
        const rawText = RepertorioApp.currentSong.rawText || '';
        const id = title.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        
        btnSaveCloud.innerText = "Saving...";
        btnSaveCloud.disabled = true;
        
        try {
            // 1. Guardar meta.json
            const metaStr = JSON.stringify({ id, title, artist, original_key: "C", genre: "" }, null, 2);
            await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/${id}/meta.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${pat}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Add ${title} meta`,
                    content: btoa(unescape(encodeURIComponent(metaStr)))
                })
            });
            
            // 2. Guardar chords.txt
            await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/${id}/chords.txt`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${pat}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Add ${title} chords`,
                    content: btoa(unescape(encodeURIComponent(rawText)))
                })
            });
            
            // 3. Actualizar index.json
            const idxRes = await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/index.json`);
            const idxData = await idxRes.json();
            const idxContent = JSON.parse(decodeURIComponent(escape(atob(idxData.content))));
            
            idxContent.push({ id, title, artist });
            
            await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/index.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${pat}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Update library index with ${title}`,
                    content: btoa(unescape(encodeURIComponent(JSON.stringify(idxContent, null, 2)))),
                    sha: idxData.sha
                })
            });
            
            alert("Song saved to your cloud library successfully!");
            RepertoireSync.loadIndex();
            
        } catch(e) {
            console.error(e);
            alert("Error saving to GitHub. Please check your GitHub Token and permissions.");
        } finally {
            btnSaveCloud.innerText = "Save to Cloud";
            btnSaveCloud.disabled = false;
        }
    });
}
