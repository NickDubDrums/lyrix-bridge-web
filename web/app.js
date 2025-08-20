// app.js – Lyrix Bridge (client)

(() => {
  // ---------------------------
  // State + DOM refs
  // ---------------------------
  const $ = (id) => document.getElementById(id);

  const state = {
    ws: null,
    page: localStorage.getItem('page') || 'performance', // performance | setlist | editor
    mode: localStorage.getItem('mode') || 'lyrics',      // lyrics | chords | split
    activeLane: localStorage.getItem('activeLane') || 'lyrics', // lyrics | chords
    server: null, // ultima copia di stato dal server
  };

  
const CSS_KEYS = [
  'lyrics-bg','lyrics-fg','lyrics-hi','lyrics-font','lyrics-dim','lyrics-alpha',
  'chords-bg','chords-fg','chords-hi','chords-now-font','chords-next-font','chords-alpha'
];

function loadCSSVars() {
  const root = document.documentElement;
  const saved = JSON.parse(localStorage.getItem('lyrix-css') || '{}');
  CSS_KEYS.forEach(k => {
    if (saved[k] != null) {
      const v = k.includes('font') || k.includes('dim') || k.includes('alpha') ? saved[k] : saved[k];
      root.style.setProperty(`--${k}`, String(v).startsWith('#') ? v : v);
    }
  });
  // Sync UI controls se presenti
  lyBg && (lyBg.value = getVar('--lyrics-bg')); lyBgPick && (lyBgPick.value = toColor(getVar('--lyrics-bg')));
  lyFg && (lyFg.value = getVar('--lyrics-fg')); lyFgPick && (lyFgPick.value = toColor(getVar('--lyrics-fg')));
  lyHi && (lyHi.value = getVar('--lyrics-hi')); lyHiPick && (lyHiPick.value = toColor(getVar('--lyrics-hi')));
  lyFont && (lyFont.value = fromPxVar('--lyrics-font', 20));
  lyDim && (lyDim.value = fromIntVar('--lyrics-dim', 40));
  lyAlpha && (lyAlpha.value = fromIntVar('--lyrics-alpha', 16));

  chBg && (chBg.value = getVar('--chords-bg')); chBgPick && (chBgPick.value = toColor(getVar('--chords-bg')));
  chFg && (chFg.value = getVar('--chords-fg')); chFgPick && (chFgPick.value = toColor(getVar('--chords-fg')));
  chHi && (chHi.value = getVar('--chords-hi')); chHiPick && (chHiPick.value = toColor(getVar('--chords-hi')));
  chNow && (chNow.value = fromPxVar('--chords-now-font', 64));
  chNext && (chNext.value = fromPxVar('--chords-next-font', 22));
  chAlpha && (chAlpha.value = fromIntVar('--chords-alpha', 12));
}

function saveCSSVars() {
  const root = document.documentElement;
  const saved = {};
  CSS_KEYS.forEach(k => saved[k] = getVar(`--${k}`));
  localStorage.setItem('lyrix-css', JSON.stringify(saved));
}

function getVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function setVar(name, value){ document.documentElement.style.setProperty(name, value); }
function toColor(v){ return /^#/.test(v) ? v : '#000000'; }
function fromPxVar(name, fallback){ const v = parseInt(getVar(name), 10); return Number.isFinite(v) ? v : fallback; }
function fromIntVar(name, fallback){ const v = parseInt(getVar(name), 10); return Number.isFinite(v) ? v : fallback; }

  // Header elements
  const wsDot       = $('wsDot');
  const pageSelect  = $('pageSelect');
btnModeLyrics?.addEventListener('click', () => { setPage('performance'); setMode('lyrics'); });
btnModeChords?.addEventListener('click', () => { setPage('performance'); setMode('chords'); });
btnModeSplit ?.addEventListener('click', () => { setPage('performance'); setMode('split');  });
  const btnFull     = $('btnFull');
  const laneBadge   = $('laneBadge');
  const songTitle   = $('songTitle');

  // Pages
  const pagePerformance = $('page-performance');
  const pageSetlist     = $('page-setlist');
  const pageEditor      = $('page-editor');

  // Performance panes
  const perfViewer   = $('perf-viewer');
  const paneLyrics   = $('perf-lyrics');
  const paneChords   = $('perf-chords');

  // Lyrics controls + list
  const lyrPrevBtn   = $('lyrPrev');
  const lyrNextBtn   = $('lyrNext');
  const lyricsList   = $('lyricsList');

  // Chords controls + widgets
  const choPrevBtn   = $('choPrev');
  const choNextBtn   = $('choNext');
  const chordCurrent = $('chordCurrent');
  const chordNext4   = $('chordNext4');
  const chordsList   = $('chordsList');

  // Setlist controls + container
  const setlistPrev  = $('setlistPrev');
  const setlistNext  = $('setlistNext');
  const setlistPlay  = $('setlistPlay');
  const setlistStop  = $('setlistStop');
  const setlistContainer = $('setlistContainer');

  // Editor
  const editorLyrics = $('editorLyrics');
  const editorChords = $('editorChords');
  const editorSaveLyrics = $('editorSaveLyrics');
  const editorSaveChords = $('editorSaveChords');

  // Editor – Display settings
  const lyBg = $('ly-bg'), lyBgPick = $('ly-bg-pick');
  const lyFg = $('ly-fg'), lyFgPick = $('ly-fg-pick');
  const lyHi = $('ly-hi'), lyHiPick = $('ly-hi-pick');
  const lyFont = $('ly-font'), lyDim = $('ly-dim'), lyAlpha = $('ly-alpha');

  const chBg = $('ch-bg'), chBgPick = $('ch-bg-pick');
  const chFg = $('ch-fg'), chFgPick = $('ch-fg-pick');
  const chHi = $('ch-hi'), chHiPick = $('ch-hi-pick');
  const chNow = $('ch-now'), chNext = $('ch-next'), chAlpha = $('ch-alpha');

  const stageEnter = $('stageEnter'), stageExit = $('stageExit');


  // ---------------------------
  // Helpers
  // ---------------------------
  function send(type, extra = {}) {
    try { state.ws?.send(JSON.stringify({ type, ...extra })); } catch {}
  }

  function setPage(p) {
    state.page = p;
    localStorage.setItem('page', p);
    document.body.dataset.page = p;

    pagePerformance.classList.toggle('active', p === 'performance');
    pageSetlist.classList.toggle('active', p === 'setlist');
    pageEditor.classList.toggle('active', p === 'editor');

    // Aggiorna select se serve
    if (pageSelect && pageSelect.value !== p) pageSelect.value = p;
  }

  function setMode(m) {
    state.mode = (m === 'chords' || m === 'split') ? m : 'lyrics';
    localStorage.setItem('mode', state.mode);

    document.body.classList.remove('mode-lyrics', 'mode-chords', 'mode-split');
    document.body.classList.add(`mode-${state.mode}`);
  }

  function setActiveLane(lane) {
    state.activeLane = (lane === 'chords') ? 'chords' : 'lyrics';
    localStorage.setItem('activeLane', state.activeLane);
    document.body.dataset.activeLane = state.activeLane;
    if (laneBadge) laneBadge.textContent = `Focus: ${state.activeLane[0].toUpperCase()}${state.activeLane.slice(1)}`;
    send('ui/setActiveLane', { lane: state.activeLane });
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }



const RE_SECTION = /^\s*\[([^\]]+)\]\s*$/; // robusto: [Verse], [Chorus 2], etc.

/* Lyrics: esclude le [sections], restituisce anche l'elenco sezioni */
function parseLyricsWithSections(raw) {
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

/* Chords: esclude le [sections], splitta per SPAZI */
function parseChordsWithSections(raw) {
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

function sectionForIndex(sections, idx) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  let cur = sections[0];
  for (const s of sections) { if (s.startIdx <= idx) cur = s; else break; }
  return cur;
}

// Già usi RE_SECTION e sectionForIndex; aggiungo "nextSectionForIndex"
function nextSectionForIndex(sections, idx){
  if (!Array.isArray(sections) || !sections.length) return null;
  // trova la sezione corrente
  let curr = null, currIdx = -1;
  sections.forEach((s, i) => { if (s.startIdx <= idx) { curr = s; currIdx = i; } });
  return sections[currIdx + 1] || null;
}

// Utility per decidere quale sorgente usare (Lyrics > Chords)
function computeSectionHUDData() {
  const st   = state.server || {};
  const song = st.currentSong || {};
  const liIdx = st.currentLyricIndex ?? -1;
  const chIdx = st.currentChordIndex ?? -1;

  let liSecs = song.lyricsSections || [];
  let chSecs = song.chordsSections || [];

  // Se il server non ha già le sections, prova fallback “grezzo” (se hai salvato raw)
  // Se il server non ha già le sections, prova fallback “grezzo”
  if ((!liSecs || !liSecs.length)) {
    if (typeof song.lyricsRaw === 'string') {
      try { const p = parseLyricsWithSections(song.lyricsRaw); liSecs = p.sections || []; } catch {}
    } else if (Array.isArray(song.lyrics)) {
      // ricostruisci un raw dalle righe (potrebbero contenere [Section])
      const raw = song.lyrics
        .map(v => (typeof v === 'string' ? v : (v?.text ?? '')))
        .filter(Boolean)
        .join('\n');
      if (raw) {
        try { const p = parseLyricsWithSections(raw); liSecs = p.sections || []; } catch {}
      }
    }
  }

  if ((!chSecs || !chSecs.length)) {
    if (typeof song.chordsRaw === 'string') {
      try { const p = parseChordsWithSections(song.chordsRaw); chSecs = p.sections || []; } catch {}
    } else if (Array.isArray(song.chords)) {
      // se l’array è già tokenizzato, le [Section] potrebbero non esserci più;
      // ma se sono rimaste in forma stringa le ripeschiamo
      const raw = song.chords
        .map(v => (typeof v === 'string' ? v : (v?.chord ?? '')))
        .filter(Boolean)
        .join('\n');
      if (raw && /\[.+\]/.test(raw)) {
        try { const p = parseChordsWithSections(raw); chSecs = p.sections || []; } catch {}
      }
    }
  }
  // PRIORITÀ: se lyrics ha sezioni, usa quelle; altrimenti usa chords
  let src = null, curr = null, next = null;

  if (Array.isArray(liSecs) && liSecs.length) {
    src  = 'Lyrics';
    curr = sectionForIndex(liSecs, Math.max(0, liIdx));
    next = nextSectionForIndex(liSecs, Math.max(0, liIdx));
  } else if (Array.isArray(chSecs) && chSecs.length) {
    src  = 'Chords';
    curr = sectionForIndex(chSecs, Math.max(0, chIdx));
    next = nextSectionForIndex(chSecs, Math.max(0, chIdx));
  }

  return { src, currName: curr?.name || null, nextName: next?.name || null };
}

function updateSectionHUD() {
  const hud = document.getElementById('sectionHUD');
  if (!hud) return;

  const { src, currName } = computeSectionHUDData(); // ignoriamo nextName

  if (!src || !currName) {
    hud.style.display = 'none';
    return;
  }

  hud.style.display = 'inline-flex';
  // Mostra SOLO la sorgente (Lyrics/Chords) + la sezione corrente
  hud.innerHTML = `
    <span class="src">${src}</span>
    <span class="curr">${currName}</span>
  `;
}



  // ---------------------------
  // Render
  // ---------------------------
  function renderSongTitle() {
    if (!songTitle) return;
    const s = state.server?.currentSong;
    songTitle.textContent = s?.title || '—';
  }

function renderLyrics() {
  const song = state.server?.currentSong;
  const idx  = state.server?.currentLyricIndex ?? -1;

  // Sorgente + sezioni: usa quelle del server se presenti; altrimenti prova a parsare da testo grezzo
  let lines = Array.isArray(song?.lyrics) ? song.lyrics : [];
  let sections = song?.lyricsSections || [];
  let renderList = [];

  if (!sections.length) {
    // lines potrebbe ancora contenere righe [Section] → filtriamo e inseriamo spacer
    let lastWasSection = false;
    lines.forEach((obj) => {
      const text = typeof obj === 'string' ? obj : (obj?.text ?? '');
      if (!text) return;
      const m = text.match(RE_SECTION);
      if (m) {
        sections.push({ name: m[1].trim(), startIdx: renderList.length });
        if (renderList.length && !lastWasSection) renderList.push({ spacer: true });
        lastWasSection = true;
      } else {
        renderList.push({ text });
        lastWasSection = false;
      }
    });
  } else {
    // già pulite: costruisci e inserisci spacer ad ogni cambio sezione
    renderList = lines.map(l => ({ text: (typeof l === 'string' ? l : l.text) || '' }));
    sections.forEach((sec, si) => {
      if (si === 0) return;
      const insertAt = sections[si].startIdx + si - 1;
      renderList.splice(insertAt, 0, { spacer: true });
    });
  }

  // Render
  lyricsList.innerHTML = '';
  renderList.forEach((item, i) => {
    if (item.spacer) {
      const d = document.createElement('div');
      d.className = 'line spacer';
      lyricsList.appendChild(d);
      return;
    }
    const d = document.createElement('div');
    d.className = 'line' + (i === idx ? ' current' : '');
    d.textContent = item.text;
    lyricsList.appendChild(d);
  });

  // Centro fisso: padding dinamico sopra/sotto + scroll al centro
  const pane = document.getElementById('perf-lyrics');
  const cur  = lyricsList.children[idx];
  if (pane && cur) {
    const paneH = pane.clientHeight;
    const curH  = cur.clientHeight || 0;
    const need  = Math.max(0, (paneH/2) - (curH/2));
    lyricsList.style.setProperty('--ly-pad-top',    need + 'px');
    lyricsList.style.setProperty('--ly-pad-bottom', need + 'px');

    const target = Math.max(0, cur.offsetTop - (paneH/2) + (curH/2));
    if (Math.abs(pane.scrollTop - target) > 2) pane.scrollTo({ top: target, behavior: 'smooth' });
  }
}

function renderChords() {
  const song = state.server?.currentSong;
  const idx  = state.server?.currentChordIndex ?? -1;

  // Costruisci lista accordi pulita + sezioni
  let chords = [];
  let sections = song?.chordsSections || [];

  if (Array.isArray(song?.chords)) {
    chords = song.chords
      .map(c => (typeof c === 'string' ? { chord: c } : c))
      .filter(x => x && x.chord && !RE_SECTION.test(x.chord)); // safety
  } else if (typeof song?.chordsRaw === 'string') {
    const p = parseChordsWithSections(song.chordsRaw);
    chords = p.chords; sections = p.sections;
  }

  const timeline = document.getElementById('chordTimeline');
  if (!timeline) return;
  timeline.innerHTML = '';

  // Pads invisibili ai lati per poter centrare anche 1°/ultimo
  const padL = document.createElement('div'); padL.className = 'chord-pad';
  const padR = document.createElement('div'); padR.className = 'chord-pad';
  timeline.appendChild(padL);

  // Finestra: 3 passati + corrente + 4 futuri = 8 (regolabile)
  const windowIdx = [];
  for (let k = 3; k >= 1; k--) windowIdx.push(idx - k);
  windowIdx.push(idx);
  for (let k = 1; k <= 4; k++) windowIdx.push(idx + k);

  const sectionStarts = new Set((sections || []).map(s => s.startIdx));

  windowIdx.forEach((i) => {
    if (i < 0 || i >= chords.length) return;

    const el = document.createElement('div');
    const isCurrent = i === idx;
    const dist = Math.abs(i - idx);

    el.className = 'chord-item ' + (isCurrent ? 'current' : (i < idx ? 'past' : 'future')) + (isCurrent ? '' : ' small') + (dist ? ` lv${Math.min(4, dist)}` : '');
    el.textContent = chords[i].chord;

    // spazio extra all'inizio di ogni sezione (visivo)
    if (sectionStarts.has(i)) el.classList.add('section-start');

    timeline.appendChild(el);
  });

  timeline.appendChild(padR);

  // Centro fisso orizzontale indipendente dalla larghezza del simbolo
  const chips   = Array.from(timeline.querySelectorAll('.chord-item'));
  const current = chips.find((n) => n.classList.contains('current'));
  if (!current) return;

  const tlW  = timeline.clientWidth;
  const curW = current.offsetWidth;
  const targetLeft = current.offsetLeft - (tlW/2) + (curW/2);

  // Imposta ampiezza pad ai bordi per centrare primo/ultimo
  const padNeeded = Math.max(0, (tlW/2) - (curW/2));
  timeline.style.setProperty('--ch-pad', padNeeded + 'px');

  if (Math.abs(timeline.scrollLeft - targetLeft) > 2) {
    timeline.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }
}

function renderSetlist() {
    const list = Array.isArray(state.server?.setlist) ? state.server.setlist : [];
    const currentId = state.server?.currentSongId;
    setlistContainer.innerHTML = '';

if (list.length === 0) {
  const wrap = document.createElement('div');
  wrap.className = 'setlist-empty';
  wrap.innerHTML = `
    Nessun brano in setlist.
    <div style="margin-top:8px">
      <button id="btnLoadDemo">Carica demo</button>
    </div>
  `;
  setlistContainer.appendChild(wrap);
  wrap.querySelector('#btnLoadDemo')?.addEventListener('click', () => {
    send('state/resetDemo');
  });
  return;
}


    list.forEach((song, i) => {
      const card = document.createElement('div');
      card.className = 'setlist-item' + (song.id === currentId ? ' active' : '');
      card.innerHTML = `
        <div class="idx">${i + 1}</div>
        <div>
          <div class="title">${song.title ?? 'Untitled'}</div>
          <div class="meta">PC: ${song.programChange ?? (i + 1)}</div>
        </div>
      `;
card.addEventListener('click', () => {
  send('song/selectByIndex', { index: i });
});
      setlistContainer.appendChild(card);
    });
  }

  function renderAll() {
    renderSongTitle();
    renderLyrics();
    renderChords();
    renderSetlist();
    updateSectionHUD();
  }

  

  // ---------------------------
  // WebSocket
  // ---------------------------
  function connectWS() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.addEventListener('open', () => {
      wsDot?.classList.add('on');
      // sync lane al server
      send('ui/setActiveLane', { lane: state.activeLane });
       send('state/request');
    });
    ws.addEventListener('close', () => {
      wsDot?.classList.remove('on');
      // semplice retry
      setTimeout(connectWS, 1500);
    });
    ws.addEventListener('message', (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch {}
      if (!msg) return;

      if (msg.type === 'state') {
        state.server = msg.state;
        // Se il server ha una lane/mode diversa, sincronizza UI (non forzante)
        if (msg.state?.settings?.activeLane && msg.state.settings.activeLane !== state.activeLane) {
          setActiveLane(msg.state.settings.activeLane);
        }
        renderAll();
      }
    });
  }




  // ---------------------------
  // Bindings
  // ---------------------------
  // Page routing
  if (pageSelect) {
    pageSelect.value = state.page;
    pageSelect.addEventListener('change', () => setPage(pageSelect.value));
  }
  setPage(state.page);

  // Modes
  setMode(state.mode);
  btnModeLyrics?.addEventListener('click', () => setMode('lyrics'));
  btnModeChords?.addEventListener('click', () => setMode('chords'));
  btnModeSplit ?.addEventListener('click', () => setMode('split'));

  // Active lane switches
  setActiveLane(state.activeLane);
  paneLyrics?.addEventListener('click', () => setActiveLane('lyrics'));
  paneChords?.addEventListener('click', () => setActiveLane('chords'));

  // Fullscreen
// Fullscreen “da palco” uguale a Ctrl+F
btnFull?.addEventListener('click', () => {
  if (!document.body.classList.contains('hard-fullscreen')) {
    document.body.classList.add('hard-fullscreen');
    document.documentElement.requestFullscreen?.();
  } else {
    document.body.classList.remove('hard-fullscreen');
    document.exitFullscreen?.();
  }
});

  // Performance pane buttons
  lyrPrevBtn?.addEventListener('click', () => send('lyrics/prev'));
  lyrNextBtn?.addEventListener('click', () => send('lyrics/next'));
  choPrevBtn?.addEventListener('click', () => send('chords/prev'));
  choNextBtn?.addEventListener('click', () => send('chords/next'));

  // Setlist page controls (solo qui Play/Stop/Prev/Next song)
  setlistPrev?.addEventListener('click', () => send('transport/prev'));
  setlistNext?.addEventListener('click', () => send('transport/next'));
  setlistPlay?.addEventListener('click', () => send('transport/play'));
  setlistStop?.addEventListener('click', () => send('transport/stop'));

  // Editor save (placeholder: invia allo stato corrente; integrare con backend persistenza quando vuoi)
editorSaveLyrics?.addEventListener('click', () => {
  const lyricsText = editorLyrics?.value ?? '';
  send('editor/apply', { lyricsText });
});

editorSaveChords?.addEventListener('click', () => {
  const chordsText = editorChords?.value ?? '';
  send('editor/apply', { chordsText });
});

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Modalità
    if (e.key === '1') setMode('lyrics');
    if (e.key === '2') setMode('chords');
    if (e.key === '3') setMode('split');

    // Fullscreen
    if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }

    // Navigation con frecce: sulla lane attiva
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.activeLane === 'lyrics') send('lyrics/prev');
      else send('chords/prev');
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.activeLane === 'lyrics') send('lyrics/next');
      else send('chords/next');
    }

    // Space: SOLO nella pagina setlist → Play (Shift+Space → Stop)
    if (e.code === 'Space') {
      if (state.page === 'setlist') {
        e.preventDefault();
        if (e.shiftKey) send('transport/stop');
        else send('transport/play');
      }
    }
  });

  function bindColor(textInput, pickerInput, varName){
  if (!textInput || !pickerInput) return;
  const sync = (val) => { textInput.value = val; pickerInput.value = val; setVar(varName, val); saveCSSVars(); };
  textInput.addEventListener('change', () => sync(textInput.value));
  pickerInput.addEventListener('input', () => sync(pickerInput.value));
}

