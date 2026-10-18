const EQ_SECTIONS = [
    {
        title: 'Volume & Panning',
        controls: [
            { label: 'Volume',  cc: 7,  def: 100, tip: 'Volume' },
            { label: 'EXPRESSION',  cc: 11, def: 110, tip: 'EXPRESSION (dynamics)' },
            { label: 'PAN',  cc: 10, def: 64,  tip: 'Pan (left/right)' },
        ]
    },
    {
        title: 'Filters',
        controls: [
            { label: 'CUTOFF', cc: 74, def: 64, tip: 'Filter Cutoff Frequency' },
            { label: 'RESONANCE',   cc: 71, def: 64, tip: 'Filter Resonance' },
        ]
    },
    {
        title: 'Envelope',
        controls: [
            { label: 'ATTACK',  cc: 73, def: 64, tip: 'Attack Time (hammer strike / bow)' },
        ]
    },
    {
        title: 'Pitch & Tuning',
        controls: [
            { label: 'DETUNE',  cc: 999, def: 64, tip: 'Fine Tuning RPN (-50c to +50c)' },
        ]
    },
    {
        title: 'Vibrato (LFO)',
        controls: [
            { label: 'RATE',  cc: 76, def: 64, tip: 'Vibrato Rate' },
            { label: 'DEPTH', cc: 77, def: 0,  tip: 'Vibrato Depth' },
            { label: 'DELAY', cc: 78, def: 64, tip: 'Vibrato Delay' },
        ]
    },
    {
        title: 'Spatial Effects',
        controls: [
            { label: 'REVERB', cc: 91, def: 40, tip: 'Reverb Send' },
            { label: 'CHORUS', cc: 93, def: 0,  tip: 'Chorus Send' },
            { label: 'ECHO',    cc: 94, def: 0,  tip: 'Delay Send' },
        ]
    },
    {
        title: 'Modulation & Voicing',
        controls: [
            { label: 'MODULATION', cc: 1,   def: 0, tip: 'Modulation Wheel' },
            { label: 'PORTAMENTO', cc: 65,  def: 0, tip: 'Portamento On/Off', type: 'switch' },
            { label: 'PORT. TIME', cc: 5,   def: 30, tip: 'Portamento Time (glide)' },
            { label: 'MONO',       cc: 126, def: 0, tip: 'Mono Mode (Legato solos/vientos)', type: 'switch' },
            { label: 'SOSTENUTO',  cc: 66,  def: 0, tip: 'Sostenuto Pedal (active notes only)', type: 'switch' },
            { label: 'SOFT',       cc: 67,  def: 0, tip: 'Soft Pedal (reduces volume)', type: 'switch' },
        ]
    },
];

// Flatten for easy CC lookup
const EQ_CONTROLS = EQ_SECTIONS.flatMap(s => s.controls);


let currentEnv = 'Studio';
// Verified CT-S500 CCs: 71=Resonance 73=Attack 74=Cutoff 76=VibRate 77=VibDepth 78=VibDelay 91=Reverb 93=Chorus 94=Echo
// CC102/103/104 (Casio "EQ" Low/Mid/High) removed — verified the CT-S500 ignores them.
// CC72 (Release) excluded from EQ state — managed separately via the SUSTAIN button
// CC75 (Decay) excluded — unverified on CT-S500, caused tone distortion at non-neutral values
// Casio Categories (raw_tones): PIANO HARPSICHORD ELEC.PIANO CLAVI VIB./CHROM.PERC. ELEC.ORGAN PIPE ORGAN ACCORDION
//   ACOUS.GUITAR ELEC.GUITAR ACOUS.BASS ELEC.BASS SOLO STRINGS STRING ENSEMBLE SOLO BRASS BRASS ENSEMBLE
//   SAX REED PIPE CHOIR EDM SYNTH CASIO CLASSIC INDIAN INDONESIAN ARABIC CHINESE BRAZILIAN ETHNIC OTHERS GM TONES
// SYNTH-BASS/LEAD/PAD/BRASS aplican al PC Synth GM (no existen como Casio categories)
const activeCategories = { U1: 'PIANO', U2: 'PIANO', L: 'PIANO' };

// Sustain CC72 per category (loaded here before app.js)
const CAT_SUS_RELEASE = {
    'PIANO': 100, 'HARPSICHORD': 100, 'ELEC.PIANO': 100, 'CLAVI': 100,
    'VIB./CHROM.PERC.': 105, 'ELEC.ORGAN': 88, 'PIPE ORGAN': 92, 'ACCORDION': 90,
    'ACOUS.GUITAR': 105, 'ELEC.GUITAR': 105, 'ACOUS.BASS': 98, 'ELEC.BASS': 98,
    'SYNTH-BASS': 100, 'SOLO STRINGS': 112, 'STRING ENSEMBLE': 112, 'SYNTH-PAD': 118,
    'CHOIR': 112, 'SOLO BRASS': 100, 'BRASS ENSEMBLE': 100, 'SAX': 100,
    'REED': 100, 'PIPE': 100, 'EDM': 105, 'SYNTH': 105, 'EDM SYNTH': 105,
    'SYNTH-LEAD': 105, 'SYNTH-BRASS': 105, 'CASIO CLASSIC': 105, 'INDIAN': 100,
    'INDONESIAN': 100, 'ARABIC': 100, 'CHINESE': 100, 'BRAZILIAN': 100,
    'ETHNIC': 100, 'OTHERS': 100, 'ETHNIC OTHERS': 100, 'GM TONES': 100, 'PERCUSSION': 100
};
function susRelease(part) {
    return CAT_SUS_RELEASE[activeCategories[part]] ?? 110;
}

