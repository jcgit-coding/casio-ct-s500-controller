// ======================================================================
//  MIDI state
// ======================================================================
let midiAccess  = null;
let midiInput   = null;
let midiOutput  = null;

// PC Synth active notes. Sustain pedal (CC64) is handled natively by SpessaSynth per channel.
const pcActiveNotes = {};     // "ch:note" -> { ch, shiftedNote }
let pcSynthEnabled = false;  // OFF by default -- user must toggle on
let mctrlEnabled = false;    // MIDI Ctrl ON/OFF -- off by default

// App SUSTAIN button emulates the Casio panel SUSTAIN (long release, notes fade out
// naturally) via CC72 Release Time -- NOT a damper hold (CC64 is left to the physical pedal).
const RELEASE_NEUTRAL = 64;
// Taps used to re-send CC72 after ANY burst of CCs. The CT-S500 resets its
// controllers (on every channel) after a large burst, and over Bluetooth the
// outgoing queue can still be draining hundreds of ms after the app finished
// writing -- hence the deliberately late last tap.
const SUSTAIN_TAPS = [150, 400, 700, 1300];
// Note: CAT_SUS_RELEASE and susRelease(part) are defined in eq.js (loaded before app.js)

// Per-category CC72 neutral: these instruments have long natural decay;
// sending 64 after a tone load would shorten it below the preset's intent.
const CAT_RELEASE_NEUTRAL = {
    'SYNTH-PAD':        82,
    'CHOIR':            78,
    'STRING ENSEMBLE':  75,
    'SOLO STRINGS':     72,
};
function releaseNeutral(part) {
    return CAT_RELEASE_NEUTRAL[activeCategories[part]] ?? RELEASE_NEUTRAL;
}
// CCs that represent live performance state -- never save to toneEQ, never reset on tone/env change.
// CC1=Modulation, CC65=Portamento SW, CC66=Sostenuto, CC67=Soft Pedal
const PERFORMANCE_CCS = new Set([1, 65, 66, 67]);

function pcNoteOff(ch, note) {
    const info = pcActiveNotes[ch + ':' + note];
    if (!info) return;
    delete pcActiveNotes[ch + ':' + note];
    window.pcSynth.noteOff(info.ch, info.shiftedNote);
}

// 128 GM instruments organised by category for the instrument picker
const GM_INSTRUMENTS = [
    { name: 'Piano', programs: [
        [0,'Grand Piano'],[1,'Bright Piano'],[2,'Electric Grand'],[3,'Honky-tonk'],
        [4,'Electric Piano 1'],[5,'Electric Piano 2'],[6,'Harpsichord'],[7,'Clavinet'] ]},
    { name: 'Chrom. Percussion', programs: [
        [8,'Celesta'],[9,'Glockenspiel'],[10,'Music Box'],[11,'Vibraphone'],
        [12,'Marimba'],[13,'Xylophone'],[14,'Campanas'],[15,'Dulcimer'] ]},
    { name: 'Organ', programs: [
        [16,'Organ Drawbar'],[17,'Organ Percusivo'],[18,'Rock Organ'],[19,'Organ Iglesia'],
        [20,'Reed Organ'],[21,'Accordion'],[22,'Harmonica'],[23,'Tango Accordion'] ]},
    { name: 'Guitarra', programs: [
        [24,'Guitarra Nylon'],[25,'Guitarra Steel'],[26,'Jazz Guitar'],[27,'Clean Guitar'],
        [28,'Muted Guitar'],[29,'Overdriven'],[30,'Distortion'],[31,'Guitar Harmonics'] ]},
    { name: 'Bajo', programs: [
        [32,'Acoustic Bass'],[33,'Elec. Bass Finger'],[34,'Elec. Bass Pick'],[35,'Fretless Bass'],
        [36,'Slap Bass 1'],[37,'Slap Bass 2'],[38,'Synth Bass 1'],[39,'Synth Bass 2'] ]},
    { name: 'Cuerdas', programs: [
        [40,'Violin'],[41,'Viola'],[42,'Cello'],[43,'Contrabajo'],
        [44,'Tremolo Strings'],[45,'Pizzicato Strings'],[46,'Arpa'],[47,'Timbal'] ]},
    { name: 'Ensemble', programs: [
        [48,'String Ensemble 1'],[49,'String Ensemble 2'],[50,'Synth Strings 1'],[51,'Synth Strings 2'],
        [52,'Choir Aahs'],[53,'Voice Oohs'],[54,'Synth Voice'],[55,'Orchestra Hit'] ]},
    { name: 'Metales', programs: [
        [56,'Trompeta'],[57,'Trombone'],[58,'Tuba'],[59,'Muted Trumpet'],
        [60,'French Horn'],[61,'Brass Section'],[62,'Synth Brass 1'],[63,'Synth Brass 2'] ]},
    { name: 'Reed', programs: [
        [64,'Soprano Sax'],[65,'Alto Sax'],[66,'Tenor Sax'],[67,'Baritone Sax'],
        [68,'Oboe'],[69,'English Horn'],[70,'Fagot'],[71,'Clarinete'] ]},
    { name: 'Viento', programs: [
        [72,'Piccolo'],[73,'Flauta'],[74,'Recorder'],[75,'Pan Flute'],
        [76,'Blown Bottle'],[77,'Shakuhachi'],[78,'Whistle'],[79,'Ocarina'] ]},
    { name: 'Synth Lead', programs: [
        [80,'Lead Square'],[81,'Lead Sawtooth'],[82,'Lead Calliope'],[83,'Lead Chiff'],
        [84,'Lead Charang'],[85,'Lead Voice'],[86,'Lead Fifths'],[87,'Lead Bass+Lead'] ]},
    { name: 'Synth Pad', programs: [
        [88,'Pad New Age'],[89,'Pad Warm'],[90,'Pad Polysynth'],[91,'Pad Choir'],
        [92,'Pad Bowed'],[93,'Pad Metallic'],[94,'Pad Halo'],[95,'Pad Sweep'] ]},
    { name: 'Synth FX', programs: [
        [96,'FX Rain'],[97,'FX Soundtrack'],[98,'FX Crystal'],[99,'FX Atmosphere'],
        [100,'FX Brightness'],[101,'FX Goblins'],[102,'FX Echoes'],[103,'FX Sci-fi'] ]},
    { name: 'Ethnic', programs: [
        [104,'Sitar'],[105,'Banjo'],[106,'Shamisen'],[107,'Koto'],
        [108,'Kalimba'],[109,'Bag Pipe'],[110,'Fiddle'],[111,'Shanai'] ]},
    { name: 'Percusivo', programs: [
        [112,'Tinkle Bell'],[113,'Agogo'],[114,'Steel Drums'],[115,'Woodblock'],
        [116,'Taiko'],[117,'Melodic Tom'],[118,'Synth Drum'],[119,'Rev. Cymbal'] ]},
    { name: 'Efectos', programs: [
        [120,'Guitar Noise'],[121,'Breath Noise'],[122,'Seashore'],[123,'Bird Tweet'],
        [124,'Telephone'],[125,'Helicopter'],[126,'Applause'],[127,'Gunshot'] ]},
];

// Per-part selected GM program for PC synth (independent of keyboard tone)
const pcPartProgram = { U1: 0, U2: 0, L: 0 };

function buildGMSelectors() {
    ['U1','U2','L'].forEach(part => {
        const sel = document.getElementById('sf2-prog-' + part);
        if (!sel) return;
        GM_INSTRUMENTS.forEach(cat => {
            const grp = document.createElement('optgroup');
            grp.label = cat.name;
            cat.programs.forEach(([prog, name]) => {
                const opt = document.createElement('option');
                opt.value = prog;
                opt.textContent = prog + ' - ' + name;
                if (prog === pcPartProgram[part]) opt.selected = true;
                grp.appendChild(opt);
            });
            sel.appendChild(grp);
        });
        sel.addEventListener('change', () => {
            const prog = parseInt(sel.value);
            pcPartProgram[part] = prog;
            if (window.pcSynth && window.pcSynth.programChange) {
                window.pcSynth.programChange(CHANNEL[part], prog);
            }
        });
    });
}

// Global transpose: -12 to +12 semitones, sent to all 3 channels
let globalTranspose = 0;
let globalOctave = -1;
const pendingBank = { U1: 1, U2: 28, L: 34 };
const pendingLSB  = { U1: 0, U2: 0, L: 0 };

// Per-part state (octave and sustain are independent per channel)
const tuning = {
    U1: { sus: false, oct: 0 },
    U2: { sus: false, oct: 0 },
    L:  { sus: false, oct: 0 }
};

// MIDI channel per part
const CHANNEL = { U1: 0, U2: 1, L: 2 };

// Last CC64 value received from the Casio per part (physical sustain button/pedal).
// Tracked so bursts that reset CT-S500 controllers can re-assert it.
const physCC64 = { U1: 0, U2: 0, L: 0 };




// In-memory EQ values per part
const eqState = { U1: {}, U2: {}, L: {} };

// Per-part tone search refs -- used by loadAppState / loadPreset / onMIDIMessage
window.toneSearch = {};

// Tone applied to each part ({ id, bank, lsb, program, text }). Source of truth for save/presets/push --
const currentTone = { U1: null, U2: null, L: null };

// Per-part cancellable timers -- shared by scheduleProfile and scheduleSustainResync.
const _pendingProfile = { U1: [], U2: [], L: [] };
const _pendingSustain = { U1: [], U2: [], L: [] };

// Per-tone+environment EQ overrides: toneEQ[toneId][environment] = { cc: val, ... }
// Saved to localStorage 'casioToneEQ'. When set, overrides the category profile.
let toneEQ = {};

