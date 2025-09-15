// server.js – Lyrix Bridge (HTTP + WebSocket)
// Avvio minimale: npm i express ws && node server.js
// MIDI e OSC sono opzionali e NON necessari per avviare (sono “try/catch” e ignorati se mancanti).

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

// =======================
// Config
// =======================
const HTTP_PORT = Number(process.env.HTTP_PORT || 5173);
const STATIC_DIR = process.env.STATIC_DIR || 'web';
const MIDI_OUT_NAME = String(process.env.MIDI_OUT || 'Lyrix Control');
const MIDI_IN_NAME  = String(process.env.MIDI_IN  || 'Lyrix Learn'); // senza "s", combacia con loopMIDI
const MIDI_CH       = Number(process.env.MIDI_CH  || 0);



const USE_MMC = process.env.USE_MMC === '1';
// poi chiama mmcPlay/mmcStop solo se (USE_MMC && midiOut)

// Mappa auto-learn: program (0..127) -> { bars, num, den }
const pcMap = {};  // es: { 0: { bars:0, num:4, den:4 }, 1:{ bars:64, num:4, den:4 } }

const PLUGIN_LISTEN_PORT = 9001;        // porta su cui il plugin riceve /reqpos
let lastPC = { program: null, ts: 0 };   // per accoppiare PC → /pos


function sppFromBars(bars, num, den) {
  // SPP è in sedicesimi: 16th-per-bar = num * (16/den)
  const sixteenthsPerBar = num * (16 / den);
  return Math.max(0, Math.floor(bars * sixteenthsPerBar));
}



console.log('[MIDI] Config names OUT:', MIDI_OUT_NAME, '| IN:', MIDI_IN_NAME, '| CH:', MIDI_CH);

// subito dopo i config logs nel server.js
try {
  const easymidi = require('easymidi');
  console.log('[MIDI] Available OUT ports:', easymidi.getOutputs());
  console.log('[MIDI] Available IN  ports:', easymidi.getInputs());
} catch {}


// DAW Cues (note-on su Lyrix Learn)
const CUE = {
  START: 97, // C#7 (opzionale)
  END:   96  // C7    (obbligatorio)
};



// CC (per quando abiliteremo il MIDI/OSC reale)
const CC_PLAY = Number(process.env.CC_PLAY || 20);
const CC_STOP = Number(process.env.CC_STOP || 21);

// =======================
// HTTP static
// =======================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, STATIC_DIR)));
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, STATIC_DIR, 'index.html'));
});
const server = http.createServer(app);

// =======================
// Stato condiviso
// =======================
/**
 * session.songs[*] shape:
 * { id, title, programChange?, lyrics:[{text,time?}], chords:[{chord,time?}] }
 */
const state = {
  session: null,
  setlist: [],
  currentSongId: null,
  currentSong: null,
  currentLyricIndex: 0,
  currentChordIndex: 0,
  transport: { 
    playing: false, 
    playingSongId: null, 
    startedAt: 0, 
    pausedSongId: null, 
    pausedElapsedMs: 0,
    pendingNextAfterLoop: false,
    queuedSongId: null,
    loopExitMode: null, // 'finish' | 'bar' | 'instant'
   },
  settings: {
    detectChordsLive: false,
    activeLane: 'lyrics',
  },
  lastEvent: '',
};

// WebSocket server (lo dichiariamo qui per usarlo nei helper “safe”)
let wss = null;


// =======================
// (OPZIONALE) MIDI & OSC – disattivati se i pacchetti non ci sono
// =======================

let midiOut = null;
try {
  const easymidi = require('easymidi');
  const outs = easymidi.getOutputs();
  const isWindows = process.platform === 'win32';
  const wanted = MIDI_OUT_NAME.toLowerCase();

  const match = outs.find(n => n.toLowerCase() === wanted)
             ||   outs.find(n => n.toLowerCase().includes(wanted));

  if (match) {
    midiOut = new easymidi.Output(match);
    console.log('[MIDI] Output:', match);
  } else {
    if (isWindows) {
      console.warn('[MIDI] Output NOT found:', MIDI_OUT_NAME, '— su Windows non posso creare porte virtuali. Crea la porta con loopMIDI.');
    } else {
      midiOut = new easymidi.Output(MIDI_OUT_NAME, true);
      console.log('[MIDI] Output (virtual):', MIDI_OUT_NAME);
    }
  }
} catch (e) {
  console.warn('[MIDI] disabled (OUT):', e.message);
}