// ======================================================================
//  TONE PROFILES  --  role-based Studio / Live / Hall / Jazz
//  Every tone in raw_tones.js resolves to a ROLE: first by its exact name
//  (TONE_ROLE, 764 entries), then by category (CAT_ROLE). Each role defines
//  a Studio base profile; Live / Hall / Jazz derive from it via derive().
//  Only CCs the CT-S500 honours are used (71,73,74,76,77,78,91,93,94).
//  For the bipolar controls 64 = the tone's designed neutral, kept wherever
//  neutral is the musically correct choice (e.g. no vibrato on piano).
// ======================================================================
const ROLES = {
    piano:          { 74:72, 71:64, 73:58, 76:64, 77:64, 78:64, 91:22, 93:0,  94:0 },
    piano_pad:      { 74:70, 71:64, 73:70, 76:66, 77:66, 78:70, 91:44, 93:24, 94:14 },
    ep:             { 74:70, 71:64, 73:60, 76:66, 77:64, 78:64, 91:22, 93:20, 94:0 },
    harpsi:         { 74:80, 71:70, 73:52, 76:64, 77:64, 78:64, 91:16, 93:0,  94:0 },
    clav:           { 74:82, 71:76, 73:52, 76:64, 77:64, 78:64, 91:14, 93:22, 94:0 },
    mallet:         { 74:80, 71:66, 73:58, 76:64, 77:64, 78:64, 91:26, 93:8,  94:0 },
    bell:           { 74:88, 71:64, 73:54, 76:64, 77:64, 78:64, 91:34, 93:10, 94:10 },
    dulcimer:       { 74:84, 71:64, 73:50, 76:64, 77:64, 78:64, 91:28, 93:8,  94:4 },
    organ:          { 74:74, 71:64, 73:58, 76:78, 77:74, 78:64, 91:24, 93:26, 94:0 },
    organ_pipe:     { 74:72, 71:64, 73:62, 76:64, 77:64, 78:64, 91:50, 93:0,  94:18 },
    accordion:      { 74:74, 71:68, 73:56, 76:64, 77:64, 78:64, 91:20, 93:14, 94:0 },
    harmonica:      { 74:74, 71:70, 73:58, 76:64, 77:64, 78:64, 91:22, 93:4,  94:0 },
    harmonium:      { 74:74, 71:70, 73:60, 76:64, 77:64, 78:64, 91:26, 93:8,  94:0 },
    bagpipe:        { 74:76, 71:72, 73:60, 76:64, 77:64, 78:64, 91:18, 93:12, 94:0 },
    guitar_acoustic:{ 74:76, 71:66, 73:58, 76:64, 77:64, 78:64, 91:22, 93:10, 94:0 },
    guitar_12str:   { 74:78, 71:66, 73:56, 76:64, 77:64, 78:64, 91:24, 93:20, 94:0 },
    guitar_jazz:    { 74:60, 71:64, 73:60, 76:64, 77:64, 78:64, 91:24, 93:8,  94:0 },
    guitar_clean:   { 74:80, 71:66, 73:58, 76:66, 77:64, 78:64, 91:22, 93:24, 94:8 },
    guitar_drive:   { 74:76, 71:70, 73:56, 76:68, 77:64, 78:64, 91:22, 93:12, 94:8 },
    guitar_dist:    { 74:74, 71:72, 73:54, 76:66, 77:64, 78:64, 91:20, 93:8,  94:10 },
    guitar_mute:    { 74:72, 71:66, 73:52, 76:64, 77:64, 78:64, 91:16, 93:4,  94:0 },
    guitar_synth:   { 74:80, 71:68, 73:60, 76:68, 77:68, 78:68, 91:26, 93:26, 94:16 },
    guitar_pad:     { 74:66, 71:62, 73:78, 76:66, 77:66, 78:72, 91:44, 93:22, 94:16 },
    guitar_talk:    { 74:78, 71:74, 73:54, 76:72, 77:70, 78:64, 91:18, 93:10, 94:10 },
    folk_pluck:     { 74:82, 71:66, 73:54, 76:64, 77:64, 78:64, 91:18, 93:6,  94:0 },
    bass:           { 74:68, 71:64, 73:58, 76:64, 77:64, 78:64, 91:10, 93:0,  94:0 },
    bass_slap:      { 74:78, 71:68, 73:50, 76:64, 77:64, 78:64, 91:12, 93:12, 94:6 },
    bass_synth:     { 74:72, 71:68, 73:54, 76:64, 77:64, 78:64, 91:10, 93:10, 94:0 },
    seq_bass:       { 74:76, 71:70, 73:48, 76:64, 77:64, 78:64, 91:10, 93:14, 94:4 },
    strings_solo:   { 74:74, 71:66, 73:70, 76:70, 77:72, 78:68, 91:32, 93:6,  94:0 },
    strings_ens:    { 74:72, 71:64, 73:78, 76:70, 77:68, 78:72, 91:40, 93:16, 94:12 },
    synth_strings:  { 74:78, 71:68, 73:78, 76:70, 77:70, 78:68, 91:36, 93:22, 94:14 },
    pad_strings:    { 74:78, 71:68, 73:76, 76:70, 77:72, 78:70, 91:40, 93:24, 94:16 },
    pad_saw:        { 74:80, 71:66, 73:74, 76:64, 77:70, 78:80, 91:46, 93:30, 94:18 },
    pad_glass:      { 74:82, 71:64, 73:66, 76:70, 77:72, 78:76, 91:52, 93:30, 94:22 },
    harp:           { 74:80, 71:64, 73:58, 76:64, 77:64, 78:64, 91:30, 93:6,  94:0 },
    pizz:           { 74:72, 71:64, 73:56, 76:64, 77:64, 78:64, 91:22, 93:6,  94:0 },
    hit:            { 74:74, 71:66, 73:50, 76:64, 77:64, 78:64, 91:28, 93:0,  94:14 },
    brass_solo:     { 74:76, 71:66, 73:60, 76:70, 77:68, 78:66, 91:24, 93:0,  94:0 },
    brass_ens:      { 74:76, 71:66, 73:58, 76:64, 77:64, 78:64, 91:26, 93:8,  94:0 },
    brass_hard:     { 74:82, 71:70, 73:54, 76:64, 77:64, 78:64, 91:22, 93:6,  94:0 },
    synth_brass:    { 74:80, 71:70, 73:56, 76:64, 77:64, 78:64, 91:22, 93:18, 94:12 },
    sax:            { 74:76, 71:66, 73:60, 76:72, 77:72, 78:66, 91:26, 93:6,  94:0 },
    reed:           { 74:78, 71:70, 73:62, 76:70, 77:68, 78:66, 91:26, 93:0,  94:0 },
    flute:          { 74:82, 71:60, 73:68, 76:72, 77:70, 78:68, 91:34, 93:4,  94:0 },
    voice:          { 74:68, 71:62, 73:80, 76:66, 77:68, 78:74, 91:50, 93:18, 94:16 },
    vocoder:        { 74:76, 71:70, 73:60, 76:70, 77:68, 78:66, 91:30, 93:24, 94:14 },
    synth_lead:     { 74:80, 71:68, 73:58, 76:66, 77:66, 78:68, 91:22, 93:24, 94:10 },
    lead_soft:      { 74:74, 71:60, 73:62, 76:64, 77:66, 78:66, 91:26, 93:20, 94:8 },
    pluck:          { 74:84, 71:60, 73:40, 76:64, 77:64, 78:64, 91:18, 93:12, 94:0 },
    arp:            { 74:86, 71:64, 73:38, 76:64, 77:64, 78:64, 91:24, 93:22, 94:12 },
    synth_pad:      { 74:72, 71:66, 73:78, 76:64, 77:64, 78:80, 91:48, 93:30, 94:20 },
    edm:            { 74:84, 71:70, 73:54, 76:64, 77:64, 78:64, 91:20, 93:30, 94:14 },
    ethnic_string:  { 74:74, 71:64, 73:60, 76:72, 77:74, 78:66, 91:30, 93:8,  94:6 },
    ethnic_pluck:   { 74:82, 71:66, 73:52, 76:64, 77:64, 78:64, 91:24, 93:6,  94:4 },
    ethnic_flute:   { 74:80, 71:62, 73:66, 76:72, 77:72, 78:68, 91:32, 93:4,  94:4 },
    ethnic_reed:    { 74:78, 71:72, 73:56, 76:72, 77:70, 78:66, 91:24, 93:6,  94:6 },
    ethnic_perc:    { 74:78, 71:66, 73:46, 76:64, 77:64, 78:64, 91:30, 93:4,  94:8 },
    sfx:            { 74:64, 71:64, 73:50, 76:64, 77:64, 78:64, 91:40, 93:0,  94:16 },
    generic:        { 74:72, 71:66, 73:62, 76:66, 77:64, 78:64, 91:22, 93:15, 94:0 }
};

// Casio category -> default role (last-resort fallback for tone names absent
// from TONE_ROLE, e.g. tones driven over the PC Synth / GM set).
const CAT_ROLE = {
    'PIANO': 'piano', 'HARPSICHORD': 'harpsi', 'ELEC.PIANO': 'ep', 'CLAVI': 'clav',
    'VIB./CHROM.PERC.': 'mallet', 'ELEC.ORGAN': 'organ', 'PIPE ORGAN': 'organ_pipe',
    'ACCORDION': 'accordion', 'ACOUS.GUITAR': 'guitar_acoustic', 'ELEC.GUITAR': 'guitar_clean',
    'ACOUS.BASS': 'bass', 'ELEC.BASS': 'bass', 'SYNTH-BASS': 'bass_synth',
    'SOLO STRINGS': 'strings_solo', 'STRING ENSEMBLE': 'strings_ens', 'SOLO BRASS': 'brass_solo',
    'BRASS ENSEMBLE': 'brass_ens', 'SYNTH-BRASS': 'synth_brass', 'SAX': 'sax', 'REED': 'reed',
    'PIPE': 'flute', 'CHOIR': 'voice', 'EDM SYNTH': 'edm', 'CASIO CLASSIC': 'generic',
    'INDIAN': 'ethnic_string', 'INDONESIAN': 'ethnic_perc', 'ARABIC': 'ethnic_string',
    'CHINESE': 'ethnic_string', 'BRAZILIAN': 'ethnic_pluck', 'ETHNIC OTHERS': 'folk_pluck',
    'GM TONES': 'generic', 'SYNTH-LEAD': 'synth_lead', 'SYNTH-PAD': 'synth_pad'
};