function saveToneEQ() {
    try { localStorage.setItem('casioToneEQ', JSON.stringify(toneEQ)); } catch(e) {}
}
function loadToneEQ() {
    try {
        toneEQ = JSON.parse(localStorage.getItem('casioToneEQ') || '{}');
        // Purge any CC7 (Volume) values saved by older versions -- volume is now always
        // governed by Part Mix Rules and must never be locked per-tone.
        for (const id of Object.keys(toneEQ)) {
            for (const env of Object.keys(toneEQ[id])) {
                delete toneEQ[id][env][7];  delete toneEQ[id][env]['7'];
                delete toneEQ[id][env][72]; delete toneEQ[id][env]['72'];
            }
        }
    } catch(e) { toneEQ = {}; }
}

// Save current eqState for the active part's tone+environment
function saveToneEQForPart(part) {
    const tone = currentTone[part];
    if (!tone) return;
    const id = tone.id;
    if (!toneEQ[id]) toneEQ[id] = {};
    const profile = Object.assign({}, eqState[part]);
    // CC7 (Volume) is per-part mix balance -- never persist in toneEQ
    delete profile[7]; delete profile['7'];
    // CC72 (Release/Sustain) is controlled separately via the SUSTAIN button -- never persist
    delete profile[72]; delete profile['72'];
    // Performance CCs (modulation, pedal switches) are live state -- never persist
    PERFORMANCE_CCS.forEach(cc => { delete profile[cc]; delete profile[String(cc)]; });
    toneEQ[id][currentEnv] = profile;
    saveToneEQ();
}

// Delete saved profile for a tone+environment (reset to category default)
function resetToneEQForPart(part) {
    const tone = currentTone[part];
    if (!tone) return;
    const id = tone.id;
    if (toneEQ[id]) { delete toneEQ[id][currentEnv]; if (!Object.keys(toneEQ[id]).length) delete toneEQ[id]; }
    saveToneEQ();
}

// Which part the EQ panel is editing
let activePart = 'U1';
// MIDI connection state
let midiInitAttempted = false;
let _midiConnectTimer = null;
let _lastMidiOutputId = null;
// Guard: until this timestamp, the EQ fader 'input' events are ignored.
// Some mobile browsers (Android Chrome) fire 'input' on programmatic .value
// changes -- and those events can arrive on a later task, after the synchronous
// guard would already have been cleared. Windowed guard covers both.
// Cost of the window: a genuine user drag within ~100 ms of a programmatic
// write is swallowed (the fader still shows the value, MIDI is re-sent by the
// next change / resync).
let _eqSwitchingUntil = 0;
function isEqProgrammatic() { return Date.now() < _eqSwitchingUntil; }
// 250ms: Android Chrome fires 'input' asynchronously after programmatic fader.value writes;
// 100ms was too short and let spurious ~17-CC bursts through, resetting CC72 on all channels.
function beginEqProgrammatic(ms = 250) { _eqSwitchingUntil = Date.now() + ms; }

// ======================================================================
//  MIDI INIT -- always-on with auto-reconnect
// ======================================================================
function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        setStatus("Web MIDI not supported (Use Chrome or Edge)", false);
        return;
    }
    setStatus("Connecting...", false);

    function onAccess(access) {
        midiAccess = access;
        // Debounce: statechange fires for every port open/close; batch into one reconnect
        access.onstatechange = () => {
            clearTimeout(_midiConnectTimer);
            _midiConnectTimer = setTimeout(() => reconnectMIDI(), 300);
        };
        reconnectMIDI();
    }

    function onError(err) {
        console.error('[MIDI] error:', err.name, err.message);
        setStatus("MIDI blocked: Click 'Reconnect' or grant permissions in Chrome", false);
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'block';
    }

    // Use sysex: false to avoid Chrome permission prompt/blocking on load
    navigator.requestMIDIAccess({ sysex: false }).then(onAccess, onError);
}

