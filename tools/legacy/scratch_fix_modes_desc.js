const fs = require('fs');
let harm = fs.readFileSync('harmony.js', 'utf8');

const startIdx = harm.indexOf('    const MODES = {');
const endIdx = harm.indexOf('    function renderMasterKeyboard(');

if (startIdx !== -1 && endIdx !== -1) {
    const before = harm.substring(0, startIdx);
    const after = harm.substring(endIdx);
    
    const newModes = `    const MODES = {
        ionian: {
            intervals:   [0, 2, 4, 5, 7, 9, 11],
            qualities:   ['Maj', 'm', 'm', 'Maj', 'Dom', 'm', 'dim'],
            degrees:     ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
            extensions:  [DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6]],
            desc: "<strong>Emotional Portrait:</strong> Happy, bright, stable, and deeply restful. It is the color of 'home', the center of gravity that transmits safety and wholeness. Since it contains no external alterations, it sounds natural and direct, serving as the foundation for diatonic harmony.<br><br><strong>Avoid Notes:</strong> The perfect 11th is the ultimate Avoid Note. Omit the 11th or suspend the chord to a sus4.<br><br><strong>Study Progression:</strong> Imaj9 → vim9 → iim9 → V9 → Imaj9 (Classic Ballad)"
        },
        dorian: {
            intervals:   [0, 2, 3, 5, 7, 9, 10],
            qualities:   ['m', 'm', 'Maj', 'Dom', 'm', 'dim', 'Maj'],
            degrees:     ['i', 'ii', 'bIII', 'IV', 'v', 'vi°', 'bVII'],
            extensions:  [DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0]],
            desc: "<strong>Emotional Portrait:</strong> Sophisticated, mysterious, and nostalgic with a glimmer of hope. It is the flagship sound of Neo-Soul, Modal Jazz, and Funk. The brightness of the natural major 6th prevents the minor chord from being completely sad, giving it a sophisticated, modern, and ethereal color.<br><br><strong>Avoid Notes:</strong> No strict avoid notes. The mode is highly symmetrical.<br><br><strong>Study Progression:</strong> im9 → IV9 → bVIImaj9 → im9 (Neo-Soul / Jazz Modal Groove)"
        },
        phrygian: {
            intervals:   [0, 1, 3, 5, 7, 8, 10],
            qualities:   ['m', 'Maj', 'Dom', 'm', 'dim', 'Maj', 'm'],
            degrees:     ['i', 'bII', 'bIII', 'iv', 'v°', 'bVI', 'bvii'],
            extensions:  [DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1]],
            desc: "<strong>Emotional Portrait:</strong> Dark, tense, exotic, and intensely passionate. It is the classic sound of flamenco, metal, and mystery soundtracks. The use of the b2 / b9 generates an acoustic friction of immense dramatic weight that demands immediate resolution.<br><br><strong>Avoid Notes:</strong> The b2 is a highly dissonant note.<br><br><strong>Study Progression:</strong> im11(b9) → bIImaj13(#11) → bviim9 → im11(b9) (Epic Flamenco Cadence)"
        },
        lydian: {
            intervals:   [0, 2, 4, 6, 7, 9, 11],
            qualities:   ['Maj', 'Dom', 'm', 'dim', 'Maj', 'm', 'm'],
            degrees:     ['I', 'II', 'iii', '#iv°', 'V', 'vi', 'vii'],
            extensions:  [DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2]],
            desc: "<strong>Emotional Portrait:</strong> Magical, dreamy, cinematic, and floating. It is the favorite color of film composers to convey wonder, flight, or space magic. The presence of the #11 opens the chord and makes it sound expansive and weightless.<br><br><strong>Avoid Notes:</strong> No avoid notes. The #11 is an extremely stable tension note.<br><br><strong>Study Progression:</strong> Imaj13(#11) → II9 → viim7 → Imaj13(#11) (Space Cinematic Progression)"
        },
        mixolydian: {
            intervals:   [0, 2, 4, 5, 7, 9, 10],
            qualities:   ['Dom', 'm', 'dim', 'Maj', 'm', 'm', 'Maj'],
            degrees:     ['I', 'ii', 'iii°', 'IV', 'v', 'vi', 'bVII'],
            extensions:  [DEG_EXTS[4], DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3]],
            desc: "<strong>Emotional Portrait:</strong> Earthy, bluesy, groovy, the engine of gospel and blues. It is the festive and restless color of Southern Rock and West Coast Funk. The minor 7th (b7) removes the classic rigidity of the major chord, giving it a constant rhythmic push.<br><br><strong>Avoid Notes:</strong> The perfect 11th clashes with the major 3rd by a semitone.<br><br><strong>Study Progression:</strong> I9 → bVIImaj13(#11) → iim9 → I9 (Gospel / Southern Rock Groove)"
        },
        aeolian: {
            intervals:   [0, 2, 3, 5, 7, 8, 10],
            qualities:   ['m', 'dim', 'Maj', 'm', 'm', 'Maj', 'Dom'],
            degrees:     ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'],
            extensions:  [DEG_EXTS[5], DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4]],
            desc: "<strong>Emotional Portrait:</strong> Melancholic, introspective, sad, and poetic without being tragic. It is the predominant sonority of classic rock, pop ballads, and folk music. It conveys a feeling of resignation or mature nostalgia, ideal for developing emotional ballads.<br><br><strong>Avoid Notes:</strong> The b13 is the Avoid Note.<br><br><strong>Study Progression:</strong> im9 → bVImaj13(#11) → ivm9 → bVII9 → im9 (Emotional Ballad Progression)"
        },
        locrian: {
            intervals:   [0, 1, 3, 5, 6, 8, 10],
            qualities:   ['dim', 'Maj', 'm', 'm', 'Maj', 'Dom', 'm'],
            degrees:     ['i°', 'bII', 'biii', 'iv', 'bV', 'bVI', 'bvii'],
            extensions:  [DEG_EXTS[6], DEG_EXTS[0], DEG_EXTS[1], DEG_EXTS[2], DEG_EXTS[3], DEG_EXTS[4], DEG_EXTS[5]],
            desc: "<strong>Emotional Portrait:</strong> Unstable, tense, dark, unsettling, and passing. Containing a diminished 5th over its tonic chord, it completely lacks harmonic stability. It feels like floating in quicksand, making it ideal for suspenseful film tension passages.<br><br><strong>Avoid Notes:</strong> The b2 and b5 are critical notes.<br><br><strong>Study Progression:</strong> im7b5(b9) → bIImaj9 → ivm11(b9) → im7b5(b9) (Tension / Suspense Passage)"
        }
    };

`;
    
    fs.writeFileSync('harmony.js', before + newModes + after);
    console.log('Fixed MODES structure and added descs');
} else {
    console.log('Failed to find indices');
}