// Tone name (uppercased, exactly as parsed from raw_tones.js) -> role.
// One entry per tone, so no tone ever needs the category fallback.
const TONE_ROLE = {
    "STAGE PIANO": "piano",
    "CLASSIC GRAND": "piano",
    "BALLAD PIANO": "piano",
    "BRIGHT PIANO": "piano",
    "MELLOW ROCK PIANO": "piano",
    "MELLOW PIANO": "piano",
    "DYNAMIC PIANO": "piano",
    "ADV PIANO PAD": "piano_pad",
    "GRAND PIANO": "piano",
    "AMBIENT PIANO": "piano",
    "POP PIANO": "piano",
    "ROCK PIANO": "piano",
    "DANCE PIANO": "piano",
    "LA PIANO": "piano",
    "BREEZING PIANO": "piano",
    "TACK PIANO": "piano",
    "WIDE GRAND PIANO": "piano",
    "MONO PIANO": "piano",
    "HONKY-TONK 1": "piano",
    "HONKY-TONK 2": "piano",
    "OCTAVE PIANO 1": "piano_pad",
    "OCTAVE PIANO 2": "piano_pad",
    "BASS/PIANO": "piano_pad",
    "STRINGS PIANO": "piano_pad",
    "PIANO PAD": "piano_pad",
    "MODULATED PIANO": "piano_pad",
    "VOICE PIANO": "voice",
    "NEW AGE PIANO": "synth_pad",
    "ELEC.GRAND PIANO": "piano",
    "AMP E.GRAND": "ep",
    "MODERN E.G.PIANO": "ep",
    "HARPSICHORD 1": "harpsi",
    "HARPSICHORD 2": "harpsi",
    "COUPLED HARPSICHORD": "harpsi",
    "AMBIENT HARPSICHORD": "harpsi",
    "STAGE E.PIANO": "ep",
    "GALAXIA EP": "ep",
    "PHASER E.PIANO": "ep",
    "DYNO E.PIANO": "ep",
    "AMP 60'S E.PIANO": "ep",
    "LUCENT EP": "ep",
    "DYNAMIC EP": "ep",
    "ELEC.PIANO 1": "ep",
    "ELEC.PIANO 2": "ep",
    "ELEC.PIANO 3": "ep",
    "ELEC.PIANO 4": "ep",
    "ELEC.PIANO 5": "ep",
    "ELEC.PIANO 6": "ep",
    "TREM 60'S E.PIANO": "ep",
    "60'S E.PIANO": "ep",
    "AMP E.PIANO 1": "ep",
    "AMP E.PIANO 2": "ep",
    "PAN E.PIANO": "ep",
    "DIGITAL E.PIANO 1": "ep",
    "DIGITAL E.PIANO 2": "ep",
    "DIGITAL E.PIANO 3": "ep",
    "WIDE E.PIANO": "ep",
    "MELLOW E.PIANO": "ep",
    "WAH E.PIANO": "ep",
    "CRUNCH E.PIANO": "ep",
    "DIZZY E.PIANO": "ep",
    "ADV E.PIANO PAD 1": "piano_pad",
    "ADV E.PIANO PAD 2": "piano_pad",
    "E.PIANO PAD": "piano_pad",
    "CLAVI 1": "clav",
    "WAH CLAV": "clav",
    "AMP CLAVI": "clav",
    "CLAVI 2": "clav",
    "CLAVI 3": "clav",
    "CLAVI 4": "clav",
    "CLAVI 5": "clav",
    "CLAVI 6": "clav",
    "VIBRAPHONE 1": "mallet",
    "AMBIENT VIBRAPHONE": "mallet",
    "VIBRAPHONE 2": "mallet",
    "VIBRAPHONE 3": "mallet",
    "VIBRAPHONE WIDE": "mallet",
    "ADV VIBRAPHONE PAD": "mallet",
    "MARIMBA": "mallet",
    "ADV MARIMBA PAD": "mallet",
    "XYLOPHONE": "mallet",
    "CELESTA": "bell",
    "GLOCKENSPIEL": "bell",
    "MUSIC BOX": "bell",
    "ORGEL": "bell",
    "TUBULAR BELL": "bell",
    "CHURCH BELLS": "bell",
    "JS ORGAN": "organ",
    "AMP ORGAN 1": "organ",
    "ROCK ORGAN 1": "organ",
    "HARD ROCK ORGAN": "organ",
    "GOSPEL ORGAN 1": "organ",
    "VELO.ORGAN": "organ",
    "F-ORGAN": "organ",
    "V-ORGAN": "organ",
    "RTF FD ORGAN": "organ",
    "ROCK OD ORGAN": "organ",
    "TREMOLO ORGAN": "organ",
    "DP ORGAN": "organ",
    "JAZZ ORGAN 1": "organ",
    "JAZZ ORGAN 2": "organ",
    "ELEC.ORGAN 1": "organ",
    "ELEC.ORGAN 2": "organ",
    "ELEC.ORGAN 3": "organ",
    "ELEC.ORGAN 4": "organ",
    "ELEC.ORGAN 5": "organ",
    "PERC.ORGAN 1": "organ",
    "PERC.ORGAN 2": "organ",
    "GOSPEL ORGAN 2": "organ",
    "FULL DRAWBAR": "organ",
    "ROCK ORGAN 2": "organ",
    "ROCK ORGAN 3": "organ",
    "CLICK ORGAN": "organ",
    "70'S ORGAN": "organ",
    "ORGAN PAD": "organ_pipe",
    "THEATER ORGAN": "organ_pipe",
    "PERC.ORGAN 3": "organ",
    "ELEC.ORGAN 6": "organ",
    "AMP ORGAN 2": "organ",
    "AMP ORGAN 3": "organ",
    "ORGAN FLUTE": "organ_pipe",
    "PUFF ORGAN": "organ_pipe",
    "REED ORGAN": "organ_pipe",
    "ROTARY F-ORGAN": "organ",
    "ROTARY V-ORGAN": "organ",
    "CHAPEL ORGAN": "organ_pipe",
    "PIPE ORGAN 1": "organ_pipe",
    "PIPE ORGAN 2": "organ_pipe",
    "PIPE ORGAN 3": "organ_pipe",
    "ACCORDION FRENCH 1": "accordion",
    "ACCORDION FRENCH 2": "accordion",
    "ACCORDION FRENCH 3": "accordion",
    "ACCORDION ITALY 1": "accordion",
    "ACCORDION ITALY 2": "accordion",
    "ACCORDION": "accordion",
    "BANDONEON": "accordion",
    "BANDONEON SOLO": "accordion",
    "HARMONICA 1": "accordion",
    "HARMONICA 2": "accordion",
    "DYNAMIC NYLON GUITAR": "guitar_acoustic",
    "DYNAMIC STEEL GUITAR": "guitar_acoustic",
    "GUITAR PAD": "guitar_pad",
    "NYLON GUITAR VELO.SLIDE": "guitar_acoustic",
    "STEEL GUITAR VELO.SLIDE": "guitar_acoustic",
    "NYLON STR.GUITAR 1": "guitar_acoustic",
    "NYLON STR.GUITAR 2": "guitar_acoustic",
    "NYLON STR.GUITAR 3": "guitar_acoustic",
    "STEEL STR.GUITAR 1": "guitar_acoustic",
    "STEEL STR.GUITAR 2": "guitar_acoustic",
    "STEEL STR.GUITAR 3": "guitar_acoustic",
    "STEEL STR.GUITAR 4": "guitar_acoustic",
    "12 STR.GUITAR": "guitar_12str",
    "MANDOLIN": "folk_pluck",
    "UKULELE": "folk_pluck",
    "VERSATILE NYLON GUITAR": "guitar_acoustic",
    "VERSATILE STEEL GUITAR": "guitar_acoustic",
    "CLEAN LEAD GUITAR": "guitar_clean",
    "DISTORTION GUITAR 1": "guitar_dist",
    "DOUBLE TRACK GUITAR": "guitar_drive",
    "SOLO FEEDBACK GUITAR": "guitar_dist",
    "CRY DIST GUITAR": "guitar_dist",
    "TALK GUITAR OH-YEAH": "guitar_talk",
    "SOLO GUITAR SYNTH": "guitar_synth",
    "JAZZ GUITAR 1": "guitar_jazz",
    "JAZZ GUITAR 2": "guitar_jazz",
    "OD OCT JAZZ GUITAR": "guitar_jazz",
    "CRUNCH JAZZ GUITAR": "guitar_jazz",
    "CLEAN GUITAR 1": "guitar_clean",
    "CLEAN GUITAR 2": "guitar_clean",
    "CLEAN GUITAR 3": "guitar_clean",
    "CLEAN GUITAR 4": "guitar_clean",
    "CLEAN GUITAR 5": "guitar_clean",
    "CLEAN GUITAR 6": "guitar_clean",
    "CLEAN GUITAR 7": "guitar_clean",
    "CHORUS CLEAN GUITAR 1": "guitar_clean",
    "CHORUS CLEAN GUITAR 2": "guitar_clean",
    "WAH CLEAN GUITAR": "guitar_clean",
    "CRUNCH ELEC.GUITAR 1": "guitar_drive",
    "CRUNCH ELEC.GUITAR 2": "guitar_drive",
    "CRUNCH ELEC.GUITAR 3": "guitar_drive",
    "CHORUS CRUNCH GUITAR": "guitar_drive",
    "MUTE GUITAR": "guitar_mute",
    "CRUNCH MUTE GUITAR": "guitar_drive",
    "OVERDRIVE MUTE GT": "guitar_drive",
    "PHASER MUTE GUITAR": "guitar_mute",
    "AMBIENT MUTE GUITAR": "guitar_mute",
    "HUM BLUES GUITAR": "guitar_drive",
    "OVERDRIVE GUITAR 1": "guitar_drive",
    "OVERDRIVE GUITAR 2": "guitar_drive",
    "LFO WAH OD GUITAR": "guitar_drive",
    "WAH OD GUITAR": "guitar_drive",
    "CRY OD GUITAR": "guitar_drive",
    "FLANGER OD GUITAR": "guitar_drive",
    "DISTORTION GUITAR 2": "guitar_dist",
    "DISTORTION GUITAR 3": "guitar_dist",
    "DISTORTION GUITAR 4": "guitar_dist",
    "WAH DIST GUITAR": "guitar_dist",
    "PHASER DRIVE GUITAR": "guitar_dist",
    "VINTAGE OD GUITAR": "guitar_drive",
    "AMP GUITAR 1": "guitar_drive",
    "AMP GUITAR 2": "guitar_drive",
    "METAL AMBIENT GUITAR": "guitar_dist",
    "FRONT DRIVE GUITAR": "guitar_dist",
    "UPPER OCT GUITAR": "guitar_drive",
    "C+R CRUNCH GUITAR": "guitar_drive",
    "OCT METAL GUITAR": "guitar_dist",
    "TALK GUITAR UUH-WAH": "guitar_talk",
    "TALK GUITAR DOO-CHU": "guitar_talk",
    "FEEDBACK GUITAR": "guitar_dist",
    "GUITAR SYNTH": "guitar_synth",
    "VERSATILE SINGLE COIL E.GUITAR": "guitar_clean",
    "ACOUSTIC BASS 1": "bass",
    "ACOUSTIC BASS 2": "bass",
    "RIDE BASS": "bass",
    "FINGERED BASS 1": "bass",
    "FINGERED BASS 2": "bass",
    "FINGERED BASS VELO.SLAP 1": "bass",
    "FINGERED BASS VELO.SLAP 2": "bass",
    "SLAP BASS 1": "bass",
    "FINGER SLAP BASS 1": "bass",
    "CHORUS FINGERED BASS 1": "bass",
    "PHASER FINGERED BASS": "bass",
    "AMP FINGERED BASS": "bass",
    "WAH FINGERED BASS 1": "bass",
    "WAH SLAP BASS 1": "bass",
    "FINGERED BASS 3": "bass",
    "FINGERED BASS 4": "bass",
    "FINGERED BASS 5": "bass",
    "FINGERED BASS 6": "bass",
    "FINGERED BASS 7": "bass",
    "CHORUS FINGERED BASS 2": "bass",
    "WAH FINGERED BASS 2": "bass",
    "PICKED BASS 1": "bass",
    "PICKED BASS 2": "bass",
    "MUTE PICKED BASS": "bass",
    "SLAP BASS 2": "bass",
    "SLAP BASS 3": "bass",
    "CHORUS SLAP BASS": "bass",
    "AMP SLAP BASS": "bass",
    "WAH SLAP BASS 2": "bass",
    "FRETLESS BASS": "bass",
    "CHORUS FRETLESS BASS": "bass",
    "AMP FRETLESS BASS": "bass",
    "FINGER SLAP BASS 2": "bass",
    "FINGER SLAP BASS 3": "bass",
    "VERSATILE ELECTRIC BASS 1": "bass",
    "VERSATILE ELECTRIC BASS 2": "bass",
    "SYNTH-BASS 1": "bass_synth",
    "SYNTH-BASS 2": "bass_synth",
    "SYNTH-BASS 3": "bass_synth",
    "SYNTH-BASS 4": "bass_synth",
    "SYNTH-BASS 5": "bass_synth",
    "SYNTH-BASS 6": "bass_synth",
    "SYNTH-BASS 7": "bass_synth",
    "SYNTH-BASS 8": "bass_synth",
    "SYNTH-BASS 9": "bass_synth",
    "SYNTH-BASS 10": "bass_synth",
    "SYNTH-BASS 11": "bass_synth",
    "SYNTH-BASS 12": "bass_synth",
    "SYNTH-BASS 13": "bass_synth",
    "ORGAN BASS": "bass",
    "SOLO VIOLIN": "strings_solo",
    "VIOLIN": "strings_solo",
    "SLOW VIOLIN": "strings_solo",
    "VIOLA": "strings_solo",
    "CELLO": "strings_solo",
    "SLOW CELLO": "strings_solo",
    "CONTRABASS": "bass",
    "HARP 1": "harp",
    "HARP 2": "harp",
    "STEREO STRINGS": "strings_ens",
    "MELLOW STRINGS 1": "strings_ens",
    "MELLOW STRINGS 2": "strings_ens",
    "BRIGHT STRINGS 1": "strings_ens",
    "BRIGHT STRINGS 2": "strings_ens",
    "STRINGS": "strings_ens",
    "SLOW STEREO STRINGS": "strings_ens",
    "SLOW STRINGS 1": "strings_ens",
    "SLOW STRINGS 2": "strings_ens",
    "STRING ENSEMBLE": "strings_ens",
    "WARM STRINGS": "strings_ens",
    "PIZZICATO STRINGS": "pizz",
    "CHAMBER": "strings_ens",
    "OCTAVE STRINGS": "strings_ens",
    "ORCHESTRA HIT 1": "hit",
    "ORCHESTRA HIT 2": "hit",
    "ORCHESTRA HIT 3": "hit",
    "BRASS & STRINGS": "strings_ens",
    "VIOLIN SECTION": "strings_ens",
    "STRING QUARTET": "strings_ens",
    "HARP & STRINGS": "harp",
    "SOLO TRUMPET": "brass_solo",
    "TRUMPET 1": "brass_solo",
    "TRUMPET 2": "brass_solo",
    "TRUMPET 3": "brass_solo",
    "MELLOW TRUMPET": "brass_solo",
    "MUTE TRUMPET": "brass_solo",
    "AMBIENT TRUMPET": "brass_solo",
    "FLUGELHORN": "brass_solo",
    "TROMBONE": "brass_solo",
    "JAZZ TROMBONE": "brass_solo",
    "FRENCH HORN": "brass_solo",
    "FRENCH HORN SECTION": "brass_ens",
    "TUBA": "brass_solo",
    "SYMPHONIC BRASS": "brass_ens",
    "STEREO BRASS": "brass_ens",
    "BRASS": "brass_ens",
    "BRASS SECTION 1": "brass_ens",
    "BRASS SECTION 2": "brass_ens",
    "BRASS SECTION 3": "brass_ens",
    "AMBIENT BRASS": "brass_ens",
    "BIG BAND BRASS": "brass_ens",
    "HARD BRASS": "brass_hard",
    "BRASS SFZ": "brass_ens",
    "TRUMPET & TROMBONE & SAX": "brass_ens",
    "BRASS VELO.FALL": "brass_ens",
    "BRASS VELO.SHAKE": "brass_ens",
    "BRASS VELO.GLISSANDO": "brass_ens",
    "VERSATILE BRASS 1": "brass_ens",
    "VERSATILE BRASS 2": "brass_ens",
    "SYNTH-BRASS 1": "synth_brass",
    "SYNTH-BRASS STAB": "synth_brass",
    "SYNTH-BRASS 2": "synth_brass",
    "SYNTH-BRASS 3": "synth_brass",
    "SYNTH-BRASS 4": "synth_brass",
    "SYNTH-BRASS 5": "synth_brass",
    "WARM SYNTH-BRASS 1": "synth_brass",
    "WARM SYNTH-BRASS 2": "synth_brass",
    "ANALOG SYNTH-BRASS": "synth_brass",
    "80'S SYNTH-BRASS": "synth_brass",
    "TRANCE BRASS": "edm",
    "SOLO TENOR SAX 1": "sax",
    "SOLO TENOR SAX 2": "sax",
    "SOLO ALTO SAX": "sax",
    "VELO.ALTO SAX": "sax",
    "BREATHY ALTO SAX": "sax",
    "SOLO SOPRANO SAX 1": "sax",
    "SOLO SOPRANO SAX 2": "sax",
    "VELO.SOPRANO SAX": "sax",
    "BREATHY S.SAX": "sax",
    "ALTO SAX GROWL": "sax",
    "ALTO SAX 1": "sax",
    "ALTO SAX 2": "sax",
    "TENOR SAX": "sax",
    "BREATHY TENOR SAX": "sax",
    "SOPRANO SAX 1": "sax",
    "SOPRANO SAX 2": "sax",
    "BARITONE SAX": "sax",
    "AMBIENT SAX 1": "sax",
    "AMBIENT SAX 2": "sax",
    "HARD ALTO SAX": "sax",
    "TENOR SAXYS": "sax",
    "SAX SECTION 1": "sax",
    "SAX SECTION 2": "sax",
    "SOLO OBOE": "reed",
    "SOLO BASSOON": "reed",
    "CLARINET": "reed",
    "VELO.CLARINET": "reed",
    "OBOE": "reed",
    "ENGLISH HORN": "reed",
    "BASSOON": "reed",
    "SOLO FLUTE 1": "flute",
    "SOLO FLUTE 2": "flute",
    "FLUTE 1": "flute",
    "FLUTE 2": "flute",
    "JAZZ FLUTE 1": "flute",
    "JAZZ FLUTE 2": "flute",
    "PICCOLO": "flute",
    "RECORDER": "flute",
    "PAN FLUTE 1": "flute",
    "PAN FLUTE 2": "flute",
    "BOTTLE BLOW": "flute",
    "WHISTLE": "flute",
    "OCARINA": "flute",
    "SHAKUHACHI": "flute",
    "PIPE SECTION": "flute",
    "FLUTE & OBOE": "reed",
    "TAPE FLUTE 1": "flute",
    "TAPE FLUTE 2": "flute",
    "SAW LEAD 1": "synth_lead",
    "AMP SAW LEAD": "synth_lead",
    "DRIVE SAW LEAD": "synth_lead",
    "SUPER SAW LEAD 1": "synth_lead",
    "SUPER SAW LEAD 2": "synth_lead",
    "TRANCE POLY LEAD": "edm",
    "TRANCE PLUCK": "pluck",
    "PROGRESSIVE PLUCK": "pluck",
    "SAW PLUCK": "pluck",
    "DIRTY PLUCK": "pluck",
    "POP LEAD": "synth_lead",
    "HOUSE CHORD SYNTH": "synth_lead",
    "POPULAR PLUCK 1": "pluck",
    "POPULAR PLUCK 2": "pluck",
    "VOCAL CHOP SYNTH 1": "synth_lead",
    "VOCAL CHOP SYNTH 2": "synth_lead",
    "DSP MODULATED SYNTH 1": "piano_pad",
    "DSP MODULATED SYNTH 2": "piano_pad",
    "DSP MODULATED SYNTH 3": "piano_pad",
    "X SYNTH LEAD 1": "synth_lead",
    "X SYNTH LEAD 2": "synth_lead",
    "X SYNTH LEAD 3": "synth_lead",
    "X SYNTH LEAD 4": "synth_lead",
    "X SYNTH LEAD 5": "synth_lead",
    "X SYNTH LEAD 6": "synth_lead",
    "VA SYNTH 1": "synth_lead",
    "VA SYNTH 2": "synth_lead",
    "VA SYNTH 3": "synth_lead",
    "VA SYNTH SEQ-BASS 1": "seq_bass",
    "VA SYNTH SEQ-BASS 2": "seq_bass",
    "VA SYNTH SEQ-BASS 3": "seq_bass",
    "VA SYNTH SEQUENCE 1": "synth_lead",
    "VA SYNTH SEQUENCE 2": "synth_lead",
    "SAW LEAD 2": "synth_lead",
    "SAW LEAD 3": "synth_lead",
    "SAW LEAD 4": "synth_lead",
    "MELLOW SAW LEAD": "synth_lead",
    "PULSE SAW LEAD": "synth_lead",
    "TRANCE LEAD": "edm",
    "SS LEAD": "synth_lead",
    "SQUARE LEAD 1": "synth_lead",
    "SQUARE LEAD 2": "synth_lead",
    "SLOW SQUARE LEAD": "synth_lead",
    "PHASER SQUARE LEAD": "synth_lead",
    "PULSE LEAD 1": "synth_lead",
    "PULSE LEAD 2": "synth_lead",
    "SQUARE PULSE LEAD": "synth_lead",
    "SINE LEAD": "lead_soft",
    "VELO.SINE LEAD": "lead_soft",
    "SYNTH SEQUENCE": "synth_lead",
    "SEQUENCE SAW": "arp",
    "SEQUENCE SINE": "arp",
    "8BIT ARPEGGIO 1": "arp",
    "8BIT ARPEGGIO 2": "arp",
    "8BIT WAVE": "arp",
    "SAW ARPEGGIO 1": "arp",
    "SAW ARPEGGIO 2": "arp",
    "DSP MODULATED LEAD 1": "piano_pad",
    "DSP MODULATED LEAD 2": "piano_pad",
    "DSP MODULATED LEAD 3": "piano_pad",
    "VENT LEAD": "synth_lead",
    "CHURCH LEAD": "voice",
    "DOUBLE VOICE LEAD": "voice",
    "SYNTH-VOICE LEAD": "voice",
    "FIFTH LEAD": "synth_lead",
    "FIFTH SAW LEAD": "synth_lead",
    "FIFTH SQUARE LEAD": "synth_lead",
    "FOURTH LEAD": "synth_lead",
    "SEVENTH SEQUENCE": "arp",
    "BASS+LEAD": "synth_lead",
    "SYNTH-BASS+LEAD": "synth_lead",
    "REED LEAD": "synth_lead",
    "G FUNK LEAD": "synth_lead",
    "HOP LEAD": "synth_lead",
    "HIP LEAD": "synth_lead",
    "WIRE LEAD": "synth_lead",
    "FIRE WIRE": "synth_lead",
    "SYNTH-STRINGS 1": "pad_strings",
    "SYNTH-STRINGS 2": "pad_strings",
    "SYNTH-STRINGS 3": "pad_strings",
    "PROGRESSIVE VOICE": "voice",
    "SUPER SAW PAD": "pad_saw",
    "OLD TAPE PAD": "synth_pad",
    "SOUND TRACK 1": "synth_pad",
    "FANTASIA": "synth_pad",
    "XENON PAD": "synth_pad",
    "HOUSE CHORD PAD": "synth_pad",
    "MAGNI SYNTH PAD": "synth_pad",
    "ADVANCED PAD 1": "synth_pad",
    "ADVANCED PAD 2": "synth_pad",
    "DSP MODULATED PAD 1": "synth_pad",
    "DSP MODULATED PAD 2": "synth_pad",
    "DSP MODULATED PAD 3": "synth_pad",
    "X SYNTH PAD 1": "synth_pad",
    "X SYNTH PAD 2": "synth_pad",
    "X SYNTH PAD 3": "synth_pad",
    "SYNTH-STRINGS 4": "pad_strings",
    "SYNTH-STRINGS 5": "pad_strings",
    "SYNTH-STRINGS 6": "pad_strings",
    "70'S SYNTH-STR.1": "pad_strings",
    "70'S SYNTH-STR.2": "pad_strings",
    "80'S SYNTH-STR.1": "pad_strings",
    "80'S SYNTH-STR.2": "pad_strings",
    "DIGITAL SYNTH-STR.1": "pad_strings",
    "DIGITAL SYNTH-STR.2": "pad_strings",
    "FAST SYNTH-STRINGS": "pad_strings",
    "SLOW SYNTH-STRINGS": "pad_strings",
    "OCTAVE SYNTH-STRINGS": "pad_strings",
    "FANTASY": "synth_pad",
    "NEW AGE": "synth_pad",
    "WARM PAD": "synth_pad",
    "FAT SAW PAD": "pad_saw",
    "SOFT PAD": "synth_pad",
    "POLYSYNTH PAD": "synth_pad",
    "SYNTH-PAD": "synth_pad",
    "VA SYNTH-PAD": "synth_pad",
    "POLY SAW": "pad_saw",
    "BRIGHT SAW PAD 1": "pad_saw",
    "BRIGHT SAW PAD 2": "pad_saw",
    "GLASS PAD": "synth_pad",
    "BOTTLE PAD": "synth_pad",
    "ETHNIC PAD": "synth_pad",
    "SWEEP PAD": "synth_pad",
    "WOOD PAD": "synth_pad",
    "SOUND TRACK 2": "synth_pad",
    "VIBRAPHONE BELL": "mallet",
    "ATMOSPHERE PAD": "synth_pad",
    "STEEL PAD": "synth_pad",
    "BRIGHTNESS": "synth_pad",
    "BRIGHT BELL PAD": "pad_glass",
    "SPACE PAD": "synth_pad",
    "EDM PAD": "edm",
    "VOCODER": "vocoder",
    "SYNTH CHOIR": "voice",
    "DSP MODULATED VOICE 1": "piano_pad",
    "DSP MODULATED VOICE 2": "piano_pad",
    "DSP MODULATED VOICE 3": "piano_pad",
    "CHOIR AAHS": "voice",
    "STRINGS VOICE": "strings_ens",
    "SLOW CHOIR": "voice",
    "VOICE DOO": "voice",
    "VOICE UUH": "voice",
    "SYNTH-VOICE 1": "voice",
    "SYNTH-VOICE 2": "voice",
    "VOICE ENSEMBLE": "voice",
    "SYNTH-VOICE PAD": "voice",
    "WARM VOX": "voice",
    "SPACE CHOIR": "voice",
    "STAR VOICE": "voice",
    "ECHO VOICE": "voice",
    "EDM KICK & BASS": "edm",
    "EDM LEAD SYNTH": "edm",
    "EDM PER SYNTH": "edm",
    "EDM LAZER 1": "edm",
    "EDM LAZER 2": "edm",
    "EDM THEME SYNTH 1": "edm",
    "EDM THEME SYNTH 2": "edm",
    "EDM THEME HIT": "edm",
    "EDM BRASS HIT": "edm",
    "EDM BASS": "edm",
    "EDM SE BEND": "edm",
    "EDM SE VOX SYNTH": "edm",
    "EDM SE WHITE": "edm",
    "EDM SE": "edm",
    "VL-TONE": "generic",
    "CT E.PIANO": "ep",
    "CT HARP": "harp",
    "CZ BASS": "bass_synth",
    "CZ TRUMPET": "synth_brass",
    "CZ VIOLIN": "synth_strings",
    "CZ PIANO": "ep",
    "CZ GUITAR": "guitar_clean",
    "CZ LEAD 1": "synth_lead",
    "CZ LEAD 2": "synth_lead",
    "VZ SEEGOD": "synth_lead",
    "VZ BRASS": "synth_brass",
    "VZ BASS": "bass_synth",
    "VZ HARP": "synth_strings",
    "VZ LEAD 1": "synth_lead",
    "VZ LEAD 2": "synth_lead",
    "SITAR 1": "ethnic_pluck",
    "SITAR 2": "ethnic_pluck",
    "SITAR 3": "ethnic_pluck",
    "SITAR PAD": "ethnic_pluck",
    "TANPURA 1": "ethnic_pluck",
    "TANPURA 2": "ethnic_pluck",
    "HARMONIUM 1": "harmonium",
    "HARMONIUM 2": "harmonium",
    "SANTUR 1": "dulcimer",
    "SANTUR 2": "dulcimer",
    "SAROD 1": "ethnic_string",
    "SAROD 2": "ethnic_string",
    "SARANGI 1": "ethnic_string",
    "SARANGI 2": "ethnic_string",
    "VEENA 1": "ethnic_string",
    "VEENA 2": "ethnic_string",
    "SHANAI": "ethnic_reed",
    "BANSURI": "ethnic_flute",
    "PUNGI": "ethnic_reed",
    "TABLA": "ethnic_perc",
    "ANGKLUNG TREM.": "ethnic_perc",
    "GENDER": "ethnic_perc",
    "CAK": "ethnic_perc",
    "CUK": "ethnic_perc",
    "CELLO FINGERED": "pizz",
    "SASANDO": "ethnic_perc",
    "SHORT SULING": "ethnic_flute",
    "SULING BAMBOO 1": "ethnic_flute",
    "SALUANG": "ethnic_flute",
    "SULING BAMBOO 2": "ethnic_flute",
    "OUD 1": "ethnic_string",
    "OUD 2": "ethnic_string",
    "SAZ": "ethnic_string",
    "KANUN 1": "ethnic_string",
    "KANUN 2": "ethnic_string",
    "BOUZOUKI": "ethnic_pluck",
    "RABAB": "ethnic_string",
    "KEMENCHE": "ethnic_string",
    "NEY 1": "ethnic_flute",
    "NEY 2": "ethnic_flute",
    "ZURNA": "ethnic_reed",
    "ARABIC ORGAN": "organ",
    "ARABIC STRINGS": "strings_ens",
    "ER HU 1": "ethnic_string",
    "ER HU 2": "ethnic_string",
    "ER HU 3": "ethnic_string",
    "ER HU 4": "ethnic_string",
    "YANG QIN 1": "dulcimer",
    "YANG QIN 2": "dulcimer",
    "YANG QIN 3": "dulcimer",
    "ZHENG 1": "ethnic_pluck",
    "ZHENG 2": "ethnic_pluck",
    "PI PA 1": "ethnic_pluck",
    "PI PA 2": "ethnic_pluck",
    "PI PA 3": "ethnic_pluck",
    "CHINESE HARP": "ethnic_pluck",
    "DI ZI 1": "ethnic_flute",
    "DI ZI 2": "ethnic_flute",
    "XIAO": "ethnic_flute",
    "SHENG 1": "ethnic_reed",
    "SHENG 2": "ethnic_reed",
    "SUO NA 1": "ethnic_reed",
    "SUO NA 2": "ethnic_reed",
    "CAVAQUINHO": "ethnic_pluck",
    "VIOLA CAIPIRA": "ethnic_string",
    "BERIMBAU": "ethnic_perc",
    "PANDEIRO": "ethnic_perc",
    "BANJO": "folk_pluck",
    "MUTE BANJO": "folk_pluck",
    "STEEL DRUMS": "mallet",
    "FIDDLE 1": "strings_solo",
    "SHAMISEN": "folk_pluck",
    "KOTO": "folk_pluck",
    "THUMB PIANO": "mallet",
    "BAGPIPE": "bagpipe",
    "FIDDLE 2": "strings_solo",
    "CAJON": "ethnic_perc",
    "GM PIANO 1": "piano",
    "GM PIANO 2": "piano",
    "GM ELEC.GRAND PIANO": "piano",
    "GM HONKY-TONK": "piano",
    "GM E.PIANO 1": "ep",
    "GM E.PIANO 2": "ep",
    "GM HARPSICHORD": "harpsi",
    "GM CLAVI": "clav",
    "GM CELESTA": "mallet",
    "GM GLOCKENSPIEL": "mallet",
    "GM MUSIC BOX": "mallet",
    "GM VIBRAPHONE": "mallet",
    "GM MARIMBA": "mallet",
    "GM XYLOPHONE": "mallet",
    "GM TUBULAR BELL": "bell",
    "GM DULCIMER": "dulcimer",
    "GM ORGAN 1": "organ",
    "GM ORGAN 2": "organ",
    "GM ORGAN 3": "organ",
    "GM PIPE ORGAN": "organ_pipe",
    "GM REED ORGAN": "harmonium",
    "GM ACCORDION": "accordion",
    "GM HARMONICA": "harmonica",
    "GM BANDONEON": "accordion",
    "GM NYLON STR.GUITAR": "guitar_acoustic",
    "GM STEEL STR.GUITAR": "guitar_acoustic",
    "GM JAZZ GUITAR": "guitar_jazz",
    "GM CLEAN GUITAR": "guitar_clean",
    "GM MUTE GUITAR": "guitar_mute",
    "GM OVERDRIVE GT": "guitar_drive",
    "GM DISTORTION GT": "guitar_dist",
    "GM GT HARMONICS": "guitar_drive",
    "GM ACOUSTIC BASS": "bass",
    "GM FINGERED BASS": "bass",
    "GM PICKED BASS": "bass",
    "GM FRETLESS BASS": "bass",
    "GM SLAP BASS 1": "bass_slap",
    "GM SLAP BASS 2": "bass_slap",
    "GM SYNTH-BASS 1": "bass_synth",
    "GM SYNTH-BASS 2": "bass_synth",
    "GM VIOLIN": "strings_solo",
    "GM VIOLA": "strings_solo",
    "GM CELLO": "strings_solo",
    "GM CONTRABASS": "strings_solo",
    "GM TREMOLO STRINGS": "strings_solo",
    "GM PIZZICATO": "pizz",
    "GM HARP": "harp",
    "GM TIMPANI": "ethnic_perc",
    "GM STRINGS 1": "strings_ens",
    "GM STRINGS 2": "strings_ens",
    "GM SYNTH-STRINGS 1": "synth_strings",
    "GM SYNTH-STRINGS 2": "synth_strings",
    "GM CHOIR AAHS": "voice",
    "GM VOICE DOO": "voice",
    "GM SYNTH-VOICE": "voice",
    "GM ORCHESTRA HIT": "hit",
    "GM TRUMPET": "brass_solo",
    "GM TROMBONE": "brass_solo",
    "GM TUBA": "brass_solo",
    "GM MUTE TRUMPET": "brass_solo",
    "GM FRENCH HORN": "brass_solo",
    "GM BRASS": "brass_ens",
    "GM SYNTH-BRASS 1": "synth_brass",
    "GM SYNTH-BRASS 2": "synth_brass",
    "GM SOPRANO SAX": "sax",
    "GM ALTO SAX": "sax",
    "GM TENOR SAX": "sax",
    "GM BARITONE SAX": "sax",
    "GM OBOE": "reed",
    "GM ENGLISH HORN": "reed",
    "GM BASSOON": "reed",
    "GM CLARINET": "reed",
    "GM PICCOLO": "flute",
    "GM FLUTE": "flute",
    "GM RECORDER": "flute",
    "GM PAN FLUTE": "flute",
    "GM BOTTLE BLOW": "flute",
    "GM SHAKUHACHI": "flute",
    "GM WHISTLE": "flute",
    "GM OCARINA": "flute",
    "GM SQUARE LEAD": "synth_lead",
    "GM SAW LEAD": "synth_lead",
    "GM CALLIOPE": "lead_soft",
    "GM CHIFF LEAD": "lead_soft",
    "GM CHARANG": "synth_lead",
    "GM VOICE LEAD": "synth_lead",
    "GM FIFTH LEAD": "synth_lead",
    "GM BASS+LEAD": "synth_lead",
    "GM FANTASY": "synth_pad",
    "GM WARM PAD": "synth_pad",
    "GM POLYSYNTH": "synth_pad",
    "GM SPACE CHOIR": "voice",
    "GM BOWED GLASS": "pad_glass",
    "GM METAL PAD": "pad_glass",
    "GM HALO PAD": "synth_pad",
    "GM SWEEP PAD": "synth_pad",
    "GM RAIN DROP": "pad_glass",
    "GM SOUND TRACK": "synth_pad",
    "GM CRYSTAL": "pad_glass",
    "GM ATMOSPHERE": "synth_pad",
    "GM BRIGHTNESS": "synth_pad",
    "GM GOBLINS": "synth_pad",
    "GM ECHOES": "synth_pad",
    "GM SF": "sfx",
    "GM SITAR": "folk_pluck",
    "GM BANJO": "folk_pluck",
    "GM SHAMISEN": "folk_pluck",
    "GM KOTO": "folk_pluck",
    "GM THUMB PIANO": "mallet",
    "GM BAGPIPE": "bagpipe",
    "GM FIDDLE": "strings_solo",
    "GM SHANAI": "ethnic_reed",
    "GM TINKLE BELL": "pad_glass",
    "GM AGOGO": "ethnic_perc",
    "GM STEEL DRUMS": "mallet",
    "GM WOOD BLOCK": "ethnic_perc",
    "GM TAIKO": "ethnic_perc",
    "GM MELODIC TOM": "ethnic_perc",
    "GM SYNTH-DRUM": "ethnic_perc",
    "GM REVERSE CYMBAL": "ethnic_perc",
    "GM GT FRET NOISE": "ethnic_perc",
    "GM BREATH NOISE": "ethnic_perc",
    "GM SEASHORE": "sfx",
    "GM BIRD": "sfx",
    "GM TELEPHONE": "sfx",
    "GM HELICOPTER": "sfx",
    "GM APPLAUSE": "sfx",
    "GM GUNSHOT": "sfx",
};

