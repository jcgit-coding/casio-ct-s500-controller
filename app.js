// ======================================================================
//  MIDI state
// ======================================================================
let midiAccess  = null;
let midiInput   = null;
let midiOutput  = null;

// PC Synth Sustain Buffer
const pcActiveNotes = {};
const pcSustainedNotes = {};
let pcSustainOn = false;

function applyPcSustain(isSustain) {
    if (!window.pcSynth) return;
    pcSustainOn = isSustain;
    if (!pcSustainOn) {
        for (const note in pcSustainedNotes) {
            if (!pcActiveNotes[note]) {
                window.pcSynth.noteOff(parseInt(note), 0, 0);
            }
            delete pcSustainedNotes[note];
        }
    }
}

// Global transpose: -12 to +12 semitones, sent to all 3 channels
let globalTranspose = 0;
const pendingBank = { U1: 0, U2: 0, L: 0 };

// Per-part state (octave and sustain are independent per channel)
const tuning = {
    U1: { oct: 0, sus: false },
    U2: { oct: 0, sus: false },
    L:  { oct: 0, sus: false }
};

// MIDI channel per part
const CHANNEL = { U1: 0, U2: 1, L: 2 };




// In-memory EQ values per part
const eqState = { U1: {}, U2: {}, L: {} };

// Which part the EQ panel is editing
let activePart = 'U1';

// ======================================================================
//  INIT
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
    buildEQ();          // also seeds eqState defaults
    initToneSearch();
    initQuickControls();
    initGlobalTranspose();
    initPresets();
    initArranger();

    // Load saved settings if any, then start auto-save
    loadAppState();
    setInterval(saveAppState, 1000);

    // Android Chrome necesita un gesto de usuario para mostrar el diálogo de
    // permisos MIDI. Esperamos el primer click en cualquier lugar de la pantalla.
    let midiInitAttempted = false;
    document.addEventListener("click", () => {
        if (!midiInitAttempted) { midiInitAttempted = true; initMIDI(); }
    }, { once: true });

    document.getElementById("connectBtn").addEventListener("click", () => {
        if (midiAccess) scanAndConnect(); else initMIDI();
    });

    
    // EQ Part Target Logic
    document.querySelectorAll('.btn-eq').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchEQ(e.currentTarget.dataset.part);
        });
    });

    // EQ Badge Target Logic (Cycle U1 -> U2 -> L -> U1)
    document.getElementById('eqTargetBadge')?.addEventListener('click', () => {
        const parts = ['U1', 'U2', 'L'];
        let nextIdx = (parts.indexOf(activePart) + 1) % parts.length;
        switchEQ(parts[nextIdx]);
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
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
        
    const envSel = document.getElementById('envSelector');
    if (envSel) {
        // Load saved env
        if (localStorage.getItem('casioEnv')) {
            currentEnv = localStorage.getItem('casioEnv');
            envSel.value = currentEnv;
        }
        envSel.addEventListener('change', (e) => {
            currentEnv = e.target.value;
            localStorage.setItem('casioEnv', currentEnv);
            // Reapply profiles to all parts that have a category
            ['U1', 'U2', 'L'].forEach(part => {
                if (activeCategories[part]) applySmartProfile(part, activeCategories[part]);
            });
            switchEQ(activePart);
            pushAllToKeyboard(); // Update hardware
        });
    }

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
});


// ======================================================================
//  MIDI INIT — always-on with auto-reconnect
// ======================================================================
function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        setStatus("Web MIDI no soportado (Usa Chrome o Edge)", false);
        return;
    }
    setStatus("Conectando...", false);
    navigator.requestMIDIAccess({ sysex: false }).then(access => {
        midiAccess = access;
        access.onstatechange = () => scanAndConnect();
        scanAndConnect();
    }, err => {
        console.error(err);
        
        if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            setStatus("MIDI bloqueado: Toca 'Reconectar' o da permisos en Chrome", false);
        } else {
            setStatus("Error MIDI: " + err.message, false);
        }
    
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'block';
    });
}

