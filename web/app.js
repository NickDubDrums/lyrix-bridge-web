// === Stato client ===
const state = {
  ws: null,
  connected: false,
  // contenuti
  setlist: [],
  currentSongId: null,
  lyrics: ["(incolla il testo in EDITOR)"],
  currentLyricIndex: 0,
  chordTimeline: [],
  currentChordIndex: -1,
  chordNow: "—",
  // transpose agisce solo sui CHORDS (UI è dentro il pannello CHORDS)
  transpose: Number(localStorage.getItem("transpose") || 0),
  // preferenze (CSS custom properties)
  prefs: {
    lyricsBg: localStorage.getItem("lyricsBg") || "#000000",
    lyricsFg: localStorage.getItem("lyricsFg") || "#ffffff",
    lyricsHi: localStorage.getItem("lyricsHi") || "#67e8f9",
    lyricsAlpha: Number(localStorage.getItem("lyricsAlpha") || 16),
    lyricsFont: Number(localStorage.getItem("lyricsFont") || 64),
    lyricsDim:  Number(localStorage.getItem("lyricsDim")  || 40),
    chordsBg: localStorage.getItem("chordsBg") || "#0b0b0e",
    chordsFg: localStorage.getItem("chordsFg") || "#f2f2f2",
    chordsHi: localStorage.getItem("chordsHi") || "#67e8f9",
    chordsAlpha: Number(localStorage.getItem("chordsAlpha") || 12),
    chordsNowFont: Number(localStorage.getItem("chordsNowFont") || 64),
    chordsNextFont: Number(localStorage.getItem("chordsNextFont") || 22),
  }
};