const clampCC = (v, a, b) => Math.max(a, Math.min(b, v));
// Studio = the role base; the other rooms reshape it with fixed rules.
function derive(env, S) {
    if (env === 'Live') return {
        74: clampCC(S[74] + 6, 0, 127), 71: clampCC(S[71] + 1, 0, 127), 73: clampCC(S[73] - 4, 0, 127),
        76: S[76], 77: S[77], 78: S[78],
        91: clampCC(S[91] - 6, 8, 127), 93: clampCC(S[93] + 4, 0, 127), 94: clampCC(S[94] + 3, 0, 127)
    };
    if (env === 'Hall') return {
        74: clampCC(S[74] - 2, 0, 127), 71: S[71], 73: clampCC(S[73] + 3, 0, 127),
        76: S[76], 77: S[77], 78: clampCC(S[78] + 4, 0, 127),
        91: clampCC(S[91] + 30, 30, 90), 93: clampCC(S[93] - 2, 0, 127), 94: clampCC(S[94] + 10, 0, 127)
    };
    if (env === 'Jazz') return {
        74: clampCC(S[74] - 5, 0, 127), 71: clampCC(S[71] + 1, 0, 127), 73: clampCC(S[73] + 2, 0, 127),
        76: S[76], 77: S[77], 78: S[78],
        91: clampCC(S[91] + 6, 14, 58), 93: clampCC(S[93] - 4, 0, 127), 94: clampCC(S[94] - 4, 0, 127)
    };
    return { ...S };
}

