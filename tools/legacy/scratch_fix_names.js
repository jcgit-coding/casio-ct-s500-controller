const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

const formatFn = `
    function formatChordName(root, qual, ext) {
        if (!ext) {
            if (qual === 'm') return root + 'm';
            if (qual === 'dim') return root + 'dim';
            return root; 
        }
        if (ext === 'sus2' || ext === 'sus4') return root + ' ' + ext; 
        if (ext === '#11') return root + 'Maj7#11'; 
        if (ext.startsWith('m') || ext.startsWith('Maj') || ext === '7' || ext === '9' || ext === '13') return root + ext; 
        return root + ' ' + ext;
    }
`;

harm = harm.replace('    const MODES = {', formatFn + '\n    const MODES = {');

// Line 247 replacement (approximate string replace)
const oldStr = "renderMasterKeyboard(rootNote, intervals, chordName + ' ' + ext, notesStr);";
const newStr = "const formattedTitle = formatChordName(rootNote, qual, ext);\n                    renderMasterKeyboard(rootNote, intervals, formattedTitle, notesStr);";

harm = harm.replace(oldStr, newStr);

fs.writeFileSync('harmony.js', harm);
console.log('Fixed chord names');