// ===== MIDI IN =====
let midiIn = null;
try {
  const easymidi = require('easymidi');
  const ins = easymidi.getInputs();
  const isWindows = process.platform === 'win32';
  const wantedIn = MIDI_IN_NAME.toLowerCase();

  const matchIn = ins.find(n => n.toLowerCase() === wantedIn)
               ||   ins.find(n => n.toLowerCase().includes(wantedIn));

  if (matchIn) {
    midiIn = new easymidi.Input(matchIn);
    console.log('[MIDI] Input:', matchIn);
  } else {
    if (isWindows) {
      console.warn('[MIDI] Input NOT found:', MIDI_IN_NAME, '— su Windows non posso creare porte virtuali. Crea la porta con loopMIDI.');
    } else {
      midiIn = new easymidi.Input(MIDI_IN_NAME, true);
      console.log('[MIDI] Input (virtual):', MIDI_IN_NAME);
    }
  }
} catch (e) {
  console.warn('[MIDI] disabled (IN):', e.message);
}

if (midiIn) {
  midiIn.on('noteon', (msg) => {
    // START (opzionale)
    if (msg.note === CUE.START) {
      const songId = getCurrentSongId();
      resetLoopCount(songId);
      broadcastCue('start', { songId });
      return;
    }
    // END (obbligatorio)
    if (msg.note === CUE.END) {
      const songId = getCurrentSongId();
      const loops = incLoopCount(songId);
      broadcastCue('end', { songId, loopCount: loops });
      return;
    }
    // ...altri comandi note del tuo pedale se vuoi...
  });
}
if (midiIn) {
  midiIn.on('program', (msg) => {
    const prog = Number(msg.number ?? -1);
    console.log('[MIDI-IN] PC <-', prog, 'ch', msg.channel);
    lastPC = { program: prog, ts: Date.now() };
    try {
      oscUDP && oscUDP.send({ address: "/reqpos" }, "127.0.0.1", PLUGIN_LISTEN_PORT);
      console.log('[OSC] /reqpos -> 127.0.0.1:' + PLUGIN_LISTEN_PORT);
    } catch (e) {
      console.warn('[OSC] /reqpos send error:', e.message);
    }
  });
}

if (midiIn) {
  const DBG_EVT = [
    'program','noteon','noteoff','cc','pitch','channel aftertouch','poly aftertouch',
    'position','select','start','continue','stop','sysex'
  ];
  DBG_EVT.forEach(ev => {
    try {
      midiIn.on(ev, (msg) => console.log('[MIDI-IN DBG]', ev, msg));
    } catch { /* ignora eventi non supportati su alcune versioni */ }
  });
}


function sendPC(number, channel = 0) {
  if (!midiOut) return;
  const pc = Math.max(0, Math.min(127, Number(number || 0)));
  midiOut.send('program', { number: pc, channel });
  console.log('[MIDI] PC ->', pc, 'ch', channel);
}
function sendCC(controller, value = 127, channel = 0) {
  if (!midiOut) return;
  midiOut.send('cc', { controller: Number(controller), value: Number(value), channel });
  console.log('[MIDI] CC ->', controller, value, 'ch', channel);
}

function sendSysex(bytes) {
  if (!midiOut) return;
  try { midiOut.send('sysex', bytes); }
  catch (e) { console.warn('[MIDI] sysex err:', e.message); }
}

// MMC (Universal Real-Time SysEx): F0 7F 7F 06 <cmd> F7
function mmcPlay()  { sendSysex([0xF0,0x7F,0x7F,0x06,0x02,0xF7]); console.log('[MMC] Play'); }
function mmcStop()  { sendSysex([0xF0,0x7F,0x7F,0x06,0x01,0xF7]); console.log('[MMC] Stop'); }
function mmcPause() { sendSysex([0xF0,0x7F,0x7F,0x06,0x09,0xF7]); console.log('[MMC] Pause'); }

// ---------- SPP + LOCATE ----------
function sendSPP(spp) {
  if (!midiOut) return;
  try { midiOut.send('position', { value: spp }); }
  catch (e1) {
    try { midiOut.send('songPosition', { value: spp }); }
    catch (e2) { console.warn('[MIDI] SPP failed:', e1.message, '|', e2.message); }
  }
  console.log('[MIDI] SPP ->', spp);
}

