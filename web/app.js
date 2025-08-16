// === Stato client ===
const state = {
  ws: null,
  connected: false,
  lyrics: ["(incolla il testo qui sotto e premi Applica)"],
  currentLyricIndex: 0,
  chordTimeline: [],     // facoltativa, per “Next 4”
  currentChordIndex: -1, // -1 = non iniziato
  chordNow: "—",
  transpose: Number(localStorage.getItem("transpose") || 0),
};

// === Utilità accordi: trasposizione semplice di toniche (C,C#,D,...) ===
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function transposeSymbol(sym, semi) {
  if (!sym || sym === "—" || sym === "?") return sym;
  const m = String(sym).match(/^([A-G](?:#|b)?)(.*)$/);
  if (!m) return sym;
  const [_, root, rest] = m;
  // normalizza b in equivalenti #
  const enh = { "Db":"C#", "Eb":"D#", "Gb":"F#", "Ab":"G#", "Bb":"A#" };
  const rootSharp = enh[root] || root;
  const idx = NOTES.indexOf(rootSharp);
  if (idx < 0) return sym;
  let n = (idx + semi) % 12; if (n < 0) n += 12;
  return NOTES[n] + rest;
}

// === DOM refs ===
const wsDot = document.getElementById("ws-dot");
const wsText = document.getElementById("ws-text");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const lyricsList = document.getElementById("lyricsList");
const lyricsInput = document.getElementById("lyricsInput");
const applyLyricsBtn = document.getElementById("applyLyrics");

const chordNowEl = document.getElementById("chordNow");
const chordNextEl = document.getElementById("chordNext");
const chordTimelineInput = document.getElementById("chordTimelineInput");
const applyTimelineBtn = document.getElementById("applyTimeline");

const transpose = document.getElementById("transpose");
const transposeValue = document.getElementById("transposeValue");
transpose.value = state.transpose;
transposeValue.textContent = state.transpose;

// === WS connect ===
function connectWS() {
  const url = `ws://${location.host}/sync`;
  state.ws = new WebSocket(url);

  state.ws.addEventListener("open", () => {
    state.connected = true;
    wsDot.classList.remove("red"); wsDot.classList.add("green");
    wsText.textContent = "WS: connected";
  });
  state.ws.addEventListener("close", () => {
    state.connected = false;
    wsDot.classList.remove("green"); wsDot.classList.add("red");
    wsText.textContent = "WS: disconnected";
    setTimeout(connectWS, 1000); // auto-retry
  });
  state.ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "lyric/next") {
      state.currentLyricIndex = Math.min(state.currentLyricIndex + 1, state.lyrics.length - 1);
      renderLyrics();
      // se usi timeline per accordi, avanza anche l'indice
      if (state.chordTimeline.length) {
        state.currentChordIndex = Math.min(state.currentChordIndex + 1, state.chordTimeline.length - 1);
        updateChordsFromTimeline();
      }
    } else if (msg.type === "lyric/goto") {
      state.currentLyricIndex = Math.max(0, Math.min(Number(msg.index)||0, state.lyrics.length - 1));
      renderLyrics();
      if (state.chordTimeline.length) {
        state.currentChordIndex = state.currentLyricIndex; // 1:1 se timeline allineata alle righe
        updateChordsFromTimeline();
      }
    } else if (msg.type === "chord") {
      // accordo live rilevato dal plugin
      state.chordNow = msg.symbol || "?";
      renderChordNow();
      // se hai timeline, opzionalmente avanza
      // state.currentChordIndex = Math.min(state.currentChordIndex + 1, state.chordTimeline.length - 1);
      // updateChordsFromTimeline();
    }
  });
}

// === Render Lyrics ===
function renderLyrics() {
  lyricsList.innerHTML = "";
  state.lyrics.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = "line" + (i === state.currentLyricIndex ? " current" : "");
    div.textContent = line;
    lyricsList.appendChild(div);
  });
}

// === Render Chords (Now + Next 4) ===
function renderChordNow() {
  const t = transposeSymbol(state.chordNow, state.transpose);
  chordNowEl.textContent = t;
}
function renderChordNext() {
  chordNextEl.innerHTML = "";
  if (!state.chordTimeline.length) {
    chordNextEl.innerHTML = `<div class="cell">—</div><div class="cell">—</div><div class="cell">—</div><div class="cell">—</div>`;
    return;
  }
  const i = state.currentChordIndex;
  const next = state.chordTimeline.slice(i + 1, i + 5);
  for (let k = 0; k < 4; k++) {
    const sym = next[k] || "—";
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.textContent = transposeSymbol(sym, state.transpose);
    chordNextEl.appendChild(cell);
  }
}
function updateChordsFromTimeline() {
  const i = Math.max(0, Math.min(state.currentChordIndex, state.chordTimeline.length - 1));
  state.chordNow = state.chordTimeline[i] || state.chordNow;
  renderChordNow();
  renderChordNext();
}

// === Events UI ===
applyLyricsBtn.addEventListener("click", () => {
  const text = lyricsInput.value.trim();
  state.lyrics = text ? text.split(/\r?\n/) : ["(vuoto)"];
  state.currentLyricIndex = 0;
  renderLyrics();
});

applyTimelineBtn.addEventListener("click", () => {
  const list = chordTimelineInput.value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  state.chordTimeline = list;
  state.currentChordIndex = -1;
  renderChordNext();
});

transpose.addEventListener("input", () => {
  state.transpose = Number(transpose.value);
  transposeValue.textContent = state.transpose;
  localStorage.setItem("transpose", String(state.transpose));
  renderChordNow();
  renderChordNext();
});

// Tab switching
tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    panels.forEach(p => p.classList.remove("show"));
    document.getElementById(btn.dataset.tab).classList.add("show");
  });
});

// === Boot ===
connectWS();
// demo content
lyricsInput.value = `Prima riga del testo
Seconda riga
Terza riga
Quarta riga`;
applyLyricsBtn.click();

chordTimelineInput.value = "Em D G C Em D G G";
applyTimelineBtn.click();