bindColor(lyBg, lyBgPick, '--lyrics-bg');
bindColor(lyFg, lyFgPick, '--lyrics-fg');
bindColor(lyHi, lyHiPick, '--lyrics-hi');
bindColor(chBg, chBgPick, '--chords-bg');
bindColor(chFg, chFgPick, '--chords-fg');
bindColor(chHi, chHiPick, '--chords-hi');

lyFont?.addEventListener('input', () => { setVar('--lyrics-font', `${lyFont.value}`); saveCSSVars(); });
lyDim ?.addEventListener('input', () => { setVar('--lyrics-dim', `${lyDim.value}`); saveCSSVars(); });
lyAlpha?.addEventListener('input', () => { setVar('--lyrics-alpha', `${lyAlpha.value}`); saveCSSVars(); });

chNow ?.addEventListener('input', () => { setVar('--chords-now-font', `${chNow.value}`); saveCSSVars(); });
chNext?.addEventListener('input', () => { setVar('--chords-next-font', `${chNext.value}`); saveCSSVars(); });
chAlpha?.addEventListener('input', () => { setVar('--chords-alpha', `${chAlpha.value}`); saveCSSVars(); });

// Pulsanti Stage Fullscreen (solo stage, nessun header)
stageEnter?.addEventListener('click', () => {
  document.body.classList.add('hard-fullscreen');
  document.documentElement.requestFullscreen?.();
});
stageExit?.addEventListener('click', () => {
  document.body.classList.remove('hard-fullscreen');
  document.exitFullscreen?.();
});

