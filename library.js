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
                EventsMgr.render();
            });
        }
    },

    _semitoneShift: 0,

    bindEvents() {
        document.getElementById('lib-btn-import')?.addEventListener('click', () => this.importFromText());
        document.getElementById('lib-transpose-down')?.addEventListener('click', () => this._shiftTranspose(-1));
        document.getElementById('lib-transpose-up')?.addEventListener('click', () => this._shiftTranspose(+1));
        document.getElementById('lib-transpose-reset')?.addEventListener('click', () => this._resetTranspose());
        document.getElementById('lib-btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    },

    _shiftTranspose(delta) {
        if (!this.currentSong) return;
        this._semitoneShift = ((this._semitoneShift + delta) % 12 + 12) % 12;
        this._applyTransposeShift();
    },

    _resetTranspose() {
        if (!this.currentSong) return;
        this._semitoneShift = 0;
        this._applyTransposeShift();
    },

    _applyTransposeShift() {
        this.applyTranspose(this._semitoneShift);
        const root = this.notes[this._semitoneShift] || this.currentSong.originalKey;
        const label = document.getElementById('lib-transpose-label');
        const shift = this._semitoneShift;
        const shiftStr = shift === 0 ? '0' : (shift <= 6 ? `+${shift}` : `-${12 - shift}`);
        if (label) label.textContent = `${root} (${shiftStr})`;
    },

    populateTransposeDropdown(originalKey) {
        this._semitoneShift = 0;
        const root = originalKey ? this.normalizeNoteRoot(originalKey) : 'C';
        const label = document.getElementById('lib-transpose-label');
        if (label) label.textContent = `${root} (0)`;
    },

    setSong(title, artist, rawText, originalKey) {
        const titleEl = document.getElementById('lib-song-title');
        const artistEl = document.getElementById('lib-song-artist');
        let parsedHTML = this.parseRawTextToChords(rawText);

        this.currentSong = {
            _id: this._pendingSongId || null,
            title: title || "Song",
            artist: artist || "Artist",
            rawText: rawText,
            originalContent: parsedHTML,
            originalKey: originalKey || 'C'
        };
        this._pendingSongId = null;

        if (titleEl) titleEl.innerText = this.currentSong.title;
        if (artistEl) artistEl.innerText = this.currentSong.artist;
        this.populateTransposeDropdown(this.currentSong.originalKey);
        this.renderChords(this.currentSong.originalContent);

        const btnSave = document.getElementById('lib-btn-save-cloud');
        if (btnSave) btnSave.style.display = 'inline-block';

        // Show "add to event" banner if an event is active
        let banner = document.getElementById('_evt-add-banner');
        if (typeof EventsMgr !== 'undefined' && EventsMgr.activeEventId) {
            const events = EventsMgr.getAll();
            const evt = events.find(e => e.id === EventsMgr.activeEventId);
            if (evt) {
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = '_evt-add-banner';
                    const viewer = document.getElementById('lib-chords-view');
                    viewer?.parentNode?.insertBefore(banner, viewer);
                }
                banner.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-radius:8px;background:rgba(var(--accent-rgb,0,255,204),0.1);border:1px solid var(--accent);margin-bottom:10px;gap:10px;';
                const songId = this.currentSong?._id || '';
                banner.innerHTML = `<span style="font-size:12px;font-weight:600;color:var(--accent);">Evento activo: ${evt.name}</span>
                    <button style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;background:var(--accent);color:#000;border:none;cursor:pointer;"
                            onclick="EventsMgr.addSong(RepertorioApp.currentSong?._id)">+ Agregar</button>`;
            }
        } else if (banner) {
            banner.style.display = 'none';
        }
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
        this._semitoneShift = 0;
        this.renderChords(this.currentSong.originalContent);
    },

    parseRawTextToChords(text) {
        // Notación inglesa: C D E F G A B
        const EN_ROOT = '[CDEFGAB]';
        // Sufijo inglés: accidental, calificador, extensión base, paréntesis numérico (9), (9/13), (add2), (maj7), etc.
        const EN_PAREN = '(?:\\((?:add|maj|aug|\\d+)(?:[/,](?:add|maj|aug|\\d+))*\\))?';
        const EN_QUAL  = `(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+|sus[24]?|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?${EN_PAREN}(?:\\/\\d+)?`;
        const EN_BASS  = '(?:\\/[CDEFGAB](?:#|b)?)?';

        // Notación española/solfège: DO RE MI FA SOL LA SI (y mayúsculas mixtas como Sol, Sim, Fa#)
        const ES_ROOT = '(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)';
        // Sufijo español: igual de completo, con paréntesis numérico adicional
        const ES_PAREN = '(?:\\((?:add|maj|aug|\\d+)(?:[/,](?:add|maj|aug|\\d+))*\\))?';
        const ES_QUAL  = `(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+(?:\\(aug\\))?|sus[24]?|(?:\\((?:add|aug)\\d*\\))|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?${ES_PAREN}(?:\\/\\d+)?`;
        const ES_BASS  = '(?:\\/(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?(?:[A-G][#b]?)?)?';

        // Español PRIMERO: DO/RE/MI etc deben ganar sobre D/E/... inglés
        const CHORD_STRIP_RE = new RegExp(
            `(?:${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS})`, 'g'
        );

        // Etiquetas de sección conocidas (para styling y detección)
        const SECTION_LABEL_RE = /^((?:Coro|Estrofa|Verso|Puente|Intro|Outro|Bridge|Chorus|Verse|Pre-?[Cc]oro|Pre-?[Cc]horus|Vamp|Tag|Interludio|Instrumental|Solo|Final|Llave)(?:\s+\d+)?)\s*(?:\([^)]*\))?\s*:?\s*$/i;

        const isChordLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            if (trimmed.startsWith('//')) return false;
            // Etiquetas de sección puras → nunca son línea de acordes
            if (SECTION_LABEL_RE.test(trimmed)) return false;
            // Strip etiqueta de sección al inicio, incluyendo repeticiones como (x3)
            const noLabel = trimmed
                .replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '')
                .replace(/\(x\s*\d+\)/gi, '')  // "(x3)", "(x 2)"
                .trim();
            if (!noLabel) return false;
            const leftover = noLabel.replace(CHORD_STRIP_RE, '').replace(/[\s\-|./\\()\[\]]+/gi, '').replace(/\d+/g, '').trim();
            return leftover.length === 0;
        };

        // Español PRIMERO también en highlight
        const CHORD_RE = new RegExp(
            `(${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS})`, 'g'
        );

        // Separa acordes concatenados sin espacio: "FAFA" → "FA FA", "SIbFASOLm7" → "SIb FA SOLm7"
        const CHORD_FIND_RE = new RegExp(
            `${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS}`, 'g'
        );
        const splitConcatChords = (line) => {
            let result = '';
            let lastEnd = 0;
            let prevEnd = -1;
            let m;
            CHORD_FIND_RE.lastIndex = 0;
            while ((m = CHORD_FIND_RE.exec(line)) !== null) {
                const gap = line.slice(lastEnd, m.index);
                result += gap + (m.index === prevEnd ? ' ' : '') + m[0];
                lastEnd = m.index + m[0].length;
                prevEnd = lastEnd;
            }
            result += line.slice(lastEnd);
            return result;
        };

        const lines = text.split('\n');
        const htmlLines = lines.map(line => {
            const trimmed = line.trim();
            // Etiqueta de sección → resaltar con estilo propio
            if (trimmed && SECTION_LABEL_RE.test(trimmed)) {
                const label = trimmed.replace(/:$/, '');
                return `<span style="display:inline-block;margin-top:10px;margin-bottom:2px;font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);opacity:0.75;">${label}</span>`;
            }
            let parsedLine = line;
            if (isChordLine(line)) {
                parsedLine = splitConcatChords(line).replace(CHORD_RE, chord =>
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

        // Mapa solfège → semitono y viceversa
        const ES_TO_EN = { 'DO':'C','RE':'D','MI':'E','FA':'F','SOL':'G','LA':'A','SI':'B',
                           'Do':'C','Re':'D','Mi':'E','Fa':'F','Sol':'G','La':'A','Si':'B' };
        const EN_TO_ES = { 'C':'Do','D':'Re','E':'Mi','F':'Fa','G':'Sol','A':'La','B':'Si' };

        const transposeRoot = (root) => {
            // Detectar si es solfège y convertir a inglés para transponer
            let enRoot = root, isSpanish = false;
            for (const [es, en] of Object.entries(ES_TO_EN)) {
                if (root.toUpperCase().startsWith(es.toUpperCase()) &&
                    (root.length === es.length || '#b'.includes(root[es.length]))) {
                    enRoot = en;
                    isSpanish = es.length > 1; // DO/RE/MI/FA/SOL/LA/SI son >1 char
                    break;
                }
            }
            let idx = this.notes.indexOf(enRoot + (root.includes('#') ? '#' : ''));
            if (idx === -1) idx = this.notes.indexOf(enRoot);
            if (idx === -1) return root;
            let newIdx = ((idx + steps) % 12 + 12) % 12;
            const transposed = this.notes[newIdx];
            // Devolver en el mismo sistema (español o inglés)
            if (isSpanish) {
                const base = transposed.replace('#','');
                return (EN_TO_ES[base] || base) + (transposed.includes('#') ? '#' : '');
            }
            return transposed;
        };

        let newContent = this.currentSong.originalContent.replace(/(<span[^>]*class=['"]chord['"][^>]*>)(.*?)(<\/span>)/gi, (match, openTag, chordText, closeTag) => {
            // Transponer la raíz del acorde preservando sufijos (m, maj7, sus2, etc.)
            const ES_ROOT_RE = /^(DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(#|b)?/i;
            const EN_ROOT_RE = /^([CDEFGAB])(#|b)?/;
            let transposedChord = chordText;
            const esM = chordText.match(ES_ROOT_RE);
            const enM = !esM && chordText.match(EN_ROOT_RE);
            if (esM) {
                const root = esM[0];
                transposedChord = transposeRoot(root) + chordText.slice(root.length);
            } else if (enM) {
                const root = enM[0];
                transposedChord = transposeRoot(root) + chordText.slice(root.length);
            }
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

// ================= CLOUD SYNC =================
function initCloudSync() {
    const btnSaveKeys = document.getElementById('btnSaveApiKeys');
    if(btnSaveKeys) {
        document.getElementById('api-key-github').value = localStorage.getItem('github_pat') || '';

        btnSaveKeys.addEventListener('click', () => {
            localStorage.setItem('github_pat', document.getElementById('api-key-github').value.trim());
            btnSaveKeys.innerText = 'Guardado!';
            btnSaveKeys.style.background = '#00ffcc';
            btnSaveKeys.style.color = '#000';
            setTimeout(() => {
                btnSaveKeys.innerText = 'Guardar';
                btnSaveKeys.style.background = '';
                btnSaveKeys.style.color = '';
            }, 2000);
        });
    }

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

    _activeArtist: null,

    initSearchFilter() {
        const input = document.getElementById('lib-song-search-filter');
        if (!input || input._bound) return;
        input._bound = true;
        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            if (!q) {
                // Sin búsqueda: volver a la pantalla de artistas (o del artista activo)
                if (this._activeArtist) {
                    const songs = this.allSongs.filter(s => s.artist === this._activeArtist);
                    this._renderArtistSongs(this._activeArtist, songs);
                } else {
                    this.renderSongList(this.allSongs);
                }
            } else {
                // Búsqueda activa: mostrar resultados planos agrupados por artista
                const filtered = this.allSongs.filter(s =>
                    (s.title && s.title.toLowerCase().includes(q)) ||
                    (s.artist && s.artist.toLowerCase().includes(q))
                );
                this._renderSearchResults(filtered, q);
            }
        });
    },

    // Pantalla 1: lista de artistas
    renderSongList(songs) {
        const wrap = document.getElementById('cloud-song-list-container');
        if (!wrap) return;
        this._activeArtist = null;
        this._clearAlphaIndex();

        if (!songs || songs.length === 0) {
            wrap.innerHTML = "<div style='color:var(--text-muted);font-size:12px;padding:10px;'>Sin canciones en la biblioteca.</div>";
            wrap.style.paddingRight = '';
            return;
        }

        const byArtist = {};
        songs.forEach(s => {
            const a = s.artist || 'Sin artista';
            if (!byArtist[a]) byArtist[a] = [];
            byArtist[a].push(s);
        });
        const sorted = Object.keys(byArtist).sort((a, b) => a.localeCompare(b, 'es'));

        wrap.style.paddingRight = '28px';
        wrap.innerHTML = sorted.map(artist => {
            const count = byArtist[artist].length;
            const initial = artist[0].toUpperCase();
            const aid = 'art-' + artist.replace(/[^a-z0-9]/gi, '_');
            return `<div id="${aid}" style="margin-bottom:4px;">
                <div onclick="RepertoireSync._openArtist('${artist.replace(/'/g,"\\'")}',event)"
                     style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;
                            background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
                            cursor:pointer;transition:background .12s;user-select:none;"
                     onmouseover="this.style.background='rgba(255,255,255,0.09)'"
                     onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                    <span style="width:28px;height:28px;border-radius:50%;background:rgba(var(--accent-rgb,0,255,204),0.15);
                                 display:flex;align-items:center;justify-content:center;flex-shrink:0;
                                 font-size:12px;font-weight:800;color:var(--accent);">${initial}</span>
                    <span style="flex:1;font-size:13px;font-weight:700;color:var(--text);">${artist}</span>
                    <span style="font-size:11px;font-weight:600;color:var(--text-muted);background:rgba(255,255,255,0.06);
                                 padding:2px 7px;border-radius:10px;">${count}</span>
                    <span style="font-size:14px;color:var(--text-muted);opacity:0.5;">›</span>
                </div>
            </div>`;
        }).join('');

        // Índice alfabético
        const used = new Set(sorted.map(a => a[0].toUpperCase()));
        this._renderAlphaIndex(used, letter => {
            const target = [...wrap.querySelectorAll('[id^="art-"]')]
                .find(el => el.querySelector('span:nth-child(2)')?.textContent.trim()[0]?.toUpperCase() >= letter);
            if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
    },

    // Pantalla 2: canciones de un artista
    _openArtist(artist) {
        this._activeArtist = artist;
        const songs = this.allSongs.filter(s => s.artist === artist);
        this._renderArtistSongs(artist, songs);
    },

    _renderArtistSongs(artist, songs) {
        const wrap = document.getElementById('cloud-song-list-container');
        if (!wrap) return;
        this._clearAlphaIndex();
        wrap.style.paddingRight = '';

        const hasActive = typeof EventsMgr !== 'undefined' && EventsMgr.activeEventId;

        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:0 0 10px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:8px;position:sticky;top:0;background:var(--panel-bg,#1a1a2e);z-index:2;">
                <button onclick="RepertoireSync._backToArtists()"
                        style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:6px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:0.04em;"
                        onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='none'">
                    ‹ ARTISTAS
                </button>
                <span style="font-size:13px;font-weight:800;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${artist}</span>
                <span style="font-size:10px;color:var(--text-muted);">${songs.length} canciones</span>
            </div>
            ${songs.length === 0
                ? "<div style='color:var(--text-muted);font-size:12px;padding:10px;'>Sin canciones.</div>"
                : songs.map(s => `
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                        <div style="flex:1;padding:8px 12px;border-radius:7px;background:rgba(255,255,255,0.03);
                                    border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background .12s;"
                             onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                             onmouseout="this.style.background='rgba(255,255,255,0.03)'"
                             onclick="RepertoireSync.openSong('${s.id}')">
                            <span style="font-weight:600;font-size:13px;color:var(--text);">${s.title}</span>
                        </div>
                        ${hasActive ? `<div style="cursor:pointer;padding:6px 9px;border-radius:7px;background:rgba(255,255,255,0.05);
                                           border:1px solid rgba(255,255,255,0.1);font-size:13px;line-height:1;color:var(--accent);"
                                      title="Agregar al evento" onclick="EventsMgr.addSong('${s.id}')">+</div>` : ''}
                    </div>`).join('')}`;
    },

    _backToArtists() {
        const input = document.getElementById('lib-song-search-filter');
        if (input) input.value = '';
        this.renderSongList(this.allSongs);
    },

    // Búsqueda activa: resultados planos agrupados
    _renderSearchResults(songs, q) {
        const wrap = document.getElementById('cloud-song-list-container');
        if (!wrap) return;
        this._clearAlphaIndex();
        wrap.style.paddingRight = '';

        if (!songs.length) {
            wrap.innerHTML = "<div style='color:var(--text-muted);font-size:12px;padding:10px;'>Sin resultados.</div>";
            return;
        }

        const hl = txt => {
            const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
            return (txt||'').replace(re, `<mark style="background:rgba(var(--accent-rgb,0,255,204),0.25);color:var(--text);border-radius:2px;">$1</mark>`);
        };

        const byArtist = {};
        songs.forEach(s => {
            const a = s.artist || 'Sin artista';
            if (!byArtist[a]) byArtist[a] = [];
            byArtist[a].push(s);
        });
        const sorted = Object.keys(byArtist).sort((a,b) => a.localeCompare(b,'es'));

        wrap.innerHTML = sorted.map(artist => `
            <div style="margin-bottom:12px;">
                <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;
                            color:var(--accent);opacity:0.7;padding:2px 0 5px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:4px;">
                    ${hl(artist)}
                </div>
                ${byArtist[artist].map(s => `
                    <div style="padding:7px 10px 7px 14px;border-radius:7px;background:rgba(255,255,255,0.03);
                                border:1px solid rgba(255,255,255,0.06);cursor:pointer;margin-bottom:3px;transition:background .12s;"
                         onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                         onmouseout="this.style.background='rgba(255,255,255,0.03)'"
                         onclick="RepertoireSync.openSong('${s.id}')">
                        <span style="font-weight:600;font-size:13px;color:var(--text);">${hl(s.title)}</span>
                    </div>`).join('')}
            </div>`).join('');
    },

    _clearAlphaIndex() {
        document.getElementById('_alpha-index')?.remove();
    },

    _renderAlphaIndex(usedLetters, onClickFn) {
        const wrap = document.getElementById('cloud-song-list-container');
        if (!wrap) return;
        this._clearAlphaIndex();
        const idx = document.createElement('div');
        idx.id = '_alpha-index';
        idx.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:20px;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:5;';
        idx.innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map(l => {
            const has = usedLetters.has(l);
            return `<div style="font-size:9px;font-weight:700;line-height:1.9;text-align:center;width:100%;cursor:${has?'pointer':'default'};color:${has?'var(--accent)':'rgba(255,255,255,0.15)'};"
                        ${has ? `onclick="RepertoireSync._alphaJump('${l}')"` : ''}>${l}</div>`;
        }).join('');
        wrap.insertBefore(idx, wrap.firstChild);
        this._alphaJumpFn = onClickFn;
    },

    _alphaJumpFn: null,
    _alphaJump(letter) { if (this._alphaJumpFn) this._alphaJumpFn(letter); },
    
    async openSong(id, versionFile) {
        try {
            const metaRes = await fetch(`library/${id}/meta.json?v=` + Date.now());
            let meta = { title: 'Song', artist: 'Artist', original_key: 'C', versions: [] };
            if (metaRes.ok) meta = { ...meta, ...await metaRes.json() };

            // Determine which file to load
            const file = versionFile || (meta.versions?.length ? meta.versions[0].file : 'chords.txt');
            const res  = await fetch(`library/${id}/${file}?v=` + Date.now());
            if (!res.ok) throw new Error('File not found: ' + file);
            const text = await res.text();

            RepertorioApp._pendingSongId = id;
            RepertorioApp._songMeta      = meta;
            RepertorioApp.setSong(meta.title, meta.artist, text, meta.original_key);

            // Show version picker if multiple versions exist
            this._renderVersionPicker(id, meta, file);
        } catch(e) {
            console.error(e);
            alert('Error loading song: ' + e.message);
        }
    },

    _renderVersionPicker(id, meta, activeFile) {
        let picker = document.getElementById('_version-picker');
        const versions = meta.versions || [];

        if (!versions.length || versions.length < 2) {
            if (picker) picker.remove();
            return;
        }

        if (!picker) {
            picker = document.createElement('div');
            picker.id = '_version-picker';
            const viewer = document.getElementById('lib-chords-view');
            viewer?.parentNode?.insertBefore(picker, viewer);
        }

        const site = f => f.includes('cifraclub') ? 'Cifraclub' : f.includes('lacuerda') ? 'Lacuerda' : 'Manual';
        picker.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);';
        picker.innerHTML = `<span style="font-size:10px;color:var(--text-muted);font-weight:700;margin-right:4px;">VERSIÓN:</span>` +
            versions.map((v, i) => {
                const isActive = v.file === activeFile;
                const ratingStr = (v.lcd != null && v.lcd > 0) ? ` · ${v.lcd}★` : '';
                const linkHtml = v.source
                    ? ` <a href="${v.source}" target="_blank" rel="noopener"
                           title="Ver en lacuerda.net"
                           style="font-size:9px;color:var(--text-muted);opacity:0.6;text-decoration:none;vertical-align:middle;"
                           onclick="event.stopPropagation()">↗</a>`
                    : '';
                return `<span style="display:inline-flex;align-items:center;gap:2px;">
                    <button onclick="RepertoireSync.openSong('${id}','${v.file}')"
                        style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:5px;border:1px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.15)'};
                        background:${isActive ? 'var(--accent)' : 'transparent'};color:${isActive ? '#000' : 'var(--text-muted)'};cursor:pointer;">
                        ${site(v.file)} v${i+1}${ratingStr}
                    </button>${linkHtml}</span>`;
            }).join('');
    }
};
window.RepertoireSync = RepertoireSync;

// ================= EVENTS MANAGER =================
const EventsMgr = {
    activeEventId: null,

    getAll() {
        try { return JSON.parse(localStorage.getItem('casio_events') || '[]'); } catch { return []; }
    },

    save(events) {
        localStorage.setItem('casio_events', JSON.stringify(events));
    },

    init() {
        document.getElementById('lib-btn-add-event')?.addEventListener('click', () => this.promptCreate());
        document.getElementById('lib-date-picker')?.addEventListener('change', () => this.render());
        // Set today's date as default
        const dp = document.getElementById('lib-date-picker');
        if (dp && !dp.value) dp.value = new Date().toISOString().slice(0, 10);
        this.render();
    },

    promptCreate() {
        const date = document.getElementById('lib-date-picker')?.value;
        if (!date) return alert('Selecciona una fecha primero.');
        const name = prompt(`Nombre del evento (${date}):`);
        if (!name || !name.trim()) return;
        const events = this.getAll();
        events.push({ id: 'evt_' + Date.now(), name: name.trim(), date, songs: [] });
        this.save(events);
        this.render();
    },

    render() {
        const list = document.getElementById('lib-event-list');
        if (!list) return;
        const dateFilter = document.getElementById('lib-date-picker')?.value;
        let events = this.getAll();
        if (dateFilter) events = events.filter(e => e.date === dateFilter);
        events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

        if (!events.length) {
            list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">
                Sin eventos${dateFilter ? ' para esta fecha' : ''}.<br>
                ${dateFilter ? 'Haz click en + para crear uno.' : 'Selecciona una fecha arriba.'}
            </div>`;
            return;
        }

        const allSongs = RepertoireSync.allSongs;
        list.innerHTML = events.map(evt => {
            const isActive = this.activeEventId === evt.id;
            const evtSongs = (evt.songs || []).map(s => typeof s === 'string' ? { id: s, versionFile: null, transpose: 0 } : s);
            const songsHTML = isActive ? (evtSongs.length ? evtSongs.map((entry, i) => {
                const sid   = entry.id;
                const meta  = allSongs.find(s => s.id === sid);
                const title = meta ? meta.title : sid;
                const artist = meta ? meta.artist : '';
                const verLabel = entry.versionFile
                    ? ` · <span style="color:var(--accent);font-size:9px;">${entry.versionFile.replace(/chords_|\.txt/g,'')}</span>` : '';
                const transpLabel = entry.transpose ? ` +${entry.transpose}st` : '';
                return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;background:rgba(255,255,255,0.04);margin-bottom:2px;">
                    <span style="color:var(--text-muted);font-size:10px;min-width:16px;text-align:right;">${i+1}.</span>
                    <div style="flex:1;cursor:pointer;" onclick="RepertoireSync.openSong('${sid}','${entry.versionFile||''}')">
                        <div style="font-size:12px;font-weight:600;color:var(--text);">${title}${verLabel}${transpLabel}</div>
                        <div style="font-size:10px;color:var(--text-muted);">${artist}</div>
                    </div>
                    <span style="cursor:pointer;padding:2px 6px;border-radius:4px;color:rgba(255,100,100,0.8);font-size:12px;font-weight:700;"
                          onclick="EventsMgr.removeSong('${evt.id}','${sid}')" title="Quitar">✕</span>
                </div>`;
            }).join('') : `<div style="padding:8px;text-align:center;font-size:11px;color:var(--text-muted);">Sin canciones aún.</div>`) : '';

            return `<div style="border-radius:10px;border:1px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};overflow:hidden;margin-bottom:6px;">
                <div style="display:flex;align-items:center;padding:10px 12px;cursor:pointer;background:rgba(255,255,255,0.04);gap:8px;"
                     onclick="EventsMgr.toggleActive('${evt.id}')">
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:13px;color:${isActive ? 'var(--accent)' : 'var(--text)'};">${evt.name}</div>
                        <div style="font-size:10px;color:var(--text-muted);">${evt.date} · ${evt.songs.length} canción${evt.songs.length !== 1 ? 'es' : ''}</div>
                    </div>
                    <span style="font-size:10px;color:var(--text-muted);">${isActive ? '▲' : '▼'}</span>
                    <span style="cursor:pointer;padding:3px 7px;border-radius:5px;background:rgba(255,60,60,0.12);color:rgba(255,100,100,0.8);font-size:11px;font-weight:700;"
                          onclick="event.stopPropagation();EventsMgr.deleteEvent('${evt.id}')" title="Eliminar evento">✕</span>
                </div>
                ${isActive ? `<div style="padding:8px;">${songsHTML}
                    <div style="margin-top:6px;padding:6px;text-align:center;font-size:10px;color:var(--text-muted);border:1px dashed rgba(255,255,255,0.12);border-radius:6px;">
                        Abre una canción en SONGS y toca <b style="color:var(--accent);">+</b> para agregarla aquí
                    </div>
                </div>` : ''}
            </div>`;
        }).join('');
    },

    toggleActive(id) {
        this.activeEventId = this.activeEventId === id ? null : id;
        this.render();
        RepertoireSync.renderSongList(RepertoireSync.allSongs);
        // Refresh banner in viewer
        if (RepertorioApp.currentSong) {
            const { title, artist, rawText, originalKey, _id } = RepertorioApp.currentSong;
            RepertorioApp._pendingSongId = _id;
            RepertorioApp.setSong(title, artist, rawText, originalKey);
        }
    },

    addSong(songId, versionFile) {
        if (!songId) return;
        if (!this.activeEventId) return alert('Selecciona un evento en la pestaña EVENTS primero.');
        const events = this.getAll();
        const evt = events.find(e => e.id === this.activeEventId);
        if (!evt) return;
        if (!evt.songs) evt.songs = [];
        // songs now stored as objects: {id, versionFile, transpose}
        const alreadyIn = evt.songs.find(s => (s.id || s) === songId);
        if (alreadyIn) { alert('Esta canción ya está en el evento.'); return; }
        const meta = RepertorioApp._songMeta;
        const file = versionFile || meta?.versions?.[0]?.file || null;
        evt.songs.push({ id: songId, versionFile: file, transpose: 0 });
        this.save(events);
        this.render();
        // Flash feedback
        const banner = document.getElementById('_evt-add-banner');
        if (banner) {
            const btn = banner.querySelector('button');
            if (btn) { const orig = btn.textContent; btn.textContent = '✓ Agregada'; setTimeout(() => btn.textContent = orig, 1200); }
        }
    },

    removeSong(eventId, songId) {
        const events = this.getAll();
        const evt = events.find(e => e.id === eventId);
        if (!evt) return;
        evt.songs = (evt.songs || []).filter(s => (s.id || s) !== songId);
        this.save(events);
        this.render();
    },

    deleteEvent(id) {
        if (!confirm('¿Eliminar este evento?')) return;
        const events = this.getAll().filter(e => e.id !== id);
        this.save(events);
        if (this.activeEventId === id) {
            this.activeEventId = null;
            RepertoireSync.renderSongList(RepertoireSync.allSongs);
        }
        this.render();
    }
};
window.EventsMgr = EventsMgr;

initCloudSync();

document.addEventListener('DOMContentLoaded', () => {
    RepertorioApp.init();
    EventsMgr.init();
});



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

// ─── LacuerdaImport ────────────────────────────────────────────────────────
const LacuerdaImport = (() => {
    const LOCAL_URL = 'http://localhost:7373';
    const REPO = 'jcgit-coding/casio-ct-s500-controller';
    const WORKFLOW = 'lacuerda-import.yml';

    function openPanel() {
        const panel = document.getElementById('lacuerda-import-panel');
        if (panel) panel.style.display = 'flex';
        const log = document.getElementById('lacuerda-import-log');
        if (log) log.textContent = '';
        const status = document.getElementById('lacuerda-import-status');
        if (status) { status.textContent = ''; status.className = ''; }
    }

    function closePanel() {
        const panel = document.getElementById('lacuerda-import-panel');
        if (panel) panel.style.display = 'none';
    }

    function log(text, cls) {
        const el = document.getElementById('lacuerda-import-log');
        if (!el) return;
        const line = document.createElement('div');
        line.textContent = text;
        if (cls) line.className = cls;
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    }

    function setStatus(text, cls) {
        const el = document.getElementById('lacuerda-import-status');
        if (!el) return;
        el.textContent = text;
        el.className = cls || '';
    }

    async function run() {
        const artist = (document.getElementById('lacuerda-input-artist') || {}).value || '';
        const displayName = (document.getElementById('lacuerda-input-displayname') || {}).value || '';
        const artistId = (document.getElementById('lacuerda-input-artistid') || {}).value || '';

        if (!artist.trim()) { alert('Ingresa el slug del artista'); return; }

        const btn = document.getElementById('lacuerda-btn-import');
        if (btn) btn.disabled = true;

        const logEl = document.getElementById('lacuerda-import-log');
        if (logEl) logEl.textContent = '';
        setStatus('Conectando…', '');

        // Detectar servidor local
        let localOk = false;
        try {
            const r = await fetch(LOCAL_URL + '/status', { signal: AbortSignal.timeout(1500) });
            if (r.ok) localOk = true;
        } catch (_) {}

        if (localOk) {
            await runLocal(artist.trim(), displayName.trim(), artistId.trim());
        } else {
            await runRemote(artist.trim(), displayName.trim(), artistId.trim());
        }

        if (btn) btn.disabled = false;
    }

    async function runLocal(artist, displayName, artistId) {
        setStatus('Usando servidor local…', '');
        try {
            const body = { artist };
            if (displayName) body.displayName = displayName;
            if (artistId) body.artistId = artistId;
            const r = await fetch(LOCAL_URL + '/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok) { const t = await r.text(); throw new Error(t); }

            setStatus('Importando…', '');
            const es = new EventSource(LOCAL_URL + '/progress');
            es.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.done) {
                    es.close();
                    setStatus('✅ Terminado — recarga la Library', 'li-ok');
                    log('─── Importación completa ───', 'li-ok');
                } else if (data.type === 'error') {
                    log('⚠ ' + data.text, 'li-err');
                } else if (data.text) {
                    log(data.text);
                }
            };
            es.onerror = () => {
                es.close();
                setStatus('⚠ Conexión SSE interrumpida', 'li-err');
            };
        } catch (err) {
            setStatus('Error: ' + err.message, 'li-err');
        }
    }

    async function runRemote(artist, displayName, artistId) {
        const pat = localStorage.getItem('github_pat');
        if (!pat) {
            setStatus('⚠ Falta token de GitHub. Guárdalo en Configuración.', 'li-err');
            return;
        }
        setStatus('Enviando a GitHub Actions…', '');
        const inputs = { artist };
        if (displayName) inputs.display_name = displayName;
        if (artistId) inputs.artist_id = artistId;
        try {
            const r = await fetch(
                `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
                {
                    method: 'POST',
                    headers: { 'Authorization': 'token ' + pat, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ref: 'main', inputs })
                }
            );
            if (r.status === 204) {
                setStatus('✅ Lanzado en GitHub — espera ~2 min y recarga la Library', 'li-ok');
                log('Importación corriendo en GitHub Actions.');
                log('Cuando termine, recarga la Library para ver las canciones.');
            } else {
                const t = await r.text();
                throw new Error(r.status + ': ' + t);
            }
        } catch (err) {
            setStatus('Error: ' + err.message, 'li-err');
        }
    }

    return { openPanel, closePanel, run };
})();