function scanAndConnect() {
    midiInput  = null;
    midiOutput = null;

    // Prefer CASIO / CT-S, fallback to first available port
    for (let o of midiAccess.outputs.values()) {
        if (o.state !== 'connected') continue;
        const n = o.name.toUpperCase();
        if (n.includes("THROUGH")) continue; // Ignore Android's internal dummy port
        if (!midiOutput || n.includes("CASIO") || n.includes("CT-S") || n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH") || n.includes("USB") || n.includes("MIDI")) midiOutput = o;
    }
    for (let i of midiAccess.inputs.values()) {
        if (i.state !== 'connected') continue;
        const n = i.name.toUpperCase();
        if (n.includes("THROUGH")) continue; // Ignore Android's internal dummy port
        if (!midiInput || n.includes("CASIO") || n.includes("CT-S") || n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH") || n.includes("USB") || n.includes("MIDI")) midiInput = i;
    }

    if (midiOutput) {
        midiOutput.open().catch(console.error);
    }

    if (midiInput) {
        midiInput.onmidimessage = onMIDIMessage;
    }

    if (midiOutput && midiInput) {
        setStatus("✓ " + midiOutput.name, true);
        document.getElementById("connectBtn").innerText = "Reconectar";
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'none';
        pushAllToKeyboard(true); // Sync CCs but DON'T overwrite keyboard instruments on boot
    } else {
        setStatus("Sin dispositivos MIDI", false);
        document.getElementById("connectBtn").innerText = "Conectar";
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
    
    // --- PC SYNTH HOOK ---
    if (window.sf2Ready && window.pcSynth) {
        const cmd = status & 0xF0;
        const vol = (document.getElementById('sf2-vol') ? parseInt(document.getElementById('sf2-vol').value) : 100) / 100;
        
        if (cmd === 0x90) { // Note On
            if (d2 > 0) {
                pcActiveNotes[d1] = true;
                if (window.pcSynth.synth && window.pcSynth.synth.ctx && window.pcSynth.synth.ctx.state === 'suspended') { window.pcSynth.synth.ctx.resume(); } 
                window.pcSynth.noteOn(d1, Math.round(d2 * vol), 0);
            } else {
                pcActiveNotes[d1] = false;
                if (pcSustainOn) pcSustainedNotes[d1] = true;
                else window.pcSynth.noteOff(d1, 0, 0);
            }
        } else if (cmd === 0x80) { // Note Off
            pcActiveNotes[d1] = false;
            if (pcSustainOn) pcSustainedNotes[d1] = true;
            else window.pcSynth.noteOff(d1, d2, 0);
        } else if (cmd === 0xB0 && d1 === 64) { // Sustain pedal
            applyPcSustain(d2 >= 64);
        }
    }
    
    // Control Change
    if (status >= 0xB0 && status <= 0xBF) {
        const ch   = status & 0x0F;
        const part = Object.keys(CHANNEL).find(k => CHANNEL[k] === ch);
        if (!part) return;

        // Catch Bank Select MSB (CC0)
        if (d1 === 0) {
            pendingBank[part] = d2;
        }

        // Sustain from physical pedal → sync button UI
        if (d1 === 64) {
            tuning[part].sus = d2 >= 64;
            const btn = document.getElementById('sus-' + part);
            if (btn) {
                btn.innerText = tuning[part].sus ? 'ON' : 'OFF';
                btn.classList.toggle('sus-on', tuning[part].sus);
            }
        }

        // Update EQ memory (exclude CC 64 — sustain is tracked separately in tuning[part].sus)
        if (d1 !== 64) eqState[part][d1] = d2;

        // If EQ panel is showing this part, update fader UI
        if (part === activePart) {
            const ctrl = EQ_CONTROLS.find(c => c && c.cc === d1);
            if (ctrl) {
                if (ctrl.type === 'switch') {
                    const btn = document.querySelector(`.eq-switch[data-cc="${d1}"]`);
                    if (btn) {
                        btn.innerText = d2 > 63 ? 'ON' : 'OFF';
                        btn.classList.toggle('sus-on', d2 > 63);
                    }
                } else {
                    const fader = document.querySelector(`.eq-fader[data-cc="${d1}"]`);
                    if (fader) fader.value = d2;
                }
                const valEl = document.getElementById('eq-val-' + d1);
                if (valEl) valEl.innerText = ctrl.type === 'switch' ? (d2 > 63 ? 'ON' : 'OFF') : formatVal(ctrl.label, d2);
            }
        }
    }

    // Program Change
    if (status >= 0xC0 && status <= 0xCF) {
        const ch = status & 0x0F;
        const part = Object.keys(CHANNEL).find(k => CHANNEL[k] === ch);
        if (!part) return;

        const pc = d1;
        const bank = pendingBank[part] || 0;

        const listEl = document.getElementById('list-' + part);
        if (listEl) {
            for (let i = 0; i < listEl.options.length; i++) {
                try {
                    const data = JSON.parse(listEl.options[i].value);
                    if (data.bank === bank && data.program === pc) {
                        listEl.selectedIndex = i;
                        // update UI elements manually (don't dispatch change to avoid loop)
                        const nameEl = document.getElementById('selectedTone-' + part);
                        if (nameEl) nameEl.innerText = listEl.options[i].text;
                        const catEl = document.getElementById('selectedCat-' + part);
                        if (catEl && listEl.options[i].parentElement && listEl.options[i].parentElement.tagName === 'OPTGROUP') {
                            catEl.innerText = listEl.options[i].parentElement.label;
                        }
                        break;
                    }
                } catch(e) {}
            }
        }
    }
}

// ======================================================================
//  EQ PANEL
// ======================================================================
// EQ sections — grouped logically with readable titles
const EQ_SECTIONS = [
    {
        title: 'Volumen & Panorámica',
        controls: [
            { label: 'VOLUMEN',  cc: 7,  def: 100, tip: 'Volumen' },
            { label: 'EXPRESIÓN',  cc: 11, def: 127, tip: 'Expresión (dinámica)' },
            { label: 'PANORAMA',  cc: 10, def: 64,  tip: 'Panorámica (izq/der)' },
        ]
    },
    {
        title: 'Filtros',
        controls: [
            { label: 'CUTOFF', cc: 74, def: 64, tip: 'Frecuencia de Corte del Filtro' },
            { label: 'RESONANCIA',   cc: 71, def: 64, tip: 'Resonancia del Filtro' },
        ]
    },
    {
        title: 'Envíolvente (ADSR)',
        controls: [
            { label: 'ATAQUE',  cc: 73, def: 64, tip: 'Tiempo de Ataque' },
            { label: 'DECAY',   cc: 75, def: 64, tip: 'Tiempo de Decaimiento' },

        ]
    },
    {
        title: 'Vibrato (LFO)',
        controls: [
            { label: 'RATE',  cc: 76, def: 64, tip: 'Velocidad del Vibrato' },
            { label: 'DEPTH', cc: 77, def: 64, tip: 'Profundidad del Vibrato' },
            { label: 'DELAY', cc: 78, def: 64, tip: 'Retraso del inicio del Vibrato' },
        ]
    },
    {
        title: 'Efectos Espaciales',
        controls: [
            { label: 'REVERB', cc: 91, def: 40, tip: 'Envío de Reverb (eco de sala)' },
            { label: 'CHORUS', cc: 93, def: 0,  tip: 'Envío de Chorus (engrosamiento)' },
            { label: 'ECO',    cc: 94, def: 0,  tip: 'Envío de Delay (repetición)' },
        ]
    },
    {
        title: 'Modulación & Pedales',
        controls: [
            { label: 'MODULACIÓN',       cc: 1,  def: 0, tip: 'Rueda de Modulación' },
            { label: 'PORTAMENTO', cc: 65, def: 0, tip: 'Portamento On/Off', type: 'switch' },
            { label: 'TIEMPO PORT.', cc: 5,  def: 0, tip: 'Tiempo de Portamento (glide)' },
            { label: 'SOSTENUTO', cc: 66, def: 0, tip: 'Pedal Sostenuto (solo notas activas)', type: 'switch' },
            { label: 'SOFT',      cc: 67, def: 0, tip: 'Pedal Suave (reduce volumen)', type: 'switch' },
        ]
    },
];

// Flatten for easy CC lookup
const EQ_CONTROLS = EQ_SECTIONS.flatMap(s => s.controls);


let currentEnv = 'Estudio';
const ENVIRONMENTS = {
    "Estudio": {
        "PIANO": {
            "74": 64,
            "91": 30
        },
        "HARPSICHORD": {
            "91": 25
        },
        "ELEC.PIANO": {
            "74": 64,
            "91": 30
        },
        "CLAVI": {
            "91": 25
        },
        "VIB./CHROM.PERC.": {
            "91": 25
        },
        "ELEC.ORGAN": {
            "91": 20,
            "93": 10
        },
        "PIPE ORGAN": {
            "91": 60
        },
        "ACCORDION": {
            "91": 25
        },
        "ACOUS.GUITAR": {
            "91": 15
        },
        "ELEC.GUITAR": {
            "91": 15
        },
        "ACOUS.BASS": {
            "91": 15
        },
        "ELEC.BASS": {
            "91": 15
        },
        "SYNTH-BASS": {
            "74": 64,
            "91": 40
        },
        "SOLO STRINGS": {
            "73": 64,
            "91": 50
        },
        "STRING ENSEMBLE": {
            "73": 64,
            "91": 50
        },
        "SOLO BRASS": {
            "91": 25
        },
        "BRASS ENSEMBLE": {
            "91": 25
        },
        "SYNTH-BRASS": {
            "74": 64,
            "91": 40
        },
        "SAX": {
            "91": 25
        },
        "REED": {
            "91": 25
        },
        "PIPE": {
            "91": 25
        },
        "SYNTH-LEAD": {
            "74": 64,
            "91": 40
        },
        "SYNTH-PAD": {
            "74": 64,
            "91": 40
        },
        "CHOIR": {
            "73": 64,
            "91": 50
        },
        "EDM SYNTH": {
            "74": 64,
            "91": 40
        },
        "CASIO CLASSIC": {
            "91": 25
        },
        "INDIAN": {
            "91": 25
        },
        "INDONESIAN": {
            "91": 25
        },
        "ARABIC": {
            "91": 25
        },
        "CHINESE": {
            "91": 25
        },
        "BRAZILIAN": {
            "91": 25
        },
        "ETHNIC OTHERS": {
            "91": 25
        },
        "GM TONES": {
            "91": 25
        }
    },
    "Vivo": {
        "PIANO": {
            "74": 70,
            "91": 45
        },
        "HARPSICHORD": {
            "74": 68,
            "91": 40
        },
        "ELEC.PIANO": {
            "74": 70,
            "91": 45
        },
        "CLAVI": {
            "74": 68,
            "91": 40
        },
        "VIB./CHROM.PERC.": {
            "74": 68,
            "91": 40
        },
        "ELEC.ORGAN": {
            "74": 70,
            "91": 30,
            "93": 30
        },
        "PIPE ORGAN": {
            "74": 72,
            "91": 70
        },
        "ACCORDION": {
            "74": 68,
            "91": 40
        },
        "ACOUS.GUITAR": {
            "74": 68,
            "91": 25
        },
        "ELEC.GUITAR": {
            "74": 68,
            "91": 25
        },
        "ACOUS.BASS": {
            "74": 68,
            "91": 25
        },
        "ELEC.BASS": {
            "74": 68,
            "91": 25
        },
        "SYNTH-BASS": {
            "74": 75,
            "91": 50,
            "93": 15
        },
        "SOLO STRINGS": {
            "73": 62,
            "91": 65
        },
        "STRING ENSEMBLE": {
            "73": 62,
            "91": 65
        },
        "SOLO BRASS": {
            "74": 68,
            "91": 40
        },
        "BRASS ENSEMBLE": {
            "74": 68,
            "91": 40
        },
        "SYNTH-BRASS": {
            "74": 75,
            "91": 50,
            "93": 15
        },
        "SAX": {
            "74": 68,
            "91": 40
        },
        "REED": {
            "74": 68,
            "91": 40
        },
        "PIPE": {
            "74": 68,
            "91": 40
        },
        "SYNTH-LEAD": {
            "74": 75,
            "91": 50,
            "93": 15
        },
        "SYNTH-PAD": {
            "74": 75,
            "91": 50,
            "93": 15
        },
        "CHOIR": {
            "73": 62,
            "91": 65
        },
        "EDM SYNTH": {
            "74": 75,
            "91": 50,
            "93": 15
        },
        "CASIO CLASSIC": {
            "74": 68,
            "91": 40
        },
        "INDIAN": {
            "74": 68,
            "91": 40
        },
        "INDONESIAN": {
            "74": 68,
            "91": 40
        },
        "ARABIC": {
            "74": 68,
            "91": 40
        },
        "CHINESE": {
            "74": 68,
            "91": 40
        },
        "BRAZILIAN": {
            "74": 68,
            "91": 40
        },
        "ETHNIC OTHERS": {
            "74": 68,
            "91": 40
        },
        "GM TONES": {
            "74": 68,
            "91": 40
        }
    },
    "Catedral": {
        "PIANO": {
            "74": 60,
            "91": 95,
            "94": 20
        },
        "HARPSICHORD": {
            "73": 70,
            "91": 90
        },
        "ELEC.PIANO": {
            "74": 60,
            "91": 95,
            "94": 20
        },
        "CLAVI": {
            "73": 70,
            "91": 90
        },
        "VIB./CHROM.PERC.": {
            "73": 70,
            "91": 90
        },
        "ELEC.ORGAN": {
            "91": 85,
            "93": 20
        },
        "PIPE ORGAN": {
            "74": 64,
            "91": 120
        },
        "ACCORDION": {
            "73": 70,
            "91": 90
        },
        "ACOUS.GUITAR": {
            "73": 70,
            "91": 75
        },
        "ELEC.GUITAR": {
            "73": 70,
            "91": 75
        },
        "ACOUS.BASS": {
            "73": 70,
            "91": 75
        },
        "ELEC.BASS": {
            "73": 70,
            "91": 75
        },
        "SYNTH-BASS": {
            "73": 75,
            "74": 55,
            "91": 100
        },
        "SOLO STRINGS": {
            "73": 85,
            "91": 110,
            "93": 40
        },
        "STRING ENSEMBLE": {
            "73": 85,
            "91": 110,
            "93": 40
        },
        "SOLO BRASS": {
            "73": 70,
            "91": 90
        },
        "BRASS ENSEMBLE": {
            "73": 70,
            "91": 90
        },
        "SYNTH-BRASS": {
            "73": 75,
            "74": 55,
            "91": 100
        },
        "SAX": {
            "73": 70,
            "91": 90
        },
        "REED": {
            "73": 70,
            "91": 90
        },
        "PIPE": {
            "73": 70,
            "91": 90
        },
        "SYNTH-LEAD": {
            "73": 75,
            "74": 55,
            "91": 100
        },
        "SYNTH-PAD": {
            "73": 75,
            "74": 55,
            "91": 100
        },
        "CHOIR": {
            "73": 85,
            "91": 110,
            "93": 40
        },
        "EDM SYNTH": {
            "73": 75,
            "74": 55,
            "91": 100
        },
        "CASIO CLASSIC": {
            "73": 70,
            "91": 90
        },
        "INDIAN": {
            "73": 70,
            "91": 90
        },
        "INDONESIAN": {
            "73": 70,
            "91": 90
        },
        "ARABIC": {
            "73": 70,
            "91": 90
        },
        "CHINESE": {
            "73": 70,
            "91": 90
        },
        "BRAZILIAN": {
            "73": 70,
            "91": 90
        },
        "ETHNIC OTHERS": {
            "73": 70,
            "91": 90
        },
        "GM TONES": {
            "73": 70,
            "91": 90
        }
    },
    "Lofi": {
        "PIANO": {
            "71": 70,
            "74": 40,
            "76": 80,
            "77": 64,
            "91": 15,
            "93": 40
        },
        "HARPSICHORD": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "ELEC.PIANO": {
            "71": 70,
            "74": 40,
            "76": 80,
            "77": 64,
            "91": 15,
            "93": 40
        },
        "CLAVI": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "VIB./CHROM.PERC.": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "ELEC.ORGAN": {
            "74": 45,
            "76": 85,
            "77": 68,
            "91": 15,
            "93": 60
        },
        "PIPE ORGAN": {
            "71": 80,
            "74": 50,
            "76": 90,
            "77": 70,
            "91": 30
        },
        "ACCORDION": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "ACOUS.GUITAR": {
            "74": 35,
            "91": 10,
            "93": 50
        },
        "ELEC.GUITAR": {
            "74": 35,
            "91": 10,
            "93": 50
        },
        "ACOUS.BASS": {
            "74": 35,
            "91": 10,
            "93": 50
        },
        "ELEC.BASS": {
            "74": 35,
            "91": 10,
            "93": 50
        },
        "SYNTH-BASS": {
            "71": 90,
            "74": 35,
            "76": 75,
            "77": 64,
            "91": 20,
            "93": 50
        },
        "SOLO STRINGS": {
            "71": 85,
            "74": 45,
            "76": 70,
            "77": 70,
            "91": 25
        },
        "STRING ENSEMBLE": {
            "71": 85,
            "74": 45,
            "76": 70,
            "77": 70,
            "91": 25
        },
        "SOLO BRASS": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "BRASS ENSEMBLE": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "SYNTH-BRASS": {
            "71": 90,
            "74": 35,
            "76": 75,
            "77": 64,
            "91": 20,
            "93": 50
        },
        "SAX": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "REED": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "PIPE": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "SYNTH-LEAD": {
            "71": 90,
            "74": 35,
            "76": 75,
            "77": 64,
            "91": 20,
            "93": 50
        },
        "SYNTH-PAD": {
            "71": 90,
            "74": 35,
            "76": 75,
            "77": 64,
            "91": 20,
            "93": 50
        },
        "CHOIR": {
            "71": 85,
            "74": 45,
            "76": 70,
            "77": 70,
            "91": 25
        },
        "EDM SYNTH": {
            "71": 90,
            "74": 35,
            "76": 75,
            "77": 64,
            "91": 20,
            "93": 50
        },
        "CASIO CLASSIC": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "INDIAN": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "INDONESIAN": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "ARABIC": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "CHINESE": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "BRAZILIAN": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "ETHNIC OTHERS": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        },
        "GM TONES": {
            "71": 75,
            "74": 40,
            "76": 75,
            "77": 60,
            "91": 20,
            "93": 45
        }
    }
};


const activeCategories = { U1: 'PIANO', U2: 'PIANO', L: 'PIANO' };

function applySmartProfile(part, category) {
    if (category) activeCategories[part] = category;
    const cat = activeCategories[part];
    
    // 1. Reset everything to generic default first
    EQ_CONTROLS.forEach(ctrl => {
        eqState[part][ctrl.cc] = ctrl.def;
    });

    // 2. Apply Category Sound Profile
    if (ENVIRONMENTS[currentEnv] && ENVIRONMENTS[currentEnv][cat]) {
        for (const [cc, val] of Object.entries(ENVIRONMENTS[currentEnv][cat])) {
            eqState[part][cc] = val;
        }
    }

    // 3. Apply Part Mix Rules
    if (part === 'U1') eqState[part][7] = 100;
    if (part === 'U2') eqState[part][7] = 60;
    if (part === 'L')  eqState[part][7] = 100;
    
    // 4. Send to keyboard and update UI
    EQ_CONTROLS.forEach(ctrl => {
        sendCC(part, ctrl.cc, eqState[part][ctrl.cc]);
        if (activePart === part) {
            const f = document.querySelector(`.eq-fader[data-cc="${ctrl.cc}"]`);
            const valEl = document.getElementById('eq-val-' + ctrl.cc);
            if (f && valEl) {
                f.value = eqState[part][ctrl.cc];
                valEl.innerText = formatVal(ctrl.label, eqState[part][ctrl.cc]);
            }
        }
    });
}

function buildEQ() {
    ['U1','U2','L'].forEach(part => {
        EQ_CONTROLS.forEach(ctrl => { 
            let defVal = ctrl.def;
            if (part === 'U2' && ctrl.cc === 7) defVal = 60;
            eqState[part][ctrl.cc] = defVal; 
        });
    });

    const container = document.getElementById('eqFaders');
    if (!container) return;
    container.innerHTML = '';

    EQ_SECTIONS.forEach(section => {
        const secEl = document.createElement('div');
        secEl.className = 'fader-section';

        const titleEl = document.createElement('div');
        titleEl.className = 'fader-section-title';
        titleEl.innerText = section.title;
        secEl.appendChild(titleEl);

        const switchesEl = document.createElement('div');
        switchesEl.className = 'fader-section-switches';
        switchesEl.style.display = 'flex';
        switchesEl.style.justifyContent = 'center';
        switchesEl.style.gap = '8px';
        switchesEl.style.marginBottom = '12px';
        switchesEl.style.flexWrap = 'wrap';
        
        const innerEl = document.createElement('div');
        innerEl.className = 'fader-section-inner';

        section.controls.forEach(ctrl => {
            if (ctrl.type === 'switch') {
                const sWrap = document.createElement('div');
                sWrap.style.display = 'flex';
                sWrap.style.flexDirection = 'column';
                sWrap.style.alignItems = 'center';
                sWrap.style.gap = '4px';
                
                const sLbl = document.createElement('span');
                sLbl.style.fontSize = '8.5px';
                sLbl.style.fontWeight = 'bold';
                sLbl.style.color = 'var(--text-muted)';
                sLbl.innerText = ctrl.label;
                
                const btn = document.createElement('button');
                btn.className = 'sus-btn eq-switch';
                btn.dataset.cc = ctrl.cc;
                btn.title = ctrl.tip;
                btn.innerText = ctrl.def > 63 ? 'ON' : 'OFF';
                if (ctrl.def > 63) btn.classList.add('sus-on');
                btn.style.padding = '4px 12px';
                btn.style.fontSize = '10px';
                
                btn.addEventListener('click', () => {
                    const currentVal = eqState[activePart][ctrl.cc] || 0;
                    const newVal = currentVal > 63 ? 0 : 127;
                    eqState[activePart][ctrl.cc] = newVal;
                    btn.innerText = newVal > 63 ? 'ON' : 'OFF';
                    btn.classList.toggle('sus-on', newVal > 63);
                    sendCC(activePart, ctrl.cc, newVal);
                    if (typeof saveAppState === 'function') saveAppState();
                });
                
                sWrap.appendChild(sLbl);
                sWrap.appendChild(btn);
                switchesEl.appendChild(sWrap);
            } else {
                const group = document.createElement('div');
                group.className = 'fader-group';
    
                const lbl = document.createElement('span');
                lbl.className = 'fader-label';
                lbl.innerText = ctrl.label;
                lbl.title     = ctrl.tip;
    
                const valSpan = document.createElement('span');
                valSpan.className = 'fader-value';
                valSpan.id        = 'eq-val-' + ctrl.cc;
                valSpan.innerText = formatVal(ctrl.label, ctrl.def);
    
                const fader = document.createElement('input');
                fader.type = 'range';
                fader.className  = 'eq-fader';
                fader.dataset.cc = ctrl.cc;
                fader.title      = ctrl.tip;
                fader.min = 0; fader.max = 127;
                fader.value = ctrl.def;
    
                fader.addEventListener('input', e => {
                    const v = parseInt(e.target.value);
                    eqState[activePart][ctrl.cc] = v;
                    valSpan.innerText = formatVal(ctrl.label, v);
                    sendCC(activePart, ctrl.cc, v);
                });
                fader.addEventListener('change', () => {
                    if (typeof saveAppState === 'function') saveAppState();
                });
    
                const note = document.createElement('div');
                note.className = 'fader-note';
                note.innerText = ctrl.tip;
    
                group.appendChild(lbl);
                group.appendChild(fader);
                group.appendChild(valSpan);
                group.appendChild(note);
                
                innerEl.appendChild(group);
            }
        });
        
        if (switchesEl.children.length > 0) secEl.appendChild(switchesEl);
        if (innerEl.children.length > 0) secEl.appendChild(innerEl);
        container.appendChild(secEl);
    });
}

function switchEQ(part) {
    activePart = part;
    const labels = { U1: 'UPPER 1', U2: 'UPPER 2', L: 'LOWER' };
    const badge = document.getElementById('eqTargetBadge');
    if (badge) badge.innerText = labels[part];

    document.querySelectorAll('.btn-eq').forEach(b => b.classList.remove('active-eq'));
    const activeEqBtn = document.querySelector('.btn-eq[data-part="' + part + '"]');
    if (activeEqBtn) activeEqBtn.classList.add('active-eq');

    document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active-track'));
    const card = document.getElementById('card-' + part);
    if (card) card.classList.add('active-track');

    EQ_CONTROLS.forEach(ctrl => {
        const val = eqState[part][ctrl.cc] !== undefined ? eqState[part][ctrl.cc] : ctrl.def;
        
        if (ctrl.type === 'switch') {
            const btn = document.querySelector(`.eq-switch[data-cc="${ctrl.cc}"]`);
            if (btn) {
                btn.innerText = val > 63 ? 'ON' : 'OFF';
                btn.classList.toggle('sus-on', val > 63);
            }
        } else {
            const fader = document.querySelector(`.eq-fader[data-cc="${ctrl.cc}"]`);
            if (fader) fader.value = val;
            
            const valEl = document.getElementById('eq-val-' + ctrl.cc);
            if (valEl) valEl.innerText = formatVal(ctrl.label, val);
        }
    });
}
function resetEQ() {
    applySmartProfile(activePart);
}

function formatVal(label, val) {
    if (label === 'PAN') {
        if (val === 64) return 'C';
        return val < 64 ? 'L' + (64 - val) : 'R' + (val - 64);
    }
    // Switch-style controls (on/off)
    if (['PORTAM.','SOSTENUTO','SOFT'].includes(label)) {
        return val >= 64 ? 'ON' : 'OFF';
    }
    return val;
}

// ======================================================================
//  TONE SEARCH (filterable select)
// ======================================================================
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
                    opt.value = JSON.stringify({ bank: t.bank, lsb: t.lsb, program: t.program });
                    opt.text  = t.label;
                    grp.appendChild(opt);
                });
                listEl.appendChild(grp);
            }
        }

        populateList(allTones);

        searchEl.addEventListener('input', () => {
            const q = searchEl.value.trim().toLowerCase();
            populateList(q ? allTones.filter(t =>
                t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
            ) : allTones);
            if (listEl.options.length > 0) listEl.selectedIndex = 0;
        });

        listEl.addEventListener('change', () => {
            const opt = listEl.options[listEl.selectedIndex];
            if (!opt) return;
            const data = JSON.parse(opt.value);
            changeTone(part, data.bank, data.lsb, data.program);
            
            // Extract category and apply smart acoustic profile
            let catName = 'PIANO';
            if (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') {
                catName = opt.parentElement.label;
            }
            
            // Delay sending 18 CCs to prevent overwhelming the Casio's MIDI buffer
            // which causes it to abort the Program Change.
            setTimeout(() => {
                applySmartProfile(part, catName);
                
                // Casio Hardware Quirk: Changing a tone via MIDI on one channel often triggers
                // an internal reset that disables the Layer (U2) and Split (L) parts physically.
                // We re-awaken them by re-sending their Program Changes right after!
                setTimeout(() => {
                    ['U1', 'U2', 'L'].forEach(p => {
                        if (p !== part) {
                            const l = document.getElementById('list-' + p);
                            if (l && l.selectedIndex >= 0) {
                                try {
                                    const d = JSON.parse(l.options[l.selectedIndex].value);
                                    changeTone(p, d.bank, d.lsb, d.program);
                                } catch(e){}
                            }
                        }
                    });
                }, 50);
            }, 100);
            
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
        
        // Ensure category label is initialized
        if (listEl.options.length > 0) {
            listEl.selectedIndex = 0;
            listEl.dispatchEvent(new Event('change'));
        }
    });
}

