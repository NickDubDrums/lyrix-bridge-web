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
const clamp = (i, len) => Math.max(0, Math.min(len - 1, i));

function broadcastState() {
  // SAFE: se wss ancora non c’è, non inviamo nulla
  if (!wss) return;
  const payload = JSON.stringify({ type: 'state', state });
  wss.clients.forEach((c) => c.readyState === 1 && c.send(payload));
}

function selectSongByIndex(i) {
  if (!Array.isArray(state.setlist) || state.setlist.length === 0) return;
  const idx = Math.max(0, Math.min(state.setlist.length - 1, i));
  const song = state.setlist[idx];
  if (!song) return;

  state.currentSongId = song.id;
  state.currentSong = song;
  state.currentLyricIndex = 0;
  state.currentChordIndex = 0;

  // PC opzionale (funziona solo se MIDI presente)
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
  const hasList = Array.isArray(state.setlist) && state.setlist.length > 0;
  if (hasList) return;

  const demo = {
    id: 'demo-001',
    title: 'Lyrix Demo',
    songs: [
      {
        id: 'song-001',
        title: 'Brano Demo',
        programChange: 1,
        lyrics: [
          { text: 'Odio tante cose da...' },
          { text: 'quando ti conosco' },
          { text: 'ma poi ti penso e...' },
          { text: 'non ci capisco più' }
        ],
        chords: [
          { chord: 'Em' }, { chord: 'D' }, { chord: 'G' }, { chord: 'C' },
          { chord: 'Em' }, { chord: 'D' }, { chord: 'G' }, { chord: 'C' }
        ]
      },
      {
        id: 'song-002',
        title: 'Secondo Brano',
        programChange: 2,
        lyrics: [ { text:'Prima strofa' }, { text:'Ritornello' }, { text:'Bridge' } ],
        chords: [ { chord:'Am' }, { chord:'F' }, { chord:'C' }, { chord:'G' } ]
      }
    ]
  };

  state.session = demo;
  state.setlist = demo.songs;
  selectSongByIndex(0);
  state.lastEvent = 'Demo session loaded';
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
  ws.send(JSON.stringify({ type: 'state', state }));

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
      // ===== Stato / Setlist =====
      case 'state/request':
        ensureDemoSession();
        ws.send(JSON.stringify({ type: 'state', state }));
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
        state.session = { id: 'ad-hoc', title: 'Ad-Hoc', songs };
        state.setlist = songs;
        selectSongByIndex(0);
        break;
      }

      // ===== Transport / Song nav =====
      case 'transport/prev': prevSong(); state.lastEvent = 'Prev song'; break;
      case 'transport/next': nextSong(); state.lastEvent = 'Next song'; break;
      case 'transport/play': sendCC(CC_PLAY, 127); state.lastEvent = 'Play'; broadcastState(); break;
      case 'transport/stop': sendCC(CC_STOP, 127); state.lastEvent = 'Stop'; broadcastState(); break;

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

// ...poi sostituisci l'assegnazione:
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
  try { wss && wss.clients && wss.clients.forEach(c => { try { c.terminate(); } catch(_){} }); } catch (_){}
  try { wss && wss.close && wss.close(); } catch (_){}
  return new Promise(res => {
    try { server.close(() => res()); } catch (_) { res(); }
  });
}

if (require.main === module) {
  // Avvio classico per i tuoi .bat
  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Lyrix Bridge running at http://localhost:${HTTP_PORT}`);
    console.log(`[HTTP] Serving static from ./${STATIC_DIR}`);
  });
} else {
  module.exports = { startEmbedded };
}