function reconnectMIDI() {
    // Detach old input handler first -- prevents ghost messages and PC Synth duplicate notes
    if (midiInput) { midiInput.onmidimessage = null; }
    midiInput  = null;
    midiOutput = null;

    const allOuts = [...midiAccess.outputs.values()];
    const allIns  = [...midiAccess.inputs.values()];
    console.log('[MIDI] outputs:', allOuts.map(o => o.name + ' state=' + o.state + ' conn=' + o.connection));
    console.log('[MIDI] inputs:', allIns.map(i => i.name + ' state=' + i.state + ' conn=' + i.connection));

    // Pick the best port by priority: CASIO/CT-S > Bluetooth adapter > USB > generic MIDI > any.
    const portScore = p => {
        const n = p.name.toUpperCase();
        if (n.includes("CASIO") || n.includes("CT-S")) return 5;
        if (n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH")) return 4;
        if (n.includes("LOOPMIDI") || n.includes("RTPMIDI") || n.includes("VIRTUAL")) return 1;
        if (n.includes("USB")) return 3;
        if (n.includes("MIDI")) return 2;
        return 1;
    };
    const pickPort = ports => ports
        .filter(p => p.state === 'connected' && !p.name.toUpperCase().includes("THROUGH"))
        .reduce((best, p) => (!best || portScore(p) > portScore(best)) ? p : best, null);
    midiOutput = pickPort(allOuts);
    midiInput  = pickPort(allIns);
    console.log('[MIDI] selected output:', midiOutput?.name, '| selected input:', midiInput?.name);

    if (midiOutput) {
        midiOutput.open().catch(console.error);
    }
    if (midiInput) {
        midiInput.onmidimessage = onMIDIMessage;
    }

    if (midiOutput || midiInput) {
        const name = (midiOutput || midiInput).name;
        const label = midiOutput && midiInput ? "✓ " + name
                    : midiOutput ? "✓ " + name + " (output only)"
                    : "✓ " + name + " (input only)";
        setStatus(label, !!(midiOutput || midiInput));
        document.getElementById("connectBtn").innerText = "Reconnect";
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'none';
        if (midiOutput) {
            _lastMidiOutputId = midiOutput.id;
            pushAllToKeyboard(false);
        }
    } else {
        const outs = [...midiAccess.outputs.values()].filter(o => o.state === 'connected').length;
        const ins  = [...midiAccess.inputs.values()].filter(i => i.state === 'connected').length;
        setStatus("No MIDI devices (" + ins + " in / " + outs + " out)", false);
        document.getElementById("connectBtn").innerText = "Connect";
    }
}

function setStatus(text, connected) {
    document.getElementById("statusText").innerText = text;
    document.getElementById("statusIndicator").classList.toggle("connected", connected);
}

// ======================================================================
//  INCOMING MIDI (bidireccional)
// ======================================================================
function onMIDIMessage(e) {
    const [status, d1, d2] = e.data;

    if (pcSynthEnabled && window.sf2Ready && window.pcSynth) {
        const cmd    = status & 0xF0;
        const noteCh = status & 0x0F;
        if (cmd === 0x90) {
            if (d2 > 0) {
                const shift = globalTranspose + globalOctave * 12;
                const shiftedNote = Math.max(0, Math.min(127, d1 + shift));
                pcActiveNotes[noteCh + ':' + d1] = { ch: noteCh, shiftedNote: shiftedNote };
                if (window.pcSynth.synth?.ctx?.state === 'suspended') window.pcSynth.synth.ctx.resume();
                window.pcSynth.noteOn(noteCh, shiftedNote, d2);
            } else {
                pcNoteOff(noteCh, d1);
            }
        } else if (cmd === 0x80) {
            pcNoteOff(noteCh, d1);
        } else if (cmd === 0xB0 && d1 === 64) {
            Object.values(CHANNEL).forEach(ch => window.pcSynth.applyCC(64, d2, ch));
        }
    }

    if (status >= 0xB0 && status <= 0xBF) {
        const ch   = status & 0x0F;
        const part = Object.keys(CHANNEL).find(k => CHANNEL[k] === ch);
        if (!part) return;
        if (d1 === 7 && window.pcSynth?.applyCC) window.pcSynth.applyCC(7, d2, ch);
        if (d1 === 0) { pendingBank[part] = d2; }
        if (d1 === 32) { pendingLSB[part] = d2; }
        if (d1 === 64) { physCC64[part] = d2; }
        if (d1 !== 64 && d1 !== 72 && d1 !== 0 && d1 !== 32) eqState[part][d1] = d2;
        if (part === activePart) {
            const ctrl = EQ_CONTROLS.find(c => c.cc === d1);
            if (ctrl) {
                if (ctrl.type === 'switch') {
                    document.querySelectorAll(`.eq-switch[data-cc="${d1}"]`).forEach(btn => {
                        btn.innerText = d2 > 63 ? 'ON' : 'OFF';
                        btn.classList.toggle('sus-on', d2 > 63);
                    });
                } else {
                    beginEqProgrammatic();
                    document.querySelectorAll(`.eq-fader[data-cc="${d1}"]`).forEach(f => { f.value = d2; });
                }
                document.querySelectorAll(`.eq-val-${d1}`).forEach(valEl => {
                    valEl.innerText = ctrl.type === 'switch' ? (d2 > 63 ? 'ON' : 'OFF') : formatVal(ctrl.label, d2);
                });
            }
        }
    }

    if (status >= 0xC0 && status <= 0xCF) {
        const ch = status & 0x0F;
        const part = Object.keys(CHANNEL).find(k => CHANNEL[k] === ch);
        if (!part) return;
        if (window.pcSynth && window.pcSynth.programChange) {
            window.pcSynth.programChange(ch, d1);
            const sel = document.getElementById('sf2-prog-' + part);
            if (sel) sel.value = d1;
            pcPartProgram[part] = d1;
        }
        const pc = d1;
        const bank = pendingBank[part] ?? 0;
        let pcOpt = selectToneInList(part, d => d.bank === bank && d.program === pc);
        if (!pcOpt) {
            // Fallback if Bank MSB was not sent prior to PC
            pcOpt = selectToneInList(part, d => d.program === pc);
        }
        if (pcOpt) {
            // Automatically switch active UI view to this part so the screen reflects what you're playing on the Casio
            activePart = part;
            document.querySelectorAll('.btn-eq').forEach(b => b.classList.toggle('active-eq', b.dataset.part === activePart));
            document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active-track'));
            const card = document.getElementById('card-' + part);
            if (card) card.classList.add('active-track');

            const pcCat = pcOpt.parentElement?.tagName === 'OPTGROUP'
                ? pcOpt.parentElement.label
                : (activeCategories[part] || 'PIANO');
            scheduleProfile(part, pcCat);
        } else if (tuning[part].sus) {
            scheduleSustainResync(part, SUSTAIN_TAPS);
        }
    }
}

// ======================================================================
//  INIT
// ======================================================================

function initApp() {
    buildEQ();          // also seeds eqState defaults
    initToneSearch();
    initQuickControls();
    initGlobalTuning();
    initPresets();
    initArranger();

    // Load saved settings if any, then start auto-save
    // First run (no saved state): apply the category profile of the default tones
    loadToneEQ();
    if (!loadAppState()) ['U1','U2','L'].forEach(part => applySmartProfile(part));
    setInterval(saveAppState, 1000);

    // On desktop Chrome, MIDI doesn't require a user gesture -- init right away.
    // On Android Chrome, requestMIDIAccess needs a user gesture to show the permission dialog.
    const isAndroid = /android/i.test(navigator.userAgent);
    if (!isAndroid) {
        midiInitAttempted = true;
        initMIDI();
    }
    document.addEventListener("click", () => {
        if (!midiInitAttempted) { midiInitAttempted = true; initMIDI(); }
        // Pre-init AudioContext on first gesture so PC synth is ready immediately
        if (window.pcSynth && typeof window.pcSynth._audio === 'function') window.pcSynth._audio();
    }, { once: true });

    const handleConnectClick = () => {
        midiInitAttempted = true;
        if (midiAccess) reconnectMIDI(); else initMIDI();
    };
    document.getElementById("connectBtn")?.addEventListener("click", handleConnectClick);
    document.getElementById("btnConnectMidi")?.addEventListener("click", handleConnectClick);

    // MIDI Panic Button
    document.getElementById("btnPanic")?.addEventListener("click", () => {
        ['U1', 'U2', 'L'].forEach(part => {
            const ch = CHANNEL[part];
            if (midiOutput) {
                midiOutput.send([0xB0 | ch, 120, 0]); // All Sound Off
                midiOutput.send([0xB0 | ch, 123, 0]); // All Notes Off
                midiOutput.send([0xB0 | ch, 64,  0]); // Damper Off
            }
        });
        if (window.pcSynth) {
            for (let ch = 0; ch < 16; ch++) {
                try { window.pcSynth.allNotesOff(ch); } catch(e) {}
            }
        }
    });

    // EQ Part Target Logic
    document.querySelectorAll('.btn-eq').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchEQ(e.currentTarget.dataset.part);
            const eqEl = document.querySelector('.eq-panel');
            if (eqEl) window.scrollTo({ top: eqEl.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
        });
    });

    // EQ Badge Target Logic (Cycle U1 -> U2 -> L -> U1)
    document.getElementById('eqTargetBadge')?.addEventListener('click', () => {
        const parts = ['U1', 'U2', 'L'];
        let nextIdx = (parts.indexOf(activePart) + 1) % parts.length;
        switchEQ(parts[nextIdx]);
    });

    // EQ Reset Button
    document.getElementById('btnResetEQ')?.addEventListener('click', () => resetEQ());
    document.getElementById('btnScrollEQ')?.addEventListener('click', () => {
        const card = document.getElementById('card-U1');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // View Navigation Logic
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Update active tab
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Show corresponding view
            const targetId = e.currentTarget.dataset.target;
            document.querySelectorAll('.app-view').forEach(v => {
                v.classList.toggle('active', v.id === targetId);
            });
        });
    });

    // Theme Toggle Logic
    const envSel = document.getElementById('envSelector');
    if (envSel) {
        // Load saved env — migrate legacy Spanish keys to English
        const _envMigrate = { 'Estudio': 'Studio', 'Vivo': 'Live', 'Sala': 'Hall' };
        let _savedEnv = localStorage.getItem('casioEnv');
        if (_savedEnv) {
            if (_envMigrate[_savedEnv]) { _savedEnv = _envMigrate[_savedEnv]; localStorage.setItem('casioEnv', _savedEnv); }
            currentEnv = _savedEnv;
            envSel.value = currentEnv;
        }
        envSel.addEventListener('change', (e) => {
            currentEnv = e.target.value;
            localStorage.setItem('casioEnv', currentEnv);
            // Reapply profiles to all parts (applySmartProfile already sends the CCs --
            // no pushAllToKeyboard here: it would re-send Program Changes and force the tones)
            ['U1', 'U2', 'L'].forEach(part => {
                if (activeCategories[part]) applySmartProfile(part, activeCategories[part]);
            });
            // Re-send CC72 on every part -- a ~57-CC burst from 3xapplySmartProfile
            // triggers the CT-S500 hardware controller reset multiple times.
            resyncAllSustain();
            switchEQ(activePart);
        });
    }

    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
        const savedTheme = localStorage.getItem('casioTheme') || 'dark';
        if (savedTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            btnThemeToggle.innerHTML = '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">dark_mode</span>';
        }

        btnThemeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('casioTheme', next);
            btnThemeToggle.innerHTML = '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:middle;">' + (next === 'light' ? 'dark_mode' : 'light_mode') + '</span>';
        });
    }
}

// ======================================================================
//  TONE SEARCH (filterable select)
// ======================================================================

function scheduleSustainResync(part, delays) {
    // Do NOT cancel existing taps — a new burst may arrive while previous taps are still
    // pending (e.g. rapid tone changes). Accumulating ensures CC72 survives every burst.
    delays.forEach(d => {
        const id = setTimeout(() => {
            _pendingSustain[part] = _pendingSustain[part].filter(t => t !== id);
            if (tuning[part].sus) sendCC(part, 72, susRelease(part));
            // Re-assert physical CC64 so a CT-S500 controller reset doesn't clear it
            if (physCC64[part] > 0) sendCC(part, 64, physCC64[part]);
        }, d);
        _pendingSustain[part].push(id);
    });
}

function resyncAllSustain() {
    ['U1', 'U2', 'L'].forEach(p => {
        const needsResync = tuning[p].sus || physCC64[p] > 0;
        if (needsResync) scheduleSustainResync(p, SUSTAIN_TAPS);
    });
}

function scheduleProfile(part, catName) {
    _pendingProfile[part].forEach(clearTimeout);
    _pendingProfile[part] = [
        setTimeout(() => {
            applySmartProfile(part, catName);
            if (activePart === part) switchEQ(part);
            // Resync AFTER the burst so taps arrive after the CT-S500 hardware reset,
            // not racing with it. Calling before the burst had the first tap (150ms)
            // compete with applySmartProfile -- undefined ordering, unreliable.
            resyncAllSustain();
        }, 150),
    ];
}


