// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
// OSC opzionale (per ora non lo usiamo; puoi commentare se vuoi)
let osc = null;
try { osc = require("osc"); } catch { /* opzionale, ignora */ }

const PORT = Number(process.env.PORT || process.env.HTTP_PORT || 5173);

const app = express();
const server = http.createServer(app);

app.use(express.json());

// Serve i file statici dalla cartella ./web
app.use(express.static(path.join(__dirname, "web")));
app.get("/health", (_, res) => res.json({ ok: true }));

// WebSocket su /sync
const wss = new WebSocket.Server({ server, path: "/sync" });

// Stato condiviso (in RAM)
const state = {
  setlist: [],
  currentSongId: null,
  currentSong: { lyrics: [], chordTimeline: [] },
  currentLyricIndex: 0,
  currentChordIndex: -1,
  chordNow: "—"
};

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on("connection", (ws) => {
  // manda lo stato attuale al nuovo client
  ws.send(JSON.stringify({ type: "state", state }));

  ws.on("message", (message) => {
    let msg;
    try { msg = JSON.parse(message.toString()); } catch { return; }

    switch (msg.type) {
      case "setlist/replace": {
        const arr = Array.isArray(msg.setlist) ? msg.setlist : [];
        state.setlist = arr;

        // scegli il brano corrente (primo disponibile) e carica contenuti
        const current = arr[0];
        if (current) {
          state.currentSongId = current.id;
          state.currentSong = {
            lyrics: current.lyrics || [],
            chordTimeline: current.chordTimeline || []
          };
          state.currentLyricIndex = 0;
          state.currentChordIndex = -1;
          state.chordNow = "—";
        } else {
          state.currentSongId = null;
          state.currentSong = { lyrics: [], chordTimeline: [] };
          state.currentLyricIndex = 0;
          state.currentChordIndex = -1;
          state.chordNow = "—";
        }

        broadcast({ type: "state", state });
        break;
      }

      case "song/select": {
        const found = state.setlist.find(s => s.id === msg.id);
        if (found) {
          state.currentSongId = found.id;
          state.currentSong = {
            lyrics: found.lyrics || [],
            chordTimeline: found.chordTimeline || []
          };
          state.currentLyricIndex = 0;
          state.currentChordIndex = -1;
          state.chordNow = "—";
          broadcast({ type: "state", state });
        }
        break;
      }

      case "song/update-lyrics": {
        const lines = Array.isArray(msg.lyrics) ? msg.lyrics : [];
        state.currentSong.lyrics = lines;
        state.currentLyricIndex = 0;
        broadcast({ type: "state", state });
        break;
      }

      case "song/update-chords": {
        const arr = Array.isArray(msg.timeline) ? msg.timeline : [];
        state.currentSong.chordTimeline = arr;
        state.currentChordIndex = -1;
        state.chordNow = "—";
        broadcast({ type: "state", state });
        break;
      }

      case "lyrics/currentIndex": {
        state.currentLyricIndex = Number(msg.value || 0);
        broadcast({ type: "lyrics/currentIndex", value: state.currentLyricIndex });
        break;
      }

      case "chord/current": {
        state.chordNow = msg.value || "—";
        broadcast({ type: "chord/current", value: state.chordNow });
        break;
      }

      case "chord/index": {
        state.currentChordIndex = Number(msg.value || -1);
        broadcast({ type: "chord/index", value: state.currentChordIndex });
        break;
      }

      default:
        // ignora tipi sconosciuti
        break;
    }
  });

  // opzionale: heartbeat
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`Lyrix Mini Server up: http://localhost:${PORT} (WS: /sync)`);
});
