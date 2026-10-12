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

// Merge two preset stores by timestamp -- most recent entry wins.
// Tombstones ({_deleted,_ts}) are kept so deletions propagate across devices.
// Old presets without _ts lose to any timestamped version (_ts ?? 0 = epoch).
function mergePresetStores(local, cloud) {
    const merged = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(cloud)]);
    for (const key of keys) {
        const l = local[key], c = cloud[key];
        if (!l) { merged[key] = c; continue; }
        if (!c) { merged[key] = l; continue; }
        merged[key] = (c._ts ?? 0) >= (l._ts ?? 0) ? c : l;
    }
    return merged;
}

async function syncPull() {
    try {
        // Public read -- no auth needed
        const res = await fetch(GH_API + '?t=' + Date.now(), {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!res.ok) return false;
        const json = await res.json();
        ghFileSha = json.sha;
        const cloud = JSON.parse(decodeURIComponent(escape(atob(json.content.replace(/\n/g, '')))));
        const local = readPresetsStore();
        const merged = mergePresetStores(local, cloud);
        localStorage.setItem('casioPresets', JSON.stringify(merged));
        renderPresets();
        return true;
    } catch { return false; }
}

// Serialized push queue -- prevents concurrent PUTs racing on the same SHA
let _syncQueue = Promise.resolve();
function syncPush() {
    _syncQueue = _syncQueue.catch(() => {}).then(() => _syncPushOnce());
    return _syncQueue;
}

async function _syncPushOnce(retried = false) {
    const token = ghToken();
    if (!token) { updateSyncStatus('No GitHub token'); return; }
    try {
        updateSyncStatus('Saving...');
        if (!ghFileSha) await syncPull();
        const presets = readPresetsStore();
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
        if (res.status === 409 && !retried) {
            // SHA conflict from a concurrent write -- re-fetch, merge, retry once
            ghFileSha = null;
            await syncPull();
            return _syncPushOnce(true);
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || res.status);
        }
        const data = await res.json();
        ghFileSha = data.content.sha;
        updateSyncStatus('✔ Guardado en GitHub');
    } catch(e) {
        console.error('syncPush:', e);
        updateSyncStatus('Error: ' + e.message);
    }
}

async function autoSyncInit() {
    updateSyncStatus('Loading presets...');
    const ok = await syncPull();
    if (ok) {
        updateSyncStatus(ghToken() ? 'GitHub connected' : 'Presets loaded (read only)');
    } else {
        updateSyncStatus('Offline - using local presets');
    }
    // Show token status in UI
    const tokenEl = document.getElementById('syncTokenDisplay');
    if (tokenEl) tokenEl.innerText = ghToken() ? '✔ Token configurado' : 'No token (read only)';
}