function initToneSearch() {
    if (typeof db === 'undefined') return;

    const allTones = [];
    db.forEach(cat => {
        cat.tones.forEach(tone => {
            allTones.push({
                id: tone.id, name: tone.name,
                category: cat.category,
                bank: tone.bank, lsb: tone.lsb, program: tone.program,
                label: `${tone.id}. ${tone.name}`
            });
        });
    });

    ['U1','U2','L'].forEach(part => {
        const searchEl = document.getElementById('search-' + part);
        const listEl   = document.getElementById('list-' + part);

        function populateList(tones) {
            listEl.innerHTML = '';
            const grouped = {};
            tones.forEach(t => {
                if (!grouped[t.category]) grouped[t.category] = [];
                grouped[t.category].push(t);
            });
            for (const [cat, items] of Object.entries(grouped)) {
                const grp = document.createElement('optgroup');
                grp.label = cat;
                items.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify({ id: t.id, name: t.name, bank: t.bank, lsb: t.lsb, program: t.program });
                    opt.text  = t.label;
                    grp.appendChild(opt);
                });
                listEl.appendChild(grp);
            }
        }

        // Always reset to startup defaults (Piano/Pad/String) so chips are reliably active.
        // The saved tone ID is restored later by loadAppState -> selectToneInList.
        if (part === 'U1') searchEl.value = 'Piano';
        if (part === 'U2') searchEl.value = 'Pad';
        if (part === 'L')  searchEl.value = 'String';

        searchEl.addEventListener('input', () => {
            const q = searchEl.value.trim().toLowerCase();
            const tokens = q ? q.split('|').map(s => s.trim()).filter(Boolean) : [];
            populateList(q ? allTones.filter(t => {
                const name = t.name.toLowerCase();
                const cat  = t.category.toLowerCase();
                return tokens.some(k => name.includes(k) || cat.includes(k));
            }) : allTones);
            // Keep the applied tone highlighted if it's in the filtered list (filtering must not "lose" it)
            const cur = currentTone[part];
            listEl.selectedIndex = cur ? [...listEl.options].findIndex(o => JSON.parse(o.value).id === cur.id) : -1;
            // Sync active chip
            const chips = document.querySelectorAll(`.search-presets[data-search-target="search-${part}"] .search-preset-btn`);
            chips.forEach(c => c.classList.toggle('active', c.dataset.q.toLowerCase() === searchEl.value.trim().toLowerCase()));
        });

        // Search preset chips -- filter list only, never auto-change the tone
        document.querySelectorAll(`.search-presets[data-search-target="search-${part}"] .search-preset-btn`).forEach(btn => {
            btn.addEventListener('click', () => {
                searchEl.value = btn.dataset.q;
                searchEl.dispatchEvent(new Event('input'));
                searchEl.blur();
            });
        });

        searchEl.dispatchEvent(new Event('input'));

        // Expose refs so loadAppState / loadPreset / onMIDIMessage can show all tones
        window.toneSearch[part] = { allTones, populateList, searchEl };

        listEl.addEventListener('change', () => {
            const opt = listEl.options[listEl.selectedIndex];
            if (!opt) return;
            const data = JSON.parse(opt.value);
            const toneName = data.name || opt.text.replace(/^\d+\.\s*/, '');
            currentTone[part] = { ...data, name: toneName, text: opt.text };
            changeTone(part, data.bank, data.lsb, data.program);

            // Extract category and apply smart acoustic profile
            let catName = 'PIANO';
            if (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') {
                catName = opt.parentElement.label;
            }

            // Sync active EQ view to the track being adjusted so faders update visibly
            activePart = part;
            document.querySelectorAll('.btn-eq').forEach(b => b.classList.toggle('active-eq', b.dataset.part === activePart));
            document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active-track'));
            const card = document.getElementById('card-' + part);
            if (card) card.classList.add('active-track');

            scheduleProfile(part, catName);

            // Update the name shown in the card header
            const nameEl = document.getElementById('selectedTone-' + part);
            if (nameEl) nameEl.innerText = opt.text;
            
            // Update category shown in the card header
            const catEl = document.getElementById('selectedCat-' + part);
            if (catEl) catEl.innerText = catName;
        });

        // Prev / Next Buttons (Tones)
        document.querySelectorAll(`.tone-nav-btn[data-part="${part}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const dir = parseInt(e.currentTarget.dataset.dir);
                let newIdx = listEl.selectedIndex + dir;
                if (newIdx < 0) newIdx = listEl.options.length - 1;
                if (newIdx >= listEl.options.length) newIdx = 0;
                
                listEl.selectedIndex = newIdx;
                listEl.dispatchEvent(new Event('change'));
            });
        });

        // Prev / Next Buttons (Categories)
        document.querySelectorAll(`.cat-nav-btn[data-part="${part}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const optgroups = Array.from(listEl.querySelectorAll('optgroup'));
                if (optgroups.length === 0) return;

                const currentOpt = listEl.options[listEl.selectedIndex];
                const currentGrp = currentOpt ? currentOpt.parentElement : optgroups[0];
                let grpIdx = optgroups.indexOf(currentGrp);

                const dir = parseInt(e.currentTarget.dataset.dir);
                grpIdx += dir;
                
                if (grpIdx < 0) grpIdx = optgroups.length - 1;
                if (grpIdx >= optgroups.length) grpIdx = 0;

                const targetGrp = optgroups[grpIdx];
                const firstOption = targetGrp.querySelector('option');
                if (firstOption) {
                    firstOption.selected = true;
                    listEl.dispatchEvent(new Event('change'));
                }
            });
        });
        
        // Default: select default tone for each part (U1: 1, U2: 8, L: 24)
        const startupDefaultTones = { U1: 1, U2: 8, L: 24 };
        selectToneInList(part, d => d.id === startupDefaultTones[part], true);
    });
}

// Select a tone in the part's list keeping the current search filter when the tone is in it;
// otherwise the search is cleared so the tone is visible. Updates card labels and category.
function selectToneInList(part, match, keepFilter = false) {
    const listEl = document.getElementById('list-' + part);
    if (!listEl) return null;
    const find = () => [...listEl.options].findIndex(o => {
        try { return match(JSON.parse(o.value), o); } catch(e) { return false; }
    });
    let idx = find();
    const ts = window.toneSearch?.[part];
    if (idx < 0 && !keepFilter && ts && ts.searchEl.value) {
        ts.searchEl.value = '';
        ts.searchEl.dispatchEvent(new Event('input'));
        idx = find();
    }
    if (idx < 0) return null;
    listEl.selectedIndex = idx;
    const opt = listEl.options[idx];
    const data = JSON.parse(opt.value);
    const toneName = data.name || opt.text.replace(/^\d+\.\s*/, '');
    currentTone[part] = { ...data, name: toneName, text: opt.text };
    const nameEl = document.getElementById('selectedTone-' + part);
    if (nameEl) nameEl.innerText = opt.text;
    if (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') {
        const catEl = document.getElementById('selectedCat-' + part);
        if (catEl) catEl.innerText = opt.parentElement.label;
        activeCategories[part] = opt.parentElement.label;
    }
    return opt;
}

// ======================================================================
//  GLOBAL TRANSPOSE & OCTAVE
// ======================================================================
function initGlobalTuning() {
    const valElTrn = document.getElementById('gTrnVal');
    const valElOct = document.getElementById('gOctVal');

    function updateGlobalTranspose(delta) {
        globalTranspose = Math.max(-12, Math.min(12, globalTranspose + delta));
        if (valElTrn) valElTrn.innerText = globalTranspose > 0 ? '+' + globalTranspose : globalTranspose;
        ['U1','U2','L'].forEach(part => sendCoarseTuning(part));
    }

    function updateGlobalOctave(delta) {
        globalOctave = Math.max(-3, Math.min(3, globalOctave + delta));
        if (valElOct) valElOct.innerText = globalOctave > 0 ? '+' + globalOctave : globalOctave;
        ['U1','U2','L'].forEach(part => sendCoarseTuning(part));
    }

    const tp = document.getElementById('gTrnPlus');
    if (tp) tp.addEventListener('click', () => updateGlobalTranspose(+1));
    const tm = document.getElementById('gTrnMinus');
    if (tm) tm.addEventListener('click', () => updateGlobalTranspose(-1));
    const tr = document.getElementById('gTrnReset');
    if (tr) tr.addEventListener('click', () => {
        globalTranspose = 0;
        if (valElTrn) valElTrn.innerText = '0';
        ['U1','U2','L'].forEach(part => sendCoarseTuning(part));
    });

    const op = document.getElementById('gOctPlus');
    if (op) op.addEventListener('click', () => updateGlobalOctave(+1));
    const om = document.getElementById('gOctMinus');
    if (om) om.addEventListener('click', () => updateGlobalOctave(-1));
    const or = document.getElementById('gOctReset');
    if (or) or.addEventListener('click', () => {
        globalOctave = -1;
        if (valElOct) valElOct.innerText = '-1';
        ['U1','U2','L'].forEach(part => sendCoarseTuning(part));
    });
}

// ======================================================================
//  PER-PART QUICK CONTROLS
// ======================================================================
function initQuickControls() {
    document.querySelectorAll('.step-btn, .btn-reset-small[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const part   = btn.dataset.part;
            const action = btn.dataset.action;
            if (!part) return; // skip global buttons handled elsewhere

            if (action === 'oct+' && tuning[part].oct < 3)  tuning[part].oct++;
            if (action === 'oct-' && tuning[part].oct > -3) tuning[part].oct--;
            if (action === 'oct-reset') tuning[part].oct = (part === 'U1') ? -1 : 0;

            const octEl = document.getElementById('oct-' + part);
            if (octEl) octEl.innerText = tuning[part].oct > 0 ? '+' + tuning[part].oct : tuning[part].oct;

            sendCoarseTuning(part);
        });
    });

    document.querySelectorAll('button[id^="sus-"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const part = btn.dataset.part;
            tuning[part].sus = !tuning[part].sus;
            const isOn = tuning[part].sus;
            btn.innerText = isOn ? 'ON' : 'OFF';
            btn.classList.toggle('sus-on', isOn);

            if (isOn) {
                sendCC(part, 72, susRelease(part));
                scheduleSustainResync(part, [40, 150, 400]);
            } else {
                sendCC(part, 72, releaseNeutral(part));
                // Only clear CC64 if the physical sustain is not active
                if (physCC64[part] === 0) sendCC(part, 64, 0);
            }
        });
    });
}

