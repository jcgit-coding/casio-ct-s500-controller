// ======================================================================
//  PITCH  --  single source of truth for OCTAVE + TRANSPOSE
//
//  Both values are GLOBAL: they drive U1 + U2 + L together through
//  RPN 0x0002 (Coarse Tuning). There is no per-part octave: a per-part
//  value makes the three sounds diverge in pitch and has no UI to fix it.
//
//  The physical keyboard plays itself, so the only way to transpose it is
//  the channel RPN. Every path that could reset it (Program Change, CC121,
//  reconnect, preset load) must re-assert the same value on all 3 channels.
//
//  This module owns:
//    - the values (globalOctave / globalTranspose)
//    - the debounce + generation guard (no two different values in flight)
//    - the timing of the late re-asserts
//    - the header UI, shortcuts and the diagnostic line
// ======================================================================

// Global pitch state -- shared by app.js / presets.js / library.js.
// Declared here (not in app.js) so there is exactly one owner.
// Default octave -1: the player's chosen starting register (RPN 52). With -1 every transpose
// -12..+12 stays inside the Casio's +/-24 semitone limit; at -2 negative transpose is blocked.
const PITCH_DEFAULT_OCTAVE = -1;
let globalOctave = PITCH_DEFAULT_OCTAVE;      // -2..+2 octaves
let globalTranspose = 0;   // -12..+12 semitones
// CT-S500 MIDI Implementation 7.23.3: Coarse Tune accepts 28H-58H (40..88) = 64 +/- 24 semitones.
// Anything outside is invalid for the keyboard, so octave*12 + transpose is capped at +/-24.
const PITCH_MAX_SEMITONES = 24;

const PITCH_PARTS       = ['U1', 'U2', 'L'];
const PITCH_DEBOUNCE_MS = 40;   // coalesce button mashing
const PITCH_CHANNEL_GAP = 10;   // space the 3 channels (avoid bursts)
const PITCH_RPN_MSB     = 0x00;
const PITCH_RPN_LSB     = 0x02; // Coarse Tuning