// ======================================================================
//  GLOBAL TRANSPOSE
// ======================================================================
function initGlobalTranspose() {
    const valEl = document.getElementById('gTrnVal');

    function updateGlobalTranspose(delta) {
        globalTranspose = Math.max(-12, Math.min(12, globalTranspose + delta));
        valEl.innerText = globalTranspose > 0 ? '+' + globalTranspose : globalTranspose;
        // Send to ALL channels via RPN Coarse Tuning
        ['U1','U2','L'].forEach(part => sendCoarseTuning(part));
    }

    document.getElementById('gTrnPlus' ).addEventListener('click', () => updateGlobalTranspose(+1));
    document.getElementById('gTrnMinus').addEventListener('click', () => updateGlobalTranspose(-1));
    document.getElementById('gTrnReset').addEventListener('click', () => {
        globalTranspose = 0;
        valEl.innerText = '0';
        ['U1','U2','L'].forEach(part => sendCoarseTuning(part));
    });
}

// ======================================================================
//  PER-PART QUICK CONTROLS (Octave, Sustain)
// ======================================================================
function initQuickControls() {
    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const part   = btn.dataset.part;
            const action = btn.dataset.action;
            if (!part) return; // skip global buttons handled elsewhere

            if (action === 'oct+' && tuning[part].oct < 3)  tuning[part].oct++;
            if (action === 'oct-' && tuning[part].oct > -3) tuning[part].oct--;

            const octEl = document.getElementById('oct-' + part);
            if (octEl) octEl.innerText = tuning[part].oct > 0 ? '+' + tuning[part].oct : tuning[part].oct;

            sendCoarseTuning(part);
        });
    });

    document.querySelectorAll('button[id^="sus-"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const part = btn.dataset.part;
            tuning[part].sus = !tuning[part].sus;
            const val = tuning[part].sus ? 127 : 0;
            btn.innerText = tuning[part].sus ? 'ON' : 'OFF';
            btn.classList.toggle('sus-on', tuning[part].sus);
            
            // Sync PC Synth sustain if manipulating Upper 1
            if (part === 'U1') applyPcSustain(tuning[part].sus);
            
            sendCC(part, 64, val);
              if (val === 0) {
                  // Casio CT-S500 sometimes ignores a single CC64=0 if the buffer is busy.
                  // Send it again after 20ms, and also clear Sostenuto (CC 66)
                  setTimeout(() => {
                      sendCC(part, 64, 0);
                      sendCC(part, 66, 0);
                      
                      // Also sync the UI to reflect that Sostenuto was cleared
                      if (eqState[part] && eqState[part][66] !== 0) {
                          eqState[part][66] = 0;
                          if (activePart === part) {
                              const sosBtn = document.querySelector('.eq-switch[data-cc="66"]');
                              if (sosBtn) {
                                  sosBtn.innerText = 'OFF';
                                  sosBtn.classList.remove('sus-on');
                              }
                          }
                      }
                  }, 20);
              }

        });
    });
}