// ======================================================================
//  PRESETS + GITHUB STORAGE
// ======================================================================
//  ARRANGER & REGISTRATIONS CONTROLLER (CT-S500)
// ======================================================================
function initArranger() {
    let isPlaying        = false;
    let bpm              = 120;
    let clockTimer       = null;
    let currentRegBank   = 0; // 0..15 (Banks 1..16)
    let currentRegSlot   = null; // 0..3 (Slots 1..4)
    let tapTimes         = [];

    // Accompaniment volumes & mute states
    const accompMute = {
        master: false,
        drums: false,
        bass: false,
        chords: false
    };
    const savedVol = {
        master: 100,
        drums: 100,
        bass: 100,
        chords: 100
    };

    // Category Typical Tempos
    const CAT_SUGGESTED_BPM = {
        '8 Beat': 120, '16 Beat': 96, 'Pop': 118, 'Rock': 128,
        'Dance': 128, 'Jazz': 132, 'Ballad': 72, 'Latin': 124,
        'Waltz': 110, 'March': 116, 'Country': 120, 'World': 105,
        'Ballroom': 122, 'Kids': 115
    };

    function getSuggestedBpm(r) {
        if (!r) return 120;
        const n = (r.name || '').toLowerCase();
        if (n.includes('slow')) return 70;
        if (n.includes('ballad')) return 72;
        if (n.includes('fast') || n.includes('speed')) return 140;
        if (n.includes('disco') || n.includes('techno') || n.includes('house')) return 128;
        if (n.includes('bossa')) return 125;
        if (n.includes('samba')) return 130;
        if (n.includes('waltz')) return 108;
        return CAT_SUGGESTED_BPM[r.cat] || 120;
    }

    // ── Setup Guide Toggle ──────────────────────────────────────
    const helpToggle = document.getElementById('arrangerHelpToggle');
    const helpContent = document.getElementById('arrangerHelpContent');
    const helpIcon = document.getElementById('arrangerHelpIcon');
    helpToggle?.addEventListener('click', () => {
        const isShown = helpContent.style.display !== 'none';
        helpContent.style.display = isShown ? 'none' : 'block';
        if (helpIcon) helpIcon.style.transform = isShown ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    // ── REGISTRATION SWITCHER (FW 1.06+) ────────────────────────
    function sendRegistrationRecall(bank, slot) {
        if (!midiOutput) return;
        // Bank Select MSB = 116 (0x74) for Registration memory
        midiOutput.send([0xB0, 0, 116]);
        // Bank Select LSB = Bank index (0..15)
        midiOutput.send([0xB0, 32, bank]);
        // Program Change = Slot index (0..3) on Channel 1
        midiOutput.send([0xC0, slot]);
    }

    function recallRegistration(bank, slot) {
        currentRegBank = bank;
        currentRegSlot = slot;
        sendRegistrationRecall(bank, slot);

        // Update UI
        updateRegUI();
        const badge = document.getElementById('activeRegBadge');
        if (badge) {
            badge.innerText = `ACTIVE: BANK ${bank + 1} • REG ${slot + 1}`;
            badge.style.display = 'inline-block';
        }
    }

    function updateRegUI() {
        const sel = document.getElementById('regBankSelect');
        if (sel && parseInt(sel.value, 10) !== currentRegBank) {
            sel.value = currentRegBank;
        }
        document.querySelectorAll('#regSlotsGrid .btn-giant').forEach(btn => {
            const slot = parseInt(btn.dataset.slot, 10);
            btn.classList.toggle('active-reg', slot === currentRegSlot);
        });
    }

    // Populate Banks 1 to 16
    const regBankSel = document.getElementById('regBankSelect');
    if (regBankSel) {
        regBankSel.innerHTML = Array.from({ length: 16 }, (_, i) =>
            `<option value="${i}">Bank ${String(i + 1).padStart(2, '0')}</option>`
        ).join('');
        regBankSel.addEventListener('change', e => {
            currentRegBank = parseInt(e.target.value, 10);
            currentRegSlot = null;
            updateRegUI();
        });
    }

    document.getElementById('regBankMinus')?.addEventListener('click', () => {
        currentRegBank = Math.max(0, currentRegBank - 1);
        currentRegSlot = null;
        updateRegUI();
    });

    document.getElementById('regBankPlus')?.addEventListener('click', () => {
        currentRegBank = Math.min(15, currentRegBank + 1);
        currentRegSlot = null;
        updateRegUI();
    });

    // 4 Slots
    [0, 1, 2, 3].forEach(slot => {
        const btn = document.getElementById(`btnReg${slot + 1}`);
        btn?.addEventListener('click', () => recallRegistration(currentRegBank, slot));
    });

    // Backward compat aliases for old IDs if still clicked anywhere
    document.getElementById('btnIntro')?.addEventListener('click', () => recallRegistration(currentRegBank, 0));
    document.getElementById('btnVar1')?.addEventListener('click', () => recallRegistration(currentRegBank, 1));
    document.getElementById('btnVar2')?.addEventListener('click', () => recallRegistration(currentRegBank, 2));
    document.getElementById('btnEnding')?.addEventListener('click', () => recallRegistration(currentRegBank, 3));

    // ── MIDI CLOCK & REALTIME TRANSPORT ─────────────────────────
    function setClockBadge(text) {
        const el = document.getElementById('clockStatusBadge');
        if (el) el.innerText = text;
    }

    function startClock() {
        stopClock();
        const interval = (60000 / bpm) / 24; // 24 pulses per quarter note
        clockTimer = setInterval(() => {
            if (midiOutput) midiOutput.send([0xF8]);
        }, interval);
    }

    function stopClock() {
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    function setBpm(newBpm) {
        bpm = Math.min(255, Math.max(20, Math.round(newBpm)));
        const el = document.getElementById('bpmVal');
        if (el) el.innerText = bpm;
        if (isPlaying || document.getElementById('chkMidiClock')?.checked) {
            startClock();
        }
    }

    document.getElementById('bpmMinus5')?.addEventListener('click', () => setBpm(bpm - 5));
    document.getElementById('bpmMinus')?.addEventListener('click',  () => setBpm(bpm - 1));
    document.getElementById('bpmPlus')?.addEventListener('click',   () => setBpm(bpm + 1));
    document.getElementById('bpmPlus5')?.addEventListener('click',  () => setBpm(bpm + 5));

    // Tap Tempo
    document.getElementById('btnTapTempo')?.addEventListener('click', () => {
        const now = Date.now();
        if (tapTimes.length && (now - tapTimes[tapTimes.length - 1] > 2500)) {
            tapTimes = [];
        }
        tapTimes.push(now);
        if (tapTimes.length > 5) tapTimes.shift();

        const tapBtn = document.getElementById('btnTapTempo');
        if (tapBtn) {
            tapBtn.style.transform = 'scale(0.92)';
            setTimeout(() => { if (tapBtn) tapBtn.style.transform = ''; }, 100);
        }

        if (tapTimes.length >= 2) {
            const diffs = [];
            for (let i = 1; i < tapTimes.length; i++) {
                diffs.push(tapTimes[i] - tapTimes[i - 1]);
            }
            const avgMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            if (avgMs > 0) {
                const calculatedBpm = Math.round(60000 / avgMs);
                setBpm(calculatedBpm);
            }
        }
    });

    document.getElementById('chkMidiClock')?.addEventListener('change', e => {
        if (e.target.checked) {
            startClock();
            setClockBadge(isPlaying ? 'CLOCK: RUNNING (PLAY)' : 'CLOCK: RUNNING (FREE)');
        } else {
            if (!isPlaying) {
                stopClock();
                setClockBadge('CLOCK: STANDBY');
            }
        }
    });

    // START / STOP
    const btnSS = document.getElementById('btnStartStop');
    btnSS?.addEventListener('click', () => {
        if (!midiOutput) return;
        isPlaying = !isPlaying;
        if (isPlaying) {
            startClock();
            midiOutput.send([0xFA]); // Start
            btnSS.querySelector('.icon').innerHTML = '<span class="material-symbols-outlined">stop</span>';
            btnSS.querySelector('.text').innerText = 'STOP';
            btnSS.classList.add('btn-stop');
            btnSS.classList.remove('btn-start');
            setClockBadge('CLOCK: RUNNING (PLAY)');
        } else {
            if (!document.getElementById('chkMidiClock')?.checked) {
                stopClock();
                setClockBadge('CLOCK: STOPPED');
            } else {
                setClockBadge('CLOCK: RUNNING (FREE)');
            }
            midiOutput.send([0xFC]); // Stop
            btnSS.querySelector('.icon').innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
            btnSS.querySelector('.text').innerText = 'START / STOP';
            btnSS.classList.remove('btn-stop');
            btnSS.classList.add('btn-start');
        }
    });

    // SYNC START
    document.getElementById('btnSyncStart')?.addEventListener('click', () => {
        if (!midiOutput) return;
        midiOutput.send([0xFA]); // Synchro Start
        startClock();
        setClockBadge('CLOCK: ARMED (SYNC)');
    });

    // ── ACCOMPANIMENT MULTI-CHANNEL MIXER ───────────────────────
    function sendAccompanimentCC(channels, val) {
        if (!midiOutput) return;
        channels.forEach(ch => {
            midiOutput.send([0xB0 | ch, 7, val]);
        });
    }

    const ACCOMP_CHANNELS = {
        master: [8, 9, 10, 11, 12, 13, 14, 15], // Ch 9–16
        drums:  [8, 9],                         // Ch 9 & 10
        bass:   [10],                           // Ch 11
        chords: [11, 12, 13, 14, 15]            // Ch 12–16
    };

    function setupAccompSlider(sliderId, valId, muteBtnId, groupKey) {
        const slider  = document.getElementById(sliderId);
        const valSpan = document.getElementById(valId);
        const muteBtn = document.getElementById(muteBtnId);
        if (!slider) return;

        slider.addEventListener('input', () => {
            const v = parseInt(slider.value, 10);
            if (valSpan) valSpan.innerText = v;
            savedVol[groupKey] = v;
            if (accompMute[groupKey]) {
                accompMute[groupKey] = false;
                muteBtn?.classList.remove('muted');
                if (muteBtn) muteBtn.innerText = 'MUTE';
            }
            sendAccompanimentCC(ACCOMP_CHANNELS[groupKey], v);
        });

        muteBtn?.addEventListener('click', () => {
            accompMute[groupKey] = !accompMute[groupKey];
            if (accompMute[groupKey]) {
                savedVol[groupKey] = parseInt(slider.value, 10) || 100;
                slider.value = 0;
                if (valSpan) valSpan.innerText = 0;
                muteBtn.classList.add('muted');
                muteBtn.innerText = 'MUTED';
                sendAccompanimentCC(ACCOMP_CHANNELS[groupKey], 0);
            } else {
                const restored = savedVol[groupKey] || 100;
                slider.value = restored;
                if (valSpan) valSpan.innerText = restored;
                muteBtn.classList.remove('muted');
                muteBtn.innerText = 'MUTE';
                sendAccompanimentCC(ACCOMP_CHANNELS[groupKey], restored);
            }
        });
    }

    setupAccompSlider('rhythmVol',       'rhythmVolVal',       'muteAccompMaster', 'master');
    setupAccompSlider('volAccompDrums',  'volAccompDrumsVal',  'muteAccompDrums',  'drums');
    setupAccompSlider('volAccompBass',   'volAccompBassVal',   'muteAccompBass',   'bass');
    setupAccompSlider('volAccompChords', 'volAccompChordsVal', 'muteAccompChords', 'chords');

    // ── FACTORY RHYTHM LIST & DIAL HUD ──────────────────────────
    let activeRhythm = null;

    function selectRhythm(r) {
        activeRhythm = r;
        const suggestedBpm = getSuggestedBpm(r);

        const titleEl = document.getElementById('activeRhythmTitle');
        if (titleEl) {
            titleEl.innerHTML = `[${String(r.id).padStart(3, '0')}] ${r.name} <span style="font-size:12px; color:var(--accent); font-weight:600;">(${r.cat})</span>`;
        }

        const dialTipEl = document.getElementById('activeRhythmDialTip');
        if (dialTipEl) {
            dialTipEl.innerHTML = `👉 Pon en la rueda del Casio: <span style="font-size:15px; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; border:1px solid var(--accent);">${String(r.id).padStart(3, '0')}</span>`;
        }

        const sugVal = document.getElementById('suggestedBpmVal');
        if (sugVal) sugVal.innerText = suggestedBpm;

        // Keep legacy badge for compatibility
        const legacyBadge = document.getElementById('activeRhythmBadge');
        if (legacyBadge) {
            legacyBadge.innerText = `SELECTED: [${String(r.id).padStart(3, '0')}] ${r.name} (${r.cat})`;
            legacyBadge.style.display = 'block';
        }
    }

    document.getElementById('btnApplySuggestedBpm')?.addEventListener('click', () => {
        if (!activeRhythm) return;
        const sBpm = getSuggestedBpm(activeRhythm);
        setBpm(sBpm);
    });

    function buildRhythmList(filter = '', cat = 'ALL') {
        const list = document.getElementById('rhythmList');
        if (!list || !window.RAW_RHYTHMS) return;

        const items = RAW_RHYTHMS.filter(r => {
            const matchCat = cat === 'ALL' || r.cat === cat;
            const matchQ   = r.name.toLowerCase().includes(filter.toLowerCase());
            return matchCat && matchQ;
        });

        list.innerHTML = '';
        items.forEach(r => {
            const div = document.createElement('div');
            div.className = 'rhythm-item';
            div.innerHTML = `<span class="rhythm-num">${String(r.id).padStart(3, '0')}</span><span class="rhythm-name">${r.name}</span><span class="rhythm-cat">${r.cat}</span>`;
            div.addEventListener('click', () => {
                document.querySelectorAll('.rhythm-item').forEach(d => d.classList.remove('active'));
                div.classList.add('active');
                selectRhythm(r);
            });
            list.appendChild(div);
        });
    }

    function buildCatFilter() {
        const sel = document.getElementById('rhythmCatFilter');
        if (!sel || !window.RAW_RHYTHMS) return;
        const cats = ['ALL', ...new Set(RAW_RHYTHMS.map(r => r.cat))];
        sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        sel.addEventListener('change', () => buildRhythmList(
            document.getElementById('rhythmSearch')?.value || '', sel.value
        ));
    }

    buildCatFilter();
    buildRhythmList();

    // Default selection to first rhythm
    if (window.RAW_RHYTHMS && window.RAW_RHYTHMS.length > 0) {
        selectRhythm(window.RAW_RHYTHMS[0]);
    }

    document.getElementById('rhythmSearch')?.addEventListener('input', e => {
        buildRhythmList(e.target.value, document.getElementById('rhythmCatFilter')?.value || 'ALL');
    });
}

// ======================================================================
//  MIDI SEND HELPERS
// ======================================================================
function sendCC(part, cc, value) {
    if (!midiOutput && !window.pcSynth) return;
    const ch = CHANNEL[part];

    // Detune pseudo-CC: RPN 00 01H Fine Tuning (-50c to +50c, center 64 = 0c)
    if (cc === 999 || cc === 'detune') {
        if (midiOutput) {
            midiOutput.send([0xB0 | ch, 101, 0x00]); // RPN MSB
            midiOutput.send([0xB0 | ch, 100, 0x01]); // RPN LSB (Fine Tuning)
            midiOutput.send([0xB0 | ch,   6, value]); // Data Entry MSB
            midiOutput.send([0xB0 | ch, 101, 0x7F]); // RPN Reset
            midiOutput.send([0xB0 | ch, 100, 0x7F]);
        }
        return;
    }

    // Mono Mode: CC 126 (Mono Mode On) / CC 127 (Poly Mode On)
    if (cc === 126) {
        const targetCC = value > 63 ? 126 : 127;
        if (midiOutput) midiOutput.send([0xB0 | ch, targetCC, 0]);
        return;
    }

    if (midiOutput) midiOutput.send([0xB0 | ch, cc, value]);
    // Mirror CCs al PC Synth en el canal de ese part
    if (window.pcSynth?.applyCC) window.pcSynth.applyCC(cc, value, ch);
}

function changeTone(part, msb, lsb, pc) {
    if (!midiOutput) return;
    const ch = CHANNEL[part];
    midiOutput.send([0xB0 | ch, 0x00, msb]);
    midiOutput.send([0xB0 | ch, 0x20, lsb || 0]);
    midiOutput.send([0xC0 | ch, pc]);
    // If sustain is active on this part, immediately re-assert it so tone changes never drop sustain
    if (tuning[part].sus) {
        scheduleSustainResync(part, [30, 120, 300, 700]);
    }
}

window.sendCoarseTuning = function sendCoarseTuning(part) {
    if (!midiOutput) return;
    // RPN 0x0002 = Coarse Tuning. Value 64 = center (0 semitones).
    // Octave contributes +/-12 semitones, global transpose is additional offset.
    const total = Math.min(127, Math.max(0, 64 + globalOctave * 12 + globalTranspose));
    const ch = CHANNEL[part];
    midiOutput.send([0xB0 | ch, 101, 0x00]); // RPN MSB
    midiOutput.send([0xB0 | ch, 100, 0x02]); // RPN LSB (Coarse Tuning)
    midiOutput.send([0xB0 | ch, 6,   total]); // Data Entry
    midiOutput.send([0xB0 | ch, 101, 0x7F]); // RPN reset (best practice)
    midiOutput.send([0xB0 | ch, 100, 0x7F]);
}
// Swap two track-card DOM elements and restore their instrument state.
// Wired directly here — no separate fix_swap.js needed.
document.addEventListener('DOMContentLoaded', () => {
    const titlesByOrder = { '1': 'INSTRUMENT 1', '2': 'INSTRUMENT 2', '3': 'INSTRUMENT 3' };
    document.querySelectorAll('.btn-swap').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPart  = btn.getAttribute('data-target');
            const currentPart = btn.closest('.track-card').getAttribute('data-part');
            if (targetPart === currentPart) return;
            const cardA = document.getElementById('card-' + currentPart);
            const cardB = document.getElementById('card-' + targetPart);
            if (!cardA || !cardB) return;
            const searchA = cardA.querySelector('.search-input'), listA = cardA.querySelector('.tone-list');
            const searchB = cardB.querySelector('.search-input'), listB = cardB.querySelector('.tone-list');
            const valA = searchA.value, valB = searchB.value;
            const selA = listA.selectedIndex >= 0 ? listA.options[listA.selectedIndex].value : null;
            const selB = listB.selectedIndex >= 0 ? listB.options[listB.selectedIndex].value : null;
            const orderA = cardA.style.order || getComputedStyle(cardA).order;
            const orderB = cardB.style.order || getComputedStyle(cardB).order;
            cardA.style.order = orderB;
            cardB.style.order = orderA;
            const titleA = cardA.querySelector('.inst-title'), titleB = cardB.querySelector('.inst-title');
            if (titleA && titlesByOrder[orderB]) titleA.innerHTML = titlesByOrder[orderB];
            if (titleB && titlesByOrder[orderA]) titleB.innerHTML = titlesByOrder[orderA];
            searchA.value = valB; searchB.value = valA;
            searchA.dispatchEvent(new Event('input')); searchB.dispatchEvent(new Event('input'));
            if (selB) { Array.from(listA.options).forEach((o, i) => { if (o.value === selB) listA.selectedIndex = i; }); listA.dispatchEvent(new Event('change')); }
            if (selA) { Array.from(listB.options).forEach((o, i) => { if (o.value === selA) listB.selectedIndex = i; }); listB.dispatchEvent(new Event('change')); }
            if (window.swapPartState) window.swapPartState(currentPart, targetPart);
        });
    });
});