// Se autoplay=true: Stop -> SPP -> Play
function locateToProgram(program, { autoplay = false } = {}) {
  const m = pcMap[Number(program)];
  if (!m) { console.warn('[LOCATE] no mapping for program', program); return; }
  const spp = sppFromBars(m.bars, m.num, m.den);

  // Stop sempre prima di un locate
  mmcStop();

  // Piccoli delay per sicurezza
  setTimeout(() => sendSPP(spp), 80);
  if (autoplay) setTimeout(() => mmcPlay(), 160);

  console.log(`[LOCATE] program=${program} bars=${m.bars} ${m.num}/${m.den} -> spp=${spp} autoplay=${autoplay}`);
}



const NOTE_BASE = 24; // C1
function sendSongJump(index, channel = MIDI_CH) {
  if (!midiOut) return;
  const note = NOTE_BASE + (Number(index) || 0);
  const velocity = 100;
  midiOut.send('noteon',  { note, velocity, channel });
  midiOut.send('noteoff', { note, velocity: 0, channel, time: 10 });
  console.log('[MIDI] SongJump note', note, '(index', index, ') ch', channel);
}




// (OPZIONALE) OSC IN — riceve messaggi dal plugin JUCE
let oscUDP = null;
try {
  const osc = require('osc');
  const OSC_PORT = Number(process.env.OSC_PORT || 9000);
  oscUDP = new osc.UDPPort({ localAddress: "127.0.0.1", localPort: OSC_PORT });
  oscUDP.on("ready", () => console.log(`[OSC] listening on udp://127.0.0.1:${OSC_PORT}`));
  oscUDP.on("message", (m) => {

    // /ping <replyPort:int>  -> rispondiamo con /pong (timestamp)
    if (m.address === "/ping") {
      const replyPort = Number(m.args?.[0] ?? 9001);
      try {
        oscUDP.send(
          { address: "/pong", args: [Date.now()] },
          "127.0.0.1",
          replyPort
        );
        // console.log(`[OSC] pong -> 127.0.0.1:${replyPort}`);
      } catch (e) {
        console.warn("[OSC] pong error:", e.message);
      }
      return;
    }

          // /pc <program:int> <bars:float> <ppq:float> <bpm:float> <num:int> <den:int>
      if (m.address === "/pc") {
        const program = Number(m.args?.[0] ?? -1);
        const bars    = Math.floor(Number(m.args?.[1] ?? -1));
        const num     = Number(m.args?.[4] ?? 4);
        const den     = Number(m.args?.[5] ?? 4);

        if (program >= 0 && bars >= 0) {
          pcMap[program] = { bars, num, den };
          console.log(`[PC-MAP] prog=${program} -> bars=${bars}  ${num}/${den}`);
        }
        return;
      }

        // /pos <bars:float> <ppq:float> <bpm:float> <num:int> <den:int>
        if (m.address === "/pos") {
          const bars = Math.floor(Number(m.args?.[0] ?? -1));
          const num  = Number(m.args?.[3] ?? 4);
          const den  = Number(m.args?.[4] ?? 4);
          const age  = Date.now() - (lastPC.ts || 0);

          console.log('[OSC] /pos bars=', bars, 'num/den=', num, '/', den, '(age', age, 'ms)');

          if (lastPC.program != null && age < 1500 && bars >= 0) {
            pcMap[lastPC.program] = { bars, num, den };
            console.log(`[PC-MAP] prog=${lastPC.program} -> bars=${bars}  ${num}/${den}`);
          } else {
            console.log('[PC-MAP] ignorato: manca PC recente o bars invalid');
          }
          return;
        }



    // /lyric/next
    if (m.address === "/lyric/next") {
      const songId = getCurrentSongId();
      selectLyricByIndex((state.currentLyricIndex || 0) + 1);
      state.lastEvent = "lyric/next";
      broadcastState();
      return;
    }
    // /chord <symbol:string> <count:int> <pc:int>...
    if (m.address === "/chord") {
      const symbol = String(m.args?.[0] ?? "?");
      // aggiorna “chord current” lato UI
      setChordSymbolLive(symbol);
      state.lastEvent = `chord:${symbol}`;
      broadcastState();
      return;
    }
    // /cue/start  (nuovo)
    if (m.address === "/cue/start") {
      const songId = getCurrentSongId();
      resetLoopCount(songId);
      broadcastCue('start', { songId });
      return;
    }
    // /cue/end    (nuovo)
    if (m.address === "/cue/end") {
      const songId = getCurrentSongId();
      const loops = incLoopCount(songId);
      broadcastCue('end', { songId, loopCount: loops });
      return;
    }
    // /lyrics/pos <0..1>    (nuovo)
    if (m.address === "/lyrics/pos") {
      const pos = Number(m.args?.[0] ?? 0);
      selectLyricByNormalized(pos);
      state.lastEvent = `lyricsPos:${pos.toFixed(3)}`;
      broadcastState();
      return;
    }
    // /chords/pos <0..1>    (nuovo)
    if (m.address === "/chords/pos") {
      const pos = Number(m.args?.[0] ?? 0);
      selectChordByNormalized(pos);
      state.lastEvent = `chordsPos:${pos.toFixed(3)}`;
      broadcastState();
      return;
    }
    // /chords/set <root:int> <quality:int> (nuovo)
    if (m.address === "/chords/set") {
      const root = Number(m.args?.[0] ?? -1);
      const quality = Number(m.args?.[1] ?? -1);
      if (root >= 0 && quality >= 0) {
        setChordRoqLive(root, quality);
        state.lastEvent = `chordRQ:${root},${quality}`;
        broadcastState();
      }
      return;
    }
  });
  oscUDP.on("error", e => console.warn("[OSC] error:", e.message));
  oscUDP.open();
} catch (e) {
  console.warn("[OSC] disabled:", e.message);
}


