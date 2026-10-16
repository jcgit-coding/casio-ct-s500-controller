// tools/test-section-labels.js — test del SECTION_LABEL_RE ampliado
'use strict';
const { SECTION_LABEL_RE } = require('./parser-mirror');

const positives = [
  // Forma actual (no debe romper)
  ['Coro', 'Coro'], ['Coro:', 'Coro'], ['Verso 1', 'Verso 1'], ['Pre-Coro', 'Pre-Coro'],
  ['Intro', 'Intro'], ['Estrofa 2', 'Estrofa 2'], ['Bridge', 'Bridge'], ['Chorus', 'Chorus'],
  ['Prechorus', 'Prechorus'], ['Vamp', 'Vamp'], ['Tag', 'Tag'], ['Interludio', 'Interludio'],
  ['Instrumental', 'Instrumental'], ['Solo', 'Solo'], ['Final', 'Final'], ['Llave', 'Llave'],
  ['Coro (x3)', 'Coro'], ['Verso 2 (Acústico)', 'Verso 2'],
  // Variantes de datos
  ['[Coro]', 'Coro'], ['(CORO)', 'CORO'], ['[Puente]', 'Puente'], ['[Intro]', 'Intro'],
  ['ESTRIBILLO:', 'ESTRIBILLO'], ['[Verso 1]', 'Verso 1'], ['-CORO-', 'CORO'],
  ['=Coro=', 'Coro'], ['Coro.', 'Coro'], ['::CORO::', 'CORO'], ['Verso1:', 'Verso1'],
  ['Estrofa I:', 'Estrofa I'], ['Coro x2', 'Coro'], ['CORO-1:', 'CORO-1'],
  ['2.Pre-Coro:', '2.Pre-Coro'], ['1ºVerso:', '1ºVerso'],
  // Extras aprobados
  ['Coro 3 veces', 'Coro 3'], ['Pre Coro', 'Pre Coro'], ['PRECORO', 'PRECORO'],
  ['REFRÁN', 'REFRÁN'], ['Refrain', 'Refrain'], ['Coda', 'Coda'], ['Bajada', 'Bajada'],
  ['Intermedio', 'Intermedio'], ['[Estrofa II]', 'Estrofa II'], ['(Puente)', 'Puente'],
  ['>>CORO<<', 'CORO'], ['Intro.', 'Intro'], ['CORO (x2)', 'CORO'],
  ['Verso III', 'Verso III'], ['2. Verso', '2. Verso'],
  // Variantes reales de la biblioteca (tools/section-variants.json)
  ['-- CORO --', 'CORO'], ['/CORO/', 'CORO'], ['--- Coro ---', 'Coro'],
  ['(// Coro //)', 'Coro'], ['+ CORO 1', 'CORO 1'], ['+ VERSO 2', 'VERSO 2'],
  ['Coro: -', 'Coro'], ['/Coro/', 'Coro'], ['intro: //', 'intro'],
  ['INTRO:////', 'INTRO'], ['-/VERSO 2//', 'VERSO 2'], ['VERSO #1:', 'VERSO #1'],
  ['VERSO#2:', 'VERSO#2'], ['-///VERSO 2///', 'VERSO 2'], ['verso: 1:', 'verso: 1'],
  ['= INTRO =', 'INTRO'], ['ESTROFA /', 'ESTROFA'], ['* PRECORO *', 'PRECORO'],
  ['* CORO *', 'CORO'], ['/Estrofa I/', 'Estrofa I'], ['/Pre-coro/', 'Pre-coro'],
  ['+ INTRO', 'INTRO'], ['CORO //', 'CORO'], ['-----Coro -- ---', 'Coro'],
  ['CORO://', 'CORO'], ['[ Coro ]', 'Coro'], ['Coro: ..', 'Coro'],
  ['Coro: --------------', 'Coro'], ['PRE-CORO //', 'PRE-CORO'], ['coro: ...', 'coro'],
  ['-- intermedio --', 'intermedio'], ['CORO2 //', 'CORO2'],
  ['************** Coro 1 **************************', 'Coro 1'],
  ['+++CORO+++', 'CORO'], ['+++VERSO II+++', 'VERSO II'], ['= CORO =', 'CORO'],
  ['- Intro -', 'Intro'], ['- Coro -', 'Coro'], ['- Interludio 1 -', 'Interludio 1'],
  ['[Pre-Estribillo]', 'Pre-Estribillo'], ['( 1 final )', '1 final'],
  ['/ Coro /', 'Coro'], ['+ BAJADA', 'BAJADA'], ['- PRECORO -', 'PRECORO'],
  ['+Coro 1', 'Coro 1'], ['Verso #1:', 'Verso #1'], ['Estrofa: =', 'Estrofa'],
  ['-- Verso 1 --', 'Verso 1'], ['-- Coro x2 --', 'Coro'], ['-- Puente x2 --', 'Puente'],
  ['PRE-ESTRIBILLO:', 'PRE-ESTRIBILLO'], ['- CORO:', 'CORO'], ['- Coro 3 veces.', 'Coro 3'],
  ['INTRO ////////', 'INTRO'], ['(1 final)', '1 final'],
];

const negatives = [
  'G C D', 'Am Em F', 'Yo te alabo Señor', 'Intro: G C D', 'Coro y amen',
  'Solo un día', 'Final de todo', 'Tag me', 'Do Re Mi', 'La', 'y', '',
  'C G Am F', '(C G Am F)', 'Bm7 F#m7 E', 'SOL DO FA', '1. G C D',
  'Intro. G C D', 'Corito de la iglesia', 'Verse of the day', 'Finalizado',
  'Verso libre', 'Solo una vez', 'Final feliz', 'Coro de niños', 'Intro de la mañana',
  'Tag me', 'y el coro llegó',
];

let fail = 0;
for (const [line, expected] of positives) {
  const m = SECTION_LABEL_RE.exec(line);
  if (!m) { console.log(`FAIL (no match): ${JSON.stringify(line)}`); fail++; continue; }
  if (m[1] !== expected) { console.log(`FAIL badge: ${JSON.stringify(line)} → ${JSON.stringify(m[1])} (esperado ${JSON.stringify(expected)})`); fail++; }
}
for (const line of negatives) {
  if (SECTION_LABEL_RE.test(line)) { console.log(`FALSE POSITIVE: ${JSON.stringify(line)}`); fail++; }
}
console.log(fail === 0 ? `OK: ${positives.length} positivos + ${negatives.length} negativos` : `${fail} fallos`);
process.exit(fail ? 1 : 0);
