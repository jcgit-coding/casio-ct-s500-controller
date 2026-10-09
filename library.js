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
        document.getElementById('lib-btn-import').addEventListener('click', () => this.importFromURL());
        document.getElementById('lib-transpose-select').addEventListener('change', (e) => this.applyTranspose(parseInt(e.target.value)));
        document.getElementById('lib-btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    },

    populateTransposeDropdown() {
        const select = document.getElementById('lib-transpose-select');
        select.innerHTML = '<option value="0">Tono Original</option>';
        for(let i=1; i<=11; i++) select.innerHTML += `<option value="${i}">+${i} Semitonos</option>`;
        for(let i=-1; i>=-11; i--) select.innerHTML += `<option value="${i}">${i} Semitonos</option>`;
    },

    async importFromURL() {
        const url = document.getElementById('lib-url-input').value.trim();
        if(!url) return alert("Por favor ingresa una URL de LaCuerda o CifraClub");
        
        const titleEl = document.getElementById('lib-song-title');
        const artistEl = document.getElementById('lib-song-artist');
        const chordsEl = document.getElementById('lib-chords-view');
        
        titleEl.innerText = "Extrayendo...";
        artistEl.innerText = "Conectando con la web...";
        chordsEl.innerHTML = "<i>Por favor espera, descargando letra y acordes...</i>";

        try {
            // Usamos AllOrigins como proxy CORS gratuito para extraer HTML directamente desde el navegador
            const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxy);
            const data = await response.json();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.contents, "text/html");

            let songData = this.parseSongHTML(doc, url);

            // Guardar en memoria la canción actual
            this.currentSong = {
                title: songData.title,
                artist: songData.artist,
                originalContent: songData.content
            };

            // Mostrar en UI
            titleEl.innerText = this.currentSong.title;
            artistEl.innerText = this.currentSong.artist;
            document.getElementById('lib-transpose-select').value = "0";
            this.renderChords(this.currentSong.originalContent);

        } catch (err) {
            console.error("Error extrayendo canción:", err);
            titleEl.innerText = "Error";
            artistEl.innerText = "Falló la extracción";
            chordsEl.innerHTML = `<span style="color:#ff3366">Hubo un error al intentar leer la URL. Verifica que sea un enlace válido de LaCuerda.</span>`;
        }
    },

    parseSongHTML(doc, url) {
        let title = "Canción Desconocida";
        let artist = "Artista Desconocido";
        let rawContent = "";

        if (url.includes("lacuerda.net")) {
            title = doc.querySelector('h1')?.innerText.trim() || title;
            artist = doc.querySelector('h2 a')?.innerText.trim() || doc.querySelector('h2')?.innerText.trim() || artist;
            let pre = doc.querySelector('#t_body pre') || doc.querySelector('pre');
            rawContent = pre ? pre.innerHTML : "No se encontró la estructura de acordes en esta página.";
            
            // Convertir los hipervínculos de acordes que usa LaCuerda a nuestro formato interno (span class="chord")
            rawContent = rawContent.replace(/<a[^>]*>(.*?)<\/a>/gi, "<span class='chord' style='color:var(--accent); font-weight:bold;'>$1</span>");
        } else {
            // Generic fallback parser
            title = doc.querySelector('title')?.innerText || title;
            let pre = doc.querySelector('pre');
            rawContent = pre ? pre.innerHTML : "Solo se soporta extracción optimizada para LaCuerda.net por el momento.";
        }
        
        return { title, artist, content: rawContent };
    },

    applyTranspose(steps) {
        if(!this.currentSong) return;
        
        if (steps === 0) {
            this.renderChords(this.currentSong.originalContent);
            return;
        }

        // Motor Matemático de Transposición
        // Busca todo el texto que está clasificado como acorde (dentro del span class='chord')
        let newContent = this.currentSong.originalContent.replace(/(<span[^>]*class=['"]chord['"][^>]*>)(.*?)(<\/span>)/gi, (match, openTag, chordText, closeTag) => {
            
            // Transponer cada nota base encontrada en el acorde (Ej: F#m -> G#m)
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