const Pitch = (() => {
    let timer = null;
    let gen   = 0;
    let last  = null;   // { value, reason, at }

    function clampInt(value, min, max) {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) return 0;
        return Math.max(min, Math.min(max, n));
    }

    function rpnValue() {
        return Math.max(64 - PITCH_MAX_SEMITONES, Math.min(64 + PITCH_MAX_SEMITONES, 64 + globalOctave * 12 + globalTranspose));
    }

    // Keep octave*12 + transpose inside +/-24 by trimming the value that was just changed.
    function fitTotal(changed) {
        const total = globalOctave * 12 + globalTranspose;
        if (Math.abs(total) <= PITCH_MAX_SEMITONES) return;
        if (changed === 'octave') {
            globalOctave = clampInt(globalOctave, Math.ceil((-PITCH_MAX_SEMITONES - globalTranspose) / 12), Math.floor((PITCH_MAX_SEMITONES - globalTranspose) / 12));
        } else {
            globalTranspose = clampInt(globalTranspose, -PITCH_MAX_SEMITONES - globalOctave * 12, PITCH_MAX_SEMITONES - globalOctave * 12);
        }
    }

    function hasOutput() {
        return typeof midiOutput !== 'undefined' && !!midiOutput;
    }

    function sendTo(part, value) {
        if (!hasOutput()) return false;
        const ch = CHANNEL[part];
        if (ch === undefined) return false;
        midiOutput.send([0xB0 | ch, 101, PITCH_RPN_MSB]);
        midiOutput.send([0xB0 | ch, 100, PITCH_RPN_LSB]);
        midiOutput.send([0xB0 | ch, 6,   value]);
        midiOutput.send([0xB0 | ch, 101, 0x7F]);
        midiOutput.send([0xB0 | ch, 100, 0x7F]);
        return true;
    }

    function updateUI() {
        const octEl = document.getElementById('gOctVal');
        const trnEl = document.getElementById('gTrnVal');
        if (octEl) octEl.innerText = globalOctave > 0 ? '+' + globalOctave : String(globalOctave);
        if (trnEl) trnEl.innerText = globalTranspose > 0 ? '+' + globalTranspose : String(globalTranspose);
        updateDiag();
    }

    function updateDiag() {
        const el = document.getElementById('pitchDiag');
        if (!el) return;
        const out = hasOutput() ? 'ch 0,1,2' : 'sin salida MIDI';
        const when = last ? Math.round((Date.now() - last.at) / 100) / 10 + 's' : '—';
        el.textContent =
            `OCTAVE ${globalOctave} · TRANSPOSE ${globalTranspose >= 0 ? '+' + globalTranspose : globalTranspose}` +
            ` → RPN ${rpnValue()} (${out})` +
            (last ? ` · ${last.reason} hace ${when}` : '');
    }

    function flush(reason) {
        const myGen = gen;
        const value = rpnValue();
        last = { value, reason, at: Date.now() };
        updateUI();
        PITCH_PARTS.forEach((part, i) => {
            if (i === 0) { sendTo(part, value); return; }
            setTimeout(() => {
                if (myGen !== gen) return; // superseded by a newer value
                sendTo(part, value);
            }, i * PITCH_CHANNEL_GAP);
        });
    }

    function schedule(reason) {
        gen++;
        clearTimeout(timer);
        const myGen = gen;
        timer = setTimeout(() => {
            timer = null;
            if (myGen !== gen) return;
            flush(reason);
        }, PITCH_DEBOUNCE_MS);
    }

    // ── Long-press repeat (pointer) + Enter/Space (keyboard) ──────────
    function bindStep(el, fn) {
        if (!el) return;
        let holdTimer = null;
        let repeatTimer = null;
        const stop = () => { clearTimeout(holdTimer); clearInterval(repeatTimer); holdTimer = repeatTimer = null; };
        el.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            fn();
            holdTimer = setTimeout(() => { repeatTimer = setInterval(fn, 120); }, 400);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
        });
    }

    function init() {
        updateUI();

        bindStep(document.getElementById('gOctPlus'),  () => Pitch.stepOctave(+1, 'boton'));
        bindStep(document.getElementById('gOctMinus'), () => Pitch.stepOctave(-1, 'boton'));
        bindStep(document.getElementById('gTrnPlus'),  () => Pitch.stepTranspose(+1, 'boton'));
        bindStep(document.getElementById('gTrnMinus'), () => Pitch.stepTranspose(-1, 'boton'));

        document.getElementById('gOctReset')?.addEventListener('click', () => Pitch.setOctave(PITCH_DEFAULT_OCTAVE, 'reset'));
        document.getElementById('gTrnReset')?.addEventListener('click', () => Pitch.setTranspose(0, 'reset'));

        // Shortcuts: Alt+Up/Down = transpose, Shift+Alt+Up/Down = octave.
        document.addEventListener('keydown', e => {
            if (!e.altKey || e.ctrlKey || e.metaKey) return;
            const tag = (e.target && e.target.tagName) || '';
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const up = e.key === 'ArrowUp';
            if (e.shiftKey) Pitch.stepOctave(up ? +1 : -1, 'atajo');
            else           Pitch.stepTranspose(up ? +1 : -1, 'atajo');
        });

        document.getElementById('pitchSelftest')?.addEventListener('click', () => Pitch.selftest());
        document.getElementById('pitchResync')?.addEventListener('click', () => Pitch.reassert('manual'));
    }

    // ── Public API ────────────────────────────────────────────────────
    const api = {
        get: () => ({ octave: globalOctave, transpose: globalTranspose, value: rpnValue() }),

        setOctave(value, reason = 'octave') {
            globalOctave = clampInt(value, -2, 2);
            fitTotal('octave');
            updateUI();
            schedule(reason);
            return globalOctave;
        },

        setTranspose(value, reason = 'transpose') {
            globalTranspose = clampInt(value, -12, 12);
            fitTotal('transpose');
            updateUI();
            schedule(reason);
            return globalTranspose;
        },

        // Set both at once (preset / saved state). Setting them one by one lets the previous value
        // of the other one clip the new one (e.g. current octave +2 would trim a restored transpose +12).
        setBoth(octave, transpose, reason = 'state') {
            globalOctave = clampInt(octave === undefined ? globalOctave : octave, -2, 2);
            globalTranspose = clampInt(transpose === undefined ? globalTranspose : transpose, -12, 12);
            fitTotal('transpose');
            updateUI();
            schedule(reason);
            return api.get();
        },

        stepOctave(delta, reason = 'octave')     { return api.setOctave(globalOctave + delta, reason); },
        stepTranspose(delta, reason = 'transpose') { return api.setTranspose(globalTranspose + delta, reason); },

        // Ask for a (debounced) full re-assert. `delay` schedules it later and
        // returns the timer id so callers can cancel it.
        reassert(reason = 'reassert', delay = 0) {
            if (delay) return setTimeout(() => schedule(reason), delay);
            schedule(reason);
            return null;
        },

        // Immediate send, no debounce (used by the self-test and by hand).
        sendNow(reason = 'manual') { gen++; clearTimeout(timer); timer = null; flush(reason); },

        status: () => ({
            octave: globalOctave,
            transpose: globalTranspose,
            value: rpnValue(),
            last,
            pending: timer !== null,
            hasOutput: hasOutput()
        }),

        init,

        // ── Self-test: verifies the value that actually leaves on each channel ──
        async selftest() {
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const savedOutput = hasOutput() ? midiOutput : null;
            const savedOct = globalOctave, savedTrn = globalTranspose;
            const results = [];
            let cap = [];

            midiOutput = { send: m => cap.push(m), open: () => Promise.resolve() };

            const readChannels = () => {
                const rpn = {}, chans = {};
                cap.forEach(m => {
                    if ((m[0] & 0xF0) !== 0xB0) return;
                    const ch = m[0] & 0x0F;
                    rpn[ch] = rpn[ch] || { msb: null, lsb: null };
                    if (m[1] === 101) rpn[ch].msb = m[2];
                    if (m[1] === 100) rpn[ch].lsb = m[2];
                    if (m[1] === 6 && rpn[ch].msb === 0 && rpn[ch].lsb === 2) chans[ch] = m[2];
                });
                return chans;
            };

            const run = async (name, apply, expected) => {
                cap = [];
                apply();
                api.sendNow('selftest');
                await sleep(PITCH_CHANNEL_GAP * 3 + 20);
                const chans = readChannels();
                const ok = [0, 1, 2].every(ch => chans[ch] === expected);
                results.push({ name, ok, detail: `esperado ${expected} · enviado ${JSON.stringify(chans)}` });
            };

            await run('neutro (oct 0, trn 0)',   () => { globalOctave = 0;  globalTranspose = 0;  }, 64);
            await run('octava +1',               () => { globalOctave = 1;  globalTranspose = 0;  }, 76);
            await run('octava +2, transpose -3', () => { globalOctave = 2;  globalTranspose = -3; }, 85);
            await run('transpose +12',           () => { globalOctave = 0;  globalTranspose = 12; }, 76);
            await run('octava -2 (limite)',        () => { globalOctave = -2; globalTranspose = 0;  }, 40);
            await run('trn +12 y octava +2 -> octava recorta a +1 (total 24)', () => { api.setOctave(0); api.setTranspose(12); api.setOctave(2); }, 88);
            await run('clamp (oct 9, trn -99)',  () => { api.setTranspose(0); api.setOctave(9); api.setTranspose(-99); }, 76);
            await run('NaN -> 0',                () => { api.setOctave(0); api.setTranspose('abc'); }, 64);

            // Debounce: three quick changes must leave only the final value.
            cap = [];
            api.setOctave(1, 'selftest');
            api.setTranspose(2, 'selftest');
            api.setOctave(0, 'selftest');
            await sleep(PITCH_DEBOUNCE_MS + PITCH_CHANNEL_GAP * 3 + 40);
            const chans = readChannels();
            const debounceOk = [0, 1, 2].every(ch => chans[ch] === 66);
            results.push({ name: 'debounce (solo el último)', ok: debounceOk, detail: `esperado 66 · enviado ${JSON.stringify(chans)}` });

            // Restore the real state and output.
            globalOctave = savedOct;
            globalTranspose = savedTrn;
            if (savedOutput) midiOutput = savedOutput; else midiOutput = null;
            api.sendNow('restore');

            const okCount = results.filter(r => r.ok).length;
            const el = document.getElementById('pitchDiag');
            if (el) {
                el.textContent = `SELFTEST ${okCount}/${results.length} OK\n` +
                    results.map(r => `${r.ok ? 'OK ' : 'FALLA'} ${r.name} -- ${r.detail}`).join('\n');
            }
            console.table(results);
            return { ok: okCount === results.length, results };
        }
    };

    return api;
})();

// Compatibility wrapper for old call sites. It always sends the global value
// to all three channels (never a single part) so U1/U2/L cannot drift apart.
window.sendCoarseTuning = function sendCoarseTuning() {
    Pitch.sendNow('compat');
};
