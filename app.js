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
        // Pre-init AudioContext on first gesture so PC synth is ready immediately
        if (window.pcSynth && typeof window.pcSynth._audio === 'function') window.pcSynth._audio();
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

    // EQ Reset Button
    document.getElementById('btnResetEQ')?.addEventListener('click', () => resetEQ());

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
    navigator.requestMIDIAccess({ sysex: true }).then(access => {
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

    const allOuts = [...midiAccess.outputs.values()];
    const allIns  = [...midiAccess.inputs.values()];
    console.log('[MIDI] outputs:', allOuts.map(o => o.name + ' state=' + o.state + ' conn=' + o.connection));
    console.log('[MIDI] inputs:', allIns.map(i => i.name + ' state=' + i.state + ' conn=' + i.connection));

    // Prefer CASIO / CT-S, fallback to first available port (skip THROUGH ports)
    for (let o of allOuts) {
        if (o.state !== 'connected') continue;
        const n = o.name.toUpperCase();
        if (n.includes("THROUGH")) continue;
        if (!midiOutput || n.includes("CASIO") || n.includes("CT-S") || n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH") || n.includes("USB") || n.includes("MIDI")) midiOutput = o;
    }
    for (let i of allIns) {
        if (i.state !== 'connected') continue;
        const n = i.name.toUpperCase();
        if (n.includes("THROUGH")) continue;
        if (!midiInput || n.includes("CASIO") || n.includes("CT-S") || n.includes("WU-BT") || n.includes("BLE") || n.includes("BLUETOOTH") || n.includes("USB") || n.includes("MIDI")) midiInput = i;
    }
    console.log('[MIDI] selected output:', midiOutput?.name, '| selected input:', midiInput?.name);

    if (midiOutput) {
        midiOutput.open().catch(console.error);
    }

    if (midiInput) {
        midiInput.onmidimessage = onMIDIMessage;
    }

    if (midiInput) {
        const name = (midiOutput || midiInput).name;
        const label = midiOutput ? "✓ " + name : "✓ " + name + " (solo entrada)";
        setStatus(label, true);
        document.getElementById("connectBtn").innerText = "Reconectar";
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'none';
        if (midiOutput) pushAllToKeyboard(true);
    } else {
        const outs = [...midiAccess.outputs.values()].filter(o => o.state === 'connected').length;
        const ins  = [...midiAccess.inputs.values()].filter(i => i.state === 'connected').length;
        setStatus("Sin dispositivos MIDI (" + ins + " ent. / " + outs + " sal.)", false);
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

        // CC7 = master volume: applies to all parts regardless of channel
        if (d1 === 7) {
            ['U1','U2','L'].forEach(p => { eqState[p][7] = d2; });
            const fader = document.querySelector('.eq-fader[data-cc="7"]');
            if (fader) fader.value = d2;
            const valEl = document.getElementById('eq-val-7');
            if (valEl) valEl.innerText = formatVal('VOLUMEN', d2);
            if (window.pcSynth && window.pcSynth.applyCC) window.pcSynth.applyCC(7, d2);
            return;
        }

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
        // Mirror program to SF2 synth so PC sound matches keyboard tone (U1 only)
        if (part === 'U1' && window.pcSynth && window.pcSynth.programChange) {
            window.pcSynth.programChange(d1);
        }

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
// CC74=Brillo(cutoff) CC71=Resonancia CC73=Attack CC72=Release CC91=Reverb CC93=Chorus CC77=VibRate CC78=VibDepth CC94=Detune
// Defaults: 74→64(neutro) 71→0(sin resonancia) 73→64 72→64 91→0 93→0 77→0 78→0 94→0
const ENVIRONMENTS = {
    "Estudio": {
        // Seco, preciso, mínimo color. CC71=0 (sin resonancia extra) en casi todo.
        "PIANO":            { "74":68, "71":0,  "73":55, "91":18 },
        "HARPSICHORD":      { "74":70, "71":0,  "73":45, "91":14 },
        "ELEC.PIANO":       { "74":62, "71":0,  "91":22, "93":12 },
        "CLAVI":            { "74":70, "71":0,  "73":45, "91":14 },
        "VIB./CHROM.PERC.": { "74":72, "71":0,  "91":28, "93":8  },
        "ELEC.ORGAN":       { "74":64, "71":0,  "91":20, "93":40, "77":68 },
        "PIPE ORGAN":       { "74":62, "71":0,  "91":55, "93":8  },
        "ACCORDION":        { "74":64, "71":0,  "91":18, "93":10 },
        "ACOUS.GUITAR":     { "74":66, "71":0,  "73":60, "91":12 },
        "ELEC.GUITAR":      { "74":68, "71":0,  "73":58, "91":16, "93":8  },
        "ACOUS.BASS":       { "74":52, "71":0,  "75":55, "91":8  },
        "ELEC.BASS":        { "74":60, "71":0,  "75":58, "91":6  },
        "SYNTH-BASS":       { "74":48, "71":72, "73":50, "75":52, "91":12 },
        "SOLO STRINGS":     { "74":62, "71":0,  "73":68, "77":62, "78":70, "91":35 },
        "STRING ENSEMBLE":  { "74":60, "71":0,  "73":72, "91":42, "93":14 },
        "SOLO BRASS":       { "74":72, "71":0,  "73":58, "91":25 },
        "BRASS ENSEMBLE":   { "74":72, "71":55, "73":55, "91":30, "93":8  },
        "SYNTH-BRASS":      { "74":65, "71":60, "73":58, "91":35, "93":14 },
        "SAX":              { "74":68, "71":0,  "73":58, "77":58, "91":22 },
        "REED":             { "74":62, "71":0,  "73":60, "91":20 },
        "PIPE":             { "74":68, "71":0,  "73":62, "78":62, "91":28 },
        "SYNTH-LEAD":       { "74":68, "71":72, "91":38, "94":24 },
        "SYNTH-PAD":        { "74":50, "71":45, "73":88, "91":58, "93":38, "94":16 },
        "CHOIR":            { "74":58, "71":0,  "73":80, "91":55, "93":22 },
        "EDM SYNTH":        { "74":78, "71":85, "73":55, "91":32, "94":26 },
        "CASIO CLASSIC":    { "74":64, "91":18 },
        "INDIAN":           { "74":66, "91":28 },
        "INDONESIAN":       { "74":64, "91":25 },
        "ARABIC":           { "74":66, "91":25 },
        "CHINESE":          { "74":66, "91":25 },
        "BRAZILIAN":        { "74":64, "91":22 },
        "ETHNIC OTHERS":    { "74":64, "91":22 },
        "GM TONES":         { "74":64, "91":22 }
    },
    "Vivo": {
        // En vivo — más presencia, más reverb, más vibrato para vientos/cuerdas
        "PIANO":            { "74":75, "71":38, "73":60, "91":50 },
        "HARPSICHORD":      { "74":74, "71":15, "73":50, "91":30 },
        "ELEC.PIANO":       { "74":72, "71":22, "91":48, "93":28 },
        "CLAVI":            { "74":74, "71":18, "73":50, "91":28 },
        "VIB./CHROM.PERC.": { "74":78, "71":18, "91":52, "93":16 },
        "ELEC.ORGAN":       { "74":70, "71":18, "91":40, "93":58, "77":78 },
        "PIPE ORGAN":       { "74":70, "71":18, "91":72, "93":16 },
        "ACCORDION":        { "74":70, "71":14, "91":42 },
        "ACOUS.GUITAR":     { "74":74, "71":8,  "73":58, "91":38 },
        "ELEC.GUITAR":      { "74":75, "71":12, "73":56, "91":42, "93":20, "94":16 },
        "ACOUS.BASS":       { "74":58, "71":0,  "75":52, "91":22 },
        "ELEC.BASS":        { "74":70, "71":8,  "75":55, "91":18 },
        "SYNTH-BASS":       { "74":60, "71":88, "73":52, "75":48, "91":30, "93":10 },
        "SOLO STRINGS":     { "74":70, "71":12, "73":65, "72":80, "77":76, "78":66, "91":65 },
        "STRING ENSEMBLE":  { "74":72, "71":10, "73":72, "91":70, "93":36 },
        "SOLO BRASS":       { "74":80, "71":8,  "73":58, "91":52 },
        "BRASS ENSEMBLE":   { "74":82, "71":70, "73":55, "91":55, "93":16 },
        "SYNTH-BRASS":      { "74":78, "71":75, "73":58, "91":60, "93":28 },
        "SAX":              { "74":75, "71":10, "73":58, "77":70, "91":52 },
        "REED":             { "74":70, "71":8,  "91":45 },
        "PIPE":             { "74":75, "71":8,  "78":60, "91":55 },
        "SYNTH-LEAD":       { "74":82, "71":80, "91":62, "94":26 },
        "SYNTH-PAD":        { "74":62, "71":55, "73":85, "91":72, "93":62, "94":26 },
        "CHOIR":            { "74":68, "71":10, "73":80, "91":72, "93":40 },
        "EDM SYNTH":        { "74":88, "71":92, "73":55, "91":55, "94":28 },
        "CASIO CLASSIC":    { "74":70, "91":35 },
        "INDIAN":           { "74":72, "91":45 },
        "INDONESIAN":       { "74":72, "91":45 },
        "ARABIC":           { "74":72, "91":45 },
        "CHINESE":          { "74":72, "91":45 },
        "BRAZILIAN":        { "74":72, "91":42 },
        "ETHNIC OTHERS":    { "74":72, "91":42 },
        "GM TONES":         { "74":70, "91":40 }
    },
    "Sala": {
        // Sala de conciertos — mucho reverb, CC72 (release) largo en sostenidos
        "PIANO":            { "74":70, "71":20, "73":65, "72":88, "91":65 },
        "HARPSICHORD":      { "74":72, "71":10, "73":52, "91":48 },
        "ELEC.PIANO":       { "74":68, "71":14, "91":58, "93":16 },
        "CLAVI":            { "74":70, "71":12, "73":52, "91":42 },
        "VIB./CHROM.PERC.": { "74":75, "71":16, "91":58, "93":12 },
        "ELEC.ORGAN":       { "74":68, "71":16, "91":52, "93":48, "77":70 },
        "PIPE ORGAN":       { "74":64, "71":14, "72":112, "91":92, "93":10 },
        "ACCORDION":        { "74":68, "71":10, "91":48 },
        "ACOUS.GUITAR":     { "74":72, "71":6,  "73":58, "91":48 },
        "ELEC.GUITAR":      { "74":74, "71":10, "73":56, "91":52, "93":12 },
        "ACOUS.BASS":       { "74":56, "71":0,  "75":52, "91":28 },
        "ELEC.BASS":        { "74":66, "71":6,  "75":56, "91":22 },
        "SYNTH-BASS":       { "74":52, "71":80, "73":54, "75":50, "91":38 },
        "SOLO STRINGS":     { "74":65, "71":10, "73":68, "72":92, "77":72, "78":74, "91":72 },
        "STRING ENSEMBLE":  { "74":66, "71":8,  "73":75, "72":98, "91":82, "93":30 },
        "SOLO BRASS":       { "74":78, "71":6,  "73":58, "91":58 },
        "BRASS ENSEMBLE":   { "74":80, "71":65, "73":56, "91":68, "93":12 },
        "SYNTH-BRASS":      { "74":74, "71":72, "73":58, "91":68, "93":20 },
        "SAX":              { "74":72, "71":8,  "73":58, "77":65, "91":58 },
        "REED":             { "74":66, "71":6,  "73":58, "91":52 },
        "PIPE":             { "74":74, "71":6,  "73":60, "78":68, "91":68 },
        "SYNTH-LEAD":       { "74":74, "71":76, "91":62, "94":30 },
        "SYNTH-PAD":        { "74":58, "71":50, "73":90, "72":102, "91":82, "93":50, "94":20 },
        "CHOIR":            { "74":62, "71":8,  "73":85, "72":100, "91":82, "93":36 },
        "EDM SYNTH":        { "74":82, "71":85, "73":55, "91":58, "94":30 },
        "CASIO CLASSIC":    { "74":68, "91":48 },
        "INDIAN":           { "74":70, "91":52 },
        "INDONESIAN":       { "74":70, "91":52 },
        "ARABIC":           { "74":70, "91":52 },
        "CHINESE":          { "74":70, "91":52 },
        "BRAZILIAN":        { "74":70, "91":48 },
        "ETHNIC OTHERS":    { "74":70, "91":48 },
        "GM TONES":         { "74":68, "91":48 }
    },
    "Jazz": {
        // Club de jazz — cálido (CC74 bajo), íntimo, reverb mínimo
        "PIANO":            { "74":52, "71":16, "73":60, "91":18 },
        "HARPSICHORD":      { "74":60, "71":8,  "73":52, "91":14 },
        "ELEC.PIANO":       { "74":58, "71":10, "91":24, "93":8  },
        "CLAVI":            { "74":62, "71":10, "73":52, "91":14 },
        "VIB./CHROM.PERC.": { "74":65, "71":8,  "91":28, "93":6  },
        "ELEC.ORGAN":       { "74":62, "71":8,  "91":18, "93":52, "77":76 },
        "PIPE ORGAN":       { "74":58, "71":6,  "91":42, "93":8  },
        "ACCORDION":        { "74":60, "71":6,  "91":16, "93":10 },
        "ACOUS.GUITAR":     { "74":60, "71":4,  "73":62, "91":14 },
        "ELEC.GUITAR":      { "74":62, "71":6,  "73":60, "91":16, "93":6  },
        "ACOUS.BASS":       { "74":44, "71":0,  "75":65, "91":6  },
        "ELEC.BASS":        { "74":58, "71":4,  "75":62, "91":5  },
        "SYNTH-BASS":       { "74":42, "71":72, "73":60, "75":60, "91":10 },
        "SOLO STRINGS":     { "74":60, "71":8,  "73":70, "77":66, "78":74, "91":32 },
        "STRING ENSEMBLE":  { "74":56, "71":6,  "73":78, "91":42, "93":16 },
        "SOLO BRASS":       { "74":66, "71":6,  "73":60, "91":24 },
        "BRASS ENSEMBLE":   { "74":68, "71":58, "73":58, "91":28, "93":6  },
        "SYNTH-BRASS":      { "74":62, "71":60, "73":60, "91":28, "93":10 },
        "SAX":              { "74":60, "71":8,  "73":60, "77":70, "91":24 },
        "REED":             { "74":56, "71":6,  "73":60, "91":18 },
        "PIPE":             { "74":65, "71":4,  "73":62, "78":66, "91":28 },
        "SYNTH-LEAD":       { "74":62, "71":68, "91":32, "94":16 },
        "SYNTH-PAD":        { "74":50, "71":42, "73":85, "91":52, "93":36, "94":12 },
        "CHOIR":            { "74":56, "71":6,  "73":80, "91":52, "93":20 },
        "EDM SYNTH":        { "74":84, "71":88, "73":56, "91":38, "94":20 },
        "CASIO CLASSIC":    { "74":60, "91":18 },
        "INDIAN":           { "74":62, "91":28 },
        "INDONESIAN":       { "74":62, "91":28 },
        "ARABIC":           { "74":62, "91":28 },
        "CHINESE":          { "74":62, "91":28 },
        "BRAZILIAN":        { "74":62, "91":28 },
        "ETHNIC OTHERS":    { "74":62, "91":28 },
        "GM TONES":         { "74":60, "91":22 }
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
        const val = eqState[part][ctrl.cc];
        sendCC(part, ctrl.cc, val);
        if (activePart === part) {
            if (ctrl.type === 'switch') {
                const btn = document.querySelector(`.eq-switch[data-cc="${ctrl.cc}"]`);
                if (btn) {
                    btn.innerText = val > 63 ? 'ON' : 'OFF';
                    btn.classList.toggle('sus-on', val > 63);
                }
            } else {
                const f = document.querySelector(`.eq-fader[data-cc="${ctrl.cc}"]`);
                const valEl = document.getElementById('eq-val-' + ctrl.cc);
                if (f && valEl) {
                    f.value = val;
                    valEl.innerText = formatVal(ctrl.label, val);
                }
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
                    valSpan.innerText = formatVal(ctrl.label, v);
                    if (ctrl.cc === 7) {
                        // Volume: master — aplica a todos los parts
                        ['U1','U2','L'].forEach(p => { eqState[p][7] = v; sendCC(p, 7, v); });
                    } else {
                        eqState[activePart][ctrl.cc] = v;
                        sendCC(activePart, ctrl.cc, v);
                    }
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
    if (label === 'PANORAMA') {
        if (val === 64) return 'C';
        return val < 64 ? 'L' + (64 - val) : 'R' + (val - 64);
    }
    // Switch-style controls (on/off)
    if (['PORTAMENTO','SOSTENUTO','SOFT'].includes(label)) {
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
                    opt.value = JSON.stringify({ id: t.id, bank: t.bank, lsb: t.lsb, program: t.program });
                    opt.text  = t.label;
                    grp.appendChild(opt);
                });
                listEl.appendChild(grp);
            }
        }

        if (part === 'U1') searchEl.value = 'Piano';
        if (part === 'U2') searchEl.value = 'Pad ';
        if (part === 'L')  searchEl.value = 'String';

        searchEl.addEventListener('input', () => {
            const q = searchEl.value.trim().toLowerCase();
            populateList(q ? allTones.filter(t =>
                t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
            ) : allTones);
            if (listEl.options.length > 0) listEl.selectedIndex = -1;
        });
        
        searchEl.dispatchEvent(new Event('input'));

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
//  PRESETS + GITHUB STORAGE
// ======================================================================
const GH_OWNER = 'jcgit-coding';
const GH_REPO  = 'casio-ct-s500-controller';
const GH_FILE  = 'presets.json';
const GH_API   = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`;

let ghFileSha = null; // current SHA of presets.json on GitHub (needed for PUT)

function updateSyncStatus(msg) {
    const el = document.getElementById('syncAutoStatus');
    if (el) el.innerText = msg;
}

function ghToken() { return localStorage.getItem('casioGhToken') || ''; }

async function syncPull() {
    try {
        // Public read — no auth needed
        const res = await fetch(GH_API + '?t=' + Date.now(), {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!res.ok) return false;
        const json = await res.json();
        ghFileSha = json.sha;
        const cloud = JSON.parse(atob(json.content.replace(/\n/g, '')));
        // Merge: cloud wins (source of truth)
        const local = JSON.parse(localStorage.getItem('casioPresets') || '{}');
        const merged = Object.assign({}, local, cloud);
        localStorage.setItem('casioPresets', JSON.stringify(merged));
        renderPresets();
        return true;
    } catch { return false; }
}

async function syncPush() {
    const token = ghToken();
    if (!token) { updateSyncStatus('Sin token GitHub'); return; }
    try {
        updateSyncStatus('Guardando…');
        // Re-fetch SHA if missing (e.g. first push)
        if (!ghFileSha) await syncPull();
        const presets = JSON.parse(localStorage.getItem('casioPresets') || '{}');
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(presets, null, 2))));
        const body = { message: 'Update presets', content };
        if (ghFileSha) body.sha = ghFileSha;
        const res = await fetch(GH_API, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || res.status);
        }
        const data = await res.json();
        ghFileSha = data.content.sha;
        updateSyncStatus('✓ Guardado en GitHub');
    } catch(e) {
        console.error('syncPush:', e);
        updateSyncStatus('Error: ' + e.message);
    }
}

async function autoSyncInit() {
    updateSyncStatus('Cargando presets…');
    const ok = await syncPull();
    if (ok) {
        updateSyncStatus(ghToken() ? '✓ GitHub conectado' : '✓ Presets cargados (solo lectura)');
    } else {
        updateSyncStatus('Sin conexión — usando presets locales');
    }
    // Show token status in UI
    const tokenEl = document.getElementById('syncTokenDisplay');
    if (tokenEl) tokenEl.innerText = ghToken() ? '✓ Token configurado' : 'Sin token (solo lectura)';
}

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

    // ── Exportar a archivo JSON ──────────────────────────────────────────
    document.getElementById('btnExportPresets')?.addEventListener('click', () => {
        const json = localStorage.getItem('casioPresets') || '{}';
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'casio-presets.json'; a.click();
        URL.revokeObjectURL(url);
    });

    // ── Importar desde archivo JSON ──────────────────────────────────────
    document.getElementById('btnImportPresets')?.addEventListener('click', () => {
        document.getElementById('fileImportPresets')?.click();
    });
    document.getElementById('fileImportPresets')?.addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const imported = JSON.parse(ev.target.result);
                const existing = JSON.parse(localStorage.getItem('casioPresets') || '{}');
                Object.assign(existing, imported);
                localStorage.setItem('casioPresets', JSON.stringify(existing));
                renderPresets();
                syncPush();
            } catch { alert('Archivo inválido.'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // ── Configurar token GitHub ──────────────────────────────────────────
    document.getElementById('btnSyncCreate')?.addEventListener('click', async e => {
        e.preventDefault();
        const current = ghToken();
        const t = prompt('Token de GitHub (scope: contents):\n(Déjalo vacío para borrar)', current);
        if (t === null) return;
        const trimmed = t.trim();
        if (trimmed) {
            localStorage.setItem('casioGhToken', trimmed);
            const tokenEl = document.getElementById('syncTokenDisplay');
            if (tokenEl) tokenEl.innerText = '✓ Token configurado';
            await syncPush();
        } else {
            localStorage.removeItem('casioGhToken');
            const tokenEl = document.getElementById('syncTokenDisplay');
            if (tokenEl) tokenEl.innerText = 'Sin token (solo lectura)';
            updateSyncStatus('Token eliminado');
        }
    });

    // ── Subir / Bajar manual ─────────────────────────────────────────────
    document.getElementById('btnSyncPush')?.addEventListener('click', () => syncPush());
    document.getElementById('btnSyncPull')?.addEventListener('click', async () => {
        const ok = await syncPull();
        updateSyncStatus(ok ? '✓ Presets actualizados' : 'Sin conexión');
    });

    renderPresets();
    autoSyncInit();
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
    syncPush();
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
            syncPush();
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
    if (midiOutput) midiOutput.send([0xB0 | CHANNEL[part], cc, value]);
    // Mirror EQ/ambience/volume CCs to built-in PC synth (only from U1 to avoid triple-apply)
    if (part === 'U1' && window.pcSynth && window.pcSynth.applyCC) {
        window.pcSynth.applyCC(cc, value);
    }
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
function _getSavedToneId(part) {
    const list = document.getElementById('list-' + part);
    if (!list || list.selectedIndex < 0) return 0;
    try {
        return JSON.parse(list.options[list.selectedIndex].value).id;
    } catch(e) { return 0; }
}

function saveAppState() {
    const appState = {
        eqState,
        tuning,
        globalTranspose,
        activePart,
        tones: {
            U1: _getSavedToneId('U1'),
            U2: _getSavedToneId('U2'),
            L: _getSavedToneId('L')
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
                    // Find the option by ID
                    let targetIndex = -1;
                    const savedId = saved.tones[part];
                    for (let i = 0; i < list.options.length; i++) {
                        try {
                            const d = JSON.parse(list.options[i].value);
                            // Fallback: if savedId is likely an old index (e.g. < 800 and not matching IDs),
                            // we just do our best. But matching by ID is safest.
                            if (d.id === savedId) {
                                targetIndex = i;
                                break;
                            }
                        } catch(e){}
                    }
                    if (targetIndex >= 0) {
                        list.selectedIndex = targetIndex;
                    } else if (savedId < list.options.length) {
                        list.selectedIndex = savedId; // fallback for old saves
                    }
                    
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

// --- PC SYNTH ---
// Built-in Web Audio piano synth (zero config). SF2 upload overrides for higher quality.

class BuiltInPiano {
    constructor() {
        this._ctx    = null;
        this._master = null;
        this._filter = null;
        this._rvbGain = null;
        this._active = {};
        // CC-controlled params
        this.volume    = 0.55;
        this.cutoff    = 10000;
        this.resonance = 0.8;
        this.attack    = 0.005;
        this.release   = 1.1;
        this.reverbMix = 0;
    }
    get synth() { return { ctx: this._ctx }; }

    _audio() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            // master gain
            this._master = this._ctx.createGain();
            this._master.gain.value = this.volume;
            this._master.connect(this._ctx.destination);
            // lowpass filter (cutoff / resonance)
            this._filter = this._ctx.createBiquadFilter();
            this._filter.type = 'lowpass';
            this._filter.frequency.value = this.cutoff;
            this._filter.Q.value = this.resonance;
            this._filter.connect(this._master);
            // simple reverb: feedback delay loop
            this._rvbDelay = this._ctx.createDelay(2.0);
            this._rvbDelay.delayTime.value = 0.085;
            this._rvbFB = this._ctx.createGain();
            this._rvbFB.gain.value = 0.38;
            this._rvbGain = this._ctx.createGain();
            this._rvbGain.gain.value = this.reverbMix;
            this._rvbDelay.connect(this._rvbFB);
            this._rvbFB.connect(this._rvbDelay);
            this._rvbDelay.connect(this._rvbGain);
            this._rvbGain.connect(this._master);
            // note envs route to filter, filter sends to both dry (master) and reverb
            this._filter.connect(this._rvbDelay);
        }
        if (this._ctx.state === 'suspended') this._ctx.resume();
        return this._ctx;
    }

    // Called by sendCC so EQ/ambience/volume mirror to PC synth in real time
    applyCC(cc, val) {
        if (!this._ctx) {
            // Store for when audio starts; update properties
            const map = { 7: 'volume', 74: 'cutoff', 71: 'resonance', 91: 'reverbMix', 73: 'attack', 72: 'release' };
            if (map[cc] !== undefined) {
                if (cc === 7)  this.volume    = (val / 127) * 0.8;
                if (cc === 74) this.cutoff    = 80 + (val / 127) * 11920;
                if (cc === 71) this.resonance = 0.5 + (val / 127) * 18;
                if (cc === 91) this.reverbMix = (val / 127) * 0.65;
                if (cc === 73) this.attack    = 0.001 + (val / 127) * 0.5;
                if (cc === 72) this.release   = 0.1   + (val / 127) * 3.0;
            }
            return;
        }
        const t = this._ctx.currentTime;
        if (cc === 7)  { this.volume    = (val/127)*0.8;          this._master.gain.setTargetAtTime(this.volume, t, 0.02); }
        if (cc === 74) { this.cutoff    = 80+(val/127)*11920;      this._filter.frequency.setTargetAtTime(this.cutoff, t, 0.02); }
        if (cc === 71) { this.resonance = 0.5+(val/127)*18;        this._filter.Q.setTargetAtTime(this.resonance, t, 0.02); }
        if (cc === 91) { this.reverbMix = (val/127)*0.65;          this._rvbGain.gain.setTargetAtTime(this.reverbMix, t, 0.05); }
        if (cc === 73) { this.attack    = 0.001+(val/127)*0.5; }
        if (cc === 72) { this.release   = 0.1+(val/127)*3.0; }
    }

    noteOn(note, velocity) {
        const ctx = this._audio();
        this._forceStop(note);
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        const vel  = Math.max(0.01, Math.min(1, (velocity || 64) / 127));
        const now  = ctx.currentTime;
        const env  = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(vel * 0.65, now + this.attack);
        env.gain.exponentialRampToValueAtTime(vel * 0.20, now + this.attack + 0.35);
        env.connect(this._filter);
        const partials = [{r:1,g:1},{r:2,g:0.45},{r:3,g:0.20},{r:4,g:0.09},{r:6,g:0.04},{r:8,g:0.02}];
        const oscs = partials.map(({r,g}) => {
            const osc = ctx.createOscillator(); const gn = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq * r; gn.gain.value = g;
            osc.connect(gn); gn.connect(env); osc.start(now); return osc;
        });
        this._active[note] = { oscs, env };
    }

    noteOff(note) { this._release(note, this.release); }

    _release(note, dur) {
        const n = this._active[note];
        if (!n || !this._ctx) return;
        delete this._active[note];
        const now = this._ctx.currentTime;
        n.env.gain.cancelScheduledValues(now);
        n.env.gain.setValueAtTime(Math.max(0.001, n.env.gain.value), now);
        n.env.gain.exponentialRampToValueAtTime(0.001, now + dur);
        setTimeout(() => {
            n.oscs.forEach(o => { try { o.stop(); } catch(e) {} });
            try { n.env.disconnect(); } catch(e) {}
        }, (dur + 0.15) * 1000);
    }

    _forceStop(note) {
        const n = this._active[note];
        if (!n) return;
        delete this._active[note];
        n.oscs.forEach(o => { try { o.stop(); } catch(e) {} });
        try { n.env.disconnect(); } catch(e) {}
    }
}

// Initialise built-in synth immediately (no upload needed)
window.pcSynth  = new BuiltInPiano();
window.sf2Ready = true;
(function() {
    const el = document.getElementById('sf2-status');
    if (el) el.innerHTML = '<span style="color:#4CAF50;">✓ Sintetizador incorporado listo</span>';
})();

// IndexedDB helpers for optional SF2 cache
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

// Optional SF2 override (loads from cache or manual upload for higher quality)
async function sf2Init(buffer, name) {
    const statusEl = document.getElementById('sf2-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent);">Cargando SF2…</span>';
    try {
        const mod = await import('https://esm.sh/sf2-player');
        const SoundFont = mod.SoundFont || mod.default;
        if (!SoundFont) throw new Error('sf2-player: export not found');

        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') await ctx.resume();

        const sf2 = new SoundFont(ctx);
        const loadResult = sf2.load(buffer);
        if (loadResult && typeof loadResult.then === 'function') await loadResult;

        // Wrapper: normalises interface so noteOn(note, vel) / noteOff(note) / applyCC / programChange work
        const initVol = (eqState && eqState['U1'] && eqState['U1'][7] !== undefined)
            ? eqState['U1'][7] / 127 : 1.0;
        window.pcSynth = {
            _sf2: sf2, _ctx: ctx, _vol: initVol, _prog: 0,
            get synth() { return { ctx: this._ctx }; },
            noteOn(note, velocity) {
                const v = Math.min(127, Math.max(1, Math.round(velocity * this._vol)));
                sf2.noteOn(0, note, v);
            },
            noteOff(note) { sf2.noteOff(0, note); },
            programChange(prog) {
                this._prog = prog;
                if (sf2.programChange) sf2.programChange(0, prog);
            },
            applyCC(cc, val) {
                if (cc === 7) this._vol = val / 127;
            }
        };
        window.sf2Ready = true;
        if (statusEl) statusEl.innerHTML = '<span style="color:#4CAF50;">✓ SF2: ' + (name || 'soundfont.sf2') + '</span>';
    } catch(err) {
        console.error('SF2 init error:', err);
        if (statusEl) statusEl.innerHTML = '<span style="color:#F44336;">Error SF2 — usando sintetizador incorporado</span>';
        if (!window.pcSynth || !window.pcSynth.noteOn) window.pcSynth = new BuiltInPiano();
    }
}

// Auto-load SF2: try IndexedDB cache first, then fetch from repo
(async () => {
    const cached = await sf2LoadCache();
    if (cached) {
        sf2Init(cached.buffer, cached.name);
        return;
    }
    // Try to load bundled soundfont from GitHub Pages
    const statusEl = document.getElementById('sf2-status');
    try {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent);">Descargando soundfont…</span>';
        const res = await fetch('./soundfont.sf2');
        if (!res.ok) throw new Error('not found');
        const buffer = await res.arrayBuffer();
        await sf2SaveCache('soundfont.sf2', buffer);
        await sf2Init(buffer, 'soundfont.sf2');
    } catch {
        if (statusEl) statusEl.innerHTML = '<span style="color:#4CAF50;">✓ Sintetizador incorporado listo</span>';
    }
})();

document.getElementById('sf2-file')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const buffer = await file.arrayBuffer();
    await sf2SaveCache(file.name, buffer);
    await sf2Init(buffer, file.name);
});

document.getElementById('sf2-vol')?.addEventListener('input', e => {
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