function initPresets() {
    document.getElementById("btnSavePreset").addEventListener("click", () => {
        const input = document.getElementById("presetName");
        const name  = input.value.trim();
        if (!name) { alert("Enter a name for the preset."); return; }
        const presets = readPresetsStore();
        if (presets[name] && !confirm(`"${name}" already exists. Overwrite?`)) return;
        captureAndSavePreset(name);
        input.value = '';
    });

    // â"€â"€ Exportar a archivo JSON â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    document.getElementById('btnExportPresets')?.addEventListener('click', () => {
        const json = localStorage.getItem('casioPresets') || '{}';
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'casio-presets.json'; a.click();
        URL.revokeObjectURL(url);
    });

    // â"€â"€ Importar desde archivo JSON â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    document.getElementById('btnImportPresets')?.addEventListener('click', () => {
        document.getElementById('fileImportPresets')?.click();
    });
    document.getElementById('fileImportPresets')?.addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error();
                const existing = JSON.parse(localStorage.getItem('casioPresets') || '{}');
                const collisions = Object.keys(imported).filter(k => k in existing);
                if (collisions.length > 0) {
                    if (!confirm(`Import will overwrite ${collisions.length} existing preset(s): ${collisions.join(',')} Continue?`)) return;
                }
                Object.assign(existing, imported);
                localStorage.setItem('casioPresets', JSON.stringify(existing));
                renderPresets();
                // Do not call syncPush here: syncPull dentro de syncPush puede pisar los datos importados
            } catch { alert('Invalid file.'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // â"€â"€ Configurar token GitHub â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    document.getElementById('btnSyncCreate')?.addEventListener('click', async e => {
        e.preventDefault();
        const current = ghToken();
        const t = prompt('GitHub Token (scope: contents):\n(Leave empty to clear)', current);
        if (t === null) return;
        const trimmed = t.trim();
        if (trimmed) {
            localStorage.setItem('casioGhToken', trimmed);
            const tokenEl = document.getElementById('syncTokenDisplay');
            if (tokenEl) tokenEl.innerText = '✔ Token configurado';
            await syncPush();
        } else {
            localStorage.removeItem('casioGhToken');
            const tokenEl = document.getElementById('syncTokenDisplay');
            if (tokenEl) tokenEl.innerText = 'No token (read only)';
            updateSyncStatus('Token eliminado');
        }
    });

    // â"€â"€ Subir / Bajar manual â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    document.getElementById('btnSyncPush')?.addEventListener('click', () => syncPush());
    document.getElementById('btnSyncPull')?.addEventListener('click', async () => {
        const ok = await syncPull();
        updateSyncStatus(ok ? '✔ Presets updated' : 'Offline');
    });

    renderPresets();
    autoSyncInit();
}

function captureAndSavePreset(name) {
    const eqSnap = JSON.parse(JSON.stringify(eqState));
    // CC7 (Volume) is governed by Part Mix Rules -- not per-preset character
    // CC72 (Release/Sustain) is a live toggle -- not per-preset state
    ['U1','U2','L'].forEach(p => {
        delete eqSnap[p][7];  delete eqSnap[p]['7'];
        delete eqSnap[p][72]; delete eqSnap[p]['72'];
    });
    const data = {
        _ts:              Date.now(),
        eqState:          eqSnap,
        tuning:           JSON.parse(JSON.stringify(tuning)),
        globalTranspose:  globalTranspose,
        globalOctave:     globalOctave,
        activeCategories: JSON.parse(JSON.stringify(activeCategories)),
        tones: {
            U1: currentTone.U1?.id ?? '',
            U2: currentTone.U2?.id ?? '',
            L:  currentTone.L?.id  ?? '',
        },
        searchFilters: {
            U1: window.toneSearch?.U1?.searchEl?.value ?? 'Piano',
            U2: window.toneSearch?.U2?.searchEl?.value ?? 'Pad',
            L:  window.toneSearch?.L?.searchEl?.value  ?? 'String',
        }
    };
    const presets = readPresetsStore();
    presets[name] = data;
    localStorage.setItem("casioPresets", JSON.stringify(presets));
    renderPresets();
    syncPush();
}