// ======================================================================
//  PRESETS
// ======================================================================
function initPresets() {
    document.getElementById("btnSavePreset").addEventListener("click", () => {
        const input = document.getElementById("presetName");
        const name  = input.value.trim();
        if (!name) { alert("Escribe un nombre para el preset."); return; }
        const presets = JSON.parse(localStorage.getItem("casioPresets") || "{}");
        if (presets[name] && !confirm(`"${name}" ya existe. ¿Sobrescribir?`)) return;
        captureAndSavePreset(name);
        input.value = '';
    });
    renderPresets();
}

function captureAndSavePreset(name) {
    const data = {
        eqState:         JSON.parse(JSON.stringify(eqState)),
        tuning:          JSON.parse(JSON.stringify(tuning)),
        globalTranspose: globalTranspose,
        tones: {
            U1: (() => { const l = document.getElementById('list-U1'); return l && l.selectedIndex >= 0 ? l.options[l.selectedIndex].text : ''; })(),
            U2: (() => { const l = document.getElementById('list-U2'); return l && l.selectedIndex >= 0 ? l.options[l.selectedIndex].text : ''; })(),
            L:  (() => { const l = document.getElementById('list-L');  return l && l.selectedIndex >= 0 ? l.options[l.selectedIndex].text : ''; })(),
        }
    };
    const presets = JSON.parse(localStorage.getItem("casioPresets") || "{}");
    presets[name] = data;
    localStorage.setItem("casioPresets", JSON.stringify(presets));
    renderPresets();
}

