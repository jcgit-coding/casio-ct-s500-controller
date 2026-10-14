/**
 * CasioController Pro - Módulo de Repertorio
 * Maneja la lógica de extracción de canciones, transposición de acordes y calendario de eventos.
 */

const RepertorioApp = {
    db: { canciones: [], calendario: [] },
    currentSong: null,
    
    notes:      ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    noteLabels: ["C", "C# / Db", "D", "D# / Eb", "E", "F", "F# / Gb", "G", "G# / Ab", "A", "A# / Bb", "B"],

    init() {
        this.bindEvents();
        this.initSubTabs();
        this.populateTransposeDropdown(null);
        console.log("Library Module Initialized.");
    },

    // Extracts root note from keys like "Bm", "F#m", "C#m", "D", "Bb", etc.
    normalizeNoteRoot(key) {
        if (!key) return 'C';
        const flatToSharp = { 'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#' };
        const m = (key + '').match(/^([A-G][#b]?)/);
        if (!m) return 'C';
        return flatToSharp[m[1]] || m[1];
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
        document.getElementById('lib-transpose-select').addEventListener('change', (e) => {
            if (!this.currentSong) return;
            const targetNote = e.target.value;
            const fromIdx = this.notes.indexOf(this.normalizeNoteRoot(this.currentSong.originalKey));
            const toIdx   = this.notes.indexOf(targetNote);
            if (fromIdx === -1 || toIdx === -1) return;
            const steps = (toIdx - fromIdx + 12) % 12;
            this.applyTranspose(steps);
        });
        document.getElementById('lib-btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    },

    populateTransposeDropdown(originalKey) {
        const select = document.getElementById('lib-transpose-select');
        const root = originalKey ? this.normalizeNoteRoot(originalKey) : 'C';
        select.innerHTML = this.noteLabels.map((label, i) =>
            `<option value="${this.notes[i]}">${label}</option>`
        ).join('');
        select.value = root;
    },

    setSong(title, artist, rawText, originalKey) {
        const titleEl = document.getElementById('lib-song-title');
        const artistEl = document.getElementById('lib-song-artist');
        let parsedHTML = this.parseRawTextToChords(rawText);

        this.currentSong = {
            title: title || "Song",
            artist: artist || "Artist",
            rawText: rawText,
            originalContent: parsedHTML,
            originalKey: originalKey || 'C'
        };

        if (titleEl) titleEl.innerText = this.currentSong.title;
        if (artistEl) artistEl.innerText = this.currentSong.artist;
        this.populateTransposeDropdown(this.currentSong.originalKey);
        this.renderChords(this.currentSong.originalContent);

        const btnSave = document.getElementById('lib-btn-save-cloud');
        if (btnSave) btnSave.style.display = 'inline-block';
    },

    importFromText() {
        const title = document.getElementById('lib-song-title-input').value.trim() || "Custom Song";
        const artist = document.getElementById('lib-song-artist-input').value.trim() || "Unknown Artist";
        const rawText = document.getElementById('lib-raw-text-input').value;
        
        if (!rawText.trim()) {
            return alert("Please paste lyrics and chords into the text box.");
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
        // Matches full chord tokens in standard English notation, optionally wrapped in /// markers
        const CHORD_STRIP_RE = /\/{0,3}[CDEFGAB][#b]?(m|maj7?|dim|aug|sus[24]?|add\d?|7|9|11|13)?\d*(\/[CDEFGAB][#b]?)?\/{0,3}/g;

        // Determines if a line contains only chord symbols and structural filler
        const isChordLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            // Strip leading section labels like "Intro:", "Verso 1:", "Ministración:", etc.
            const noLabel = trimmed.replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d()]+:\s*/, '').trim();
            if (!noLabel) return false;
            const leftover = noLabel.replace(CHORD_STRIP_RE, '').replace(/[\s\-|./\\x()]+/gi, '').replace(/\d+/g, '').trim();
            return leftover.length === 0;
        };

        const CHORD_RE = /([CDEFGAB][#b]?(m|maj7?|dim|aug|sus[24]?|add\d?|7|9|11|13)?\d*(\/[CDEFGAB][#b]?)?)/g;

        const lines = text.split('\n');
        const htmlLines = lines.map(line => {
            let parsedLine = line;
            if (isChordLine(line)) {
                parsedLine = line.replace(CHORD_RE, chord =>
                    `<span class='chord' style='color:var(--accent); font-weight:bold;'>${chord}</span>`
                );
            }
            return parsedLine.replace(/ {2}/g, '&nbsp;&nbsp;');
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
            console.error('Error loading catalogue:', e);
            if (container) container.innerHTML = "<div style='color:var(--text-muted); font-size:12px; padding:10px;'>No songs found in database yet.</div>";
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
            container.innerHTML = "<div style='color:var(--text-muted); font-size:12px; padding:8px;'>No matching songs found.</div>";
            return;
        }

        // Group by artist
        const byArtist = {};
        songs.forEach(s => {
            const artist = s.artist || "Unknown Artist";
            if (!byArtist[artist]) byArtist[artist] = [];
            byArtist[artist].push(s);
        });

        container.innerHTML = Object.entries(byArtist).map(([artist, artistSongs]) => `
            <div style='margin-bottom:14px;'>
                <div style='font-size:10px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.1em; padding:3px 0 6px; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:5px;'>${artist}</div>
                ${artistSongs.map(s => `
                    <div class='song-item' style='padding:7px 10px; border-radius:7px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); cursor:pointer; transition:all .2s; margin-bottom:3px;' onclick='RepertoireSync.openSong("${s.id}")'>
                        <div style='font-weight:600; font-size:13px; color:var(--text);'>${s.title}</div>
                    </div>
                `).join('')}
            </div>
        `).join('');
    },
    
    async openSong(id) {
        try {
            const res = await fetch(`library/${id}/chords.txt?v=` + Date.now());
            const text = await res.text();
            let title = "Song";
            let artist = "Artist";
            let originalKey = 'C';

            const metaRes = await fetch(`library/${id}/meta.json?v=` + Date.now());
            if(metaRes.ok) {
                const meta = await metaRes.json();
                title = meta.title;
                artist = meta.artist;
                originalKey = meta.original_key || 'C';
            }

            RepertorioApp.setSong(title, artist, text, originalKey);
        } catch(e) {
            alert('Error loading song from cloud');
        }
    }
};
window.RepertoireSync = RepertoireSync;
initCloudSync();

document.addEventListener('DOMContentLoaded', () => {
    RepertorioApp.init();
});


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
            const prompt = `Analyze the following search query or YouTube link: "${query}".
Determine the exact song title and artist.
Then write the complete lyrics with their musical chords positioned directly above each verse (standard chords: C, D, Em, F#m, G/B).
Return strictly valid JSON with this exact schema, without extra explanations or markdown blocks:
{
  "title": "Song Title",
  "artist": "Artist Name",
  "chords": "Full lyrics with chords above..."
}`;
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            
            if (!response.ok) throw new Error("API response error");
            const data = await response.json();
            let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            aiText = aiText.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
            let parsed;
            try {
                parsed = JSON.parse(aiText);
            } catch(err) {
                parsed = {
                    title: query,
                    artist: "Unknown Artist",
                    chords: aiText
                };
            }
            
            RepertorioApp.setSong(parsed.title, parsed.artist, parsed.chords);
            if (queryInput) queryInput.value = '';
            
        } catch(e) {
            console.error(e);
            alert("Error searching or processing song. Please check your network or API Key.");
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