function loadPreset(data) {
    if (data.activeCategories) Object.assign(activeCategories, data.activeCategories);
    ['U1','U2','L'].forEach(part => {
        if (data.eqState?.[part]) {
            // Start from defaults so CCs missing in older presets don't keep the previous values
            EQ_CONTROLS.forEach(ctrl => { eqState[part][ctrl.cc] = ctrl.def; });
            Object.assign(eqState[part], data.eqState[part]);
            delete eqState[part][72]; delete eqState[part]['72'];
        }
    });
    // CC7 (Volume) comes from the saved eqState -- no longer forced here.
    ['U1','U2','L'].forEach(part => {
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
        // Restore tone selection -- new presets store numeric id, old ones stored text.
        // Restore filter first so the tone appears in context (and the chip highlights).
        if (data.tones?.[part] !== undefined && data.tones[part] !== '') {
            const ts = window.toneSearch?.[part];
            if (ts && data.searchFilters?.[part] !== undefined) {
                ts.searchEl.value = data.searchFilters[part];
                ts.searchEl.dispatchEvent(new Event('input'));
            }
            const byId = typeof data.tones[part] === 'number';
            selectToneInList(part, byId
                ? (d)    => d.id === data.tones[part]
                : (d, o) => o.text === data.tones[part]);
        }
    });

    // Restore global transpose
    if (data.globalTranspose !== undefined) {
        globalTranspose = data.globalTranspose;
        const valEl = document.getElementById('gTrnVal');
        if (valEl) valEl.innerText = globalTranspose > 0 ? '+' + globalTranspose : globalTranspose;
    }

    if (data.globalOctave !== undefined) {
        globalOctave = data.globalOctave;
        const octEl = document.getElementById('gOctVal');
        if (octEl) octEl.innerText = globalOctave > 0 ? '+' + globalOctave : globalOctave;
    }

    switchEQ(activePart);
    pushAllToKeyboard();
}

function readPresetsStore() {
    try { return JSON.parse(localStorage.getItem("casioPresets") || "{}") || {}; }
    catch(e) {
        console.error('[presets] corrupted storage, backing up:', e);
        try { localStorage.setItem('casioPresets.corrupt.' + Date.now(), localStorage.getItem('casioPresets')); } catch(_) {}
        return {};
    }
}

