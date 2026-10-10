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

// ================= CLOUD SYNC & AI =================
document.addEventListener('DOMContentLoaded', () => {
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
});

const RepertoireSync = {
    repoPath: 'jcgit-coding/casio-ct-s500-controller',
    
    async loadIndex() {
        try {
            // Fetch directo, sin autenticación (ya que es público o usamos Pages)
            const res = await fetch('library/index.json?v=' + Date.now());
            if(!res.ok) throw new Error('No index found');
            const songs = await res.json();
            this.renderSongList(songs);
        } catch(e) {
            console.error('Error cargando repertorio:', e);
            document.querySelector('.sidebar-col').innerHTML += `<div style='color:#ff3366; margin-top:10px;'>Aún no hay canciones en la nube.</div>`;
        }
    },
    
    renderSongList(songs) {
        const listHTML = songs.map(s => `
            <div class='song-item' style='padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); cursor:pointer;' onclick='RepertoireSync.openSong("${s.id}")'>
                <div style='font-weight:bold;'>${s.title}</div>
                <div style='font-size:12px; color:var(--text-muted);'>${s.artist}</div>
            </div>
        `).join('');
        
        let sidebar = document.querySelector('.sidebar-col');
        sidebar.innerHTML = `<div class='panel' style='flex:1;'><div class='panel-title'>Repertorio (Cloud)</div><div style='overflow-y:auto; max-height:400px;'>${listHTML}</div></div>`;
    },
    
    async openSong(id) {
        try {
            const res = await fetch(`library/${id}/chords.txt?v=` + Date.now());
            const text = await res.text();
            
            // Simular importación de texto
            document.getElementById('lib-raw-text-input').value = text;
            
            // Buscar metadatos
            const metaRes = await fetch(`library/${id}/meta.json?v=` + Date.now());
            if(metaRes.ok) {
                const meta = await metaRes.json();
                document.getElementById('lib-song-title-input').value = meta.title;
                document.getElementById('lib-song-artist-input').value = meta.artist;
            }
            
            // Procesar
            RepertorioApp.importFromText(); 
        } catch(e) {
            alert('Error abriendo canción desde la nube');
        }
    }
};
window.RepertoireSync = RepertoireSync;


// ================= AI GENERATOR =================
document.addEventListener('DOMContentLoaded', () => {
    const btnAi = document.getElementById('lib-btn-ai');
    if(btnAi) {
        btnAi.addEventListener('click', async () => {
            const title = document.getElementById('lib-song-title-input').value.trim();
            const artist = document.getElementById('lib-song-artist-input').value.trim();
            if(!title) return alert("Por favor escribe el título de la canción primero.");
            
            const apiKey = localStorage.getItem('gemini_api_key');
            if(!apiKey) {
                alert("Por favor ve a PRESETS y configura tu llave Gemini API Key gratuita.");
                document.querySelector('[data-target="view-settings"]').click();
                return;
            }
            
            btnAi.innerText = "Pensando...";
            btnAi.disabled = true;
            
            try {
                const prompt = `Eres un músico experto. Escribe la letra completa con acordes encima para la canción "${title}" de "${artist}". 
Usa estrictamente formato de acordes en inglés (C, D, Em) en una línea, y la letra en la siguiente línea.
No incluyas introducciones habladas ni explicaciones, SOLO la canción con sus acordes.`;
                
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        contents: [{parts: [{text: prompt}]}]
                    })
                });
                
                if(!response.ok) throw new Error("Error en API");
                const data = await response.json();
                const aiText = data.candidates[0].content.parts[0].text;
                
                document.getElementById('lib-raw-text-input').value = aiText;
                
                // Procesar automáticamente
                RepertorioApp.importFromText();
                
            } catch(e) {
                alert("Error contactando a la IA. Verifica tu llave.");
            } finally {
                btnAi.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">smart_toy</span> Ask AI`;
                btnAi.disabled = false;
            }
        });
    }

    const btnSaveCloud = document.getElementById('lib-btn-save-cloud');
    if(btnSaveCloud) {
        btnSaveCloud.addEventListener('click', async () => {
            const pat = localStorage.getItem('github_pat');
            if(!pat) {
                alert("Por favor ve a PRESETS y configura tu GitHub PAT para guardar en la nube.");
                document.querySelector('[data-target="view-settings"]').click();
                return;
            }
            
            if(!RepertorioApp.currentSong || !RepertorioApp.currentSong.title) {
                return alert("Primero procesa una canción antes de guardarla.");
            }
            
            const title = RepertorioApp.currentSong.title;
            const artist = RepertorioApp.currentSong.artist;
            const content = RepertorioApp.currentSong.originalContent;
            const id = title.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
            
            btnSaveCloud.innerText = "Guardando...";
            
            try {
                // 1. Guardar meta.json
                const metaStr = JSON.stringify({id, title, artist, original_key: "C", genre: ""}, null, 2);
                await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/${id}/meta.json`, {
                    method: 'PUT',
                    headers: {'Authorization': `token ${pat}`, 'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        message: `Add ${title} meta`,
                        content: btoa(unescape(encodeURIComponent(metaStr)))
                    })
                });
                
                // 2. Guardar chords.txt (usamos el texto crudo del input, o el content html?)
                // El HTML es mejor porque ya tiene los spans. Pero el texto crudo es editable.
                // Guardaremos el html procesado para lectura rápida.
                const rawText = document.getElementById('lib-raw-text-input').value;
                await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/${id}/chords.txt`, {
                    method: 'PUT',
                    headers: {'Authorization': `token ${pat}`, 'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        message: `Add ${title} chords`,
                        content: btoa(unescape(encodeURIComponent(rawText)))
                    })
                });
                
                // 3. Actualizar index.json
                const idxRes = await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/index.json`);
                const idxData = await idxRes.json();
                const idxContent = JSON.parse(decodeURIComponent(escape(atob(idxData.content))));
                
                idxContent.push({id, title, artist});
                
                await fetch(`https://api.github.com/repos/${RepertoireSync.repoPath}/contents/library/index.json`, {
                    method: 'PUT',
                    headers: {'Authorization': `token ${pat}`, 'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        message: `Update library index with ${title}`,
                        content: btoa(unescape(encodeURIComponent(JSON.stringify(idxContent, null, 2)))),
                        sha: idxData.sha
                    })
                });
                
                alert("¡Canción guardada exitosamente en tu nube!");
                RepertoireSync.loadIndex();
                
            } catch(e) {
                console.error(e);
                alert("Error al guardar en GitHub. Verifica tu Token y permisos.");
            } finally {
                btnSaveCloud.innerHTML = `<span class="material-symbols-outlined" style="font-size: 24px;">cloud_upload</span><span style="font-weight:bold; font-size:11px;">Save to<br>Cloud</span>`;
            }
        });
    }
});