// ======================================================================
//  TONE + ENVIRONMENT PRESET RESOLVER
// ======================================================================
function getToneEnvPreset(tone, cat, env) {
    const name = (tone && (tone.name || tone.text) || '').toUpperCase().trim();
    const c = (cat || (tone && tone.category) || 'PIANO').toUpperCase().trim();
    const role = TONE_ROLE[name] || CAT_ROLE[c] || 'generic';
    return derive(env || 'Studio', ROLES[role] || ROLES.generic);
}

function applySmartProfile(part, category) {
    if (category) activeCategories[part] = category;
    const cat = activeCategories[part];

    // 1. Reset tone/env parameters to generic defaults -- skip live performance CCs
    EQ_CONTROLS.forEach(ctrl => {
        if (PERFORMANCE_CCS.has(ctrl.cc)) return;
        eqState[part][ctrl.cc] = ctrl.def;
    });

    // 2. Resolve Tone + Environment Profile
    const tone = currentTone[part];
    const toneId = tone?.id;
    const userOverride = toneId != null && toneEQ[toneId]?.[currentEnv];
    
    // Fallback to rich Tone + Environment Preset Engine
    const profile = userOverride || getToneEnvPreset(tone, cat, currentEnv);

    if (profile) {
        for (const [cc, val] of Object.entries(profile)) {
            if (PERFORMANCE_CCS.has(Number(cc))) continue;
            eqState[part][cc] = val;
        }
    }

    // 3. Part Mix Rules always applied -- CC7 is per-part balance, not per-tone character.
    if (part === 'U1') eqState[part][7] = 100;
    if (part === 'U2') eqState[part][7] = 75;
    if (part === 'L')  eqState[part][7] = 100;

    // CC72 (Release/Sustain) is governed exclusively by the SUSTAIN button -- never an EQ fader
    delete eqState[part][72]; delete eqState[part]['72'];

    // 4. Send to keyboard and update UI -- skip performance CCs
    if (activePart === part) beginEqProgrammatic();
    EQ_CONTROLS.forEach(ctrl => {
        if (PERFORMANCE_CCS.has(ctrl.cc)) return;
        const val = eqState[part][ctrl.cc];
        sendCC(part, ctrl.cc, val);
        if (activePart === part) {
            if (ctrl.type === 'switch') {
                document.querySelectorAll(`.eq-switch[data-cc="${ctrl.cc}"]`).forEach(btn => {
                    btn.innerText = val > 63 ? 'ON' : 'OFF';
                    btn.classList.toggle('sus-on', val > 63);
                });
            } else {
                document.querySelectorAll(`.eq-fader[data-cc="${ctrl.cc}"]`).forEach(f => {
                    f.value = val;
                });
                document.querySelectorAll(`.eq-val-${ctrl.cc}`).forEach(valEl => {
                    valEl.innerText = formatVal(ctrl.label, val);
                });
            }
        }
    });

    // 5. CC72: assert sustain release value or per-category neutral.
    // Casio hardware resets CC72 on Program Change (its own envelope wins), so this only
    // matters for the PC synth — but sending it to both is harmless and keeps them in sync.
    if (tuning[part].sus) {
        sendCC(part, 72, susRelease(part));
    } else {
        const neutral = releaseNeutral(part);
        if (neutral !== RELEASE_NEUTRAL) sendCC(part, 72, neutral);
    }
}

