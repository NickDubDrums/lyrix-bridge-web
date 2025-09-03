// midi.js
const MIDI_CFG = {
  // Note mapping per salto/segnali brano (octave -2 = 0 nel tuo schema)
  notes: {
    // Esempio: C-2 start song1, C#-2 end song1, D-2 start song2, D#-2 end song2...
    // Usa numeri MIDI (C-1=12 in standard, ma molte app chiamano "C-2" il 0).
    // Qui assumiamo numerazione "C-2 = 0". Adatta se la tua DAW usa altro offset!
    0:  { action: { type: 'song', op: 'start', index: 1 } },   // C-2
    1:  { action: { type: 'song', op: 'end',   index: 1 } },   // C#-2
    2:  { action: { type: 'song', op: 'start', index: 2 } },   // D-2
    3:  { action: { type: 'song', op: 'end',   index: 2 } },   // D#-2
    // ...prosegui come vuoi
  },

  // CC mapping per Lyrics/Chords (range 1..256)
  lyrics: { ccA: 20, ccB: 21 },   // ccA → 1..128 (value 0..127), ccB → 129..256
  chords: { ccA: 22, ccB: 23 }    // idem per chords
};

// Helpers per WebSocket bridge (se vuoi inviare/ric. eventi tra client)
let ws;
export function connectWS(url) {
  ws = new WebSocket(url);
  ws.onopen = () => console.log('[WS] connected');
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'osc') {
        // ricevi /lyrics/line etc. dal plugin → applica alla UI
        routeIncomingOSC(data.msg);
      }
    } catch(e){}
  };
}

// UI hooks (integra con il tuo stato/renderer)
function goToSongStart(idx){ console.log('[LYRIX] Song start', idx); /* ... */ }
function goToSongEnd(idx){   console.log('[LYRIX] Song end',   idx); /* ... */ }
function setLyricsLine(n){   console.log('[LYRIX] Lyrics line', n);  /* update focus */ }
function setChordsLine(n){   console.log('[LYRIX] Chords line', n);  /* update focus */ }

function routeIncomingOSC(msg) {
  // esempio: /lyrics/line, arg int
  if (msg.address === '/lyrics/line') setLyricsLine(msg.args?.[0]?.value|0);
  if (msg.address === '/chords/line') setChordsLine(msg.args?.[0]?.value|0);
}

// ── MIDI
export async function initMIDI() {
  if (!navigator.requestMIDIAccess) {
    console.warn('Web MIDI non supportato da questo browser.');
    return;
  }
  const access = await navigator.requestMIDIAccess({ sysex: false });
  access.inputs.forEach(input => {
    input.onmidimessage = onMIDIMessage;
  });
  access.onstatechange = () => {
    // ricollega su hotplug
    access.inputs.forEach(input => {
      input.onmidimessage = onMIDIMessage;
    });
  };
  console.log('[MIDI] pronto');
}

function onMIDIMessage(e) {
  const [status, data1, data2] = e.data;
  const cmd = status & 0xF0; // 0x90 note on, 0x80 note off, 0xB0 CC
  // NOTE ON (velocity > 0)
  if (cmd === 0x90 && data2 > 0) {
    const note = data1;
    const map = MIDI_CFG.notes[note];
    if (map?.action?.type === 'song') {
      if (map.action.op === 'start') goToSongStart(map.action.index);
      else if (map.action.op === 'end') goToSongEnd(map.action.index);
    }
    return;
  }
  // CC
  if (cmd === 0xB0) {
    const cc = data1;
    const val = data2; // 0..127

    // Lyrics
    if (cc === MIDI_CFG.lyrics.ccA) setLyricsLine(val + 1);         // 1..128
    if (cc === MIDI_CFG.lyrics.ccB) setLyricsLine(val + 129);       // 129..256

    // Chords
    if (cc === MIDI_CFG.chords.ccA) setChordsLine(val + 1);         // 1..128
    if (cc === MIDI_CFG.chords.ccB) setChordsLine(val + 129);       // 129..256
  }
}


export function renderMIDI(){
  const el = document.createElement('section');
  el.className = 'view view-midi';
  el.innerHTML = `<header class="page-header"><h2>MIDI</h2></header>
  <p>Legenda comandi MIDI/OSC (to-do): questa pagina mostrerà i mapping e un tester live.</p>`;
  return el;
}
