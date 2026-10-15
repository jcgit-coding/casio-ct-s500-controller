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
        document.getElementById('lib-transpose-select').value = "0";
        this.renderChords(this.currentSong.originalContent);
    },

    parseRawTextToChords(text) {
        // Notación inglesa: C D E F G A B
        const EN_ROOT = '[CDEFGAB]';
        const EN_QUAL = '(?:#|b)?(?:m(?:aj)?|dim|aug|sus[24]?|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?(?:/\\d+)?';
        const EN_BASS = '(?:\\/[CDEFGAB](?:#|b)?)?';

        // Notación española/solfège: DO RE MI FA SOL LA SI (y mayúsculas mixtas como Sol, Sim, Fa#)
        const ES_ROOT = '(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)';
        // Sufijos: #/b accidental, calificador, extensión, sus[24] compuesto (para 7sus4, 9sus4), fracción (6/9)
        const ES_QUAL = '(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+(?:\\(aug\\))?|sus[24]?|(?:\\((?:add|aug)\\d*\\))|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?(?:/\\d+)?';
        const ES_BASS = '(?:\\/(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?(?:[A-G][#b]?)?)?';

        // Español PRIMERO: DO/RE/MI etc deben ganar sobre D/E/... inglés
        const CHORD_STRIP_RE = new RegExp(
            `(?:${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS})`, 'g'
        );

        const isChordLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            // Ignorar líneas que empiezan con // (marcadores de sección)
            if (trimmed.startsWith('//')) return false;
            // Strip etiquetas de sección: "Intro:", "Coro:", "Verso 1:", etc.
            const noLabel = trimmed.replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '').trim();
            if (!noLabel) return false;
            const leftover = noLabel.replace(CHORD_STRIP_RE, '').replace(/[\s\-|./\\()\[\]x]+/gi, '').replace(/\d+/g, '').trim();
            return leftover.length === 0;
        };

        // Español PRIMERO también en highlight
        const CHORD_RE = new RegExp(
            `(${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS})`, 'g'
        );

        // Separa acordes concatenados sin espacio: "FAFA" → "FA FA", "SIbFASOLm7" → "SIb FA SOLm7"
        // Encuentra matches consecutivos sin gap y les inserta espacio entre ellos
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
        const wrap = document.getElementById('cloud-song-list-container');
        if (!wrap) return;

        const clearIndex = () => { const o = document.getElementById('_alpha-index'); if (o) o.remove(); };

        if (!songs || songs.length === 0) {
            wrap.innerHTML = "<div style='color:var(--text-muted); font-size:12px; padding:8px;'>No matching songs found.</div>";
            wrap.style.paddingRight = '';
            clearIndex();
            return;
        }

        // Group by artist, sorted alphabetically
        const byArtist = {};
        songs.forEach(s => {
            const artist = s.artist || "Unknown Artist";
            if (!byArtist[artist]) byArtist[artist] = [];
            byArtist[artist].push(s);
        });
        const sortedArtists = Object.keys(byArtist).sort((a, b) => a.localeCompare(b));

        // Song list HTML with per-artist sections
        const listHTML = sortedArtists.map(artist => {
            const anchorId = 'artist-' + artist.replace(/[^a-z0-9]/gi, '_');
            const letter = artist[0].toUpperCase();
            return `<div id="${anchorId}" style="margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:8px;padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:5px;">
                    <span style="font-size:15px;font-weight:800;color:var(--accent);min-width:18px;">${letter}</span>
                    <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">${artist}</span>
                </div>
                ${byArtist[artist].map(s => {
                    const hasActive = typeof EventsMgr !== 'undefined' && EventsMgr.activeEventId;
                    return `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
                        <div style="flex:1;padding:7px 10px 7px 26px;border-radius:7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background .12s;"
                             onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'"
                             onclick="RepertoireSync.openSong('${s.id}')">
                            <span style="font-weight:600;font-size:13px;color:var(--text);">${s.title}</span>
                        </div>
                        ${hasActive ? `<div style="cursor:pointer;padding:5px 8px;border-radius:7px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:14px;line-height:1;color:var(--accent);"
                             title="Agregar al evento" onclick="EventsMgr.addSong('${s.id}')">+</div>` : ''}
                    </div>`;
                }).join('')}
            </div>`;
        }).join('');

        // Alphabet index — highlight only letters present
        const usedLetters = new Set(sortedArtists.map(a => a[0].toUpperCase()));
        const indexHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map(l => {
            const has = usedLetters.has(l);
            return `<div style="font-size:9px;font-weight:700;line-height:1.9;text-align:center;width:100%;cursor:${has ? 'pointer' : 'default'};color:${has ? 'var(--accent)' : 'rgba(255,255,255,0.15)'};"
                        ${has ? `onclick="RepertoireSync._jumpToLetter('${l}')"` : ''}>${l}</div>`;
        }).join('');

        wrap.innerHTML = listHTML;
        clearIndex();
        const idx = document.createElement('div');
        idx.id = '_alpha-index';
        idx.style.cssText = 'position:absolute;top:0;right:0;bottom:0;width:20px;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:5;pointer-events:none;';
        idx.innerHTML = indexHTML.replace(/onclick=/g, 'style="pointer-events:auto;" onclick=');
        wrap.insertBefore(idx, wrap.firstChild);
    },

    _jumpToLetter(letter) {
        const scroll = document.getElementById('cloud-song-list-container');
        if (!scroll) return;
        const groups = [...scroll.querySelectorAll('[id^="artist-"]')];
        const target = groups.find(el => {
            const letterSpan = el.querySelector('span');
            return letterSpan && letterSpan.textContent.trim() >= letter;
        });
        if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    
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
                return `<button onclick="RepertoireSync.openSong('${id}','${v.file}')"
                    style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:5px;border:1px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.15)'};
                    background:${isActive ? 'var(--accent)' : 'transparent'};color:${isActive ? '#000' : 'var(--text-muted)'};cursor:pointer;">
                    ${site(v.file)} v${i+1}
                </button>`;
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