function renderPresets() {
    const list    = document.getElementById("presetsList");
    const presets = readPresetsStore();
    list.innerHTML = '';

    for (const [name, data] of Object.entries(presets)) {
        if (data?._deleted) continue; // tombstone -- deleted on another device
        const item = document.createElement('div');
        item.className = 'preset-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-item-name';
        nameSpan.title     = name;
        nameSpan.innerText = name;

        const actions = document.createElement('div');
        actions.className = 'preset-actions';

        const loadBtn = document.createElement('button');
        loadBtn.innerText = 'Load'; loadBtn.title = 'Load preset';
        loadBtn.onclick = () => loadPreset(data);

        const overBtn = document.createElement('button');
        overBtn.innerText = 'Save'; overBtn.title = 'Overwrite with current state';
        overBtn.onclick = () => { if (confirm(`Overwrite "${name}"?`)) captureAndSavePreset(name); };

        const delBtn = document.createElement('button');
        delBtn.innerText = 'Delete'; delBtn.title = 'Delete preset';
        delBtn.className   = 'del-btn';
        delBtn.onclick = () => {
            if (!confirm(`Delete "${name}"?`)) return;
            const p = readPresetsStore();
            p[name] = { _deleted: true, _ts: Date.now() }; // tombstone so deletion propagates to other devices
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

function saveAppState() {
    // Deep-copy eqState excluding PERFORMANCE_CCS (live-state -- must not be forced on reload)
    const eqSnap = {};
    ['U1','U2','L'].forEach(p => {
        eqSnap[p] = {};
        Object.entries(eqState[p]).forEach(([cc, v]) => {
            if (!PERFORMANCE_CCS.has(Number(cc))) eqSnap[p][cc] = v;
        });
    });
    const appState = {
        v: 196,
        eqState: eqSnap,
        tuning,
        activeCategories,
        globalTranspose,
        globalOctave,
        activePart,
        pcSynthEnabled,
        tones: {
            U1: _getSavedToneId('U1'),
            U2: _getSavedToneId('U2'),
            L: _getSavedToneId('L')
        },
        searchFilters: {
            U1: window.toneSearch?.['U1']?.searchEl?.value ?? '',
            U2: window.toneSearch?.['U2']?.searchEl?.value ?? '',
            L:  window.toneSearch?.['L']?.searchEl?.value  ?? ''
        }
    };
    try { localStorage.setItem('casioAppState', JSON.stringify(appState)); }
    catch(e) { console.warn('[state] save failed:', e); }
}

function loadAppState() {
    try {
        const saved = JSON.parse(localStorage.getItem('casioAppState'));
        if (!saved) return false;
        
        if (saved.eqState) {
            Object.assign(eqState, saved.eqState);
            // Purge CC72 (Release) -- never apply from saved state; CC72 is managed by tuning.sus
            ['U1','U2','L'].forEach(p => { delete eqState[p][72]; delete eqState[p]['72']; });
        }
        if (saved.activeCategories) Object.assign(activeCategories, saved.activeCategories);
        if (saved.tuning) Object.assign(tuning, saved.tuning);
        // Tuning UI must follow the restored state even when the preset has no
        // tones (or an old/absent appState) -- otherwise the SUSTAIN button can
        // show OFF while tuning.sus is ON and the hardware gets CC72=100.
        ['U1','U2','L'].forEach(part => {
            const octEl = document.getElementById('oct-' + part);
            const octVal = tuning[part].oct || 0;
            if (octEl) octEl.innerText = octVal > 0 ? '+' + octVal : octVal;

            const susBtn = document.getElementById('sus-' + part);
            if (susBtn) {
                susBtn.innerText = tuning[part].sus ? 'ON' : 'OFF';
                susBtn.classList.toggle('sus-on', tuning[part].sus);
            }
        });
        if (saved.globalTranspose !== undefined) {
            globalTranspose = saved.globalTranspose;
            const trnEl = document.getElementById('gTrnVal');
            if (trnEl) trnEl.innerText = (globalTranspose>0?'+':'')+globalTranspose;
        }

        if (saved.globalOctave !== undefined) {
            globalOctave = saved.globalOctave;
            const octEl = document.getElementById('gOctVal');
            if (octEl) octEl.innerText = (globalOctave>0?'+':'')+globalOctave;
        }

        if (saved.activePart) {
            activePart = saved.activePart;
            // Update UI buttons
            document.querySelectorAll('.btn-eq').forEach(b => b.classList.toggle('active-eq', b.dataset.part === activePart));
        }
        
        // Only restore specific tones from v194+ saves (first version that saves correct
        // tones + searchFilters together). Saves from v192/v193 may still carry
        // OpenCode-era tone IDs (e.g. 687 GM SYNTH-STRINGS instead of 24 STRINGS PIANO);
        // in that case let initToneSearch's first-in-filter default stand.
        if (saved.tones && saved.v >= 194) {
            ['U1', 'U2', 'L'].forEach(part => {
                const ts = window.toneSearch?.[part];
                // Restore saved search filter so the active chip matches (v196+)
                if (ts && saved.searchFilters?.[part] !== undefined) {
                    ts.searchEl.value = saved.searchFilters[part];
                    ts.searchEl.dispatchEvent(new Event('input'));
                }
                if (saved.tones[part] !== undefined) {
                    selectToneInList(part, d => d.id === saved.tones[part]);
                }
            });
        }

        // Guarantee default tones if not loaded, missing or id is 0
        const defaults = { U1: 1, U2: 8, L: 24 };
        ['U1', 'U2', 'L'].forEach(part => {
            if (!currentTone[part] || !currentTone[part].id) {
                selectToneInList(part, d => d.id === defaults[part]);
            }
        });

        if (saved.pcSynthEnabled !== undefined) {
            pcSynthEnabled = saved.pcSynthEnabled;
            const pcToggle = document.getElementById('pcSynthToggle');
            if (pcToggle) pcToggle.checked = pcSynthEnabled;
        }

        switchEQ(activePart); // updates sliders on screen

        // If MIDI is already connected (USB was not unplugged between reloads),
        // send tones and CCs so the Casio accurately matches the instruments on screen.
        if (midiOutput) pushAllToKeyboard(false);

        return true;
    } catch (e) {
        console.error("Error loading app state:", e);
        return false;
    }
}
