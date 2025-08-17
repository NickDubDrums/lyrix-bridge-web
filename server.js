// server.js – Lyrix Bridge (HTTP + WebSocket + MIDI PC/CC)
// Requisiti:
//   npm i express ws osc easymidi lowdb
//
// Env opzionali (puoi anche hardcodare):
//   HTTP_PORT=5173
//   STATIC_DIR=web
//   MIDI_OUT="Lyrix Out"
//   CC_PLAY=20
//   CC_STOP=21

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

// ==== CONFIG ====
const HTTP_PORT = Number(process.env.HTTP_PORT || 5173);
const STATIC_DIR = process.env.STATIC_DIR || 'web';
const CC_PLAY = Number(process.env.CC_PLAY || 20);
const CC_STOP = Number(process.env.CC_STOP || 21);

// ==== MIDI OUTPUT (Program Change / CC) ====
let midiOut = null;
(function initMIDI() {
  try {
    const easymidi = require('easymidi');
    const desired = String(process.env.MIDI_OUT || 'Lyrix Out');
    const outs = easymidi.getOutputs();
    const match = outs.find((n) => n.toLowerCase().includes(desired.toLowerCase()));
    // Se esiste, usa quella porta; altrimenti crea una virtuale con lo stesso nome
    midiOut = match ? new easymidi.Output(match) : new easymidi.Output(desired, true);
    console.log('[MIDI] Output:', desired, match ? '(physical)' : '(virtual)');
  } catch (e) {
    console.warn('[MIDI] disabled:', e.message);
  }
})();

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

// ==== HTTP STATIC ====
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, STATIC_DIR)));
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, STATIC_DIR, 'index.html'));
});
const server = http.createServer(app);

// ==== STATE ====
/**
 * Struttura attesa per una sessione:
 * {
 *   id, title, songs: [
 *     {
 *       id, title, programChange, bank?, // opzionale
 *       lyrics: [{ text, time? }, ...],
 *       chords: [{ chord, time? }, ...]
 *     }
 *   ]
 * }
 */
const state = {
  session: null,
  setlist: [],          // alias per session.songs
  currentSongId: null,
  currentSong: null,
  currentLyricIndex: 0,
  currentChordIndex: 0,
  settings: {
    detectChordsLive: false, // clustering MIDI disattivato di default
    activeLane: 'lyrics'     // 'lyrics' | 'chords'
  }
};

function clamp(i, len) {
  return Math.max(0, Math.min(len - 1, i));
}

function broadcastState() {
  const payload = JSON.stringify({ type: 'state', state });
  wss.clients.forEach((c) => c.readyState === 1 && c.send(payload));
}

// Selezione brano
function selectSongByIndex(i) {
  if (!Array.isArray(state.setlist) || state.setlist.length === 0) return;
  const idx = Math.max(0, Math.min(state.setlist.length - 1, i));
  const song = state.setlist[idx];
  if (!song) return;
  state.currentSongId = song.id;
  state.currentSong = song;
  state.currentLyricIndex = 0;
  state.currentChordIndex = 0;

  // Program Change: se non specificato, usa (index+1)-1 => 0..127
  const pc = Number(song.programChange ?? (idx + 1)) - 1;
  sendPC(pc);

  console.log('[STATE] Selected song:', song.title, `(idx ${idx})`);
  broadcastState();
}
function idxById(id) {
  return Array.isArray(state.setlist) ? state.setlist.findIndex((s) => s.id === id) : -1;
}
function prevSong() {
  const i = idxById(state.currentSongId);
  selectSongByIndex(i <= 0 ? 0 : i - 1);
}
function nextSong() {
  const i = idxById(state.currentSongId);
  selectSongByIndex(i < 0 ? 0 : Math.min(state.setlist.length - 1, i + 1));
}

// Lyrics: prev/next by index (editor-driven)
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

// Chords: prev/next by index (editor-driven)
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

