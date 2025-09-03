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
  const easymidi = require('easymidi'); // se non è installato, finisce nel catch
  const desired = String(process.env.MIDI_OUT || 'Lyrix Out');
  const outs = easymidi.getOutputs();
  const match = outs.find((n) => n.toLowerCase().includes(desired.toLowerCase()));
  midiOut = match ? new easymidi.Output(match) : new easymidi.Output(desired, true);
  console.log('[MIDI] Output:', desired, match ? '(physical)' : '(virtual)');
} catch (e) {
  console.warn('[MIDI] disabled:', e.message);
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

// (Se/Quando vorrai OSC: abiliteremo qui in try/catch senza impattare l’avvio)

// =======================
// Helper di stato
// =======================
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
        
        // Se stavamo "queuando" proprio questo brano, azzera la coda (niente blink residuo)
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
        sendCC(CC_PLAY, 127);
        broadcastState();
        break;
      }
      case 'transport/pause': {
      // pausa: conserva posizione e brano
      const { songId, elapsedMs } = msg;
      state.transport.playing = false;
      state.transport.playingSongId = null;
      state.transport.startedAt = 0;
      state.transport.pausedSongId = songId || state.currentSongId || null;
      state.transport.pausedElapsedMs = Math.max(0, Number(elapsedMs || 0));
      state.lastEvent = 'Pause';
      broadcastState();
      break;
      }

      case 'transport/stop': {
        state.transport.playing = false;
        state.transport.playingSongId = null;
        state.transport.startedAt = 0;
      
        // >>> aggiunte per lo stop “pulito”
        state.transport.pausedSongId = null;
        state.transport.pausedElapsedMs = 0;
        state.transport.pendingNextAfterLoop = false;
        state.transport.queuedSongId = null;
        state.transport.loopExitMode = null;
      
        state.lastEvent = 'Stop';
        sendCC(CC_STOP, 127);
        broadcastState();
        break;
      }

      case 'transport/next': {
        selectNext(); // cambia currentSongId + broadcast
        if (state.transport.playing) {
          state.transport.playingSongId = state.currentSongId
          state.transport.startedAt = Date.now();
          
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
        if (state.transport.playing) {
          state.transport.playingSongId = state.currentSongId
          state.transport.startedAt = Date.now();
          
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
        const { id } = msg;
        if (id) {
          // Seleziona (questa già fa broadcast della selezione non in play)
          selectSongById(id);
        
          // Se siamo in play, significa che parte SUBITO il nuovo brano:
          // allinea il transport e PULISCI la coda (stop blink ovunque)
          if (state.transport.playing) {
            state.transport.playingSongId = state.currentSongId;
            state.transport.startedAt = Date.now();
          
            // 🔽 qui la parte che mancava
            state.transport.pendingNextAfterLoop = false;
            state.transport.loopExitMode = null;
            state.transport.queuedSongId = null;
          
            state.lastEvent = 'Select song (playing)';
            broadcastState();
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


