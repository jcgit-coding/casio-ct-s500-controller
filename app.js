// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MIDI state
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let midiAccess  = null;
let midiInput   = null;
let midiOutput  = null;

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INIT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    // Trick for Android/Chrome: Web MIDI with SysEx requires a user gesture.
    // We wait for the FIRST tap anywhere on the screen to initialize MIDI.
    let midiInitAttempted = false;
    document.addEventListener("click", () => {
        if (!midiInitAttempted) {
            midiInitAttempted = true;
            initMIDI();
        }
    }, { once: true });
    
    document.getElementById("connectBtn").addEventListener("click", () => {
        if (midiAccess) scanAndConnect(); else initMIDI();
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MIDI INIT â€” always-on with auto-reconnect
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
            setStatus("MIDI bloqueado: Toca 'Reset' o da permisos en Chrome", false);
        } else {
            setStatus("Error MIDI: " + err.message, false);
        }

    });
}

function scanAndConnect() {
    midiInput  = null;
    midiOutput = null;

    // Try CASIO / CT-S first, fallback to first available port
    for (let o of midiAccess.outputs.values()) {
        if (o.state !== 'connected') continue;
        const n = o.name.toUpperCase();
        if (!midiOutput || n.includes("CASIO") || n.includes("CT-S") || n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH")) midiOutput = o;
    }
    for (let i of midiAccess.inputs.values()) {
        if (i.state !== 'connected') continue;
        const n = i.name.toUpperCase();
        if (!midiInput || n.includes("CASIO") || n.includes("CT-S") || n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH")) midiInput = i;
    }

    if (midiOutput) {
        // Explicitly open the port to help prevent browser/device sleep
        midiOutput.open().catch(console.error);
    }
    
    if (midiInput) {
        midiInput.onmidimessage = onMIDIMessage;
    }

    if (midiOutput && midiInput) {
        setStatus("âœ“ " + midiOutput.name, true);
        document.getElementById("connectBtn").innerText = "Reconectar";
        pushAllToKeyboard();
    } else {
        setStatus("Sin dispositivos MIDI", false);
        document.getElementById("connectBtn").innerText = "Conectar";
    }
}

function setStatus(text, connected) {
    document.getElementById("statusText").innerText = text;
    document.getElementById("statusIndicator").classList.toggle("connected", connected);
}



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INCOMING MIDI (bidireccional)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function onMIDIMessage(e) {
    const [status, d1, d2] = e.data;
    
    // --- PC SYNTH HOOK ---
    if (window.sf2Ready && window.pcSynth) {
        const cmd = status & 0xF0;
        const ch = status & 0x0F;
        const vol = (document.getElementById('sf2-vol') ? parseInt(document.getElementById('sf2-vol').value) : 100) / 100;
        
        if (cmd === 0x90) { // Note On
            if (d2 > 0) {
                if (window.pcSynth.synth && window.pcSynth.synth.ctx && window.pcSynth.synth.ctx.state === 'suspended') { window.pcSynth.synth.ctx.resume(); } window.pcSynth.noteOn(d1, Math.round(d2 * vol), 0);
            } else {
                window.pcSynth.noteOff(d1, 0, 0);
            }
        } else if (cmd === 0x80) { // Note Off
            window.pcSynth.noteOff(d1, d2, 0);
        } else if (cmd === 0xB0 && d1 === 64) { // Sustain pedal
            // sf2-player library might support sustain via noteOff logic if not we ignore or handle
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

        // Sustain from physical pedal â†’ sync button UI
        if (d1 === 64) {
            tuning[part].sus = d2 >= 64;
            const btn = document.getElementById('sus-' + part);
            if (btn) {
                btn.innerText = tuning[part].sus ? 'ON' : 'OFF';
                btn.classList.toggle('sus-on', tuning[part].sus);
            }
        }

        // Update EQ memory (exclude CC 64 â€” sustain is tracked separately in tuning[part].sus)
        if (d1 !== 64) eqState[part][d1] = d2;

        // If EQ panel is showing this part, update fader UI
        if (part === activePart) {
            const fader = document.querySelector(`.eq-fader[data-cc="${d1}"]`);
            if (fader) {
                fader.value = d2;
                const ctrl  = EQ_CONTROLS.find(c => c && c.cc === d1);
                const lbl   = ctrl ? ctrl.label : '';
                const valEl = document.getElementById('eq-val-' + d1);
                if (valEl) valEl.innerText = formatVal(lbl, d2);
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  EQ PANEL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EQ sections â€” grouped logically with readable titles
const EQ_SECTIONS = [
    {
        title: 'Volumen & Panoramica',
        controls: [
            { label: 'VOLUMEN',  cc: 7,  def: 100, tip: 'Volumen' },
            { label: 'EXPRESION',  cc: 11, def: 127, tip: 'Expresion (dinamico)' },
            { label: 'PANORAMA',  cc: 10, def: 64,  tip: 'Panoramica (izq/der)' },
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
        title: 'Enviolvente (ADSR)',
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
            { label: 'REVERB', cc: 91, def: 40, tip: 'Envio de Reverb (eco de sala)' },
            { label: 'CHORUS', cc: 93, def: 0,  tip: 'Envio de Chorus (engrosamiento)' },
            { label: 'ECO',    cc: 94, def: 0,  tip: 'Envio de Delay (repeticion)' },
        ]
    },
    {
        title: 'Modulacion & Pedales',
        controls: [
            { label: 'MODULACION',       cc: 1,  def: 0, tip: 'Rueda de Modulacion' },
            { label: 'PORTAMENTO',   cc: 65, def: 0, tip: 'Portamento On/Off' },
            { label: 'TIEMPO PORT.', cc: 5,  def: 0, tip: 'Tiempo de Portamento (glide)' },
            { label: 'SOSTENUTO', cc: 66, def: 0, tip: 'Pedal Sostenuto (solo notas activas)' },
            { label: 'SOFT',      cc: 67, def: 0, tip: 'Pedal Suave (reduce volumen)' },
        ]
    },
];

// Flatten for easy CC lookup
const EQ_CONTROLS = EQ_SECTIONS.flatMap(s => s.controls);

const CATEGORY_PROFILES = {
    // Teclados ClÃ¡sicos
    'PIANO': { 91: 52 },
    'HARPSICHORD': { 91: 40, 74: 68 }, // ClavecÃ­n mÃ¡s brillante
    'ELEC.PIANO': { 91: 45, 93: 45, 74: 62 }, // Rhodes cálido con chorus
    'CLAVI': { 91: 30, 74: 70 }, // Funky brillante, poca reverb
    'VIB./CHROM.PERC.': { 91: 55, 93: 10 }, // VibrÃ¡fonos y campanitas
    
    // Ã“rganos
    'ELEC.ORGAN': { 91: 50, 93: 35 }, // Simulador de parlante rotatorio
    'PIPE ORGAN': { 91: 85, 93: 10 }, // Acústica gigante de iglesia
    'ACCORDION': { 91: 40, 93: 20 }, // Detune estilo musette
    
    // Cuerdas y Coros (Pads orgánicos)
    'STRING ENSEMBLE': { 91: 75, 93: 15, 73: 68, 74: 62 }, // Ataque suave, cálido
    'CHOIR': { 91: 85, 93: 35, 73: 72 }, // Ensambles vocales etÃ©reos
    
    // Instrumentos Solistas (Vibrato humano retrasado y ataques suaves)
    'SOLO STRINGS': { 91: 65, 73: 66, 77: 72, 78: 80 }, // ViolÃ­n/Cello
    'SOLO BRASS': { 91: 55, 77: 70, 78: 75 }, // Trompeta
    'BRASS ENSEMBLE': { 91: 60, 74: 70, 73: 66 }, // SecciÃ³n de metales brillante
    'SAX': { 91: 60, 77: 75, 78: 80, 73: 66 }, // Saxofón expresivo
    'REED': { 91: 55, 77: 70, 78: 75 }, // Oboe, Fagot, Clarinete
    'PIPE': { 91: 65, 77: 72, 78: 80 }, // Flauta traversa/dulce
    
    // Guitarras
    'ACOUS.GUITAR': { 91: 45, 93: 5, 73: 65 }, // PÃºa suavizada, cuerpo acÃºstico
    'ELEC.GUITAR': { 91: 40, 94: 30 }, // Eco para solos
    
    // Bajos (Secos para no ensuciar la mezcla)
    'ACOUS.BASS': { 91: 10, 74: 55 }, // Contrabajo oscuro/cálido
    'ELEC.BASS': { 91: 15, 74: 60 }, // Bajo elÃ©ctrico
    
    // Sintetizadores
    'SYNTH-PAD': { 91: 85, 93: 40, 74: 58, 73: 78 }, // Pads evolutivos lentos
    'SYNTH-LEAD': { 91: 60, 94: 45, 78: 75 }, // Solos sintÃ©ticos con eco
    'SYNTH-BRASS': { 91: 60, 93: 20, 74: 75 }, // Metales sintÃ©ticos brillantes
    'SYNTH-BASS': { 91: 15, 74: 70, 71: 70 }, // Bajos punchy y resonantes
    'EDM SYNTH': { 91: 50, 94: 30, 74: 75 }, // Modernos y brillantes
    'CASIO CLASSIC': { 91: 30, 93: 0 }, // Sonidos vintage secos
    
    // Étnicos y Mundo
    'INDIAN': { 91: 50, 73: 64 },
    'INDONESIAN': { 91: 50, 73: 64 },
    'ARABIC': { 91: 50, 78: 75 }, // Suelen tener maderas solistas
    'CHINESE': { 91: 50, 77: 70, 78: 75 }, // Erhu y Dizi con vibrato
    'BRAZILIAN': { 91: 40, 73: 65 },
    'ETHNIC OTHERS': { 91: 50 },
    'GM TONES': { 91: 40 } // Standard MIDI
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
    if (CATEGORY_PROFILES[cat]) {
        for (const [cc, val] of Object.entries(CATEGORY_PROFILES[cat])) {
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
    // Seed default values for all parts
    ['U1','U2','L'].forEach(part => {
        EQ_CONTROLS.forEach(ctrl => { 
            let defVal = ctrl.def;
            if (part === 'U2' && ctrl.cc === 7) defVal = 60; // default U2 vol to 60
            eqState[part][ctrl.cc] = defVal; 
        });
    });

    const container = document.getElementById('eqFaders');
    container.innerHTML = '';

    EQ_SECTIONS.forEach(section => {
        const secEl = document.createElement('div');
        secEl.className = 'fader-section';

        const titleEl = document.createElement('div');
        titleEl.className = 'fader-section-title';
        titleEl.innerText = section.title;
        secEl.appendChild(titleEl);

        const innerEl = document.createElement('div');
        innerEl.className = 'fader-section-inner';

        section.controls.forEach(ctrl => {
            const group = document.createElement('div');
            group.className = 'fader-group';

            const lbl = document.createElement('span');
            lbl.className = 'fader-label';
            lbl.innerText = ctrl.label;
            lbl.title     = ctrl.tip; // tooltip on hover

            const fader = document.createElement('input');
            fader.type = 'range';
            // fader.setAttribute("orient", "vertical"); // Removed in favor of CSS transform
            fader.className  = 'eq-fader';
            fader.dataset.cc = ctrl.cc;
            fader.title      = ctrl.tip;
            fader.min = 0; fader.max = 127;
            fader.value = ctrl.def;

            const valSpan = document.createElement('span');
            valSpan.className = 'fader-value';
            valSpan.id        = 'eq-val-' + ctrl.cc;
            valSpan.innerText = formatVal(ctrl.label, ctrl.def);

            fader.addEventListener('input', e => {
                const val = parseInt(e.target.value);
                const cc  = parseInt(e.target.dataset.cc);
                valSpan.innerText = formatVal(ctrl.label, val);
                eqState[activePart][cc] = val;
                sendCC(activePart, cc, val);
            });

            
            group.appendChild(lbl);
            
            const wrapper = document.createElement('div');
            wrapper.className = 'fader-wrapper';
            wrapper.appendChild(fader);
            group.appendChild(wrapper);
            
            group.appendChild(valSpan);
            
            const noteSpan = document.createElement('div');
            noteSpan.className = 'fader-note';
            noteSpan.innerText = ctrl.tip;
            group.appendChild(noteSpan);

            innerEl.appendChild(group);
        });

        secEl.appendChild(innerEl);
        container.appendChild(secEl);
    });

    // EDITAR EQ buttons
    document.querySelectorAll('.btn-eq').forEach(btn => {
        btn.addEventListener('click', e => switchEQ(e.currentTarget.dataset.part));
    });

    // Reset EQ button
    document.getElementById('btnResetEQ').addEventListener('click', resetEQ);

    document.getElementById('eqTargetBadge').innerText = 'UPPER 1';
    document.querySelector('.btn-eq[data-part="U1"]').classList.add('active-eq');
}

function resetEQ() {
    applySmartProfile(activePart);
}

function switchEQ(part) {
    activePart = part;
    const labels = { U1: 'UPPER 1', U2: 'UPPER 2', L: 'LOWER' };
    document.getElementById('eqTargetBadge').innerText = labels[part];

    document.querySelectorAll('.btn-eq').forEach(b => b.classList.remove('active-eq'));
    document.querySelector('.btn-eq[data-part="' + part + '"]').classList.add('active-eq');

    document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active-track'));
    document.getElementById('card-' + part).classList.add('active-track');

    // Load this part's EQ values into faders
    document.querySelectorAll('.eq-fader').forEach(fader => {
        const cc  = parseInt(fader.dataset.cc);
        const val = eqState[part][cc] !== undefined ? eqState[part][cc] : 64;
        fader.value = val;
        const ctrl  = EQ_CONTROLS.find(c => c.cc === cc);
        const valEl = document.getElementById('eq-val-' + cc);
        if (valEl) valEl.innerText = formatVal(ctrl ? ctrl.label : '', val);
    });
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  TONE SEARCH (filterable select)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function initToneSearch() {
    if (typeof db === 'undefined') return;

    const allTones = [];
    db.forEach(cat => {
        cat.tones.forEach(tone => {
            allTones.push({
                id: tone.id, name: tone.name,
                category: cat.category,
                bank: tone.bank, program: tone.program,
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
                    opt.value = JSON.stringify({ bank: t.bank, program: t.program });
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
            changeTone(part, data.bank, data.program);
            
            // Extract category and apply smart acoustic profile
            let catName = 'PIANO';
            if (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP') {
                catName = opt.parentElement.label;
            }
            
            // Delay sending 18 CCs to prevent overwhelming the Casio's MIDI buffer
            // which causes it to abort the Program Change.
            setTimeout(() => applySmartProfile(part, catName), 100);
            
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  GLOBAL TRANSPOSE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PER-PART QUICK CONTROLS (Octave, Sustain)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    document.querySelectorAll('.sus-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const part = btn.dataset.part;
            tuning[part].sus = !tuning[part].sus;
            const val = tuning[part].sus ? 127 : 0;
            btn.innerText = tuning[part].sus ? 'ON' : 'OFF';
            btn.classList.toggle('sus-on', tuning[part].sus);
            sendCC(part, 64, val);
        });
    });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PRESETS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function initPresets() {
    document.getElementById("btnSavePreset").addEventListener("click", () => {
        const input = document.getElementById("presetName");
        const name  = input.value.trim();
        if (!name) { alert("Escribe un nombre para el preset."); return; }
        const presets = JSON.parse(localStorage.getItem("casioPresets") || "{}");
        if (presets[name] && !confirm(`"${name}" ya existe. Â¿Sobreescribir?`)) return;
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
        loadBtn.innerText = 'â–¶'; loadBtn.title = 'Cargar';
        loadBtn.onclick = () => loadPreset(data);

        const overBtn = document.createElement('button');
        overBtn.innerText = 'âœï¸'; overBtn.title = 'Sobreescribir con estado actual';
        overBtn.onclick = () => { if (confirm(`Â¿Sobreescribir "${name}"?`)) captureAndSavePreset(name); };

        const delBtn = document.createElement('button');
        delBtn.innerText   = 'ðŸ—‘ï¸'; delBtn.title = 'Eliminar';
        delBtn.className   = 'del-btn';
        delBtn.onclick = () => {
            if (!confirm(`Â¿Eliminar "${name}"?`)) return;
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  ARRANGER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function initArranger() {
    let isPlaying    = false;
    let bpm          = 120;
    let clockTimer   = null;

    // â”€â”€ Rhythm list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ MIDI Clock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ BPM controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function updateBpm(delta) {
        bpm = Math.min(250, Math.max(20, bpm + delta));
        const el = document.getElementById('bpmVal');
        if (el) el.innerText = bpm;
        if (document.getElementById('chkMidiClock')?.checked) startClock(); // restart with new bpm
    }
    document.getElementById('bpmMinus')?.addEventListener('click', () => updateBpm(-1));
    document.getElementById('bpmPlus')?.addEventListener('click',  () => updateBpm(+1));

    // â”€â”€ Rhythm volume (CC7 ch9) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const volSlider = document.getElementById('rhythmVol');
    const volVal    = document.getElementById('rhythmVolVal');
    volSlider?.addEventListener('input', () => {
        const v = parseInt(volSlider.value);
        if (volVal) volVal.innerText = v;
        if (midiOutput) midiOutput.send([0xB9, 7, v]); // ch9 = 0xB9
    });

    // â”€â”€ START / STOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const btnSS = document.getElementById('btnStartStop');
    btnSS?.addEventListener('click', () => {
        if (!midiOutput) return;
        isPlaying = !isPlaying;
        if (isPlaying) {
            if (document.getElementById('chkMidiClock')?.checked) startClock();
            midiOutput.send([0xFA]); // Start
            btnSS.querySelector('.icon').innerText = 'â– ';
            btnSS.querySelector('.text').innerText = 'STOP';
        } else {
            stopClock();
            midiOutput.send([0xFC]); // Stop
            btnSS.querySelector('.icon').innerText = 'â–¶';
            btnSS.querySelector('.text').innerText = 'START / STOP';
        }
        btnSS.classList.toggle('btn-stop', isPlaying);
    });

    // â”€â”€ SYNC START â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.getElementById('btnSyncStart')?.addEventListener('click', () => {
        if (!midiOutput) return;
        midiOutput.send([0xFB]); // MIDI Continue
    });

    // â”€â”€ ACCOMP (toggle via SysEx-like approach using CC) â”€
    document.getElementById('btnAccomp')?.addEventListener('click', () => {
        // No standard MIDI CC â€” toggle visual feedback only
        const b = document.getElementById('btnAccomp');
        b.classList.toggle('active-rhythm');
    });

    // â”€â”€ INTRO / VAR / ENDING â€” CC on ch9 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MIDI SEND HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function sendCC(part, cc, value) {
    if (!midiOutput) return;
    midiOutput.send([0xB0 | CHANNEL[part], cc, value]);
}

function changeTone(part, msb, pc) {
    if (!midiOutput) return;
    const ch = CHANNEL[part];
    midiOutput.send([0xB0 | ch, 0x00, msb]);
    midiOutput.send([0xB0 | ch, 0x20, 0x00]);
    midiOutput.send([0xC0 | ch, pc]);
}

function sendCoarseTuning(part) {
    if (!midiOutput) return;
    // RPN 0x0002 = Coarse Tuning. Value 64 = center (0 semitones).
    // Octave contributes Â±12 semitones, global transpose is additional offset.
    const total = Math.min(127, Math.max(0, 64 + tuning[part].oct * 12 + globalTranspose));
    const ch = CHANNEL[part];
    midiOutput.send([0xB0 | ch, 101, 0x00]); // RPN MSB
    midiOutput.send([0xB0 | ch, 100, 0x02]); // RPN LSB (Coarse Tuning)
    midiOutput.send([0xB0 | ch, 6,   total]); // Data Entry
    midiOutput.send([0xB0 | ch, 101, 0x7F]); // RPN reset (best practice)
    midiOutput.send([0xB0 | ch, 100, 0x7F]);
}
function pushAllToKeyboard() {
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
                    changeTone(part, data.bank, data.program);
                } catch(e) {}
            }
        }
    });
}


function debugMidiPorts() {
    let msg = 'Inputs:\n';
    for(let i of midiAccess.inputs.values()) msg += '- ' + i.name + '\n';
    msg += '\nOutputs:\n';
    for(let o of midiAccess.outputs.values()) msg += '- ' + o.name + '\n';
    alert(msg || 'No midiAccess object found yet.');
}
document.getElementById('midiStatus')?.addEventListener('click', debugMidiPorts);
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
                        changeTone(part, data.bank, data.program);
                        
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