// ==== WEBSOCKET ====
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[WS] client connected');
  // Invia subito lo stato
  ws.send(JSON.stringify({ type: 'state', state }));

  ws.on('message', (buf) => {
    let msg = null;
    try { msg = JSON.parse(String(buf)); } catch { return; }
    const t = msg.type;

    switch (t) {
      // ====== Session & Setlist ======
      case 'state/loadSession': {
        // payload: { session }
        const { session } = msg;
        if (!session || !Array.isArray(session.songs)) return;
        state.session = session;
        state.setlist = session.songs;
        selectSongByIndex(0);
        break;
      }
      case 'state/setlist': {
        // payload: { songs }
        const { songs } = msg;
        if (!Array.isArray(songs)) return;
        state.session = { id: 'ad-hoc', title: 'Ad-Hoc', songs };
        state.setlist = songs;
        selectSongByIndex(0);
        break;
      }

      // ====== Transport / Song nav ======
case 'transport/prev': prevSong(); state.lastEvent = 'Prev song'; break;
case 'transport/next': nextSong(); state.lastEvent = 'Next song'; break;
case 'transport/play': sendCC(CC_PLAY, 127); state.lastEvent = 'Play'; broadcastState(); break;
case 'transport/stop': sendCC(CC_STOP, 127); state.lastEvent = 'Stop'; broadcastState(); break;

case 'lyrics/prev': lyricsPrev(); state.lastEvent = 'Lyrics prev'; break;
case 'lyrics/next': lyricsNext(); state.lastEvent = 'Lyrics next'; break;
case 'chords/prev': chordsPrev(); state.lastEvent = 'Chords prev'; break;
case 'chords/next': chordsNext(); state.lastEvent = 'Chords next'; break;
      // ====== Lane (attiva: lyrics | chords) ======
      case 'ui/setActiveLane': {
        const { lane } = msg;
        if (lane === 'lyrics' || lane === 'chords') {
          state.settings.activeLane = lane;
          broadcastState();
        }
        break;
      }

      // ====== Lyrics / Chords step ======
      case 'lyrics/prev': lyricsPrev(); break;
      case 'lyrics/next': lyricsNext(); break;
      case 'chords/prev': chordsPrev(); break;
      case 'chords/next': chordsNext(); break;

      // messaggio unico con lane + direzione: { lane:'lyrics'|'chords', dir:-1|+1 }
      case 'content/step': {
        const { lane, dir } = msg;
        if (lane === 'lyrics') (dir < 0 ? lyricsPrev : lyricsNext)();
        if (lane === 'chords') (dir < 0 ? chordsPrev : chordsNext)();
        break;
      }

      // ====== Settings ======
      case 'settings/set': {
        // esempio: { settings: { detectChordsLive: false } }
        state.settings = { ...state.settings, ...(msg.settings || {}) };
        broadcastState();
        break;
      }

      // ====== Selezione diretta brano per indice ======
case 'song/selectByIndex': {
  const { index } = msg;
  if (typeof index === 'number') selectSongByIndex(index);
  break;
}

// ====== Editor: applica righe al brano corrente ======
case 'editor/apply': {
  // payload: { lyricsText?: string, chordsText?: string }
  const { lyricsText, chordsText } = msg;
  const song = state.currentSong;
  if (!song) break;

  if (typeof lyricsText === 'string') {
    const lines = lyricsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    song.lyrics = lines.map(text => ({ text }));
    state.currentLyricIndex = 0;
  }
  if (typeof chordsText === 'string') {
    const lines = chordsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    song.chords = lines.map(chord => ({ chord }));
    state.currentChordIndex = 0;
  }
  state.lastEvent = 'Editor applied to current song';
  broadcastState();
  break;
}


      default:
        // Ignora tipi sconosciuti
        break;
    }
  });

  ws.on('close', () => console.log('[WS] client disconnected'));
});

// ==== START SERVER ====
server.listen(HTTP_PORT, () => {
  console.log(`[HTTP] Lyrix Bridge running at http://localhost:${HTTP_PORT}`);
  console.log(`[HTTP] Serving static from ./${STATIC_DIR}`);
});
