// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

// === OPCIONALE: OSC (UDP). Disattiva mettendo DISABLE_OSC=1
const DISABLE_OSC = process.env.DISABLE_OSC === "1";
const osc = DISABLE_OSC ? null : require("osc");

// Piattaforme PaaS usano PORT; mantengo compatibilità con HTTP_PORT locale
const PORT = Number(process.env.PORT || process.env.HTTP_PORT || 5173);
const OSC_PORT = Number(process.env.OSC_PORT || 9000);

const app = express();
const server = http.createServer(app);

// 1) Statici (serve la tua web app)
app.use(express.static(path.join(__dirname, "web")));
app.get("/health", (_, res) => res.json({ ok: true }));

// 2) WebSocket su /sync
const wss = new WebSocket.Server({ server, path: "/sync" });

// Stato condiviso in RAM
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
  // invia stato iniziale
  ws.send(JSON.stringify({ type: "state", state }));

  ws.on("message", (message) => {
    let msg;
    try { msg = JSON.parse(message.toString()); } catch { return; }

    switch (msg.type) {
      case "setlist/replace": {
        const arr = Array.isArray(msg.setlist) ? msg.setlist : [];
        state.setlist = arr;
        if (!state.currentSongId && arr[0]) state.currentSongId = arr[0].id;
        const cur = state.setlist.find(s => s.id === state.currentSongId) || arr[0];
        if (cur) {
          state.currentSong = {
            lyrics: cur.lyrics || [],
            chordTimeline: cur.chordTimeline || []
          };
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
        // ignora messaggi non gestiti
        break;
    }
  });

  // heartbeat
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

// 3) OSC (opzionale, potrebbe non essere supportato su PaaS)
if (!DISABLE_OSC) {
  try {
    const udpPort = new (osc.UDPPort)({ localAddress: "0.0.0.0", localPort: OSC_PORT });
    udpPort.on("message", (msg) => {
      if (msg.address === "/lyric/next") {
        broadcast({ type: "lyric/next" });
      } else if (msg.address === "/lyric/goto") {
        const index = msg.args?.[0]?.value ?? msg.args?.[0];
        broadcast({ type: "lyric/goto", index: Number(index) || 0 });
      } else if (msg.address === "/chord") {
        const arr = (msg.args || []).map(a => (a && typeof a === "object" && "value" in a) ? a.value : a);
        const symbol = String(arr[0] ?? "?");
        const count  = Number(arr[1] ?? 0);
        const pcs    = arr.slice(2, 2 + count).map(x => Number(x) || 0);
        broadcast({ type: "chord", symbol, pc: pcs, ts: Date.now() });
      } else {
        console.log("OSC:", msg.address, msg.args);
      }
    });
    udpPort.on("error", (e) => console.error("OSC error:", e));
    udpPort.open();
    console.log(`OSC UDP listening on ${OSC_PORT} (set DISABLE_OSC=1 to disable)`);
  } catch (e) {
    console.error("OSC init failed:", e.message);
  }
} else {
  console.log("OSC disabled (DISABLE_OSC=1)");
}

// 4) Avvio HTTP+WS
server.listen(PORT, () => {
  console.log(`HTTP server on http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}/sync`);
});
