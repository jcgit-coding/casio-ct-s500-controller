const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

const extMap = `    const EXT_INTERVALS = {
        'Maj7': [0, 4, 7, 11],
        'Maj9': [0, 4, 7, 11, 14],
        'add9': [0, 4, 7, 14],
        'sus2': [0, 2, 7],
        'sus4': [0, 5, 7],
        'm7':   [0, 3, 7, 10],
        'm9':   [0, 3, 7, 10, 14],
        'm11':  [0, 3, 7, 10, 14, 17],
        '#11':  [0, 4, 7, 11, 18],
        '7':    [0, 4, 7, 10],
        '9':    [0, 4, 7, 10, 14],
        '13':   [0, 4, 7, 10, 14, 21],
        'm7b5': [0, 3, 6, 10]
    };

    function getChordNotes(rootNote, ext) {
        const intervals = EXT_INTERVALS[ext];
        if (!intervals) return '';
        return intervals.map(iv => getNoteOffset(rootNote, iv)).join('-');
    }

`;

harm = harm.replace('const MODES = {', extMap + '    const MODES = {');
harm = harm.replace('tag.textContent = ext;', 'tag.innerHTML = `<b>${ext}</b> <span style="opacity:0.6;font-weight:400;font-size:11px;">(${getChordNotes(rootNote, ext)})</span>`;');

fs.writeFileSync('harmony.js', harm);
console.log('Fixed harmony.js');