function loadPreset(data) {
    ['U1','U2','L'].forEach(part => {
        if (data.eqState?.[part])  Object.assign(eqState[part], data.eqState[part]);
        if (data.tuning?.[part]) {
            tuning[part].oct = data.tuning[part].oct || 0;
            tuning[part].sus = data.tuning[part].sus || false;

            const octEl = document.getElementById('oct-' + part);
            if (octEl) octEl.innerText = tuning[part].oct > 0 ? '+' + tuning[part].oct : tuning[part].oct;

            const susBtn = document.getElementById('sus-' + part);
            if (susBtn) {
                susBtn.innerText = tuning[part].sus ? 'ON' : 'OFF';
                susBtn.classList.toggle('sus-on', tuning[part].sus);
            }
        }
        // Restore tone selection
        if (data.tones?.[part]) {
            const listEl = document.getElementById('list-' + part);
            if (listEl) {
                for (let i = 0; i < listEl.options.length; i++) {
                    if (listEl.options[i].text === data.tones[part]) {
                        listEl.selectedIndex = i;
                        // update custom UI text
                        const nameEl = document.getElementById('selectedTone-' + part);
                        if (nameEl) nameEl.innerText = listEl.options[i].text;
                        const catEl = document.getElementById('selectedCat-' + part);
                        if (catEl && listEl.options[i].parentElement && listEl.options[i].parentElement.tagName === 'OPTGROUP') {
                            catEl.innerText = listEl.options[i].parentElement.label;
                        }
                        break;
                    }
                }
            }
        }
    });

    // Restore global transpose
    if (data.globalTranspose !== undefined) {
        globalTranspose = data.globalTranspose;
        const valEl = document.getElementById('gTrnVal');
        if (valEl) valEl.innerText = globalTranspose > 0 ? '+' + globalTranspose : globalTranspose;
    }

    switchEQ(activePart);
    pushAllToKeyboard();
}