// === Color HEX helpers ===
const clampByte = n => Math.max(0, Math.min(255, n|0));
const toHex2 = n => clampByte(n).toString(16).padStart(2, "0").toUpperCase();
function rgbStringToHex(str){
  const m = String(str||"").match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if(!m) return null;
  const [_,r,g,b] = m;
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}
function expandTo6(hex){
  const m = String(hex||"").match(/^#([0-9a-fA-F]{3})$/);
  if(!m) return (hex||"").toUpperCase();
  return ("#" + m[1].split("").map(ch=>ch+ch).join("")).toUpperCase();
}
function compressTo3Or6(hex6){
  const m = String(hex6||"").toUpperCase().match(/^#([0-9A-F]{6})$/);
  if(!m) return String(hex6||"").toUpperCase();
  const [r1,r2,g1,g2,b1,b2] = m[1].split("");
  const canShort = r1===r2 && g1===g2 && b1===b2;
  return canShort ? `#${r1}${g1}${b1}` : ("#"+m[1]);
}
function normalizeHex(input){
  if(!input) return "#FFFFFF";
  const s = String(input).trim();
  if(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase();
  const conv = rgbStringToHex(s);
  return conv ? conv : "#FFFFFF";
}

// === Utilità accordi: trasposizione semplice tonica (solo CHORDS) ===
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function transposeSymbol(sym, semi) {
  if (!sym || sym === "—" || sym === "?") return sym;
  const m = String(sym).match(/^([A-G](?:#|b)?)(.*)$/);
  if (!m) return sym;
  const enh = { "Db":"C#", "Eb":"D#", "Gb":"F#", "Ab":"G#", "Bb":"A#" };
  const rootSharp = enh[m[1]] || m[1];
  const idx = NOTES.indexOf(rootSharp);
  if (idx < 0) return sym;
  let n = (idx + semi) % 12; if (n < 0) n += 12;
  return NOTES[n] + m[2];
}

// === DOM refs ===
const wsDot = document.getElementById("ws-dot");
const wsText = document.getElementById("ws-text");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

const lyricsList = document.getElementById("lyricsList");

const chordNowEl = document.getElementById("chordNow");
const chordNextEl = document.getElementById("chordNext");

// transpose controlli sono dentro CHORDS
const transpose = document.getElementById("transpose");
const transposeValue = document.getElementById("transposeValue");

const lyricsInput = document.getElementById("lyricsInput");
const applyLyricsBtn = document.getElementById("applyLyrics");
const chordTimelineInput = document.getElementById("chordTimelineInput");
const applyTimelineBtn = document.getElementById("applyTimeline");

const setlistContainer = document.getElementById("setlistContainer");
const mockSetlistBtn = document.getElementById("mockSetlist");
const clearSetlistBtn = document.getElementById("clearSetlist");

const lyBg = document.getElementById("lyBg");
const lyFg = document.getElementById("lyFg");
const lyHi = document.getElementById("lyHi");
const lyAlpha = document.getElementById("lyAlpha");
const lyFont = document.getElementById("lyFont");
const lyDim = document.getElementById("lyDim");

const chBg = document.getElementById("chBg");
const chFg = document.getElementById("chFg");
const chHi = document.getElementById("chHi");
const chAlpha = document.getElementById("chAlpha");
const chNowFont = document.getElementById("chNowFont");
const chNextFont = document.getElementById("chNextFont");

const lyBgHex = document.getElementById("lyBgHex");
const lyFgHex = document.getElementById("lyFgHex");
const lyHiHex = document.getElementById("lyHiHex");
const chBgHex = document.getElementById("chBgHex");
const chFgHex = document.getElementById("chFgHex");
const chHiHex = document.getElementById("chHiHex");
const lyBgSwatch = document.getElementById("lyBgSwatch");
const lyFgSwatch = document.getElementById("lyFgSwatch");
const lyHiSwatch = document.getElementById("lyHiSwatch");
const chBgSwatch = document.getElementById("chBgSwatch");
const chFgSwatch = document.getElementById("chFgSwatch");
const chHiSwatch = document.getElementById("chHiSwatch");

// === Tabs ===
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    panels.forEach(p => p.classList.remove("show"));
    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add("show");
  }, { passive: true });
});

// === Apply CSS prefs ===
function applyPrefs() {
  const r = document.documentElement.style;
  const p = state.prefs;
  r.setProperty("--lyrics-bg", p.lyricsBg);
  r.setProperty("--lyrics-fg", p.lyricsFg);
  r.setProperty("--lyrics-hi", p.lyricsHi);
  r.setProperty("--lyrics-alpha", p.lyricsAlpha);
  r.setProperty("--lyrics-font", p.lyricsFont);
  r.setProperty("--lyrics-dim", p.lyricsDim);

  r.setProperty("--chords-bg", p.chordsBg);
  r.setProperty("--chords-fg", p.chordsFg);
  r.setProperty("--chords-hi", p.chordsHi);
  r.setProperty("--chords-alpha", p.chordsAlpha);
  r.setProperty("--chords-now-font", p.chordsNowFont);
  r.setProperty("--chords-next-font", p.chordsNextFont);

  // swatch update
  lyBgSwatch.style.backgroundColor = expandTo6(p.lyricsBg);
  lyFgSwatch.style.backgroundColor = expandTo6(p.lyricsFg);
  lyHiSwatch.style.backgroundColor = expandTo6(p.lyricsHi);
  chBgSwatch.style.backgroundColor = expandTo6(p.chordsBg);
  chFgSwatch.style.backgroundColor = expandTo6(p.chordsFg);
  chHiSwatch.style.backgroundColor = expandTo6(p.chordsHi);
}

// === Lyrics render (mai trasposte) ===
function renderLyrics(scrollToCurrent=false){
  lyricsList.innerHTML = "";
  state.lyrics.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = "line" + (i === state.currentLyricIndex ? " current" : "");
    div.textContent = line; // <— nessuna trasposizione
    lyricsList.appendChild(div);
  });
  if (scrollToCurrent) {
    const cur = lyricsList.querySelector(".current");
    if (cur) cur.scrollIntoView({ block:"center", behavior:"smooth" });
  }
}

// === CHORDS (le uniche a usare transpose) ===
function renderChordNow(){
  chordNowEl.textContent = transposeSymbol(state.chordNow, state.transpose);
}
function renderChordNext(){
  chordNextEl.innerHTML = "";
  const arr = state.chordTimeline.slice(state.currentChordIndex+1, state.currentChordIndex+5);
  arr.forEach(c => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.textContent = transposeSymbol(c, state.transpose);
    chordNextEl.appendChild(cell);
  });
}

