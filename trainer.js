/**
 * CasioController Pro — Trainer Module
 * MIDI file playback via SpessaSynth + piano roll visualization.
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

    // MIDI playback state
    currentMidiBuffer: null,
    midiSequencer: null,
    _progressTimer: null,

    init() {
        this.bindEvents();
        this.loadTrainerIndex();
        this._injectPlaybackUI();
    },

    _injectPlaybackUI() {
        // Inject progress bar + status + time display into the piano roll canvas area
        const canvas = document.getElementById('trainer-piano-roll-canvas');
        if (!canvas) return;

        const placeholder = canvas.querySelector('.piano-roll-placeholder');
        if (placeholder) {
            placeholder.innerHTML = `
                <div id="trainer-midi-status" style="font-size:13px; color:var(--text-muted); margin-bottom:10px; min-height:18px;"></div>
                <div style="background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; height:6px; width:100%; max-width:480px; margin-bottom:10px;">
                    <div id="trainer-progress-bar" style="height:100%; width:0%; background:var(--accent); border-radius:6px; transition:width 0.2s;"></div>
                </div>
                <div id="trainer-time-display" style="font-size:11px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">00:00 / 00:00</div>
                <div style="font-size:12px; color:var(--text-muted);">
                    Select a piece and press <strong style="color:var(--accent);">Play ▶</strong> to start MIDI playback.<br>
                    Import a <code>.mid</code> file with the button above, or pieces with a MIDI file available will load automatically.
                </div>
            `;
            placeholder.style.textAlign = 'center';
            placeholder.style.padding = '24px 16px';
        }
    },

    bindEvents() {
        const searchInput = document.getElementById('trainer-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchQuery = searchInput.value.trim().toLowerCase();
                this.filterAndRender();
            });
        }

        document.querySelectorAll('.trainer-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.trainer-filter-btn').forEach(b => b.classList.remove('active-tab'));
                btn.classList.add('active-tab');
                this.currentFilter = btn.dataset.diff || 'all';
                this.filterAndRender();
            });
        });

        // Tempo
        const tempoVal = document.getElementById('trainer-tempo-val');
        document.getElementById('trainer-tempo-minus')?.addEventListener('click', () => {
            this.tempo = Math.max(30, this.tempo - 5);
            if (tempoVal) tempoVal.value = this.tempo;
            this._applySpeed();
        });
        document.getElementById('trainer-tempo-plus')?.addEventListener('click', () => {
            this.tempo = Math.min(280, this.tempo + 5);
            if (tempoVal) tempoVal.value = this.tempo;
            this._applySpeed();
        });
        tempoVal?.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v >= 30 && v <= 280) this.tempo = v;
            else e.target.value = this.tempo;
            this._applySpeed();
        });

        // Pitch
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

        // Transport
        const btnPlay  = document.getElementById('trainer-btn-play');
        const btnStop  = document.getElementById('trainer-btn-stop');
        const btnWait  = document.getElementById('trainer-btn-wait');

        btnPlay?.addEventListener('click', () => this.startPlayback());
        btnStop?.addEventListener('click', () => this.stopPlayback());
        btnWait?.addEventListener('click', () => {
            this.waitMode = !this.waitMode;
            btnWait.classList.toggle('active-tab', this.waitMode);
            btnWait.style.borderColor = this.waitMode ? 'var(--accent)' : '';
            btnWait.style.color       = this.waitMode ? 'var(--accent)' : '';
        });

        // Local MIDI upload
        const fileInput = document.getElementById('trainer-file-import');
        if (fileInput) fileInput.addEventListener('change', (e) => this.handleLocalMidiUpload(e));
    },

    async loadTrainerIndex() {
        try {
            const res = await fetch('trainer/index.json?v=' + Date.now());
            if (!res.ok) throw new Error("Index not found");
            const data = await res.json();
            this.allSongs = Array.isArray(data) ? data : [];
            this.filterAndRender();
        } catch(e) {
            this.allSongs = TrainerApp._embeddedCatalog;
            this.filterAndRender();
        }
    },

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
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(s => {
                const diff = (s.difficulty || '').toLowerCase();
                const f = this.currentFilter.toLowerCase();
                if (f === 'advanced') return diff.includes('advanced') || diff.includes('expert');
                return diff.includes(f);
            });
        }
        if (this.searchQuery) {
            filtered = filtered.filter(s => {
                const title  = (s.title  || '').toLowerCase();
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
            const diffCss = this._diffStyle(s.difficulty);
            return `
                <div class="trainer-song-item" data-id="${s.id}"
                    style="padding:10px 12px; border-radius:8px;
                           background:${isSelected ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.04)'};
                           border:1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.06)'};
                           cursor:pointer; transition:all .2s;
                           display:flex; justify-content:space-between; align-items:center;"
                    onclick="TrainerApp.selectSong('${s.id}')">
                    <div style="flex:1; min-width:0; padding-right:8px;">
                        <div style="font-weight:600; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.title}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.artist || "Unknown Composer"}</div>
                    </div>
                    <span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px; ${diffCss}">
                        ${s.difficulty || "MID"}
                    </span>
                </div>
            `;
        }).join('');
    },

    _diffStyle(diff) {
        const d = (diff || '').toLowerCase();
        if (d.includes('beg') || d.includes('easy'))
            return 'background:rgba(46,204,113,0.2); color:#2ecc71; border:1px solid rgba(46,204,113,0.4);';
        if (d.includes('adv') || d.includes('exp'))
            return 'background:rgba(231,76,60,0.2); color:#e74c3c; border:1px solid rgba(231,76,60,0.4);';
        return 'background:rgba(243,156,18,0.2); color:#f39c12; border:1px solid rgba(243,156,18,0.4);';
    },

    async selectSong(id) {
        const song = this.allSongs.find(s => s.id === id);
        if (!song) return;

        // Stop current playback first
        if (this.isPlaying) this.stopPlayback();
        this.currentMidiBuffer = null;
        this.currentSong = song;

        // Fetch extended metadata
        try {
            const metaRes = await fetch(`trainer/${id}/meta.json?v=` + Date.now());
            if (metaRes.ok) this.currentSong = { ...song, ...(await metaRes.json()) };
        } catch(e) {}

        // Update header UI
        const titleEl  = document.getElementById('trainer-current-song-title');
        const artistEl = document.getElementById('trainer-current-song-artist');
        const diffEl   = document.getElementById('trainer-current-song-diff');

        if (titleEl)  titleEl.innerText  = this.currentSong.title;
        if (artistEl) artistEl.innerText = this.currentSong.artist || "Classical Repertoire";
        if (diffEl) {
            diffEl.innerText   = this.currentSong.difficulty || "INTERMEDIATE";
            diffEl.style.cssText = `display:inline-block; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:4px; ${this._diffStyle(this.currentSong.difficulty)}`;
        }

        // Attempt to fetch MIDI file
        this._showMidiStatus('Looking for MIDI file…', 'info');
        try {
            const midRes = await fetch(`trainer/${id}/${id}.mid`);
            if (!midRes.ok) throw new Error('not found');
            this.currentMidiBuffer = await midRes.arrayBuffer();
            this._showMidiStatus(`MIDI ready — press ▶ Play to start.`, 'success');
            this._resetProgress();
        } catch(e) {
            this._showMidiStatus('No MIDI file for this piece. Import a .mid file with the button above.', 'warn');
            this._resetProgress();
        }

        this.filterAndRender();
    },

    handleLocalMidiUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (this.isPlaying) this.stopPlayback();

        const reader = new FileReader();
        reader.onload = (ev) => {
            this.currentMidiBuffer = ev.target.result;

            const cleanName = file.name.replace(/\.[^/.]+$/, '');
            const titleEl  = document.getElementById('trainer-current-song-title');
            const artistEl = document.getElementById('trainer-current-song-artist');
            const diffEl   = document.getElementById('trainer-current-song-diff');
            if (titleEl)  titleEl.innerText  = cleanName;
            if (artistEl) artistEl.innerText = 'Imported MIDI';
            if (diffEl) {
                diffEl.innerText   = 'CUSTOM';
                diffEl.style.cssText = 'display:inline-block; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(0,230,118,0.2); color:var(--accent); border:1px solid var(--accent);';
            }
            this.currentSong = { id: '_local', title: cleanName, artist: 'Imported MIDI' };

            this._showMidiStatus(`Loaded: ${file.name} — press ▶ Play.`, 'success');
            this._resetProgress();
        };
        reader.readAsArrayBuffer(file);
    },

    // ── MIDI Playback ──────────────────────────────────────────────────────────

    async startPlayback() {
        if (!this.currentMidiBuffer) {
            this._showMidiStatus('No MIDI file loaded. Select a piece or import a .mid file.', 'warn');
            return;
        }

        // SpessaSynth must be initialized (PC Synth toggle ON + SF2 loaded)
        const synth = window.spessaSynth;
        if (!synth) {
            this._showMidiStatus('Enable PC Synth in the Mixer tab and load an SF2 file first.', 'warn');
            return;
        }

        this._showMidiStatus('Loading…', 'info');

        try {
            const { MIDIFileSequencer, MIDI } = await import('https://esm.sh/spessasynth_lib@4.3.14');

            // Create sequencer once
            if (!this.midiSequencer) {
                this.midiSequencer = new MIDIFileSequencer(synth);
                this.midiSequencer.addOnSongEndedListener?.(() => {
                    this.isPlaying = false;
                    this._updateTransportUI();
                    this._stopProgress();
                    this._showMidiStatus('Playback complete.', 'success');
                });
            }

            const midiFile = new MIDI(this.currentMidiBuffer, this.currentSong?.title || 'piece');
            this.midiSequencer.loadNewSongList([midiFile]);

            // Apply tempo scaling: ratio relative to piece's inherent tempo
            this._applySpeed();

            this.midiSequencer.play();
            this.isPlaying = true;
            this._updateTransportUI();
            this._startProgress();
            this._showMidiStatus('Playing…', 'playing');

        } catch(err) {
            console.error('MIDI playback error:', err);
            this._showMidiStatus('Playback error: ' + err.message, 'warn');
            this.isPlaying = false;
            this._updateTransportUI();
        }
    },

    stopPlayback() {
        if (this.midiSequencer) {
            try { this.midiSequencer.stop(); } catch(e) {}
        }
        this.isPlaying = false;
        this._updateTransportUI();
        this._stopProgress();
        this._showMidiStatus('Stopped.', 'info');
    },

    _applySpeed() {
        // Adjust sequencer speed relative to UI tempo vs MIDI inherent tempo (120 BPM baseline)
        if (this.midiSequencer && this.isPlaying) {
            try { this.midiSequencer.speed = this.tempo / 120; } catch(e) {}
        }
    },

    _startProgress() {
        if (this._progressTimer) clearInterval(this._progressTimer);
        this._progressTimer = setInterval(() => {
            if (!this.midiSequencer) return;
            let pos = 0, dur = 0;
            try { pos = this.midiSequencer.currentTime || 0; dur = this.midiSequencer.duration || 0; } catch(e) {}
            if (dur > 0) {
                const pct = Math.min(100, (pos / dur) * 100);
                const bar = document.getElementById('trainer-progress-bar');
                if (bar) bar.style.width = pct + '%';
                const timeEl = document.getElementById('trainer-time-display');
                if (timeEl) {
                    const fmt = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
                    timeEl.textContent = `${fmt(pos)} / ${fmt(dur)}`;
                }
            }
        }, 200);
    },

    _stopProgress() {
        if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    },

    _resetProgress() {
        const bar = document.getElementById('trainer-progress-bar');
        if (bar) bar.style.width = '0%';
        const timeEl = document.getElementById('trainer-time-display');
        if (timeEl) timeEl.textContent = '00:00 / 00:00';
    },

    _updateTransportUI() {
        const btnPlay = document.getElementById('trainer-btn-play');
        if (btnPlay) btnPlay.style.background = this.isPlaying ? 'rgba(0,230,118,0.4)' : '';
    },

    _showMidiStatus(msg, type) {
        const el = document.getElementById('trainer-midi-status');
        if (!el) return;
        el.textContent = msg;
        const colors = { warn: '#f39c12', success: 'var(--accent)', playing: 'var(--accent)', info: 'var(--text-muted)' };
        el.style.color = colors[type] || 'var(--text-muted)';
    },
};

window.TrainerApp = TrainerApp;

document.addEventListener('DOMContentLoaded', () => {
    TrainerApp.init();
});