// =======================
// Helper di stato
// =======================

function selectLyricByNormalized(pos){
  const song = state.currentSong;
  if (!song?.lyrics?.length) return;
  const n = song.lyrics.length;
  const i = Math.max(0, Math.min(n-1, Math.round(pos * (n-1))));
  selectLyricByIndex(i);
}

function selectChordByNormalized(pos){
  const song = state.currentSong;
  if (!song?.chords?.length) return;
  const n = song.chords.length;
  const i = Math.max(0, Math.min(n-1, Math.round(pos * (n-1))));
  selectChordByIndex(i);
}

function setChordSymbolLive(symbol){
  state.settings.detectChordsLive = true;
  state.currentChordSymbol = String(symbol || "?");
}

function setChordRoqLive(root, quality){
  state.settings.detectChordsLive = true;
  state.currentChordRoot = root;
  state.currentChordQuality = quality;
}


function mmcPlay() {
  if (!midiOut) return;
  try {
    // F0 7F 7F 06 02 F7  => MMC PLAY (all devices)
    midiOut.send('sysex', [0xF0, 0x7F, 0x7F, 0x06, 0x02, 0xF7]);
    console.log('[MIDI] MMC PLAY');
  } catch (e) {
    console.warn('[MIDI] MMC PLAY failed:', e.message);
  }
}

function mmcStop() {
  if (!midiOut) return;
  try {
    // F0 7F 7F 06 01 F7  => MMC STOP (all devices)
    midiOut.send('sysex', [0xF0, 0x7F, 0x7F, 0x06, 0x01, 0xF7]);
    console.log('[MIDI] MMC STOP');
  } catch (e) {
    console.warn('[MIDI] MMC STOP failed:', e.message);
  }
}