window.swapPartState = function(partA, partB) {
    [tuning[partA].sus, tuning[partB].sus] = [tuning[partB].sus, tuning[partA].sus];
    [partA, partB].forEach(p => {
        const btn = document.getElementById('sus-' + p);
        if (btn) { btn.innerText = tuning[p].sus ? 'ON' : 'OFF'; btn.classList.toggle('sus-on', tuning[p].sus); }
        if (tuning[p].sus) sendCC(p, 72, susRelease(p));
        sendCoarseTuning(p);
    });
};

function pushAllToKeyboard(skipTones = false) {
    // Tones first, CCs after a delay: a burst of CCs before/around the Program Change
    // overflows the Casio's MIDI buffer and makes it drop the tone change.
    if (!skipTones) {
        ['U1','U2','L'].forEach(part => {
            const t = currentTone[part];
            if (t) changeTone(part, t.bank, t.lsb, t.program);
        });
    }
    setTimeout(() => {
        ['U1','U2','L'].forEach(part => {
            EQ_CONTROLS.forEach(ctrl => {
                if (PERFORMANCE_CCS.has(ctrl.cc)) return; // live-state -- never force on reconnect
                sendCC(part, ctrl.cc, eqState[part][ctrl.cc] !== undefined ? eqState[part][ctrl.cc] : ctrl.def);
            });
            sendCoarseTuning(part);
            if (tuning[part].sus) sendCC(part, 72, susRelease(part));
            if (physCC64[part] > 0) sendCC(part, 64, physCC64[part]);
        });
    }, skipTones ? 0 : 150);
    resyncAllSustain();
}


