// server.js — WS + OSC con handler lyric/next & lyric/goto
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

// === OSC opzionale (abilita nel .bat togliendo DISABLE_OSC=1)
const DISABLE_OSC = process.env.DISABLE_OSC === "1";
let osc = null;
if (!DISABLE_OSC) {
  try { osc = require("osc"); } catch (e) { console.warn("[OSC] modulo non installato:", e.message); }
}

const PORT = Number(process.env.PORT || process.env.HTTP_PORT || 5173);
const OSC_IN_PORT  = Number(process.env.OSC_PORT || 9000);

const app = express();
app.use(express.json());

const server = http.createServer(app);

// Statici
app.use(express.static(path.join(__dirname, "web")));
app.get("/health", (_, res) => res.json({ ok: true }));

// WebSocket
const wss = new WebSocket.Server({ server, path: "/sync" });

// Stato condiviso
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

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function setLyricIndex(newIdx, announce=true) {
  const max = Math.max(0, (state.currentSong.lyrics?.length || 1) - 1);
  state.currentLyricIndex = clamp(Number(newIdx||0), 0, max);
  if (announce) broadcast({ type: "lyrics/currentIndex", value: state.currentLyricIndex });
}

wss.on("connection", (ws) => {
  // invia stato iniziale
  ws.send(JSON.stringify({ type: "state", state }));

  ws.on("message", (message) => {
    let msg;
    try { msg = JSON.parse(message.toString()); } catch { return; }

    // LOG utile
    if (msg?.type) console.log("[WS IN]", msg.type, (msg.value ?? msg.index ?? ""));

    switch (msg.type) {
      case "setlist/replace": {
        const arr = Array.isArray(msg.setlist) ? msg.setlist : [];
        state.setlist = arr;
        const current = arr[0];
        if (current) {
          state.currentSongId = current.id;
          state.currentSong = {
            lyrics: current.lyrics || [],
            chordTimeline: current.chordTimeline || []
          };
          setLyricIndex(0, false);
          state.currentChordIndex = -1;
          state.chordNow = "—";
        } else {
          state.currentSongId = null;
          state.currentSong = { lyrics: [], chordTimeline: [] };
          setLyricIndex(0, false);
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
          setLyricIndex(0, false);
          state.currentChordIndex = -1;
          state.chordNow = "—";
          broadcast({ type: "state", state });
        }
        break;
      }

      case "song/update-lyrics": {
        const lines = Array.isArray(msg.lyrics) ? msg.lyrics : [];
        state.currentSong.lyrics = lines;
        setLyricIndex(0);
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

      // === Trigger lyric via WS dal plugin ===
      case "lyrics/currentIndex": {
        setLyricIndex(msg.value);
        break;
      }
      case "lyric/goto": {
        setLyricIndex(msg.index);
        break;
      }
      case "lyric/next": {
        setLyricIndex(state.currentLyricIndex + 1);
        break;
      }

      // === Chords events (se li usi) ===
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

      default: break;
    }
  });

  // heartbeat per pulizia
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
});
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 30000);

// === OSC IN (se abilitato) per lyric/next & lyric/goto ===
if (!DISABLE_OSC && osc) {
  try {
    const udpPort = new (osc.UDPPort)({
      localAddress: "0.0.0.0",
      localPort: OSC_IN_PORT
    });
    udpPort.on("ready", () => {
      console.log(`[OSC] listening on udp ${OSC_IN_PORT}`);
    });
    udpPort.on("message", (msg) => {
      const addr = msg.address || "";
      console.log("[OSC IN]", addr, msg.args);
      if (addr === "/lyric/next") {
        setLyricIndex(state.currentLyricIndex + 1);
      } else if (addr === "/lyric/goto") {
        const idx = (msg.args?.[0]?.value ?? msg.args?.[0]) ?? 0;
        setLyricIndex(Number(idx));
      }
      // se vuoi, puoi fare broadcast del messaggio originale:
      // broadcast({ type: "osc", address: addr, args: msg.args });
    });
    udpPort.on("error", (e) => console.error("[OSC] error:", e.message));
    udpPort.open();
  } catch (e) {
    console.error("[OSC] init failed:", e.message);
  }
} else {
  console.log("[OSC] disabled (set DISABLE_OSC=0 to enable)");
}

// Avvio
server.listen(PORT, () => {
  console.log(`Lyrix Server http://localhost:${PORT}  (WS /sync)`);
});
