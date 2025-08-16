// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const osc = require("osc");

const HTTP_PORT = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 5173;
const OSC_PORT  = process.env.OSC_PORT  ? Number(process.env.OSC_PORT)  : 9000;

const app = express();
const server = http.createServer(app);

// Serve static web app
app.use(express.static(path.join(__dirname, "web")));
app.get("/health", (_, res) => res.json({ ok: true }));

// WebSocket hub
const wss = new WebSocket.Server({ server, path: "/sync" });
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(msg));
}

wss.on("connection", (ws) => {
  console.log("WS client connected");
  ws.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      // Qui in futuro potrai accettare comandi dal browser (play/stop ecc.)
      console.log("WS from client:", msg);
    } catch (e) { console.error("WS parse error:", e); }
  });
});

// OSC listener (dal plugin)
const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: OSC_PORT
});

udpPort.on("ready", () => {
  console.log(`OSC listening on udp://0.0.0.0:${OSC_PORT}`);
});

udpPort.on("message", (msg) => {
  // Normalizza in JSON per i client web
  if (msg.address === "/lyric/next") {
    broadcast({ type: "lyric/next" });
  } else if (msg.address === "/lyric/goto") {
    const index = msg.args?.[0]?.value ?? msg.args?.[0];
    broadcast({ type: "lyric/goto", index: Number(index) || 0 });
  } else if (msg.address === "/chord") {
    // expected: [symbol, count, ...pcs]
    const arr = (msg.args || []).map(a => (a && typeof a === "object" && "value" in a) ? a.value : a);
    const symbol = String(arr[0] ?? "?");
    const count  = Number(arr[1] ?? 0);
    const pcs    = arr.slice(2, 2 + count).map(x => Number(x) || 0);
    broadcast({ type: "chord", symbol, pc: pcs, ts: Date.now() });
  } else {
    // Log altri messaggi
    console.log("OSC:", msg.address, msg.args);
  }
});

udpPort.on("error", (e) => console.error("OSC error:", e));
udpPort.open();

// Avvio HTTP+WS
server.listen(HTTP_PORT, () => {
  console.log(`HTTP server on http://localhost:${HTTP_PORT}`);
  console.log(`WebSocket on ws://localhost:${HTTP_PORT}/sync`);
});