// === WebSocket connect ===
function connectWS() {
  const url = `ws://${location.host}/sync`;
  try {
    state.ws = new WebSocket(url);
  } catch (_) {
    // dev senza WS
    return;
  }

  state.ws.addEventListener("open", () => {
    state.connected = true;
    wsDot.classList.remove("red"); wsDot.classList.add("green");
    wsText.textContent = "WS: connected";
  });
  state.ws.addEventListener("close", () => {
    state.connected = false;
    wsDot.classList.remove("green"); wsDot.classList.add("red");
    wsText.textContent = "WS: disconnected";
    setTimeout(connectWS, 1000);
  });
  state.ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") {
      const s = msg.state || {};
      state.setlist = Array.isArray(s.setlist) ? s.setlist : [];
      state.currentSongId = s.currentSongId || null;

      if (s.currentSong) {
        state.lyrics = s.currentSong.lyrics || [];
        state.chordTimeline = s.currentSong.chordTimeline || [];
      }

      state.currentLyricIndex = Number(s.currentLyricIndex ?? state.currentLyricIndex);
      state.currentChordIndex = Number(s.currentChordIndex ?? state.currentChordIndex);
      state.chordNow = s.chordNow || state.chordNow;

      renderSetlist();
      renderLyrics(true);
      renderChordNow();
      renderChordNext();
    }

    if (msg.type === "lyrics/currentIndex") {
      state.currentLyricIndex = Number(msg.value || 0);
      renderLyrics(true);
    }
    if (msg.type === "chord/current") {
      state.chordNow = msg.value || "—";
      renderChordNow();
      renderChordNext();
    }
    if (msg.type === "chord/index") {
      state.currentChordIndex = Number(msg.value || -1);
      renderChordNext();
    }
  });
}

// === SETLIST ===
function renderSetlist() {
  setlistContainer.innerHTML = "";
  state.setlist.forEach(s => {
    const card = document.createElement("div");
    card.className = "song" + (s.id === state.currentSongId ? " active" : "");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = s.title;
    const id = document.createElement("small");
    id.textContent = s.id;
    card.appendChild(title); card.appendChild(id);
    card.addEventListener("click", () => {
      state.ws?.send(JSON.stringify({ type: "song/select", id: s.id }));
    });
    setlistContainer.appendChild(card);
  });
}

mockSetlistBtn?.addEventListener("click", () => {
  const mock = [
    { id: "song-1", title: "Intro", lyrics: ["Benvenuti","..."], chordTimeline: ["Em","D","G","C"] },
    { id: "song-2", title: "Fiume", lyrics: ["Scorri piano","tra...","..." ], chordTimeline: ["C","G","Am","F","C","G","Am","F"] },
    { id: "song-3", title: "Notte", lyrics: ["Sotto il cielo","blu scuro","..." ], chordTimeline: ["Dm","Bb","F","C"] }
  ];
  state.ws?.send(JSON.stringify({ type: "setlist/replace", setlist: mock }));
});

clearSetlistBtn?.addEventListener("click", () => {
  state.ws?.send(JSON.stringify({ type: "setlist/replace", setlist: [] }));
});

// === EDITOR bindings ===
applyLyricsBtn.addEventListener("click", () => {
  const text = lyricsInput.value || "";
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  state.ws?.send(JSON.stringify({ type: "song/update-lyrics", lyrics: lines }));
});
applyTimelineBtn.addEventListener("click", () => {
  const t = chordTimelineInput.value || "";
  const arr = t.split(/\s+/).map(s=>s.trim()).filter(Boolean);
  state.ws?.send(JSON.stringify({ type: "song/update-chords", timeline: arr }));
});

// === Transpose (solo CHORDS) ===
transpose.value = String(state.transpose);
transposeValue.textContent = String(state.transpose);
transpose.addEventListener("input", () => {
  state.transpose = Number(transpose.value || 0);
  localStorage.setItem("transpose", String(state.transpose));
  transposeValue.textContent = String(state.transpose);
  renderChordNow();
  renderChordNext();
});

// === Prefs UI init/bind ===
const savePrefsBtn = document.getElementById("savePrefs");
const resetPrefsBtn = document.getElementById("resetPrefs");