function renderPresets() {
    const list    = document.getElementById("presetsList");
    const presets = JSON.parse(localStorage.getItem("casioPresets") || "{}");
    list.innerHTML = '';

    for (const [name, data] of Object.entries(presets)) {
        const item = document.createElement('div');
        item.className = 'preset-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-item-name';
        nameSpan.title     = name;
        nameSpan.innerText = name;

        const actions = document.createElement('div');
        actions.className = 'preset-actions';

        const loadBtn = document.createElement('button');
        loadBtn.innerText = 'Cargar'; loadBtn.title = 'Cargar preset';
        loadBtn.onclick = () => loadPreset(data);

        const overBtn = document.createElement('button');
        overBtn.innerText = 'Guardar'; overBtn.title = 'Sobrescribir con el estado actual';
        overBtn.onclick = () => { if (confirm(`¿Sobrescribir "${name}"?`)) captureAndSavePreset(name); };

        const delBtn = document.createElement('button');
        delBtn.innerText = 'Borrar'; delBtn.title = 'Eliminar preset';
        delBtn.className   = 'del-btn';
        delBtn.onclick = () => {
            if (!confirm(`¿Eliminar "${name}"?`)) return;
            const p = JSON.parse(localStorage.getItem("casioPresets") || "{}");
            delete p[name];
            localStorage.setItem("casioPresets", JSON.stringify(p));
            renderPresets();
        };

        actions.appendChild(loadBtn);
        actions.appendChild(overBtn);
        actions.appendChild(delBtn);
        item.appendChild(nameSpan);
        item.appendChild(actions);
        list.appendChild(item);
    }
}