function debugMidiPorts() {
    if (!midiAccess) { alert('MIDI not yet initialized. Touch screen to retry.'); return; }
    let msg = 'Inputs:\n';
    for (let i of midiAccess.inputs.values()) msg += '- ' + i.name + ' (' + i.state + ')\n';
    msg += '\nOutputs:\n';
    for (let o of midiAccess.outputs.values()) msg += '- ' + o.name + ' (' + o.state + ')\n';
    alert(msg || 'No MIDI ports found.');
}
document.querySelector('.status-badge')?.addEventListener('click', () => {
    midiInitAttempted = true; // prevent double init from the document {once} listener
    if (midiAccess) reconnectMIDI(); else initMIDI();
});
function _getSavedToneId(part) {
    return currentTone[part]?.id ?? 0;
}


// --- PC SYNTH -- SpessaSynth: AudioWorklet (thread separado), SF2 nativo ---
window.pcSynth = null;
window.sf2Ready = false;

// IndexedDB helpers for SF2 cache
function sf2OpenIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('casioPcSynth', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('sf2cache');
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = reject;
    });
}
async function sf2SaveCache(name, buffer) {
    try { const db = await sf2OpenIDB(); db.transaction('sf2cache','readwrite').objectStore('sf2cache').put({name,buffer},'sf2'); } catch(e) {}
}
async function sf2LoadCache() {
    try {
        const db = await sf2OpenIDB();
        return await new Promise((res, rej) => {
            const r = db.transaction('sf2cache','readonly').objectStore('sf2cache').get('sf2');
            r.onsuccess = e => res(e.target.result || null); r.onerror = rej;
        });
    } catch { return null; }
}

// Reusable AudioContext + WorkletSynthesizer instance
let spessaCtx = null;
let spessaSynth = null;

async function sf2Init(source, name) {
    const statusEl = document.getElementById('sf2-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent);">Loading SpessaSynth...</span>';
    try {
        const { WorkletSynthesizer } = await import('https://esm.sh/spessasynth_lib@4.3.14');

        if (!spessaCtx) spessaCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (!spessaCtx._workletAdded) {
            await spessaCtx.audioWorklet.addModule('./spessasynth_processor.min.js');
            spessaCtx._workletAdded = true;
        }

        if (!spessaSynth) spessaSynth = new WorkletSynthesizer(spessaCtx);

        // Load SF2 buffer
        let sf2Buffer;
        if (source instanceof ArrayBuffer) {
            sf2Buffer = source;
        } else if (source instanceof File) {
            sf2Buffer = await source.arrayBuffer();
        } else {
            const res = await fetch(source);
            if (!res.ok) throw new Error('SF2 fetch failed: ' + source);
            sf2Buffer = await res.arrayBuffer();
        }

        await spessaSynth.soundBankManager.addSoundBank(sf2Buffer, 'main');
        await spessaSynth.isReady;

        // Master gain at unity -- per-part volume is CC7 on each channel.
        // Disconnect the previous gain node first to avoid parallel audio paths on SF2 reload.
        if (window.pcSynth?._master) { try { window.pcSynth._master.disconnect(); } catch(e) {} }
        const masterGain = spessaCtx.createGain();
        masterGain.gain.value = 1.0;
        spessaSynth.connect(masterGain);
        masterGain.connect(spessaCtx.destination);

        window.pcSynth = {
            _synth: spessaSynth, _ctx: spessaCtx,
            _master: masterGain,
            get synth() { return { ctx: spessaCtx }; },
            noteOn(channel, note, velocity) {
                if (spessaCtx.state === 'suspended') spessaCtx.resume();
                spessaSynth.noteOn(channel, note, Math.min(127, Math.max(1, velocity)));
            },
            noteOff(channel, note) {
                spessaSynth.noteOff(channel, note);
            },
            programChange(channel, prog) {
                spessaSynth.programChange(channel, prog);
            },
            applyCC(cc, val, channel) {
                const ch = channel !== undefined ? channel : CHANNEL[activePart];
                spessaSynth.controllerChange(ch, cc, val);
            }
        };
        // Sync current mixer state (EQ + sustain release) to the freshly created synth
        ['U1','U2','L'].forEach(part => {
            EQ_CONTROLS.forEach(ctrl => {
                const v = eqState[part][ctrl.cc];
                window.pcSynth.applyCC(ctrl.cc, v !== undefined ? v : ctrl.def, CHANNEL[part]);
            });
            window.pcSynth.applyCC(72, tuning[part].sus ? susRelease(part) : releaseNeutral(part), CHANNEL[part]);
        });
        window.sf2Ready = true;
        if (statusEl) {
            statusEl.dataset.sf2loaded = '1';
            const sp = document.createElement('span'); sp.style.color = '#4CAF50';
            sp.textContent = '✔ SF2: ' + (name || 'soundfont.sf2'); // textContent avoids XSS from user filename
            statusEl.innerHTML = ''; statusEl.appendChild(sp);
        }
    } catch(err) {
        console.error('SF2 init error:', err);
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Error: Could not load SF2</span>';
    }
}

// Auto-load SF2: IndexedDB cache -> GeneralUser GS CDN -> local fallback
(async () => {
    const statusEl = document.getElementById('sf2-status');
    const cached = await sf2LoadCache();
    if (cached) {
        await sf2Init(cached.buffer, cached.name);
        return;
    }
    const GUGS_URL = 'https://cdn.jsdelivr.net/gh/mrbumpy409/GeneralUser-GS@main/GeneralUser-GS.sf2';
    const LOCAL_URL = './soundfont.sf2';

    for (const [url, name] of [[GUGS_URL, 'GeneralUser GS'], [LOCAL_URL, 'soundfont.sf2']]) {
        try {
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">Downloading ${name}...</span>`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('not found');
            const buffer = await res.arrayBuffer();
            sf2SaveCache(name, buffer);
            await sf2Init(buffer, name);
            return;
        } catch { /* try next */ }
    }
    if (statusEl && !statusEl.dataset.sf2loaded) statusEl.innerHTML = '<span style="color:var(--text-muted);">Error: Could not load SF2</span>';
})();

document.getElementById('sf2-file')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    sf2SaveCache(file.name, await file.arrayBuffer());
    await sf2Init(file, file.name);
});

// ======================================================================
//  MIDI CONTROLLER -- Virtual Keyboard + Per-part controls
// ======================================================================

// Per-part octave offset for the MIDI controller (separate from mixer octave)
const mctrlOct = { U1: 0, U2: 0, L: 0 };
let vkActivePart = 'U1';   // which part the virtual keyboard plays
let vkOctave = 4;           // base octave for virtual keyboard (C4 = MIDI 60)
const vkActiveKeys = {};    // note -> channel number while held (captured at press time)

function initMidiController() {
    // Per-part volume sliders
    ['U1', 'U2', 'L'].forEach(part => {
        const volSlider = document.getElementById('mctrl-vol-' + part);
        const volVal = document.getElementById('mctrl-vol-' + part + '-val');
        if (volSlider) {
            const cap = part === 'U2' ? 75 : 100;
            volSlider.max = cap; // slider range matches Part Mix Rules -- no dead zone above cap
            volSlider.addEventListener('input', () => {
                const v = parseInt(volSlider.value);
                if (volVal) volVal.innerText = v;
                eqState[part][7] = v;
                if (!mctrlEnabled) return;
                if (midiOutput) midiOutput.send([0xB0 | CHANNEL[part], 7, v]);
                if (window.pcSynth?.applyCC) window.pcSynth.applyCC(7, v, CHANNEL[part]);
            });
        }

        const rvbSlider = document.getElementById('mctrl-rvb-' + part);
        const rvbVal = document.getElementById('mctrl-rvb-' + part + '-val');
        if (rvbSlider) {
            rvbSlider.addEventListener('input', () => {
                const v = parseInt(rvbSlider.value);
                if (rvbVal) rvbVal.innerText = v;
                eqState[part][91] = v;
                if (!mctrlEnabled) return;
                if (midiOutput) midiOutput.send([0xB0 | CHANNEL[part], 91, v]);
                if (window.pcSynth?.applyCC) window.pcSynth.applyCC(91, v, CHANNEL[part]);
            });
        }

        // Per-part octave (controller octave, separate from mixer)
        document.querySelectorAll(`[data-part="${part}"][data-mctrl-oct]`).forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.mctrlOct;
                if (action === 'reset') {
                    mctrlOct[part] = 0;
                } else {
                    const dir = parseInt(action);
                    mctrlOct[part] = Math.max(-3, Math.min(3, mctrlOct[part] + dir));
                }
                const el = document.getElementById('mctrl-oct-' + part);
                if (el) el.innerText = mctrlOct[part] > 0 ? '+' + mctrlOct[part] : mctrlOct[part];
            });
        });

        // Card click -> select active card highlight
        const card = document.getElementById('mctrl-card-' + part);
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
                document.querySelectorAll('[id^="mctrl-card-"]').forEach(c => c.classList.remove('active-track'));
                card.classList.add('active-track');
            });
        }
    });

    // Part selector buttons for virtual keyboard
    document.querySelectorAll('[data-vk-part]').forEach(btn => {
        btn.addEventListener('click', () => {
            vkActivePart = btn.dataset.vkPart;
            document.querySelectorAll('[data-vk-part]').forEach(b => b.classList.remove('sus-on'));
            btn.classList.add('sus-on');
        });
    });

    // Virtual keyboard octave
    document.getElementById('vk-oct-minus')?.addEventListener('click', () => {
        vkOctave = Math.max(1, vkOctave - 1);
        document.getElementById('vk-oct-val').innerText = vkOctave;
    });
    document.getElementById('vk-oct-plus')?.addEventListener('click', () => {
        vkOctave = Math.min(7, vkOctave + 1);
        document.getElementById('vk-oct-val').innerText = vkOctave;
    });
    document.getElementById('vk-oct-reset')?.addEventListener('click', () => {
        vkOctave = 4;
        document.getElementById('vk-oct-val').innerText = vkOctave;
    });

    buildVirtualKeyboard();
}