function makeStateForClients() {
  return {
    setlist: state.setlist || [],
    currentSongId: state.currentSongId || null,
    transport: state.transport || { playing: false },
    settings: state.settings || {},
    lastEvent: state.lastEvent || '',
  };
}
function broadcastState(targetWs = null) {
  if (!wss && !targetWs) return;
  const frame = { type: 'state', serverTime: Date.now(), state: makeStateForClients() };
  const payload = JSON.stringify(frame);
  if (targetWs) {
    if (targetWs.readyState === 1) targetWs.send(payload);
    return;
  }
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

function idxById(id) {
  return Array.isArray(state.setlist) ? state.setlist.findIndex(s => s && s.id === id) : -1;
}
function selectSongByIndex(i) {
  if (!Array.isArray(state.setlist) || state.setlist.length === 0) return;
  const idx = Math.max(0, Math.min(state.setlist.length - 1, i|0));
  const song = state.setlist[idx];
  if (!song) return;

  state.currentSongId = song.id;
  state.currentSong   = song;
  state.currentLyricIndex = 0;
  state.currentChordIndex = 0;

  // Program Change opzionale (se MIDI attivo)
  const pc = Number(song.programChange ?? (idx + 1)) - 1;
  sendPC(pc);

  // >>> aggiungi questo salto:
  sendSongJump(idx, MIDI_CH);

  broadcastState();
}
function selectSongById(id) {
  const i = idxById(id);
  if (i >= 0) selectSongByIndex(i);
}
function selectNext() {
  if (!Array.isArray(state.setlist) || !state.setlist.length) return;
  const ids = state.setlist.map(s => s.id);
  const cur = state.currentSongId ?? ids[0];
  const i   = Math.max(0, ids.indexOf(cur));
  selectSongByIndex(Math.min(ids.length - 1, i + 1));
}
function selectPrev() {
  if (!Array.isArray(state.setlist) || !state.setlist.length) return;
  const ids = state.setlist.map(s => s.id);
  const cur = state.currentSongId ?? ids[0];
  const i   = Math.max(0, ids.indexOf(cur));
  selectSongByIndex(Math.max(0, i - 1));
}



// Lyrics
function selectLyricByIndex(i) {
  const song = state.currentSong;
  if (!song?.lyrics?.length) return;
  state.currentLyricIndex = clamp(i, song.lyrics.length);
  broadcastState();
}
function lyricsPrev() {
  const song = state.currentSong;
  if (!song?.lyrics?.length) return;
  selectLyricByIndex((state.currentLyricIndex ?? 0) - 1);
}
function lyricsNext() {
  const song = state.currentSong;
  if (!song?.lyrics?.length) return;
  selectLyricByIndex((state.currentLyricIndex ?? -1) + 1);
}

// Chords
function selectChordByIndex(i) {
  const song = state.currentSong;
  if (!song?.chords?.length) return;
  state.currentChordIndex = clamp(i, song.chords.length);
  broadcastState();
}
function chordsPrev() {
  const song = state.currentSong;
  if (!song?.chords?.length) return;
  selectChordByIndex((state.currentChordIndex ?? 0) - 1);
}
function chordsNext() {
  const song = state.currentSong;
  if (!song?.chords?.length) return;
  selectChordByIndex((state.currentChordIndex ?? -1) + 1);
}

// Demo se vuoto
function ensureDemoSession() {
  // DEMO DISABILITATA: volontariamente vuota per evitare sovrascritture
  return;
}

// =======================
// WebSocket
// =======================
wss = new WebSocketServer({ server });

// Semina la demo PRIMA di mandare lo stato ai client
ensureDemoSession();

wss.on('connection', (ws) => {
  // Se qualcuno ha svuotato la setlist, ripristina demo
  ensureDemoSession();

  // Invia subito lo stato
  broadcastState(ws);

  ws.on('message', (buf) => {
    let msg = null;
    try { msg = JSON.parse(String(buf)); } catch {}
    if (!msg) return;

    function parseLyricsWithSections(raw) {
  const out = { sections: [], lines: [] };
  if (typeof raw !== 'string') return out;
  raw.split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s) return;
    const m = s.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) out.sections.push({ name: m[1].trim(), startIdx: out.lines.length });
    else out.lines.push({ text: s });
  });
  return out;
}
function parseChordsWithSections(raw) {
  const out = { sections: [], chords: [] };
  if (typeof raw !== 'string') return out;
  raw.split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s) return;
    const m = s.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) out.sections.push({ name: m[1].trim(), startIdx: out.chords.length });
    else s.split(/\s+/).forEach(tok => { if (tok) out.chords.push({ chord: tok }); });
  });
  return out;
}



    const t = msg.type;
    switch (t) {

      // ===== Salvataggio impostazioni editor =====
case 'song/updateSettings': {
  const { id, settings } = msg;
  if (!id || typeof settings !== 'object') break;

  const i = state.setlist.findIndex(s => s && s.id === id);
  if (i < 0) break;

  const allowed = { arranger: {} };

  // arranger.mode: i tuoi valori reali (UI)
  const mode = settings.arranger?.mode;
  if (typeof mode === 'string' && ['JumpToNext','StopAtEnd','LoopSection'].includes(mode)) {
    allowed.arranger.mode = mode;
  }

  // arranger.repeats (>=1)
  const reps = Number(settings.arranger?.repeats);
  if (Number.isFinite(reps) && reps > 0) {
    allowed.arranger.repeats = reps | 0;
  }

  // arranger.loopExit: normalizza in minuscolo
  if (settings.arranger && 'loopExit' in settings.arranger) {
    const le = String(settings.arranger.loopExit || '').toLowerCase();
    if (['finish','bar','instant'].includes(le)) {
      allowed.arranger.loopExit = le;
    }
  }

  const old = state.setlist[i] || {};
  state.setlist[i] = {
    ...old,
    arranger: { ...(old.arranger || {}), ...(allowed.arranger || {}) },
  };

  state.lastEvent = 'Song settings saved';
  broadcastState();
  break;
}

case 'song/updateMeta': {
  const { id, title, artist, bpm, key, duration } = msg;
  const i = state.setlist.findIndex(s => s && s.id === id);
  if (i < 0) break;

  const old = state.setlist[i] || {};
  const next = { ...old };

  if (typeof title === 'string')  next.title  = title.trim();
  if (typeof artist === 'string') next.artist = artist.trim();
  if (typeof key === 'string')    next.key    = key.trim();
  if (Number.isFinite(Number(bpm)))      next.bpm = Number(bpm);
  if (Number.isFinite(Number(duration))) next.duration = Number(duration);

  state.setlist[i] = next;
  state.lastEvent = 'Song meta saved';
  broadcastState();
  break;
}

// Avvia per program (0..127)
case 'play_song': {
  const program = Number(msg.program ?? -1);
  if (program >= 0) locateToProgram(program, { autoplay: true });
  break;
}

// (opzionale) Solo locate, senza play
case 'locate_program': {
  const program = Number(msg.program ?? -1);
  if (program >= 0) locateToProgram(program, { autoplay: false });
  break;
}




      // ===== Blink queued songs =====
      case 'transport/queueNext': {
        const { queuedSongId, mode } = msg; // 'finish' | 'bar' | 'instant'
        state.transport.pendingNextAfterLoop = true;
        state.transport.queuedSongId = queuedSongId || null;
        state.transport.loopExitMode = ['finish','bar','instant'].includes(mode) ? mode : 'finish';
        broadcastState();
        break;
      }


      // ===== Stato / Setlist =====
      case 'state/request':
        ensureDemoSession();
        broadcastState(ws);
        break;

      case 'state/loadSession': {
        const { session } = msg;
        if (!session || !Array.isArray(session.songs)) break;
        state.session = session;
        state.setlist = session.songs;
        selectSongByIndex(0);
        break;
      }
      case 'state/setlist': {
        const { songs } = msg;
        if (!Array.isArray(songs)) break;
      
        const keep = state.currentSongId;
        state.setlist = songs;
      
        // Se la selezione esiste ancora, tienila; altrimenti seleziona la prima
        if (keep && idxById(keep) >= 0) {
          state.currentSongId = keep;
        } else {
          state.currentSongId = (state.setlist[0]?.id) || null;
        }
        broadcastState();
        break;
      }




      case 'ping': {
        // il client manda {type:'ping', t: Date.now()}
        // rispondi con l’eco e il serverTime attuale
        ws.send(JSON.stringify({ type: 'pong', echo: msg.t || 0, serverTime: Date.now() }));
        break;
      }


      // ===== Transport / Song nav =====
      case 'transport/play': {
        if (!state.currentSongId && Array.isArray(state.setlist) && state.setlist.length) {
          selectSongByIndex(0); // seleziona la prima se niente è selezionato
        }
        state.transport.playing = true;
        state.transport.playingSongId = state.currentSongId || null;

        // Se stavamo "queuando" proprio questo brano, azzera la coda
        if (state.transport.queuedSongId === state.currentSongId) {
          state.transport.pendingNextAfterLoop = false;
          state.transport.queuedSongId = null;
          state.transport.loopExitMode = null;
        }

        // resume se la pausa era sulla stessa song
        const resumeMs = (state.transport.pausedSongId === state.transport.playingSongId)
          ? Math.max(0, Number(state.transport.pausedElapsedMs || 0))
          : 0;
        state.transport.startedAt = Date.now() - resumeMs;
        state.transport.pausedSongId = null;
        state.transport.pausedElapsedMs = 0;

        state.lastEvent = 'Play';
        // === MMC play (+ lascio i CC come fallback opzionale) ===
        mmcPlay();
        // sendCC(CC_PLAY, 127); // se vuoi tenerlo come fallback parallelo, lascia questa riga

        broadcastState();
        break;
      }
      case 'transport/pause': {
        const { songId, elapsedMs } = msg;
        state.transport.playing = false;
        state.transport.playingSongId = null;
        state.transport.startedAt = 0;
        state.transport.pausedSongId = songId || state.currentSongId || null;
        state.transport.pausedElapsedMs = Math.max(0, Number(elapsedMs || 0));
        state.lastEvent = 'Pause';

        // === MMC pause (+ eventuale CC fallback) ===
        mmcPause();
        // sendCC(22, 127); // se vuoi un CC fallback dedicato alla pausa

        broadcastState();
        break;
      }

      case 'transport/stop': {
        state.transport.playing = false;
        state.transport.playingSongId = null;
        state.transport.startedAt = 0;

        // pulizia
        state.transport.pausedSongId = null;
        state.transport.pausedElapsedMs = 0;
        state.transport.pendingNextAfterLoop = false;
        state.transport.queuedSongId = null;
        state.transport.loopExitMode = null;

        state.lastEvent = 'Stop';

        // === MMC stop (+ eventuale CC fallback) ===
        mmcStop();
        // sendCC(CC_STOP, 127);

        broadcastState();
        break;
      }

      case 'transport/next': {
        selectNext(); // cambia currentSongId + broadcast
        const i = idxById(state.currentSongId);
        sendSongJump(i, MIDI_CH);

        if (state.transport.playing) {
          state.transport.playingSongId = state.currentSongId;
          state.transport.startedAt = Date.now();
          mmcPlay();
        }

        state.transport.pendingNextAfterLoop = false;
        state.transport.queuedSongId = null;
        state.transport.loopExitMode = null;

        state.lastEvent = 'Next song';
        broadcastState();
        break;
      }

      case 'transport/prev': {
        selectPrev(); // cambia currentSongId + broadcast
        const i = idxById(state.currentSongId);
        sendSongJump(i, MIDI_CH);

        if (state.transport.playing) {
          state.transport.playingSongId = state.currentSongId;
          state.transport.startedAt = Date.now();
          mmcPlay();
        }

        state.lastEvent = 'Prev song';
        state.transport.pendingNextAfterLoop = false;
        state.transport.queuedSongId = null;
        state.transport.loopExitMode = null;

        broadcastState();
        break;
      }


      // ===== Lane attiva =====
      case 'ui/setActiveLane': {
        const { lane } = msg;
        if (lane === 'lyrics' || lane === 'chords') {
          state.settings.activeLane = lane;
          broadcastState();
        }
        break;
      }

      // ===== Lyrics / Chords step =====
      case 'lyrics/prev': lyricsPrev(); state.lastEvent = 'Lyrics prev'; break;
      case 'lyrics/next': lyricsNext(); state.lastEvent = 'Lyrics next'; break;
      case 'chords/prev': chordsPrev(); state.lastEvent = 'Chords prev'; break;
      case 'chords/next': chordsNext(); state.lastEvent = 'Chords next'; break;

      // Unico messaggio con lane + direzione
      case 'content/step': {
        const { lane, dir } = msg;
        if (lane === 'lyrics') (dir < 0 ? lyricsPrev : lyricsNext)();
        if (lane === 'chords') (dir < 0 ? chordsPrev : chordsNext)();
        break;
      }

// ===== Editor: applica righe al brano corrente =====
case 'editor/apply': {
  const { lyricsText, chordsText } = msg;
  const song = state.currentSong;
  if (!song) break;

  const RE_SECTION = /^\s*\[([^\]]+)\]\s*$/;

  function parseLyricsWithSectionsServer(raw) {
    const out = { sections: [], lines: [] };
    if (typeof raw !== 'string') return out;
    raw.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s) return;
      const m = s.match(RE_SECTION);
      if (m) out.sections.push({ name: m[1].trim(), startIdx: out.lines.length });
      else out.lines.push({ text: s });
    });
    return out;
  }
  function parseChordsWithSectionsServer(raw) {
    const out = { sections: [], chords: [] };
    if (typeof raw !== 'string') return out;
    raw.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s) return;
      const m = s.match(RE_SECTION);
      if (m) out.sections.push({ name: m[1].trim(), startIdx: out.chords.length });
      else s.split(/\s+/).forEach(tok => { if (tok) out.chords.push({ chord: tok }); });
    });
    return out;
  }

  if (typeof lyricsText === 'string') {
    const p = parseLyricsWithSectionsServer(lyricsText);
    song.lyrics = p.lines;
    song.lyricsSections = p.sections;
    state.currentLyricIndex = 0;
  }
  if (typeof chordsText === 'string') {
    const p = parseChordsWithSectionsServer(chordsText);
    song.chords = p.chords;
    song.chordsSections = p.sections;
    state.currentChordIndex = 0;
  }

  state.lastEvent = 'Editor applied (with sections)';
  broadcastState();
  break;
}

      // ===== Utility =====
      case 'song/selectByIndex': {
        const { index } = msg;
        if (typeof index === 'number') selectSongByIndex(index);
        break;
      }
      // dentro ws.on('message'):
      case 'song/selectById': {
        const { id, autoplay } = msg;
        if (id) {
          // seleziona
          const i = idxById(id);
          if (i >= 0) {
            selectSongByIndex(i); // aggiorna stato + PC + broadcast
            // Salto a marker via nota (C1 + index)

            // Se ho mappatura PC, uso locate SPP invece della nota fake
            const songSel = state.currentSong;
            const pc = Number(songSel?.programChange ?? (i + 1)) - 1;
            const hasMap = Number.isFinite(pc) && pcMap[pc];

            if (hasMap) {
              locateToProgram(pc, { autoplay: !!(state.transport.playing || autoplay) });
              // se ho usato locate, non serve la nota di jump
            } else {
              // fallback attuale
              sendSongJump(i, MIDI_CH);
              if (state.transport.playing || autoplay) mmcPlay();
            }
            state.lastEvent = autoplay ? 'Select song (playing)' : 'Select song';
            broadcastState();
            break;

            sendSongJump(i, MIDI_CH);

            if (state.transport.playing || autoplay) {
              state.transport.playingSongId = state.currentSongId;
              state.transport.startedAt = Date.now();

              // pulisci coda/blink
              state.transport.pendingNextAfterLoop = false;
              state.transport.loopExitMode = null;
              state.transport.queuedSongId = null;

              // avvia trasporto (MMC)
              mmcPlay();
              state.lastEvent = 'Select song (playing)';
              broadcastState();
            } else {
              // non in play: resti posizionato sul marker
              state.transport.playingSongId = null;
              state.transport.startedAt = 0;

              // pulisci coda/blink
              state.transport.pendingNextAfterLoop = false;
              state.transport.loopExitMode = null;
              state.transport.queuedSongId = null;

              state.lastEvent = 'Select song';
              broadcastState();
            }
          }
        }
        break;
      }


      case 'state/resetDemo': {
        state.session = null;
        state.setlist = [];
        ensureDemoSession();
        broadcastState();
        break;
      }

      default: break;
    }
  });

  ws.on('close', () => console.log('[WS] client disconnected'));
});

// =======================
// START (CLI o EMBEDDED)
// =======================
function startEmbedded(opts = {}) {
  const host = opts.host || '0.0.0.0';
  const port = Number(opts.port || HTTP_PORT);
  if (server.listening) return { stop: stopEmbedded };
  server.listen(port, host, () => {
    console.log(`[HTTP] Lyrix Bridge on ${host}:${port}`);
    console.log(`[HTTP] Serving static from ./${STATIC_DIR}`);
  });
  return { stop: stopEmbedded };
}
function stopEmbedded() {
  try { wss?.clients?.forEach(c => { try { c.terminate(); } catch(_){} }); } catch(_){}
  try { wss?.close?.(); } catch(_){}
  return new Promise(res => { try { server.close(() => res()); } catch(_) { res(); }});
}
if (require.main === module) {
  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Lyrix Bridge running at http://localhost:${HTTP_PORT}`);
    console.log(`[HTTP] Serving static from ./${STATIC_DIR}`);
  });
} else {
  module.exports = { startEmbedded };
}