// ======================================================================
//  ARRANGER
// ======================================================================
function initArranger() {
    let isPlaying    = false;
    let bpm          = 120;
    let clockTimer   = null;

    // ── Rhythm list ──────────────────────────────────
    function buildRhythmList(filter = '', cat = 'Todos') {
        const list = document.getElementById('rhythmList');
        if (!list || !window.RAW_RHYTHMS) return;

        const items = RAW_RHYTHMS.filter(r => {
            const matchCat = cat === 'Todos' || r.cat === cat;
            const matchQ   = r.name.toLowerCase().includes(filter.toLowerCase());
            return matchCat && matchQ;
        });

        list.innerHTML = '';
        items.forEach(r => {
            const div = document.createElement('div');
            div.className = 'rhythm-item';
            div.innerHTML = `<span class="rhythm-num">${String(r.id).padStart(3,'0')}</span><span class="rhythm-name">${r.name}</span><span class="rhythm-cat">${r.cat}</span>`;
            div.addEventListener('click', () => {
                document.querySelectorAll('.rhythm-item').forEach(d => d.classList.remove('active'));
                div.classList.add('active');
            });
            list.appendChild(div);
        });
    }

    // Populate category filter
    function buildCatFilter() {
        const sel = document.getElementById('rhythmCatFilter');
        if (!sel || !window.RAW_RHYTHMS) return;
        const cats = ['Todos', ...new Set(RAW_RHYTHMS.map(r => r.cat))];
        sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        sel.addEventListener('change', () => buildRhythmList(
            document.getElementById('rhythmSearch')?.value || '', sel.value
        ));
    }

    buildCatFilter();
    buildRhythmList();

    document.getElementById('rhythmSearch')?.addEventListener('input', e => {
        buildRhythmList(e.target.value, document.getElementById('rhythmCatFilter')?.value || 'Todos');
    });

    // ── MIDI Clock ───────────────────────────────────
    function startClock() {
        stopClock();
        const interval = (60000 / bpm) / 24; // ms per pulse
        clockTimer = setInterval(() => {
            if (midiOutput) midiOutput.send([0xF8]);
        }, interval);
    }
    function stopClock() {
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    }

    document.getElementById('chkMidiClock')?.addEventListener('change', e => {
        if (e.target.checked) startClock(); else stopClock();
    });

    // ── BPM controls ─────────────────────────────────
    function updateBpm(delta) {
        bpm = Math.min(250, Math.max(20, bpm + delta));
        const el = document.getElementById('bpmVal');
        if (el) el.innerText = bpm;
        if (document.getElementById('chkMidiClock')?.checked) startClock(); // restart with new bpm
    }
    document.getElementById('bpmMinus')?.addEventListener('click', () => updateBpm(-1));
    document.getElementById('bpmPlus')?.addEventListener('click',  () => updateBpm(+1));

    // ── Rhythm volume (CC7 ch9) ───────────────────────
    const volSlider = document.getElementById('rhythmVol');
    const volVal    = document.getElementById('rhythmVolVal');
    volSlider?.addEventListener('input', () => {
        const v = parseInt(volSlider.value);
        if (volVal) volVal.innerText = v;
        if (midiOutput) midiOutput.send([0xB9, 7, v]); // ch9 = 0xB9
    });

    // ── START / STOP ─────────────────────────────────
    const btnSS = document.getElementById('btnStartStop');
    btnSS?.addEventListener('click', () => {
        if (!midiOutput) return;
        isPlaying = !isPlaying;
        if (isPlaying) {
            if (document.getElementById('chkMidiClock')?.checked) startClock();
            midiOutput.send([0xFA]); // Start
            btnSS.querySelector('.icon').innerHTML = '<span class="material-symbols-outlined">stop</span>';
            btnSS.querySelector('.text').innerText = 'STOP';
        } else {
            stopClock();
            midiOutput.send([0xFC]); // Stop
            btnSS.querySelector('.icon').innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
            btnSS.querySelector('.text').innerText = 'START / STOP';
        }
        btnSS.classList.toggle('btn-stop', isPlaying);
    });

    // ── SYNC START ───────────────────────────────────
    document.getElementById('btnSyncStart')?.addEventListener('click', () => {
        if (!midiOutput) return;
        midiOutput.send([0xFB]); // MIDI Continue
    });

    // ── ACCOMP (toggle via SysEx-like approach using CC) ─
    document.getElementById('btnAccomp')?.addEventListener('click', () => {
        // No standard MIDI CC — toggle visual feedback only
        const b = document.getElementById('btnAccomp');
        b.classList.toggle('active-rhythm');
    });

    // ── INTRO / VAR / ENDING — CC on ch9 ─────────────
    // Based on Casio CT-S500 MIDI implementation (CC 86-89 channel 9)
    document.getElementById('btnIntro')?.addEventListener('click', () => {
        if (midiOutput) midiOutput.send([0xB9, 86, 1]);
    });
    document.getElementById('btnVar1')?.addEventListener('click', () => {
        if (midiOutput) midiOutput.send([0xB9, 87, 1]);
    });
    document.getElementById('btnVar2')?.addEventListener('click', () => {
        if (midiOutput) midiOutput.send([0xB9, 88, 1]);
    });
    document.getElementById('btnEnding')?.addEventListener('click', () => {
        if (midiOutput) midiOutput.send([0xB9, 89, 1]);
    });
}

// ======================================================================
//  MIDI SEND HELPERS
// ======================================================================
function sendCC(part, cc, value) {
    if (!midiOutput) return;
    midiOutput.send([0xB0 | CHANNEL[part], cc, value]);
}

function changeTone(part, msb, lsb, pc) {
    if (!midiOutput) return;
    const ch = CHANNEL[part];
    midiOutput.send([0xB0 | ch, 0x00, msb]);
    midiOutput.send([0xB0 | ch, 0x20, lsb || 0]);
    midiOutput.send([0xC0 | ch, pc]);
}

