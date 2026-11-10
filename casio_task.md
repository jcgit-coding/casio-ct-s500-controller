# Tareas pendientes — CasioController / CT-S500

## Verificación en hardware

### [ ] CC77 (Vibrato Depth): verificar neutral en CT-S500
En `eq.js`, todos los ROLES usan `77: 64` para instrumentos sin vibrato (piano, bass, etc.),
pero el `def` en `EQ_CONTROLS` es `0`.
- Si **CC77=64** es el neutro real del CT-S500 (sin vibrato) → cambiar `def: 0 → def: 64` en EQ_CONTROLS.
- Si **CC77=0** es el neutro real (GM estándar) → revisar todos los ROLES que ponen 64 y verificar si están añadiendo vibrato indeseado.

**Cómo probarlo:** conectar el Casio, seleccionar un piano, enviar CC77=0 y CC77=64 por separado y escuchar si hay diferencia.

---

## Recalibración de ROLES tras cambio globalOctave −1 → 0

### [ ] Revisar CC values en ROLES considerando el nuevo registro
Con `globalOctave = 0` (antes era −1), todos los instrumentos suenan 1 octava **más arriba**.
Los ROLES actuales fueron calibrados oyendo el instrumento en un registro más grave.
Puede que algunos valores (cutoff, reverb, attack) necesiten ajuste para el nuevo registro.

**Prompt para recalibrar ROLES** (usar con IA + hardware):

```
Contexto: app web para controlar Casio CT-S500 vía Web MIDI API.
Acabo de cambiar globalOctave de -1 a 0. Antes todos los instrumentos sonaban
1 octava más baja (RPN Coarse Tuning = 64 + 0*12 = 64 era el nuevo centro, pero
globalOctave=-1 lo forzaba a 52, es decir -12 semitonos). Ahora envío 64 (centro
real), así el instrumento suena en su registro MIDI estándar.

Los ROLES en eq.js fueron calibrados oyendo el instrumento en ese registro más grave.
Ahora que suena 1 octava arriba pueden necesitar ajuste:
- Cutoff (CC74): a registro más alto, puede sonar más brillante → tal vez bajar 2-4 puntos
- Attack (CC73): a registro más alto, el ataque se percibe más rápido → tal vez subir 2-3 puntos
- Reverb (CC91): a registro más alto el reverb "mancha" menos → tal vez subir levemente
- Vibrato depth (CC77): verificar primero si CT-S500 CC77=64 es neutro o hay vibrato real

ROLES actuales (Studio = base, sin derive):
piano:       { 74:72, 71:64, 73:58, 77:64, 91:22, 93:0,  94:0  }
ep:          { 74:70, 71:64, 73:60, 77:64, 91:22, 93:20, 94:0  }
clav:        { 74:82, 71:76, 73:52, 77:64, 91:14, 93:22, 94:0  }
mallet:      { 74:80, 71:66, 73:58, 77:64, 91:26, 93:8,  94:0  }
organ:       { 74:74, 71:64, 73:58, 77:74, 91:24, 93:26, 94:0  }
organ_pipe:  { 74:72, 71:64, 73:62, 77:64, 91:50, 93:0,  94:18 }
bass:        { 74:68, 71:64, 73:58, 77:64, 91:10, 93:0,  94:0  }
synth_pad:   { 74:72, 71:66, 73:78, 77:64, 91:48, 93:30, 94:20 }
sax:         { 74:76, 71:66, 73:60, 77:72, 91:26, 93:6,  94:0  }
reed:        { 74:78, 71:70, 73:62, 77:68, 91:26, 93:0,  94:0  }

(CC71=Resonance, CC73=Attack, CC74=Cutoff, CC76=VibRate, CC77=VibDepth,
 CC78=VibDelay, CC91=Reverb, CC93=Chorus, CC94=Echo)
Neutral del CT-S500 = 64 en todos los CCs bipolares excepto CC91/93/94 (0=seco).

Por favor, para cada rol: escucha en el CT-S500 (con globalOctave=0) y propón
ajustes específicos si el timbre o el espacio suenan mal en comparación con
el calibrado anterior. Documenta el delta (ej: piano CC74: 72→70).
```

---

## Hecho

- [x] v290: `changeTone` re-envía Coarse Tuning tras PC (desfase entre partes)
- [x] v291: `_shiftTranspose` clamp −12..+12 (antes envolvía 0-11)
- [x] v291: `tuning.oct * 12` en sendCoarseTuning
- [x] v292: `globalOctave` default y reset → 0