function initPrefsControls() {
  const setSwatches=()=>{
    lyBgSwatch.style.backgroundColor = expandTo6(state.prefs.lyricsBg);
    lyFgSwatch.style.backgroundColor = expandTo6(state.prefs.lyricsFg);
    lyHiSwatch.style.backgroundColor = expandTo6(state.prefs.lyricsHi);
    chBgSwatch.style.backgroundColor = expandTo6(state.prefs.chordsBg);
    chFgSwatch.style.backgroundColor = expandTo6(state.prefs.chordsFg);
    chHiSwatch.style.backgroundColor = expandTo6(state.prefs.chordsHi);
  };

  const p = state.prefs;
  // set iniziali
  lyBg.value = expandTo6(p.lyricsBg); lyFg.value = expandTo6(p.lyricsFg); lyHi.value = expandTo6(p.lyricsHi);
  lyBgHex.value = p.lyricsBg; lyFgHex.value = p.lyricsFg; lyHiHex.value = p.lyricsHi; setSwatches();

  lyAlpha.value = p.lyricsAlpha; lyFont.value = p.lyricsFont; lyDim.value = p.lyricsDim;

  chBg.value = expandTo6(p.chordsBg); chFg.value = expandTo6(p.chordsFg); chHi.value = expandTo6(p.chordsHi);
  chBgHex.value = p.chordsBg; chFgHex.value = p.chordsFg; chHiHex.value = p.chordsHi; setSwatches();

  chAlpha.value = p.chordsAlpha; chNowFont.value = p.chordsNowFont; chNextFont.value = p.chordsNextFont;

  const bindHexPair = (hexInput, colorInput, key, swatch) => {
    hexInput.addEventListener("input", () => {
      const raw = hexInput.value.trim();
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
        const norm = raw.toUpperCase();
        state.prefs[key] = norm;
        colorInput.value = expandTo6(norm);
        if (swatch) swatch.style.backgroundColor = expandTo6(norm);
        applyPrefs();
      } else if (raw.toLowerCase().startsWith("rgb")) {
        const norm = normalizeHex(raw);
        state.prefs[key] = norm;
        colorInput.value = expandTo6(norm);
        if (swatch) swatch.style.backgroundColor = expandTo6(norm);
        applyPrefs();
      }
    });
    colorInput.addEventListener("input", () => {
      const v = colorInput.value.toUpperCase();
      const compact = compressTo3Or6(v);
      state.prefs[key] = compact;
      hexInput.value = compact;
      if (swatch) swatch.style.backgroundColor = expandTo6(compact);
      applyPrefs();
    });
  };

  const bind = (el, key, transform=(v)=>v) => {
    el.addEventListener("input", () => {
      state.prefs[key] = transform(el.value);
      applyPrefs();
    });
  };
  bind(lyAlpha, "lyricsAlpha", Number);
  bind(lyFont, "lyricsFont", Number);
  bind(lyDim, "lyricsDim", Number);
  bind(chAlpha, "chordsAlpha", Number);
  bind(chNowFont, "chordsNowFont", Number);
  bind(chNextFont, "chordsNextFont", Number);

  bindHexPair(lyBgHex, lyBg, "lyricsBg", lyBgSwatch);
  bindHexPair(lyFgHex, lyFg, "lyricsFg", lyFgSwatch);
  bindHexPair(lyHiHex, lyHi, "lyricsHi", lyHiSwatch);
  bindHexPair(chBgHex, chBg, "chordsBg", chBgSwatch);
  bindHexPair(chFgHex, chFg, "chordsFg", chFgSwatch);
  bindHexPair(chHiHex, chHi, "chordsHi", chHiSwatch);

  savePrefsBtn.addEventListener("click", () => {
    Object.entries(state.prefs).forEach(([k,v]) => localStorage.setItem(k, String(v)));
    alert("Preferenze salvate su questo dispositivo");
  });
  resetPrefsBtn.addEventListener("click", () => {
    localStorage.removeItem("lyricsBg"); localStorage.removeItem("lyricsFg"); localStorage.removeItem("lyricsHi");
    localStorage.removeItem("lyricsAlpha"); localStorage.removeItem("lyricsFont"); localStorage.removeItem("lyricsDim");
    localStorage.removeItem("chordsBg"); localStorage.removeItem("chordsFg"); localStorage.removeItem("chordsHi");
    localStorage.removeItem("chordsAlpha"); localStorage.removeItem("chordsNowFont"); localStorage.removeItem("chordsNextFont");
    state.prefs = {
      lyricsBg:"#000000", lyricsFg:"#ffffff", lyricsHi:"#67e8f9", lyricsAlpha:16, lyricsFont:64, lyricsDim:40,
      chordsBg:"#0b0b0e", chordsFg:"#f2f2f2", chordsHi:"#67e8f9", chordsAlpha:12, chordsNowFont:64, chordsNextFont:22,
    };
    initPrefsControls();
    applyPrefs();
  });
}

// === Boot ===
applyPrefs();
initPrefsControls();
connectWS();

// Demo iniziale (se il server non ha ancora stato)
if (!state.lyrics?.length) state.lyrics = ["Prima riga","Seconda riga","Terza riga","Quarta riga"];
renderLyrics(true);
renderChordNow();
renderChordNext();
