const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

const startIdx = harm.indexOf('    const MODES = {');
const endIdx = harm.indexOf('    function renderMasterKeyboard(');

if (startIdx !== -1 && endIdx !== -1) {
    const before = harm.substring(0, startIdx);
    const after = harm.substring(endIdx);
    
    const newModes = `    const DEG_EXTS = [
        ['Maj7', 'Maj9', 'add9', 'sus2', 'sus4'],                  // Ionian 1
        ['m7', 'm9', 'm11', 'sus2', 'sus4'],                        // Ionian 2
        ['m7', 'm11(b9)', 'sus4'],                                  // Ionian 3
        ['Maj7', 'Maj9', 'Maj13(#11)', '#11', 'sus2'],              // Ionian 4
        ['7', '9', '13', 'sus2', 'sus4'],                           // Ionian 5
        ['m7', 'm9', 'm11', 'sus2', 'sus4'],                        // Ionian 6
        ['m7b5', 'm7b5(b9)']                                        // Ionian 7
    ];

    const MODES = {
        ionian: {
            intervals:   [0, 2, 4, 5, 7, 9, 11],
            qualities:   ['Maj', 'm', 'm', 'Maj', 'Dom', 'm', 'dim'],
            degrees:     ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            extensions:  [DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6]]
        },
        dorian: {
            intervals:   [0, 2, 3, 5, 7, 9, 10],
            qualities:   ['m', 'm', 'Maj', 'Dom', 'm', 'dim', 'Maj'],
            degrees:     ['i', 'ii', 'bIII', 'IV', 'v', 'vi°', 'bVII'],
            extensions:  [DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0]]
        },
        phrygian: {
            intervals:   [0, 1, 3, 5, 7, 8, 10],
            qualities:   ['m', 'Maj', 'Dom', 'm', 'dim', 'Maj', 'm'],
            degrees:     ['i', 'bII', 'bIII', 'iv', 'v°', 'bVI', 'bvii'],
            extensions:  [DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1]]
        },
        lydian: {
            intervals:   [0, 2, 4, 6, 7, 9, 11],
            qualities:   ['Maj', 'Dom', 'm', 'dim', 'Maj', 'm', 'm'],
            degrees:     ['I', 'II', 'iii', '#iv°', 'V', 'vi', 'vii'],
            extensions:  [DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2]]
        },
        mixolydian: {
            intervals:   [0, 2, 4, 5, 7, 9, 10],
            qualities:   ['Dom', 'm', 'dim', 'Maj', 'm', 'm', 'Maj'],
            degrees:     ['I', 'ii', 'iii°', 'IV', 'v', 'vi', 'bVII'],
            extensions:  [DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3]]
        },
        aeolian: {
            intervals:   [0, 2, 3, 5, 7, 8, 10],
            qualities:   ['m', 'dim', 'Maj', 'm', 'm', 'Maj', 'Dom'],
            degrees:     ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'],
            extensions:  [DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4]]
        },
        locrian: {
            intervals:   [0, 1, 3, 5, 6, 8, 10],
            qualities:   ['dim', 'Maj', 'm', 'm', 'Maj', 'Dom', 'm'],
            degrees:     ['i°', 'bII', 'biii', 'iv', 'bV', 'bVI', 'bvii'],
            extensions:  [DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5]]
        }
    };

`;
    
    fs.writeFileSync('harmony.js', before + newModes + after);
    console.log('Fixed MODES structure');
} else {
    console.log('Failed to find indices');
}