function sendCoarseTuning(part) {
    if (!midiOutput) return;
    // RPN 0x0002 = Coarse Tuning. Value 64 = center (0 semitones).
    // Octave contributes ±12 semitones, global transpose is additional offset.
    const total = Math.min(127, Math.max(0, 64 + tuning[part].oct * 12 + globalTranspose));
    const ch = CHANNEL[part];
    midiOutput.send([0xB0 | ch, 101, 0x00]); // RPN MSB
    midiOutput.send([0xB0 | ch, 100, 0x02]); // RPN LSB (Coarse Tuning)
    midiOutput.send([0xB0 | ch, 6,   total]); // Data Entry
    midiOutput.send([0xB0 | ch, 101, 0x7F]); // RPN reset (best practice)
    midiOutput.send([0xB0 | ch, 100, 0x7F]);
}
function pushAllToKeyboard(skipTones = false) {
    ['U1','U2','L'].forEach(part => {
        EQ_CONTROLS.forEach(ctrl => {
            if (!ctrl) return;
            sendCC(part, ctrl.cc, eqState[part][ctrl.cc] !== undefined ? eqState[part][ctrl.cc] : ctrl.def);
        });
        sendCoarseTuning(part);
        sendCC(part, 64, tuning[part].sus ? 127 : 0);
        
        const listEl = document.getElementById('list-' + part);
        if (listEl && listEl.selectedIndex >= 0) {
            const opt = listEl.options[listEl.selectedIndex];
            if (opt && opt.value) {
                
try {
    const data = JSON.parse(opt.value);
    if (!skipTones) changeTone(part, data.bank, data.lsb, data.program);
} catch(e) {}

            }
        }
    });
}


function debugMidiPorts() {
    if (!midiAccess) { alert('MIDI aún no inicializado. Toca la pantalla y reintenta.'); return; }
    let msg = 'Entradas:\n';
    for (let i of midiAccess.inputs.values()) msg += '- ' + i.name + ' (' + i.state + ')\n';
    msg += '\nSalidas:\n';
    for (let o of midiAccess.outputs.values()) msg += '- ' + o.name + ' (' + o.state + ')\n';
    alert(msg || 'Sin puertos MIDI.');
}
document.querySelector('.status-badge')?.addEventListener('click', () => {
    if (midiAccess) scanAndConnect(); else initMIDI();
});
function saveAppState() {
    const appState = {
        eqState,
        tuning,
        globalTranspose,
        activePart,
        tones: {
            U1: document.getElementById('list-U1') ? document.getElementById('list-U1').selectedIndex : 0,
            U2: document.getElementById('list-U2') ? document.getElementById('list-U2').selectedIndex : 0,
            L: document.getElementById('list-L') ? document.getElementById('list-L').selectedIndex : 0
        }
    };
    localStorage.setItem('casioAppState', JSON.stringify(appState));
}

function loadAppState() {
    try {
        const saved = JSON.parse(localStorage.getItem('casioAppState'));
        if (!saved) return;
        
        if (saved.eqState) Object.assign(eqState, saved.eqState);
        if (saved.tuning) Object.assign(tuning, saved.tuning);
        if (saved.globalTranspose !== undefined) {
            globalTranspose = saved.globalTranspose;
            document.getElementById('gTrnVal').innerText = (globalTranspose>0?'+':'')+globalTranspose;
        }
        if (saved.activePart) {
            activePart = saved.activePart;
            // Update UI buttons
            document.querySelectorAll('.btn-eq').forEach(b => b.classList.toggle('active-eq', b.dataset.part === activePart));
        }
        
        if (saved.tones) {
            ['U1', 'U2', 'L'].forEach(part => {
                const list = document.getElementById('list-' + part);
                if (list && saved.tones[part] !== undefined) {
                    list.selectedIndex = saved.tones[part];
                    
                    // Manually change tone and update UI instead of firing 'change' 
                    // which would trigger applySmartProfile and wipe saved eqState!
                    const opt = list.options[list.selectedIndex];
                    if (opt) {
                        const data = JSON.parse(opt.value);
                        
// changeTone(part, data.bank, data.lsb, data.program); // Disabled on boot so we don't force the keyboard
const nameEl = document.getElementById('selectedTone-' + part);

                        if (nameEl) nameEl.innerText = opt.text;
                        
                        const catEl = document.getElementById('selectedCat-' + part);
                        if (catEl && opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') {
                            catEl.innerText = opt.parentElement.label;
                            activeCategories[part] = opt.parentElement.label; // Restore active category tracking
                        }
                    }
                }
                // Update tuning UI
                document.getElementById('oct-' + part).innerText = (tuning[part].oct>0?'+':'')+tuning[part].oct;
                const susBtn = document.getElementById('sus-' + part);
                if (susBtn) {
                    susBtn.innerText = tuning[part].sus ? 'ON' : 'OFF';
                    susBtn.classList.toggle('sus-on', tuning[part].sus);
                }
            });
        }
        switchEQ(activePart); // updates sliders on screen
    } catch (e) {
        console.error("Error loading app state:", e);
    }
}

// --- PC SYNTH (SF2 PLAYER) ---

// --- PC SYNTH FILE LOADER ---
window.pcSynth = null;
window.sf2Ready = false;

document.getElementById('sf2-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('sf2-status');
    statusEl.innerHTML = '<span style="color:var(--accent);">Cargando motor de audio y archivo...</span>';

    try {
        const module = await import('https://unpkg.com/sf2-player');
        const SoundFont = module.default;
        if (!window.pcSynth) window.pcSynth = new SoundFont();
        
        await window.pcSynth.loadSoundFontFromFile(file);
        window.pcSynth.bank = window.pcSynth.banks[0].id;
        window.pcSynth.program = window.pcSynth.programs[0].id;
        
        window.sf2Ready = true;
        statusEl.innerHTML = '<span style="color:#4CAF50;"> Listo: ' + file.name + '</span>';
    } catch (err) {
        console.error(err);
        statusEl.innerHTML = '<span style="color:#F44336;">Error cargando el archivo .sf2</span>';
        window.sf2Ready = false;
    }
});

document.getElementById('sf2-vol')?.addEventListener('input', (e) => {
    document.getElementById('sf2-vol-val').innerText = e.target.value;
});







// Mobile Web Audio API fix: AudioContext MUST be resumed via user gesture
['click', 'touchstart', 'touchend'].forEach(evt => {
    document.addEventListener(evt, () => {
        if (window.pcSynth && window.pcSynth.synth && window.pcSynth.synth.ctx && window.pcSynth.synth.ctx.state === 'suspended') {
            window.pcSynth.synth.ctx.resume();
        }
    }, { once: false, passive: true });
});
