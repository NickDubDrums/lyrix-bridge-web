// web/js/state/ws.js
import { store, setState } from './store.js';

let ws = null;
let lastEventSeen = '';
let reconnectTimer = 0;
let endpointIdx = 0;
let serverOffsetMs = 0;     // stima: serverNow ≈ Date.now() + serverOffsetMs
let pingTimer = 0;
let lastTransportSig = '';  // firma dell’ultimo transport applicato



// Endpoint candidates: stessa origin, path /ws, e un paio di porte note
function candidates() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.host;                 // es: 192.168.1.5:1919
  const hostname = location.hostname;         // es: 192.168.1.5
  return [
    `${proto}://${host}/ws`,
    `${proto}://${host}`,
    `${proto}://${hostname}:8787`,
    `${proto}://${hostname}:1919`,
    `${proto}://${hostname}:3000/ws`,
    `${proto}://${hostname}:3000`,
  ];
}

function bumpWS(status) {
  setState(s => {
    s.runtime = s.runtime || {};
    s.runtime.wsStatus = status;
  });
}

function requestRerender() {
  // Forza ridisegno della vista corrente (router ascolta hashchange)
  try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch {}
}

function applyServerState(srv, serverTime = Date.now()) {
  if (!srv) return;

  // 1) setlist (array di oggetti brano) -> store.data (songs dict + order IDs)
  const songsDict = {};
  const order = [];
  (Array.isArray(srv.setlist) ? srv.setlist : []).forEach(song => {
    if (!song || !song.id) return;
    songsDict[song.id] = song;
    order.push(song.id);
  });

  setState(s => {
    // Stato base
    s.data.songs   = songsDict;
    s.data.setlist = order;
    if (srv.currentSongId) {
      s.ui.selectedSongId = srv.currentSongId;
      s.ui.editorSongId   = srv.currentSongId;
    }
// Trasporto authoritativo
const tr = srv.transport || {};
// firma: se non cambia, non ricalcoliamo startedAt (anti-glitch)
const sig = [
  tr.playing ? 1 : 0,
  tr.playingSongId || '',
  Number(tr.startedAt || 0),
  tr.pausedSongId || '',
  Number(tr.pausedElapsedMs || 0),
  tr.queuedSongId || '',
  tr.pendingNextAfterLoop ? 1 : 0,
  tr.loopExitMode || ''
].join('|');

s.runtime = s.runtime || {};
s.runtime.transport = s.runtime.transport || {};

if (sig !== lastTransportSig) {
  lastTransportSig = sig;

  s.runtime.transport.playing = !!tr.playing;
  s.runtime.transport.pendingNextAfterLoop = !!tr.pendingNextAfterLoop;
  s.runtime.transport.queuedSongId = tr.queuedSongId || null;
  s.runtime.transport.loopExitMode = tr.loopExitMode || null;

  if (tr.playing && tr.startedAt) {
    // usa il tuo orologio locale allineato al server
    const effectiveNow = Date.now() + serverOffsetMs;
    const delta = Math.max(0, effectiveNow - Number(tr.startedAt));
    s.runtime.transport.playingSongId = tr.playingSongId || srv.currentSongId || null;
    s.runtime.transport.startedAt = performance.now() - delta;
    s.runtime.transport.pausedSongId = null;
    s.runtime.transport.pausedElapsedMs = 0;
    } else {
      // IN PAUSA: mantieni visivamente la posizione, ma non "fingere" uno startedAt passato
      const pausedMs = Math.max(0, Number(tr.pausedElapsedMs || 0));
      s.runtime.transport.playingSongId = null;                // non stiamo suonando
      s.runtime.transport.pausedSongId = tr.pausedSongId || null;
      s.runtime.transport.pausedElapsedMs = pausedMs;
      s.runtime.transport.startedAt = 0;                       // importante!
    }

}

  });

    // ridisegna la vista
    requestRerender();
    
    // 🔔 Blink sync: immediato + ritardato (evita race con il re-mount della view)
    try {
      const queued = (srv.transport && srv.transport.queuedSongId) || null;
      const fire = () => window.dispatchEvent(new CustomEvent('lyrix:queued-sync', {
        detail: { queuedSongId: queued }
      }));
      fire();                 // subito
      setTimeout(fire, 0);    // prossimo tick
      requestAnimationFrame(fire); // prossimo frame
    } catch {}


}

function connect() {
  const list = candidates();
  const url  = list[endpointIdx % list.length];

  try { ws && ws.close(); } catch {}
  ws = new WebSocket(url);
  bumpWS('connecting');


ws.onopen = () => {
  bumpWS('connected');
  safeSend({ type: 'state/request' });

  // ping ogni 2s per stimare offset e jitter
clearInterval(pingTimer);
pingTimer = setInterval(() => {
  safeSend({ type: 'ping', t: Date.now() });
}, 2000);


  console.log('[WS] connected:', url);
};

  ws.onmessage = (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg) return;

    // Forma attesa: { type:'state', state:{...} }
    if (msg.type === 'state' && msg.state) {
      applyServerState(msg.state, msg.serverTime);
      return;
    }

    // Compat: se il server inviasse direttamente { setlist, currentSongId, ... }
    if (!msg.type && (msg.setlist || msg.currentSongId)) {
      applyServerState(msg, Date.now());
      return;
    }

    if (msg.type === 'pong' && typeof msg.serverTime === 'number') {
      const now = Date.now();
      const rtt = Math.max(0, now - (msg.echo || now));
      const oneWay = rtt / 2;
      const estimate = (msg.serverTime + oneWay) - now;
      serverOffsetMs = serverOffsetMs * 0.8 + estimate * 0.2; // media mobile
      return;
    }

  };

  ws.onerror = () => {
    try { ws.close(); } catch {}
  };

  ws.onclose = () => {
    bumpWS('disconnected');
    console.warn('[WS] disconnected:', url);
    // prova prossimo endpoint tra 1s
    clearTimeout(reconnectTimer);
    endpointIdx++;
    reconnectTimer = setTimeout(connect, 1000);
  };
}



function safeSend(obj) {
  try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch {}
}

export function initRealtime() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  connect();
}

export const Realtime = {
  send: (type, payload = {}) => safeSend({ type, ...payload }),
  status: () => (store.runtime?.wsStatus || 'disconnected'),
};