function buildEQ() {
    ['U1','U2','L'].forEach(part => {
        EQ_CONTROLS.forEach(ctrl => { 
            let defVal = ctrl.def;
            if (part === 'U2' && ctrl.cc === 7) defVal = 75;
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
                    if (tuning[activePart].sus) {
                        sendCC(activePart, 72, susRelease(activePart));
                        scheduleSustainResync(activePart, [40, 150]);
                    }
                    saveToneEQForPart(activePart);
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
                valSpan.className = 'fader-value eq-val-' + ctrl.cc;
                valSpan.dataset.cc = ctrl.cc;
                valSpan.innerText = formatVal(ctrl.label, ctrl.def);
    
                const fader = document.createElement('input');
                fader.type = 'range';
                fader.className  = 'eq-fader';
                fader.dataset.cc = ctrl.cc;
                fader.title      = ctrl.tip;
                fader.min = 0; fader.max = 127;
                fader.value = ctrl.def;
    
                // Capture the active part when the drag starts so both 'input' and 'change'
                // use the same part even if the user switches EQ target mid-drag.
                let _faderPart = activePart;
                fader.addEventListener('input', e => {
                    const v = parseInt(e.target.value);
                    _faderPart = activePart; // refresh on every real user move
                    document.querySelectorAll(`.eq-val-${ctrl.cc}`).forEach(sp => {
                        sp.innerText = formatVal(ctrl.label, v);
                    });
                    document.querySelectorAll(`.eq-fader[data-cc="${ctrl.cc}"]`).forEach(other => {
                        if (other !== fader) other.value = v;
                    });
                    // Programmatic writes must not echo back
                    if (isEqProgrammatic()) return;
                    const cur = eqState[_faderPart][ctrl.cc];
                    if ((cur !== undefined ? cur : ctrl.def) === v) return;
                    eqState[_faderPart][ctrl.cc] = v;
                    sendCC(_faderPart, ctrl.cc, v);
                    // Re-assert sustain if active so CT-S500 voice block does not drop release tail (except when dragging RELEASE itself)
                    if (tuning[_faderPart].sus && ctrl.cc !== 72) {
                        sendCC(_faderPart, 72, susRelease(_faderPart));
                    }
                });
                fader.addEventListener('change', () => {
                    const v = parseInt(fader.value);
                    const cur = eqState[_faderPart][ctrl.cc];
                    if ((cur !== undefined ? cur : ctrl.def) !== v) {
                        eqState[_faderPart][ctrl.cc] = v;
                        sendCC(_faderPart, ctrl.cc, v);
                        document.querySelectorAll(`.eq-val-${ctrl.cc}`).forEach(sp => {
                            sp.innerText = formatVal(ctrl.label, v);
                        });
                        document.querySelectorAll(`.eq-fader[data-cc="${ctrl.cc}"]`).forEach(other => {
                            if (other !== fader) other.value = v;
                        });
                    }
                    if (tuning[_faderPart].sus && ctrl.cc !== 72) {
                        sendCC(_faderPart, 72, susRelease(_faderPart));
                        scheduleSustainResync(_faderPart, [30, 120, 300]);
                    }
                    saveToneEQForPart(_faderPart);
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

    beginEqProgrammatic();
    EQ_CONTROLS.forEach(ctrl => {
        const val = eqState[part][ctrl.cc] !== undefined ? eqState[part][ctrl.cc] : ctrl.def;

        if (ctrl.type === 'switch') {
            document.querySelectorAll(`.eq-switch[data-cc="${ctrl.cc}"]`).forEach(btn => {
                btn.innerText = val > 63 ? 'ON' : 'OFF';
                btn.classList.toggle('sus-on', val > 63);
            });
        } else {
            document.querySelectorAll(`.eq-fader[data-cc="${ctrl.cc}"]`).forEach(fader => {
                fader.value = val;
            });
            document.querySelectorAll(`.eq-val-${ctrl.cc}`).forEach(valEl => {
                valEl.innerText = formatVal(ctrl.label, val);
            });
        }
    });
    // Switching EQ view does NOT disrupt sustain or touch CC72!
}

function resetEQ() {
    const part = activePart;
    resetToneEQForPart(part); // Clear user override in localStorage for this tone+env
    applySmartProfile(part);  // Re-apply authentic tone+env preset (does not touch sustain)
}

function formatVal(label, val) {
    if (label === 'PAN') {
        if (val === 64) return 'C';
        return val < 64 ? 'L' + (64 - val) : 'R' + (val - 64);
    }
    if (label === 'DETUNE') {
        if (val === 64) return '0c';
        const cents = Math.round((val - 64) * 50 / (val > 64 ? 63 : 64));
        return (cents > 0 ? '+' : '') + cents + 'c';
    }
    // Switch-style controls (on/off)
    if (['PORTAMENTO','SOSTENUTO','SOFT','MONO'].includes(label)) {
        return val >= 64 ? 'ON' : 'OFF';
    }
    return val;
}

