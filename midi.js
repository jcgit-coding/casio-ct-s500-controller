// ======================================================================
//  MIDI INIT -- always-on with auto-reconnect
// ======================================================================
function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        setStatus("Web MIDI not supported (Use Chrome or Edge)", false);
        return;
    }
    setStatus("Connecting...", false);
    // Android requires sysex:false -- sysex:true triggers platform init failure, and async
    // retries lose the user gesture context required by Android Chrome for requestMIDIAccess.
    const sysex = !/android/i.test(navigator.userAgent);

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
        const permDenied = err.name === 'SecurityError' || err.name === 'NotAllowedError';
        console.error('[MIDI] error (sysex=' + sysex + '):', err.name, err.message);
        // If sysex=true was denied, retry without sysex -- basic MIDI still works
        if (permDenied && sysex) {
            console.warn('[MIDI] sysex denied, retrying without sysex...');
            navigator.requestMIDIAccess({ sysex: false }).then(onAccess, err2 => {
                console.error('[MIDI] retry error:', err2.name, err2.message);
                setStatus("MIDI blocked: Click 'Reconnect' or grant permissions in Chrome", false);
                const warn = document.getElementById('midiPermissionWarn');
                if (warn) warn.style.display = 'block';
            });
            return;
        }
        if (permDenied) {
            setStatus("MIDI blocked: Click 'Reconnect' or grant permissions in Chrome", false);
        } else {
            setStatus("MIDI Error: " + err.message, false);
        }
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'block';
    }

    navigator.requestMIDIAccess({ sysex }).then(onAccess, onError);
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
    // Virtual ports (loopMIDI, rtpMIDI...) contain "MIDI" too, so they must never outrank the Casio.
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
        const check = String.fromCharCode(0x2714) + " ";
        const label = midiOutput && midiInput ? check + name
                    : midiOutput ? check + name + " (output only)"
                    : check + name + " (input only)";
        setStatus(label, !!(midiOutput || midiInput));
        document.getElementById("connectBtn").innerText = "Reconnect";
        const warn = document.getElementById('midiPermissionWarn');
        if (warn) warn.style.display = 'none';
        if (midiOutput) {
            const newId = midiOutput.id;
            _lastMidiOutputId = newId;
            // Always push tones and CCs so the Casio accurately reflects the app's initial/current instruments
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
    
    // --- PC SYNTH HOOK ---
    if (pcSynthEnabled && window.sf2Ready && window.pcSynth) {
        const cmd    = status & 0xF0;
        const noteCh = status & 0x0F;

        if (cmd === 0x90) { // Note On
            if (d2 > 0) {
                // Same shift the Casio gets via RPN Coarse Tuning (global octave + transpose)
                // Per-part octave removed: sendCoarseTuning ignores tuning[part].oct and
                // applying it only here would desync PC Synth pitch from the Casio.
                const shift = globalTranspose + globalOctave * 12;
                const shiftedNote = Math.max(0, Math.min(127, d1 + shift));

                pcActiveNotes[noteCh + ':' + d1] = { ch: noteCh, shiftedNote: shiftedNote };
                if (window.pcSynth.synth?.ctx?.state === 'suspended') window.pcSynth.synth.ctx.resume();
                window.pcSynth.noteOn(noteCh, shiftedNote, d2); // unscaled velocity -- el synth maneja su propio Volume
            } else {
                pcNoteOff(noteCh, d1);
            }
        } else if (cmd === 0x80) { // Note Off
            pcNoteOff(noteCh, d1);
        } else if (cmd === 0xB0 && d1 === 64) {
            // Physical damper pedal is global on the Casio -> hold all 3 PC synth parts (native CC64)
            Object.values(CHANNEL).forEach(ch => window.pcSynth.applyCC(64, d2, ch));
        }
    }
    
    // Control Change
    if (status >= 0xB0 && status <= 0xBF) {
        const ch   = status & 0x0F;
        const part = Object.keys(CHANNEL).find(k => CHANNEL[k] === ch);

        if (!part) return;

        // CC7 is a per-channel (per-part) volume -- mirror it to that part's PC synth channel
        if (d1 === 7 && window.pcSynth?.applyCC) window.pcSynth.applyCC(7, d2, ch);

        // Catch Bank Select MSB (CC0)
        if (d1 === 0) {
            pendingBank[part] = d2;
        }

        // Update EQ memory (exclude CC64=damper pedal, CC72=app sustain, CC0=bank-select)
        if (d1 !== 64 && d1 !== 72 && d1 !== 0) eqState[part][d1] = d2;

        // If EQ panel is showing this part, update fader UI
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
                    document.querySelectorAll(`.eq-fader[data-cc="${d1}"]`).forEach(f => {
                        f.value = d2;
                    });
                }
                document.querySelectorAll(`.eq-val-${d1}`).forEach(valEl => {
                    valEl.innerText = ctrl.type === 'switch' ? (d2 > 63 ? 'ON' : 'OFF') : formatVal(ctrl.label, d2);
                });
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

        // Update UI and apply tone+environment acoustic profile for the new tone.
        const pcOpt = selectToneInList(part, d => d.bank === bank && d.program === pc);
        if (pcOpt) {
            const pcCat = pcOpt.parentElement?.tagName === 'OPTGROUP'
                ? pcOpt.parentElement.label
                : (activeCategories[part] || 'PIANO');
            scheduleProfile(part, pcCat); // scheduleProfile calls resyncAllSustain internally
        } else if (tuning[part].sus) {
            scheduleSustainResync(part, SUSTAIN_TAPS);
        }
    }
}

// ======================================================================
//  EQ PANEL
// ======================================================================
// EQ sections -- grouped logically with readable titles
