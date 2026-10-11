/**
 * CasioController Pro - Trainer Module
 * Interactive song catalog, difficulty filtering, DAW transport, and Piano Roll visualization.
 */

const TrainerApp = {
    allSongs: [],
    currentSong: null,
    currentFilter: 'all',
    searchQuery: '',
    isPlaying: false,
    waitMode: false,
    tempo: 120,
    pitch: 0,

    init() {
        console.log("TrainerApp Initialized.");
        this.bindEvents();
        this.loadTrainerIndex();
    },

    bindEvents() {
        // Search filter
        const searchInput = document.getElementById('trainer-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchQuery = searchInput.value.trim().toLowerCase();
                this.filterAndRender();
            });
        }

        // Difficulty filter buttons
        document.querySelectorAll('.trainer-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.trainer-filter-btn').forEach(b => b.classList.remove('active-tab'));
                btn.classList.add('active-tab');
                this.currentFilter = btn.dataset.diff || 'all';
                this.filterAndRender();
            });
        });

        // Transport: Tempo
        const tempoVal = document.getElementById('trainer-tempo-val');
        document.getElementById('trainer-tempo-minus')?.addEventListener('click', () => {
            this.tempo = Math.max(30, this.tempo - 5);
            if (tempoVal) tempoVal.value = this.tempo;
        });
        document.getElementById('trainer-tempo-plus')?.addEventListener('click', () => {
            this.tempo = Math.min(280, this.tempo + 5);
            if (tempoVal) tempoVal.value = this.tempo;
        });
        tempoVal?.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v >= 30 && v <= 280) this.tempo = v;
            else e.target.value = this.tempo;
        });

        // Transport: Pitch / Transpose
        const pitchVal = document.getElementById('trainer-pitch-val');
        document.getElementById('trainer-pitch-minus')?.addEventListener('click', () => {
            this.pitch = Math.max(-12, this.pitch - 1);
            if (pitchVal) pitchVal.value = this.pitch;
        });
        document.getElementById('trainer-pitch-plus')?.addEventListener('click', () => {
            this.pitch = Math.min(12, this.pitch + 1);
            if (pitchVal) pitchVal.value = this.pitch;
        });
        pitchVal?.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v >= -12 && v <= 12) this.pitch = v;
            else e.target.value = this.pitch;
        });

        // Transport: Play / Stop / Wait
        const btnPlay = document.getElementById('trainer-btn-play');
        const btnStop = document.getElementById('trainer-btn-stop');
        const btnWait = document.getElementById('trainer-btn-wait');

        btnPlay?.addEventListener('click', () => {
            if (!this.currentSong) {
                alert("Please select a piece from the catalog first.");
                return;
            }
            this.isPlaying = true;
            btnPlay.style.background = 'rgba(0, 230, 118, 0.4)';
            console.log("Trainer playback started for:", this.currentSong.title);
        });

        btnStop?.addEventListener('click', () => {
            this.isPlaying = false;
            if (btnPlay) btnPlay.style.background = '';
            console.log("Trainer playback stopped.");
        });

        btnWait?.addEventListener('click', () => {
            this.waitMode = !this.waitMode;
            btnWait.classList.toggle('active-tab', this.waitMode);
            btnWait.style.borderColor = this.waitMode ? 'var(--accent)' : '';
            btnWait.style.color = this.waitMode ? 'var(--accent)' : '';
        });

        // Local file upload
        const fileInput = document.getElementById('trainer-file-import');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleLocalMidiUpload(e));
        }
    },

    async loadTrainerIndex() {
        const container = document.getElementById('trainer-song-list-container');
        try {
            const res = await fetch('trainer/index.json?v=' + Date.now());
            if (!res.ok) throw new Error("Index file not found");
            const data = await res.json();
            this.allSongs = Array.isArray(data) ? data : [];
            this.filterAndRender();
        } catch(e) {
            console.warn("Fetch failed, using embedded catalog:", e.message);
            this.allSongs = TrainerApp._embeddedCatalog;
            this.filterAndRender();
        }
    },

    // Embedded fallback catalog — used when fetch fails (e.g. file:// protocol)
    _embeddedCatalog: [
        { id: "bach_prelude_c",        title: "Prelude in C Major",                   artist: "J.S. Bach",          difficulty: "Beginner" },
        { id: "beethoven_fur_elise",   title: "Für Elise",                            artist: "L. van Beethoven",   difficulty: "Beginner" },
        { id: "satie_gymnopedie_1",    title: "Gymnopédie No. 1",                     artist: "Erik Satie",         difficulty: "Beginner" },
        { id: "mozart_rondo",          title: "Rondo Alla Turca",                     artist: "W.A. Mozart",        difficulty: "Intermediate" },
        { id: "mozart_lacrimosa",      title: "Lacrimosa (Requiem)",                  artist: "W.A. Mozart",        difficulty: "Intermediate" },
        { id: "beethoven_moonlight",   title: "Moonlight Sonata",                     artist: "L. van Beethoven",   difficulty: "Intermediate" },
        { id: "zimmer_interstellar",   title: "Interstellar (Main Theme)",            artist: "Hans Zimmer",        difficulty: "Intermediate" },
        { id: "tiersen_amelie",        title: "Comptine d'un autre été",              artist: "Yann Tiersen",       difficulty: "Intermediate" },
        { id: "schubert_ave_maria",    title: "Ave Maria",                            artist: "Franz Schubert",     difficulty: "Intermediate" },
        { id: "chopin_nocturne_9_2",   title: "Nocturne Op. 9 No. 2",                artist: "Frederic Chopin",    difficulty: "Advanced" },
        { id: "barber_adagio",         title: "Adagio for Strings",                   artist: "Samuel Barber",      difficulty: "Advanced" },
        { id: "puccini_nessun_dorma",  title: "Nessun Dorma",                         artist: "Giacomo Puccini",    difficulty: "Advanced" },
        { id: "debussy_clair_de_lune", title: "Clair de Lune",                        artist: "Claude Debussy",     difficulty: "Advanced" },
        { id: "goransson_oppenheimer", title: "Can You Hear The Music (Oppenheimer)", artist: "Ludwig Göransson",   difficulty: "Advanced" },
        { id: "chopin_fantaisie",      title: "Fantaisie-Impromptu",                  artist: "Frederic Chopin",    difficulty: "Expert" },
    ],

    filterAndRender() {
        let filtered = this.allSongs;

        // Difficulty filter — "advanced" also includes "expert" level pieces
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(s => {
                const diff = (s.difficulty || '').toLowerCase();
                const f = this.currentFilter.toLowerCase();
                if (f === 'advanced') return diff.includes('advanced') || diff.includes('expert');
                return diff.includes(f);
            });
        }

        // Search query filter
        if (this.searchQuery) {
            filtered = filtered.filter(s => {
                const title = (s.title || '').toLowerCase();
                const artist = (s.artist || '').toLowerCase();
                return title.includes(this.searchQuery) || artist.includes(this.searchQuery);
            });
        }

        this.renderSongList(filtered);
    },

    renderSongList(songs) {
        const container = document.getElementById('trainer-song-list-container');
        if (!container) return;

        if (!songs || songs.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:12px; text-align:center;">No matching pieces found.</div>';
            return;
        }

        container.innerHTML = songs.map(s => {
            const isSelected = this.currentSong && this.currentSong.id === s.id;
            const diffClass = this.getDifficultyColor(s.difficulty);
            return `
                <div class="trainer-song-item" data-id="${s.id}" style="padding:10px 12px; border-radius:8px; background:${isSelected ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.06)'}; cursor:pointer; transition:all .2s; display:flex; justify-content:space-between; align-items:center;" onclick="TrainerApp.selectSong('${s.id}')">
                    <div style="flex:1; min-width:0; padding-right:8px;">
                        <div style="font-weight:600; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.title}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.artist || "Unknown Composer"}</div>
                    </div>
                    <span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px; ${diffClass}">
                        ${s.difficulty || "MID"}
                    </span>
                </div>
            `;
        }).join('');
    },

    getDifficultyColor(diff) {
        const d = (diff || '').toLowerCase();
        if (d.includes('beg') || d.includes('easy')) {
            return 'background:rgba(46, 204, 113, 0.2); color:#2ecc71; border:1px solid rgba(46, 204, 113, 0.4);';
        } else if (d.includes('adv') || d.includes('exp')) {
            return 'background:rgba(231, 76, 60, 0.2); color:#e74c3c; border:1px solid rgba(231, 76, 60, 0.4);';
        } else {
            return 'background:rgba(243, 156, 18, 0.2); color:#f39c12; border:1px solid rgba(243, 156, 18, 0.4);';
        }
    },

    async selectSong(id) {
        const song = this.allSongs.find(s => s.id === id);
        if (!song) return;

        this.currentSong = song;

        // Try to fetch extended metadata
        try {
            const metaRes = await fetch(`trainer/${id}/meta.json?v=` + Date.now());
            if (metaRes.ok) {
                const meta = await metaRes.json();
                this.currentSong = { ...song, ...meta };
            }
        } catch(e) {
            console.warn("No extra meta found for song:", id);
        }

        // Update UI Header
        const titleEl = document.getElementById('trainer-current-song-title');
        const artistEl = document.getElementById('trainer-current-song-artist');
        const diffEl = document.getElementById('trainer-current-song-diff');

        if (titleEl) titleEl.innerText = this.currentSong.title;
        if (artistEl) artistEl.innerText = this.currentSong.artist || "Classical Repertoire";
        if (diffEl) {
            diffEl.innerText = this.currentSong.difficulty || "INTERMEDIATE";
            diffEl.style.display = 'inline-block';
            diffEl.style.cssText = `display:inline-block; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:4px; ${this.getDifficultyColor(this.currentSong.difficulty)}`;
        }

        // Update visualizer canvas placeholder
        const canvasPlaceholder = document.querySelector('#trainer-piano-roll-canvas .piano-roll-placeholder');
        if (canvasPlaceholder) {
            canvasPlaceholder.innerHTML = `<strong>Ready to Practice:</strong> ${this.currentSong.title} &bull; Click <em>Play</em> to begin Piano Roll.`;
            canvasPlaceholder.style.color = 'var(--accent)';
        }

        // Re-render list to reflect selection styling
        this.filterAndRender();
    },

    handleLocalMidiUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const titleEl = document.getElementById('trainer-current-song-title');
            const artistEl = document.getElementById('trainer-current-song-artist');
            const diffEl = document.getElementById('trainer-current-song-diff');

            const cleanName = file.name.replace(/\.[^/.]+$/, "");
            if (titleEl) titleEl.innerText = cleanName;
            if (artistEl) artistEl.innerText = "Imported Local MIDI";
            if (diffEl) {
                diffEl.innerText = "CUSTOM";
                diffEl.style.display = 'inline-block';
                diffEl.style.cssText = 'display:inline-block; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(0, 230, 118, 0.2); color:var(--accent); border:1px solid var(--accent);';
            }

            const canvasPlaceholder = document.querySelector('#trainer-piano-roll-canvas .piano-roll-placeholder');
            if (canvasPlaceholder) {
                canvasPlaceholder.innerHTML = `<strong>Loaded Local MIDI:</strong> ${file.name} &bull; Ready for Practice.`;
                canvasPlaceholder.style.color = 'var(--accent)';
            }
        };
        reader.readAsArrayBuffer(file);
    }
};

window.TrainerApp = TrainerApp;

document.addEventListener('DOMContentLoaded', () => {
    TrainerApp.init();
});
