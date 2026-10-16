// tools/parser-mirror.js — Réplica EXACTA del parser de library.js:parseRawTextToChords (líneas 194-276)
'use strict';

const EN_ROOT = '[CDEFGAB]';
const EN_PAREN = '(?:\\((?:add|maj|aug|\\d+)(?:[/,](?:add|maj|aug|\\d+))*\\))?';
const EN_QUAL  = `(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+(?:\\(aug\\))?|sus[24]?|(?:\\((?:add|aug)\\d*\\))|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?${EN_PAREN}(?:\\/\\d+)?`;
const EN_BASS  = '(?:\\/[CDEFGAB](?:#|b)?(?:[A-G][#b]?)?)?';

const ES_ROOT = '(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)';
const ES_PAREN = '(?:\\((?:add|maj|aug|\\d+)(?:[/,](?:add|maj|aug|\\d+))*\\))?';
const ES_QUAL  = `(?:#|b)?(?:m(?:aj7?)?|M(?:aj7?)?|dim|aug|\\+(?:\\(aug\\))?|sus[24]?|(?:\\((?:add|aug)\\d*\\))|add\\d?|[79]|11|13)?(?:\\d+)?(?:sus[24])?${ES_PAREN}(?:\\/\\d+)?`;
const ES_BASS  = '(?:\\/(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)(?:[#b])?(?:[A-G][#b]?)?)?';

const CHORD_STRIP_RE = new RegExp(`(?:${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS})`, 'g');
const CHORD_FIND_RE  = new RegExp(`${ES_ROOT}${ES_QUAL}${ES_BASS}|${EN_ROOT}${EN_QUAL}${EN_BASS}`, 'g');
const SECTION_LABEL_RE = /^[<>[(\-=*~./+#:\s]*((?:\d+[º°]?[\s.:\-#]*)?(?:Coro|Estrofa|Verso|Puente|Intro|Outro|Bridge|Chorus|Verse|Pre\s?-?(?:[Cc]oro|[Cc]horus|Estribillo)|Vamp|Tag|Interludio|Instrumental|Solo|Final|Llave|Estribillo|Intermedio|Coda|Bajada|Refr[aá]n|Refrain)(?:[\s:.#\-–]*(?:\d+|I{1,3}|IV|V|VI{0,3}|IX|XI{0,3}))?)\s*(?:x\s*\d+|\(\s*x\s*\d+\s*\)|veces)?\s*(?:\([^)]*\))?[<\])>\-=*~./+#:\s]*$/i;

const isChordLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//')) return false;
  if (SECTION_LABEL_RE.test(trimmed)) return false;
  const noLabel = trimmed
    .replace(/^[A-Za-záéíóúüñÁÉÍÓÚÜÑ\s\d().]+:\s*/, '')
    .replace(/\(x\s*\d+\)/gi, '')
    .trim();
  if (!noLabel) return false;
  const leftover = noLabel.replace(CHORD_STRIP_RE, '').replace(/[\s\-|./\\()\[\]]+/gi, '').replace(/\d+/g, '').trim();
  return leftover.length === 0;
};

module.exports = { isChordLine, SECTION_LABEL_RE, CHORD_STRIP_RE, CHORD_FIND_RE, ES_ROOT, EN_ROOT };
