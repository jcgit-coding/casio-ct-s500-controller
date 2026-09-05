// ======================================================================
//  MIDI state
// ======================================================================
let midiAccess  = null;
let midiInput   = null;
let midiOutput  = null;

// PC Synth Sustain Buffer
const pcActiveNotes = {};     // note → MIDI channel that sent it
const pcSustainedNotes = {};  // note → MIDI channel for deferred noteOff
let pcSustainOn = false;
let pcSynthEnabled = true;   // OFF by default — user must toggle on

function applyPcSustain(isSustain) {
    if (!window.pcSynth) return;
    pcSustainOn = isSustain;
    if (!pcSustainOn) {
        for (const note in pcSustainedNotes) {
            const info = pcSustainedNotes[note];
            if (!pcActiveNotes[note]) {
                const ch = info && info.ch !== undefined ? info.ch : (typeof info === 'number' ? info : 0);
                const sn = info && info.shiftedNote !== undefined ? info.shiftedNote : parseInt(note);
                window.pcSynth.noteOff(ch, sn);
            }
            delete pcSustainedNotes[note];
        }
    }
}

// 128 GM instruments organised by category for the instrument picker
const GM_INSTRUMENTS = [
    { name: 'Piano', programs: [
        [0,'Grand Piano'],[1,'Bright Piano'],[2,'Electric Grand'],[3,'Honky-tonk'],
        [4,'Electric Piano 1'],[5,'Electric Piano 2'],[6,'Harpsichord'],[7,'Clavinet'] ]},
    { name: 'Perc. Cromática', programs: [
        [8,'Celesta'],[9,'Glockenspiel'],[10,'Music Box'],[11,'Vibraphone'],
        [12,'Marimba'],[13,'Xylophone'],[14,'Campanas'],[15,'Dulcimer'] ]},
    { name: 'Órgano', programs: [
        [16,'Órgano Drawbar'],[17,'Órgano Percusivo'],[18,'Rock Organ'],[19,'Órgano Iglesia'],
        [20,'Reed Organ'],[21,'Acordeón'],[22,'Harmónica'],[23,'Tangó Acordeón'] ]},
    { name: 'Guitarra', programs: [
        [24,'Guitarra Nylon'],[25,'Guitarra Steel'],[26,'Jazz Guitar'],[27,'Clean Guitar'],
        [28,'Muted Guitar'],[29,'Overdriven'],[30,'Distortion'],[31,'Guitar Harmonics'] ]},
    { name: 'Bajo', programs: [
        [32,'Acoustic Bass'],[33,'Elec. Bass Finger'],[34,'Elec. Bass Pick'],[35,'Fretless Bass'],
        [36,'Slap Bass 1'],[37,'Slap Bass 2'],[38,'Synth Bass 1'],[39,'Synth Bass 2'] ]},
    { name: 'Cuerdas', programs: [
        [40,'Violín'],[41,'Viola'],[42,'Cello'],[43,'Contrabajo'],
        [44,'Tremolo Strings'],[45,'Pizzicato Strings'],[46,'Arpa'],[47,'Timbal'] ]},
    { name: 'Ensemble', programs: [
        [48,'String Ensemble 1'],[49,'String Ensemble 2'],[50,'Synth Strings 1'],[51,'Synth Strings 2'],
        [52,'Choir Aahs'],[53,'Voice Oohs'],[54,'Synth Voice'],[55,'Orchestra Hit'] ]},
    { name: 'Metales', programs: [
        [56,'Trompeta'],[57,'Trombón'],[58,'Tuba'],[59,'Trompeta Sord.'],
        [60,'French Horn'],[61,'Brass Section'],[62,'Synth Brass 1'],[63,'Synth Brass 2'] ]},
    { name: 'Caña', programs: [
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
    { name: 'Étnico', programs: [
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
                opt.textContent = prog + ' – ' + name;
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
    if (pcSynthEnabled && window.sf2Ready && window.pcSynth) {
        const cmd    = status & 0xF0;
        const noteCh = status & 0x0F;

        if (cmd === 0x90) { // Note On
            if (d2 > 0) {
                const partKey = Object.keys(CHANNEL).find(k => CHANNEL[k] === noteCh);
                const octOffset = partKey && tuning[partKey] ? tuning[partKey].oct * 12 : 0;
                const shift = globalTranspose + octOffset;
                const shiftedNote = Math.max(0, Math.min(127, d1 + shift));
                
                pcActiveNotes[d1] = { ch: noteCh, shiftedNote: shiftedNote };
                if (window.pcSynth.synth?.ctx?.state === 'suspended') window.pcSynth.synth.ctx.resume();
                window.pcSynth.noteOn(noteCh, shiftedNote, d2); // velocidad sin escalar — el synth maneja su propio volumen
            } else {
                const info = pcActiveNotes[d1];
                if (info) {
                    delete pcActiveNotes[d1];
                    if (pcSustainOn) pcSustainedNotes[d1] = info;
                    else window.pcSynth.noteOff(info.ch, info.shiftedNote);
                }
            }
        } else if (cmd === 0x80) { // Note Off
            const info = pcActiveNotes[d1];
            if (info) {
                delete pcActiveNotes[d1];
                if (pcSustainOn) pcSustainedNotes[d1] = info;
                else window.pcSynth.noteOff(info.ch, info.shiftedNote);
            }
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
            
            // Update UI for the currently active part's fader (consistent with other CCs)
            const ctrl = EQ_CONTROLS.find(c => c && c.cc === 7);
            if (ctrl) {
                const fader = document.querySelector('.eq-fader[data-cc="7"]');
                if (fader) fader.value = d2;
                const valEl = document.getElementById('eq-val-7');
                if (valEl) valEl.innerText = formatVal(ctrl.label, d2);
            }
            
            // Sync PC Synth volume slider (0-127 range, same as CC7)
            const sfVol = document.getElementById('sf2-vol');
            if (sfVol) {
                sfVol.value = d2;
                const sfVolVal = document.getElementById('sf2-vol-val');
                if (sfVolVal) sfVolVal.innerText = d2;
            }
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
        // Mirror program to SF2 synth so PC sound matches keyboard tone
        if (window.pcSynth && window.pcSynth.programChange) {
            window.pcSynth.programChange(ch, d1);
            // Also update instrument picker UI for this part
            const sel = document.getElementById('sf2-prog-' + part);
            if (sel) sel.value = d1;
            pcPartProgram[part] = d1;
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
        title: 'Ecualizador Maestro',
        controls: [
            { label: 'GRAVES',   cc: 104, def: 64, tip: 'Filtro Low Shelf (Cuerpo/Bajos)' },
            { label: 'MEDIOS',   cc: 103, def: 64, tip: 'Filtro Peaking (Presencia/Medios)' },
            { label: 'AGUDOS',   cc: 102, def: 64, tip: 'Filtro High Shelf (Brillo/Aire)' },
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
        title: 'Envolvente',
        controls: [
            { label: 'ATAQUE',  cc: 73, def: 64, tip: 'Tiempo de Ataque (ADSR)' },
            { label: 'DECAY',   cc: 75, def: 64, tip: 'Tiempo de Decaimiento (ADSR)' },
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
// CCs: 74=Brillo/Cutoff 71=Resonancia 73=Ataque 75=Decay 91=Reverb 93=Chorus 76=VibRate 77=VibDepth 78=VibDelay 94=Eco
// CC72 (Release) eliminado del EQ — el teclado lo maneja internamente por instrumento
// Categorías Casio (raw_tones): PIANO HARPSICHORD ELEC.PIANO CLAVI VIB./CHROM.PERC. ELEC.ORGAN PIPE ORGAN ACCORDION
//   ACOUS.GUITAR ELEC.GUITAR ACOUS.BASS ELEC.BASS SOLO STRINGS STRING ENSEMBLE SOLO BRASS BRASS ENSEMBLE
//   SAX REED PIPE CHOIR EDM SYNTH CASIO CLASSIC INDIAN INDONESIAN ARABIC CHINESE BRAZILIAN ETHNIC OTHERS GM TONES
// SYNTH-BASS/LEAD/PAD/BRASS aplican al PC Synth GM (no existen como categorías del Casio)
const ENVIRONMENTS = {
    // ══════════════════════════════════════════════════════════════════════
    //  ESTUDIO — Respuesta plana y realista. Sala controlada.
    //  Ataques precisos, vibrato moderado, reverb corto y limpio.
    // ══════════════════════════════════════════════════════════════════════
    "Estudio": {
        "PIANO":            { "73":64, "75":64, "91":12, "104":64, "103":64, "102":64 },
        "HARPSICHORD":      { "73":62, "75":62, "91":10, "104":64, "103":64, "102":64 },
        "ELEC.PIANO":       { "73":64, "75":64, "91":15, "93":15, "104":64, "103":64, "102":64 },
        "CLAVI":            { "73":60, "75":62, "91":10, "104":64, "103":64, "102":64 },
        "VIB./CHROM.PERC.": { "73":62, "75":64, "91":18, "104":64, "103":64, "102":64 },
        "ELEC.ORGAN":       { "73":60, "75":64, "91":15, "93":20, "104":64, "103":64, "102":64 },
        "PIPE ORGAN":       { "73":66, "75":64, "91":25, "104":64, "103":64, "102":64 },
        "ACCORDION":        { "73":64, "75":64, "91":15, "93":10, "104":64, "103":64, "102":64 },
        "ACOUS.GUITAR":     { "73":62, "75":60, "91":12, "104":64, "103":64, "102":64 },
        "ELEC.GUITAR":      { "73":62, "75":60, "91":15, "104":64, "103":64, "102":64 },
        "ACOUS.BASS":       { "73":60, "75":60, "91":8, "104":64, "103":64, "102":64 },
        "ELEC.BASS":        { "73":60, "75":60, "91":8, "104":64, "103":64, "102":64 },
        "SYNTH-BASS":       { "73":58, "75":58, "91":8, "104":64, "103":64, "102":64 },
        "SOLO STRINGS":     { "73":66, "75":66, "91":20, "76":66, "77":66, "78":68, "104":64, "103":64, "102":64 },
        "STRING ENSEMBLE":  { "73":68, "75":68, "91":25, "93":15, "76":66, "77":64, "104":64, "103":64, "102":64 },
        "SOLO BRASS":       { "73":64, "75":64, "91":18, "76":66, "77":64, "78":68, "104":64, "103":64, "102":64 },
        "BRASS ENSEMBLE":   { "73":64, "75":64, "91":22, "93":10, "104":64, "103":64, "102":64 },
        "SYNTH-BRASS":      { "73":62, "75":62, "91":20, "93":15, "104":64, "103":64, "102":64 },
        "SAX":              { "73":64, "75":64, "91":18, "76":66, "77":64, "78":68, "104":64, "103":64, "102":64 },
        "REED":             { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "PIPE":             { "73":64, "75":64, "91":18, "76":66, "77":64, "104":64, "103":64, "102":64 },
        "SYNTH-LEAD":       { "74":66, "71":68, "73":60, "75":60, "91":25, "94":15, "104":64, "103":64, "102":64 },
        "SYNTH-PAD":        { "73":72, "75":72, "91":35, "93":25, "104":64, "103":64, "102":64 },
        "CHOIR":            { "73":70, "75":70, "91":30, "93":15, "104":64, "103":64, "102":64 },
        "EDM SYNTH":        { "73":58, "75":60, "91":20, "94":15, "104":64, "103":64, "102":64 },
        "CASIO CLASSIC":    { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "INDIAN":           { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "INDONESIAN":       { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "ARABIC":           { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "CHINESE":          { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "BRAZILIAN":        { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "ETHNIC OTHERS":    { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 },
        "GM TONES":         { "73":64, "75":64, "91":15, "104":64, "103":64, "102":64 }
    },
    // ══════════════════════════════════════════════════════════════════════
    //  VIVO — Sala mediana/grande. Presencia, pegada y amplitud.
    //  Ataques más rápidos, resonancia extra, efectos estéreo (Chorus/Delay).
    // ══════════════════════════════════════════════════════════════════════
    "Vivo": {
        "PIANO":            { "74":68, "73":62, "75":62, "91":35, "104":72, "103":68, "102":70 },
        "HARPSICHORD":      { "74":70, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "ELEC.PIANO":       { "74":68, "73":62, "75":62, "91":35, "93":40, "104":72, "103":68, "102":70 },
        "CLAVI":            { "74":70, "73":58, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "VIB./CHROM.PERC.": { "74":68, "73":60, "75":60, "91":40, "104":72, "103":68, "102":70 },
        "ELEC.ORGAN":       { "74":70, "71":68, "73":58, "75":60, "91":35, "93":45, "76":72, "77":68, "104":72, "103":68, "102":70 },
        "PIPE ORGAN":       { "74":68, "73":64, "75":62, "91":50, "104":72, "103":68, "102":70 },
        "ACCORDION":        { "74":68, "73":62, "75":62, "91":30, "93":20, "104":72, "103":68, "102":70 },
        "ACOUS.GUITAR":     { "74":68, "73":60, "75":58, "91":30, "93":10, "104":72, "103":68, "102":70 },
        "ELEC.GUITAR":      { "74":68, "73":60, "75":58, "91":30, "93":20, "104":72, "103":68, "102":70 },
        "ACOUS.BASS":       { "74":68, "73":58, "75":58, "91":15, "104":72, "103":68, "102":70 },
        "ELEC.BASS":        { "74":68, "73":58, "75":58, "91":15, "104":72, "103":68, "102":70 },
        "SYNTH-BASS":       { "74":72, "71":70, "73":56, "75":56, "91":15, "104":72, "103":68, "102":70 },
        "SOLO STRINGS":     { "74":68, "73":62, "75":64, "91":45, "93":10, "76":68, "77":68, "104":72, "103":68, "102":70 },
        "STRING ENSEMBLE":  { "74":68, "73":64, "75":64, "91":45, "93":25, "76":68, "77":66, "104":72, "103":68, "102":70 },
        "SOLO BRASS":       { "74":70, "71":68, "73":60, "75":62, "91":40, "76":70, "77":68, "104":72, "103":68, "102":70 },
        "BRASS ENSEMBLE":   { "74":70, "71":68, "73":60, "75":62, "91":45, "93":20, "104":72, "103":68, "102":70 },
        "SYNTH-BRASS":      { "74":72, "71":70, "73":58, "75":60, "91":45, "93":25, "104":72, "103":68, "102":70 },
        "SAX":              { "74":70, "71":68, "73":60, "75":62, "91":40, "76":70, "77":68, "104":72, "103":68, "102":70 },
        "REED":             { "74":68, "73":60, "75":62, "91":35, "104":72, "103":68, "102":70 },
        "PIPE":             { "74":68, "73":60, "75":62, "91":40, "76":68, "77":66, "104":72, "103":68, "102":70 },
        "SYNTH-LEAD":       { "74":72, "71":72, "73":58, "75":58, "91":45, "93":15, "94":30, "104":72, "103":68, "102":70 },
        "SYNTH-PAD":        { "74":68, "71":68, "73":66, "75":66, "91":50, "93":40, "104":72, "103":68, "102":70 },
        "CHOIR":            { "74":68, "73":66, "75":66, "91":50, "93":25, "104":72, "103":68, "102":70 },
        "EDM SYNTH":        { "74":72, "71":72, "73":56, "75":56, "91":40, "94":25, "104":72, "103":68, "102":70 },
        "CASIO CLASSIC":    { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "INDIAN":           { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "INDONESIAN":       { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "ARABIC":           { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "CHINESE":          { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "BRAZILIAN":        { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "ETHNIC OTHERS":    { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 },
        "GM TONES":         { "74":68, "73":60, "75":60, "91":30, "104":72, "103":68, "102":70 }
    },
    // ══════════════════════════════════════════════════════════════════════
    //  SALA — Concierto/Catedral. Sinfónico, majestuoso.
    //  Ataques lentos (swells), decaimientos largos, vibrato emotivo retrasado.
    // ══════════════════════════════════════════════════════════════════════
    "Sala": {
        "PIANO":            { "74":62, "73":66, "75":68, "91":65, "104":70, "103":60, "102":66 },
        "HARPSICHORD":      { "74":62, "73":64, "75":66, "91":55, "104":70, "103":60, "102":66 },
        "ELEC.PIANO":       { "74":60, "73":64, "75":66, "91":60, "93":25, "104":70, "103":60, "102":66 },
        "CLAVI":            { "74":62, "73":62, "75":64, "91":50, "104":70, "103":60, "102":66 },
        "VIB./CHROM.PERC.": { "74":62, "73":64, "75":68, "91":70, "93":10, "104":70, "103":60, "102":66 },
        "ELEC.ORGAN":       { "74":62, "73":64, "75":66, "91":65, "93":30, "104":70, "103":60, "102":66 },
        "PIPE ORGAN":       { "74":64, "73":68, "75":70, "91":95, "93":15, "104":70, "103":60, "102":66 },
        "ACCORDION":        { "74":60, "73":66, "75":66, "91":55, "93":15, "104":70, "103":60, "102":66 },
        "ACOUS.GUITAR":     { "74":62, "73":64, "75":64, "91":55, "104":70, "103":60, "102":66 },
        "ELEC.GUITAR":      { "74":62, "73":64, "75":64, "91":55, "93":10, "104":70, "103":60, "102":66 },
        "ACOUS.BASS":       { "74":60, "73":62, "75":64, "91":30, "104":70, "103":60, "102":66 },
        "ELEC.BASS":        { "74":60, "73":62, "75":64, "91":30, "104":70, "103":60, "102":66 },
        "SYNTH-BASS":       { "74":62, "73":62, "75":64, "91":35, "104":70, "103":60, "102":66 },
        "SOLO STRINGS":     { "74":60, "73":72, "75":72, "91":80, "93":15, "76":64, "77":70, "78":72, "104":70, "103":60, "102":66 },
        "STRING ENSEMBLE":  { "74":60, "73":76, "75":76, "91":85, "93":25, "76":64, "77":70, "78":72, "104":70, "103":60, "102":66 },
        "SOLO BRASS":       { "74":62, "73":68, "75":68, "91":75, "76":64, "77":66, "78":72, "104":70, "103":60, "102":66 },
        "BRASS ENSEMBLE":   { "74":62, "73":70, "75":70, "91":80, "93":20, "104":70, "103":60, "102":66 },
        "SYNTH-BRASS":      { "74":62, "73":66, "75":68, "91":75, "93":20, "104":70, "103":60, "102":66 },
        "SAX":              { "74":60, "73":68, "75":68, "91":70, "76":64, "77":68, "78":72, "104":70, "103":60, "102":66 },
        "REED":             { "74":60, "73":66, "75":66, "91":65, "104":70, "103":60, "102":66 },
        "PIPE":             { "74":60, "73":66, "75":66, "91":70, "76":64, "77":68, "78":70, "104":70, "103":60, "102":66 },
        "SYNTH-LEAD":       { "74":64, "71":66, "73":62, "75":64, "91":75, "94":40, "104":70, "103":60, "102":66 },
        "SYNTH-PAD":        { "74":58, "71":62, "73":82, "75":82, "91":90, "93":35, "104":70, "103":60, "102":66 },
        "CHOIR":            { "74":60, "73":78, "75":78, "91":90, "93":30, "104":70, "103":60, "102":66 },
        "EDM SYNTH":        { "74":62, "73":62, "75":64, "91":70, "94":35, "104":70, "103":60, "102":66 },
        "CASIO CLASSIC":    { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "INDIAN":           { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "INDONESIAN":       { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "ARABIC":           { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "CHINESE":          { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "BRAZILIAN":        { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "ETHNIC OTHERS":    { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 },
        "GM TONES":         { "74":62, "73":66, "75":68, "91":60, "104":70, "103":60, "102":66 }
    },
    // ══════════════════════════════════════════════════════════════════════
    //  JAZZ — Club íntimo. Tono cálido, redondo (dark) y expresivo.
    //  Filtro cerrado para calidez, decay acústico, vibrato profundo en vientos.
    // ══════════════════════════════════════════════════════════════════════
    "Jazz": {
        "PIANO":            { "74":58, "73":64, "75":64, "91":18, "104":72, "103":70, "102":56 },
        "HARPSICHORD":      { "74":60, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "ELEC.PIANO":       { "74":56, "73":64, "75":64, "91":18, "93":10, "104":72, "103":70, "102":56 },
        "CLAVI":            { "74":60, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "VIB./CHROM.PERC.": { "74":58, "73":64, "75":66, "91":20, "76":66, "77":68, "104":72, "103":70, "102":56 },
        "ELEC.ORGAN":       { "74":58, "73":60, "75":64, "91":18, "93":35, "76":68, "77":72, "104":72, "103":70, "102":56 },
        "PIPE ORGAN":       { "74":60, "73":64, "75":64, "91":35, "104":72, "103":70, "102":56 },
        "ACCORDION":        { "74":58, "73":64, "75":64, "91":15, "93":10, "104":72, "103":70, "102":56 },
        "ACOUS.GUITAR":     { "74":58, "73":62, "75":62, "91":15, "93":5, "104":72, "103":70, "102":56 },
        "ELEC.GUITAR":      { "74":56, "73":62, "75":62, "91":15, "93":10, "104":72, "103":70, "102":56 },
        "ACOUS.BASS":       { "74":54, "73":62, "75":66, "91":12, "104":72, "103":70, "102":56 },
        "ELEC.BASS":        { "74":56, "73":62, "75":64, "91":12, "104":72, "103":70, "102":56 },
        "SYNTH-BASS":       { "74":58, "73":62, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "SOLO STRINGS":     { "74":58, "73":66, "75":64, "91":25, "76":66, "77":68, "78":66, "104":72, "103":70, "102":56 },
        "STRING ENSEMBLE":  { "74":58, "73":68, "75":66, "91":25, "93":10, "76":66, "77":68, "104":72, "103":70, "102":56 },
        "SOLO BRASS":       { "74":58, "73":64, "75":64, "91":20, "76":68, "77":72, "78":66, "104":72, "103":70, "102":56 },
        "BRASS ENSEMBLE":   { "74":58, "73":66, "75":64, "91":20, "93":10, "104":72, "103":70, "102":56 },
        "SYNTH-BRASS":      { "74":58, "73":64, "75":64, "91":20, "93":10, "104":72, "103":70, "102":56 },
        "SAX":              { "74":56, "73":64, "75":64, "91":20, "76":68, "77":72, "78":66, "104":72, "103":70, "102":56 },
        "REED":             { "74":58, "73":64, "75":64, "91":18, "104":72, "103":70, "102":56 },
        "PIPE":             { "74":58, "73":64, "75":64, "91":20, "76":66, "77":70, "78":66, "104":72, "103":70, "102":56 },
        "SYNTH-LEAD":       { "74":60, "71":64, "73":62, "75":64, "91":25, "94":10, "104":72, "103":70, "102":56 },
        "SYNTH-PAD":        { "74":54, "71":64, "73":72, "75":70, "91":30, "93":20, "104":72, "103":70, "102":56 },
        "CHOIR":            { "74":58, "73":72, "75":70, "91":25, "104":72, "103":70, "102":56 },
        "EDM SYNTH":        { "74":60, "73":64, "75":64, "91":20, "94":10, "104":72, "103":70, "102":56 },
        "CASIO CLASSIC":    { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "INDIAN":           { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "INDONESIAN":       { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "ARABIC":           { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "CHINESE":          { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "BRAZILIAN":        { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "ETHNIC OTHERS":    { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 },
        "GM TONES":         { "74":58, "73":64, "75":64, "91":15, "104":72, "103":70, "102":56 }
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
    // Ensure CC72 (Release) is never in eqState — send a neutral value to keyboard instead
    delete eqState[part][72]; delete eqState[part]['72'];

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
                        // Volume: master — aplica a todos los parts y sincroniza sf2-vol slider
                        ['U1','U2','L'].forEach(p => { eqState[p][7] = v; sendCC(p, 7, v); });
                        const sfVolEl = document.getElementById('sf2-vol');
                        if (sfVolEl) { sfVolEl.value = v; }
                        const sfVolVal = document.getElementById('sf2-vol-val');
                        if (sfVolVal) sfVolVal.innerText = v;
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
            if (action === 'oct-reset') tuning[part].oct = 0;

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
    // Mirror todos los CCs de EQ al PC Synth (volumen, cutoff, resonancia, reverb, etc.)
    if (window.pcSynth?.applyCC) window.pcSynth.applyCC(cc, value);
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
        pcSynthEnabled,
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
        
        if (saved.eqState) {
            Object.assign(eqState, saved.eqState);
            // Purge CC72 (Release) — eliminado del EQ, nunca debe aplicarse desde estado guardado
            ['U1','U2','L'].forEach(p => { delete eqState[p][72]; delete eqState[p]['72']; });
        }
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
        // Restore PC Synth toggle state
        

        switchEQ(activePart); // updates sliders on screen
    } catch (e) {
        console.error("Error loading app state:", e);
    }
}

// --- PC SYNTH — WebAudioFontSynth: muestras reales (CDN) + osciladores de respaldo ---
// Inicializar sintetizador e iniciar descarga de muestras WebAudioFont
window.pcSynth = null;
window.sf2Ready = true;
(function() {
    const el = document.getElementById('sf2-status');
    if (el) el.innerHTML = '<span style="color:var(--accent);">Cargando muestras de instrumentos…</span>';
    const initVol = parseInt(document.getElementById('sf2-vol')?.value || 100);
    window.pcSynth.applyCC(7, initVol);
    // Arrancar descarga de WebAudioFont en background
    // no startwaf
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

// Single sf2-player instance (reused across reloads / file changes)
let pcPlayer = null;

// Real API (from esm.sh/sf2-player source):
//   constructor()                           — no args
//   bootSynth(arrayBuffer)                  — load SF2 from ArrayBuffer
//   loadSoundFontFromFile(File)             — load from File object
//   loadSoundFontFromURL(url)               — load from URL string
//   noteOn(note, velocity=127, channel?)    — note FIRST, then vel, then optional channel
//   noteOff(note, velocity=127, channel?)
//   player.synth.programChange(ch, prog)   — inner synth instance

async function sf2Init(source, name) {
    const statusEl = document.getElementById('sf2-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent);">Cargando SF2…</span>';
    try {
        const mod = await import('https://esm.sh/sf2-player');
        const SoundFontPlayer = mod.default;
        if (typeof SoundFontPlayer !== 'function') throw new Error('sf2-player: default export not a constructor');

        if (!pcPlayer) pcPlayer = new SoundFontPlayer();

        if (typeof source === 'string') {
            await pcPlayer.loadSoundFontFromURL(source);
        } else if (source instanceof File) {
            await pcPlayer.loadSoundFontFromFile(source);
        } else {
            // ArrayBuffer path (from IndexedDB cache or manual fetch)
            await pcPlayer.bootSynth(source);
        }

        const initVol = (eqState?.U1?.[7] !== undefined) ? eqState['U1'][7] / 127 : 1.0;

        // Wrapper — our internal API is noteOn(channel, note, vel) / noteOff(channel, note)
        // but sf2-player's API is noteOn(note, vel, channel) — we translate here.
        // CADENA DE AUDIO: sf2-player → filter (lowpass) → [reverb/chorus/delay sends] → master gain → destination
        const ctx = pcPlayer.synth?.ctx || new (window.AudioContext || window.webkitAudioContext)();

        // === Crear cadena de efectos propia ===
        const masterGain = ctx.createGain();
        masterGain.gain.value = initVol;

        const eqLow = ctx.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.value = 200;
        eqLow.gain.value = 0;

        const eqMid = ctx.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.value = 1000;
        eqMid.Q.value = 1.0;
        eqMid.gain.value = 0;

        const eqHigh = ctx.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.value = 4000;
        eqHigh.gain.value = 0;

        masterGain.connect(eqLow);
        eqLow.connect(eqMid);
        eqMid.connect(eqHigh);
        eqHigh.connect(ctx.destination);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 8000;
        filter.Q.value = 0.8;
        filter.connect(masterGain);

        // Reverb: ConvolverNode con impulse response algorítmico
        const rvbGain = ctx.createGain();
        rvbGain.gain.value = 0;
        rvbGain.connect(masterGain);
        let rvbConvolver = null;
        try {
            rvbConvolver = ctx.createConvolver();
            // Generar IR de reverb: ruido blanco decayendo exponencialmente (2s)
            const irLen = Math.floor(ctx.sampleRate * 2);
            const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const d = irBuf.getChannelData(ch);
                for (let i = 0; i < irLen; i++) {
                    d[i] = (Math.random() * 2 - 1) * Math.exp(-3.0 * i / irLen);
                }
            }
            rvbConvolver.buffer = irBuf;
            filter.connect(rvbConvolver);
            rvbConvolver.connect(rvbGain);
        } catch(e) { /* reverb no disponible */ }

        // Chorus: delay corto modulado por LFO
        let chorusGain = ctx.createGain();
        chorusGain.gain.value = 0;
        chorusGain.connect(masterGain);
        let chorusDelay = null;
        try {
            chorusDelay = ctx.createDelay(0.05);
            chorusDelay.delayTime.value = 0.012;
            const chorusLFO = ctx.createOscillator();
            const chorusDepth = ctx.createGain();
            chorusLFO.frequency.value = 0.8;
            chorusDepth.gain.value = 0.003;
            chorusLFO.connect(chorusDepth);
            chorusDepth.connect(chorusDelay.delayTime);
            chorusLFO.start();
            filter.connect(chorusDelay);
            chorusDelay.connect(chorusGain);
        } catch(e) { /* chorus no disponible */ }

        // Delay/Echo
        let echoGain = ctx.createGain();
        echoGain.gain.value = 0;
        echoGain.connect(masterGain);
        let echoDelay = null;
        try {
            echoDelay = ctx.createDelay(1.0);
            echoDelay.delayTime.value = 0.35;
            const echoFB = ctx.createGain();
            echoFB.gain.value = 0.3;
            filter.connect(echoDelay);
            echoDelay.connect(echoFB);
            echoFB.connect(echoDelay);
            echoDelay.connect(echoGain);
        } catch(e) { /* delay no disponible */ }

        // Desconectar salida directa del sf2-player y reconectar por nuestra cadena
        try {
            const synthGain = pcPlayer.synth?.gainMaster
                || pcPlayer.synth?.masterGain
                || pcPlayer.synth?.gain
                || pcPlayer.synth?.gainNode;
            if (synthGain) {
                synthGain.disconnect();
                synthGain.connect(filter);
            }
        } catch(e) {
            console.warn('[SF2] No se pudo redirigir audio del sf2-player por la cadena de efectos');
        }

        window.pcSynth = {
            _player: pcPlayer, _vol: initVol,
            _filter: filter, _master: masterGain,
            _eqLow: eqLow, _eqMid: eqMid, _eqHigh: eqHigh,
            _rvbGain: rvbGain, _chorusGain: chorusGain, _echoGain: echoGain,
            _cutoff: 8000, _resonance: 0.8, _attack: 0.005, _release: 1.0,
            get synth() { return { ctx: pcPlayer.synth?.ctx || ctx }; },
            noteOn(channel, note, velocity) {
                const c = pcPlayer.synth?.ctx || ctx;
                if (c?.state === 'suspended') c.resume();
                const v = Math.min(127, Math.max(1, Math.round(velocity * this._vol)));
                pcPlayer.noteOn(note, v, channel);
            },
            noteOff(channel, note) {
                pcPlayer.noteOff(note, 64, channel);
            },
            programChange(channel, prog) {
                if (pcPlayer.synth) pcPlayer.synth.programChange(channel, prog);
            },
            applyCC(cc, val) {
                const t = (pcPlayer.synth?.ctx || ctx).currentTime;
                if (cc === 7) {
                    this._vol = val / 127;
                    this._master.gain.setTargetAtTime(this._vol, t, 0.02);
                }
                if (cc === 74) {
                    this._cutoff = 200 + (val / 127) * 11800;
                    this._filter.frequency.setTargetAtTime(this._cutoff, t, 0.02);
                }
                if (cc === 71) {
                    this._resonance = 0.5 + (val / 127) * 18;
                    this._filter.Q.setTargetAtTime(this._resonance, t, 0.02);
                }
                if (cc === 91) {
                    this._rvbGain.gain.setTargetAtTime((val / 127) * 0.6, t, 0.05);
                }
                if (cc === 93) {
                    this._chorusGain.gain.setTargetAtTime((val / 127) * 0.4, t, 0.05);
                }
                if (cc === 94) {
                    this._echoGain.gain.setTargetAtTime((val / 127) * 0.5, t, 0.05);
                }
                if (cc === 104) {
                    // CC 104: Low EQ (-15dB to +15dB, 64 is 0dB)
                    const db = (val - 64) * (15 / 64);
                    this._eqLow.gain.setTargetAtTime(db, t, 0.05);
                }
                if (cc === 103) {
                    // CC 103: Mid EQ (-15dB to +15dB, 64 is 0dB)
                    const db = (val - 64) * (15 / 64);
                    this._eqMid.gain.setTargetAtTime(db, t, 0.05);
                }
                if (cc === 102) {
                    // CC 102: High EQ (-15dB to +15dB, 64 is 0dB)
                    const db = (val - 64) * (15 / 64);
                    this._eqHigh.gain.setTargetAtTime(db, t, 0.05);
                }
                if (cc === 73) this._attack = 0.001 + (val / 127) * 0.5;
                if (cc === 72) this._release = 0.1 + (val / 127) * 3.0;
            }
        };
        window.sf2Ready = true;
        if (statusEl) { statusEl.dataset.sf2loaded = '1'; statusEl.innerHTML = '<span style="color:#4CAF50;">✓ SF2: ' + (name || 'soundfont.sf2') + '</span>'; }
    } catch(err) {
        console.error('SF2 init error:', err);
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Motor Web Básico activo</span>';
        // BuiltInPiano stays as window.pcSynth — no override needed
    }
}

// Auto-load SF2: try IndexedDB cache first, then GeneralUser GS from CDN, then local
(async () => {
    const statusEl = document.getElementById('sf2-status');
    const cached = await sf2LoadCache();
    if (cached) {
        await sf2Init(cached.buffer, cached.name);
        return;
    }
    // Priority 1: GeneralUser GS from jsDelivr (high quality GM soundfont)
    const GUGS_URL = 'https://cdn.jsdelivr.net/gh/mrbumpy409/GeneralUser-GS@main/GeneralUser-GS.sf2';
    // Priority 2: local soundfont.sf2 (fallback)
    const LOCAL_URL = './soundfont.sf2';

    for (const [url, name] of [[GUGS_URL, 'GeneralUser GS'], [LOCAL_URL, 'soundfont.sf2']]) {
        try {
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">Descargando ${name}…</span>`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('not found');
            const buffer = await res.arrayBuffer();
            sf2SaveCache(name, buffer); // cache for next visit
            await sf2Init(buffer, name);
            return;
        } catch { /* try next */ }
    }
    // All failed — WebAudioFontSynth already active
    if (statusEl && !statusEl.dataset.sf2loaded) statusEl.innerHTML = '<span style="color:var(--text-muted);">Motor Web Básico activo</span>';
})();

document.getElementById('sf2-file')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    sf2SaveCache(file.name, await file.arrayBuffer()); // cache for next visit
    await sf2Init(file, file.name);
});

// ======================================================================
//  MIDI CONTROLLER — Virtual Keyboard + Per-part controls
// ======================================================================

// Per-part octave offset for the MIDI controller (separate from mixer octave)
const mctrlOct = { U1: 0, U2: 0, L: 0 };
let vkActivePart = 'U1';   // which part the virtual keyboard plays
let vkOctave = 4;           // base octave for virtual keyboard (C4 = MIDI 60)
const vkActiveKeys = {};    // note → true while held (mouse/touch)

function initMidiController() {
    // Per-part volume sliders
    ['U1', 'U2', 'L'].forEach(part => {
        const volSlider = document.getElementById('mctrl-vol-' + part);
        const volVal = document.getElementById('mctrl-vol-' + part + '-val');
        if (volSlider) {
            volSlider.addEventListener('input', () => {
                const v = parseInt(volSlider.value);
                if (volVal) volVal.innerText = v;
                // Send CC7 on this part's channel
                if (midiOutput) midiOutput.send([0xB0 | CHANNEL[part], 7, v]);
                if (window.pcSynth?.applyCC) window.pcSynth.applyCC(7, v);
            });
        }

        const rvbSlider = document.getElementById('mctrl-rvb-' + part);
        const rvbVal = document.getElementById('mctrl-rvb-' + part + '-val');
        if (rvbSlider) {
            rvbSlider.addEventListener('input', () => {
                const v = parseInt(rvbSlider.value);
                if (rvbVal) rvbVal.innerText = v;
                if (midiOutput) midiOutput.send([0xB0 | CHANNEL[part], 91, v]);
                if (window.pcSynth?.applyCC) window.pcSynth.applyCC(91, v);
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

        // Card click → select active card highlight
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
            lbl.innerText = 'C' + (vkOctave + k.oct);
            el.appendChild(lbl);
        }
        attachKeyEvents(el, k);
        wrap.appendChild(el);
    });

    // Draw black keys absolutely positioned
    // Black key positions relative to white keys
    // Per octave: C#(1), D#(3), F#(6), G#(8), A#(10) — white key indices
    const blackOffsets = [1, 3, null, 6, 8, 10]; // relative to octave start white idx
    // Actually compute: for each black key, find which white keys it's between
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

function vkNoteOn(midiNote) {
    if (vkActiveKeys[midiNote]) return;
    vkActiveKeys[midiNote] = true;
    const vel = parseInt(document.getElementById('vk-velocity')?.value || 90);
    const ch = CHANNEL[vkActivePart];
    // Send to MIDI output (Casio)
    if (midiOutput) midiOutput.send([0x90 | ch, midiNote, vel]);
    // Send to PC synth
    if (pcSynthEnabled && window.pcSynth) {
        if (window.pcSynth.synth?.ctx?.state === 'suspended') window.pcSynth.synth.ctx.resume();
        window.pcSynth.noteOn(ch, midiNote, vel);
    }
}

function vkNoteOff(midiNote) {
    if (!vkActiveKeys[midiNote]) return;
    delete vkActiveKeys[midiNote];
    const ch = CHANNEL[vkActivePart];
    if (midiOutput) midiOutput.send([0x80 | ch, midiNote, 0]);
    if (pcSynthEnabled && window.pcSynth) window.pcSynth.noteOff(ch, midiNote);
}

function getMidiNote(keyEl) {
    const oct = parseInt(keyEl.dataset.oct);
    const n = parseInt(keyEl.dataset.note);
    return (vkOctave + oct) * 12 + n;
}

function attachKeyEvents(el, k) {
    const getNote = () => (vkOctave + k.oct) * 12 + k.n;

    el.addEventListener('mousedown', (e) => { e.preventDefault(); vkNoteOn(getNote()); el.classList.add('vk-active'); });
    el.addEventListener('mouseup',   () => { vkNoteOff(getNote()); el.classList.remove('vk-active'); });
    el.addEventListener('mouseleave',() => { if (vkActiveKeys[getNote()]) { vkNoteOff(getNote()); el.classList.remove('vk-active'); } });

    el.addEventListener('touchstart', (e) => { e.preventDefault(); vkNoteOn(getNote()); el.classList.add('vk-active'); }, { passive: false });
    el.addEventListener('touchend',   (e) => { e.preventDefault(); vkNoteOff(getNote()); el.classList.remove('vk-active'); }, { passive: false });
    el.addEventListener('touchcancel',() => { vkNoteOff(getNote()); el.classList.remove('vk-active'); });
}

// Initialize MIDI controller (DOM already ready — script is at bottom of body)
initMidiController();


// PC Synth volume slider — sincroniza con EQ fader CC7 y envía al teclado
document.getElementById('sf2-vol')?.addEventListener('input', e => {
    const val = parseInt(e.target.value);
    const valEl = document.getElementById('sf2-vol-val');
    if (valEl) valEl.innerText = val;
    // Sincronizar EQ fader CC7 UI
    const eqFader = document.querySelector('.eq-fader[data-cc="7"]');
    if (eqFader) eqFader.value = val;
    const eqValEl = document.getElementById('eq-val-7');
    if (eqValEl) eqValEl.innerText = val;
    // Actualizar estado y enviar a teclado + PC synth (sendCC incluye applyCC para U1)
    ['U1','U2','L'].forEach(p => { eqState[p][7] = val; sendCC(p, 7, val); });
});

// PC Synth ON/OFF toggle
document.getElementById('pcSynthToggle')?.addEventListener('change', e => {
    pcSynthEnabled = e.target.checked;
    const warning = document.getElementById('pcSoundWarning');
    if (warning) warning.style.display = pcSynthEnabled ? 'flex' : 'none';

    const controls = document.getElementById('pcSynthControls');
    if (controls) controls.style.display = pcSynthEnabled ? 'block' : 'none';
    // Stop any currently sounding notes when toggling off
    if (!pcSynthEnabled && window.pcSynth) {
        for (const note in pcActiveNotes) {
            const ch = typeof pcActiveNotes[note] === 'number' ? pcActiveNotes[note] : 0;
            try { window.pcSynth.noteOff(ch, parseInt(note)); } catch(e) {}
        }
        for (const k in pcActiveNotes) delete pcActiveNotes[k];
        for (const k in pcSustainedNotes) delete pcSustainedNotes[k];
        // Stop any held virtual keyboard notes
        for (const note in vkActiveKeys) {
            try { window.pcSynth.noteOff(CHANNEL[vkActivePart], parseInt(note)); } catch(e) {}
        }
        for (const k in vkActiveKeys) delete vkActiveKeys[k];
    }
});

// Build GM instrument selectors (after DOM is ready — DOMContentLoaded already fired)
buildGMSelectors();




// Mobile Web Audio API fix: AudioContext MUST be resumed via user gesture
['click', 'touchstart', 'touchend'].forEach(evt => {
    document.addEventListener(evt, () => {
        if (window.pcSynth && window.pcSynth.synth && window.pcSynth.synth.ctx && window.pcSynth.synth.ctx.state === 'suspended') {
            window.pcSynth.synth.ctx.resume();
        }
    }, { once: false, passive: true });
});
// FORCE web audio OFF on load to defeat browser checkbox caching
window.addEventListener('DOMContentLoaded', () => {
    const pcToggle = document.getElementById('pcSynthToggle');
    if (pcToggle) pcToggle.checked = true;
    const pcWarning = document.getElementById('pcSoundWarning');
    if (pcWarning) pcWarning.style.display = 'none';
    const pcControls = document.getElementById('pcSynthControls');
    if (pcControls) pcControls.style.display = 'block';
    pcSynthEnabled = true;
});
