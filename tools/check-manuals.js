// node tools/check-manuals.js — TAREA 1J: integridad de las 9 canciones manuales
const fs = require('fs');
const manuals = ['kabed_inundanos','artag_hay_libertad','misioneros_remolineando','coritos_asi_se_alaba_a_dios','coritos_vamos_alabar_jehova','coritos_el_maestro_de_galilea','coritos_ya_llego_el_espiritu_santo','coritos_paseate_nazareno','psalm126_cuando_senor'];
for (const d of manuals) {
  const dir = 'library/' + d;
  if (!fs.existsSync(dir)) { console.log('FALTA CARPETA: ' + d); continue; }
  const files = fs.readdirSync(dir);
  const txt = files.find(f => f.endsWith('.txt'));
  const len = txt ? fs.readFileSync(dir + '/' + txt, 'utf8').trim().length : 0;
  const m = JSON.parse(fs.readFileSync(dir + '/meta.json', 'utf8'));
  const hasVersions = !!(m.versions && m.versions.length);
  const hasSource = hasVersions && !!(m.versions[0].source);
  console.log(`${d}: ${txt} (${len} chars) | "${m.title}" — ${m.artist} | key=${m.original_key} | versions=${hasVersions} source=${hasSource}`);
}