window.addEventListener('keydown', (e) => {
  // ... (resto già presente)
  if ((e.key === 'f' || e.key === 'F') && e.ctrlKey) {
    e.preventDefault();
    if (!document.body.classList.contains('hard-fullscreen')) {
      document.body.classList.add('hard-fullscreen');
      document.documentElement.requestFullscreen?.();
    } else {
      document.body.classList.remove('hard-fullscreen');
      document.exitFullscreen?.();
    }
  }
});

window.addEventListener('resize', () => {
  // forza un re-render “soft” dei centraggi
  renderLyrics();
  renderChords();
});



  // ---------------------------
  // Boot
  // ---------------------------
  connectWS();
  loadCSSVars();

  // Se proprio arriva vuoto, chiedo al server di caricare un demo
setTimeout(() => {
  if (!state.server?.setlist?.length) {
    send('state/loadSession', {
      session: {
        id: 'demo-client',
        title: 'Lyrix Demo (client)',
        songs: [{
          id: 'c-001',
          title: 'Client Demo',
          programChange: 10,
          lyrics: [{text:'Riga 1'},{text:'Riga 2'}],
          chords: [{chord:'Am'},{chord:'F'},{chord:'C'},{chord:'G'}]
        }]
      }
    });
  }
}, 400);


  // Se vuoi caricare una sessione demo al primo avvio, inviala qui:
  // send('state/loadSession', { session: { id:'demo', title:'Demo', songs:[ ... ] } });
})();