function buildVirtualKeyboard() {
    const container = document.getElementById('virtualKeyboard');
    if (!container) return;
    container.innerHTML = '';

    // 2 octaves: C to B (14 white keys, 10 black keys)
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const isBlack = [false, true, false, true, false, false, true, false, true, false, true, false];
    const NUM_OCTAVES = 2;

    // We build white key row with black keys absolutely positioned
    const whiteKeys = [];
    const allKeys = [];

    for (let oct = 0; oct < NUM_OCTAVES; oct++) {
        for (let n = 0; n < 12; n++) {
            allKeys.push({ oct, n, name: noteNames[n], black: isBlack[n] });
            if (!isBlack[n]) whiteKeys.push(allKeys[allKeys.length - 1]);
        }
    }

    // Wrapper with position:relative for black key absolute positioning
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative; display:flex; user-select:none; touch-action:none; height:100px; overflow:hidden;';
    container.appendChild(wrap);

    // Draw white keys first
    whiteKeys.forEach((k, idx) => {
        const el = document.createElement('div');
        el.className = 'vk-white';
        el.dataset.oct = k.oct;
        el.dataset.note = k.n;
        el.dataset.keyidx = idx;
        el.style.cssText = `flex:1; min-width:0; height:100%; background:#f8f8f8; border:1px solid #888; border-radius:0 0 4px 4px; cursor:pointer; position:relative; z-index:1;`;
        // Note label
        if (k.n === 0) {
            const lbl = document.createElement('span');
            lbl.style.cssText = 'position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:8px;color:#666;font-weight:bold;';
            lbl.innerText = 'C' + (vkOctave + k.oct - 1); // MIDI C4=60; (4+0)*12=48=C3 so subtract 1
            el.appendChild(lbl);
        }
        attachKeyEvents(el, k);
        wrap.appendChild(el);
    });

    // Draw black keys absolutely positioned
    const whiteWidth = 100 / whiteKeys.length; // percent

    allKeys.filter(k => k.black).forEach(k => {
        // Find white key idx just before this black key
        const prevWhiteIdx = whiteKeys.findIndex(w => w.oct === k.oct && w.n === k.n - 1);
        if (prevWhiteIdx < 0) return;
        const el = document.createElement('div');
        el.className = 'vk-black';
        el.dataset.oct = k.oct;
        el.dataset.note = k.n;
        const leftPct = (prevWhiteIdx + 1) * whiteWidth - whiteWidth * 0.35;
        el.style.cssText = `position:absolute; top:0; left:${leftPct}%; width:${whiteWidth * 0.65}%; height:62%; background:#222; border-radius:0 0 3px 3px; cursor:pointer; z-index:2; border:1px solid #000;`;
        attachKeyEvents(el, k);
        wrap.appendChild(el);
    });
}

function vkNoteOn(midiNote, ch) {
    if (vkActiveKeys[midiNote]) return;
    ch = ch ?? CHANNEL[vkActivePart];
    const vel = parseInt(document.getElementById('vk-velocity')?.value || 90);
    // Apply the same shift the Casio gets via RPN Coarse Tuning so PC synth stays in tune
    const shift = globalTranspose + globalOctave * 12;
    const shiftedNote = Math.max(0, Math.min(127, midiNote + shift));
    vkActiveKeys[midiNote] = { ch, shiftedNote };
    // Send to MIDI output (Casio) -- only when EXT MIDI is ON
    if (mctrlEnabled && midiOutput) midiOutput.send([0x90 | ch, midiNote, vel]);
    // Send to PC synth -- independent of EXT MIDI toggle
    if (pcSynthEnabled && window.pcSynth) {
        if (window.pcSynth.synth?.ctx?.state === 'suspended') window.pcSynth.synth.ctx.resume();
        window.pcSynth.noteOn(ch, shiftedNote, vel);
    }
}

function vkNoteOff(midiNote) {
    const entry = vkActiveKeys[midiNote];
    if (!entry) return;
    delete vkActiveKeys[midiNote];
    if (mctrlEnabled && midiOutput) midiOutput.send([0x80 | entry.ch, midiNote, 0]);
    if (pcSynthEnabled && window.pcSynth) window.pcSynth.noteOff(entry.ch, entry.shiftedNote);
}

function getMidiNote(keyEl) {
    const oct = parseInt(keyEl.dataset.oct);
    const n = parseInt(keyEl.dataset.note);
    return (vkOctave + oct) * 12 + n;
}

function attachKeyEvents(el, k) {
    const getNote = () => (vkOctave + k.oct) * 12 + k.n;
    let heldNote = null;

    const press = () => { heldNote = getNote(); vkNoteOn(heldNote, CHANNEL[vkActivePart]); el.classList.add('vk-active'); };
    const release = () => { if (heldNote !== null) { vkNoteOff(heldNote); heldNote = null; } el.classList.remove('vk-active'); };

    el.addEventListener('mousedown',  (e) => { e.preventDefault(); press(); });
    el.addEventListener('mouseup',    () => release());
    el.addEventListener('mouseleave', () => { if (heldNote !== null && vkActiveKeys[heldNote]) release(); });

    el.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
    el.addEventListener('touchend',   (e) => { e.preventDefault(); release(); }, { passive: false });
    el.addEventListener('touchcancel',() => { if (heldNote !== null) { vkNoteOff(heldNote); heldNote = null; } el.classList.remove('vk-active'); });
}

// Initialize MIDI controller (DOM already ready -- script is at bottom of body)
initMidiController();


// PC Synth ON/OFF toggle
document.getElementById('pcSynthToggle')?.addEventListener('change', e => {
    pcSynthEnabled = e.target.checked;
    // Stop any currently sounding notes when toggling off
    if (!pcSynthEnabled && window.pcSynth) {
        for (const note in pcActiveNotes) {
            const entry = pcActiveNotes[note];
            const ch = entry?.ch ?? 0;
            const n  = entry?.shiftedNote ?? 0;
            try { window.pcSynth.noteOff(ch, n); } catch(e) {}
        }
        for (const k in pcActiveNotes) delete pcActiveNotes[k];
        Object.values(CHANNEL).forEach(ch => { try { window.pcSynth.applyCC(64, 0, ch); } catch(e) {} });
        // Stop any held virtual keyboard notes (use captured channel, not current vkActivePart)
        for (const note in vkActiveKeys) {
            try { window.pcSynth.noteOff(vkActiveKeys[note], parseInt(note)); } catch(e) {}
        }
        for (const k in vkActiveKeys) delete vkActiveKeys[k];
    }
});

// MIDI Ctrl ON/OFF toggle
document.getElementById('mctrlToggle')?.addEventListener('change', e => {
    mctrlEnabled = e.target.checked;
    const rack = document.getElementById('mctrl-rack-content');
    if (rack) rack.style.opacity = mctrlEnabled ? '' : '0.4';
    if (!mctrlEnabled) {
        // Stop any held virtual keyboard notes (use captured channel, not current vkActivePart)
        for (const note in vkActiveKeys) {
            const ch = vkActiveKeys[note];
            if (midiOutput) try { midiOutput.send([0x80 | ch, parseInt(note), 0]); } catch(e) {}
            if (window.pcSynth) try { window.pcSynth.noteOff(ch, parseInt(note)); } catch(e) {}
        }
        for (const k in vkActiveKeys) delete vkActiveKeys[k];
        document.querySelectorAll('.vk-white, .vk-black').forEach(k => k.classList.remove('vk-active'));
    }
});

// Build GM instrument selectors (script runs after body -- DOM elements exist)
buildGMSelectors();




// Mobile Web Audio API fix: AudioContext MUST be resumed via user gesture
['click', 'touchstart', 'touchend'].forEach(evt => {
    document.addEventListener(evt, () => {
        if (window.pcSynth && window.pcSynth.synth && window.pcSynth.synth.ctx && window.pcSynth.synth.ctx.state === 'suspended') {
            window.pcSynth.synth.ctx.resume();
        }
    }, { once: false, passive: true });
});
// Sync MIDI Ctrl toggle UI with initial state
(function syncMctrlUI() {
    const t = document.getElementById('mctrlToggle');
    if (t) t.checked = mctrlEnabled;
    const rack = document.getElementById('mctrl-rack-content');
    if (rack) rack.style.opacity = mctrlEnabled ? '' : '0.4';
})();

// Sync checkbox UI with pcSynthEnabled initial state (script runs after DOM)
(function syncPcSynthUI() {
    const pcToggle = document.getElementById('pcSynthToggle');
    if (pcToggle) pcToggle.checked = pcSynthEnabled;
})();

// Start application (DOM ready check)
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
