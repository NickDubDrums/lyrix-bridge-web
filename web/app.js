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
  lyFont && (lyFont.value = fromPxVar('--lyrics-font', 10));
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
    const idx = state.server?.currentLyricIndex ?? -1;
    lyricsList.innerHTML = '';

    const lines = Array.isArray(song?.lyrics) ? song.lyrics : [];
    lines.forEach((line, i) => {
      const div = document.createElement('div');
      div.className = 'line' + (i === idx ? ' current' : '');
      div.textContent = typeof line === 'string' ? line : (line?.text ?? '');
      lyricsList.appendChild(div);
    });

    // autocentro la riga corrente
    if (idx >= 0) {
      const cur = lyricsList.children[idx];
      if (cur) {
        cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

function renderChords() {
  const song = state.server?.currentSong;
  const idx = state.server?.currentChordIndex ?? -1;
  const chords = Array.isArray(song?.chords) ? song.chords : [];

  // Corrente
  const now = chords[idx];
  chordCurrent.textContent = now ? (now.chord ?? String(now)) : '—';

  // Next 4 – griglia originale
  chordNext4.innerHTML = '';
  chordNext4.classList.add('next-grid');
  for (let k = 1; k <= 4; k++) {
    const next = chords[idx + k];
    if (!next) break;
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = next.chord ?? String(next);
    chordNext4.appendChild(cell);
  }

  // Lista completa (opzionale)
  chordsList.innerHTML = '';
  chords.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'chord' + (i === idx ? ' active' : '');
    div.textContent = c.chord ?? String(c);
    chordsList.appendChild(div);
  });

  // autocentro il corrente in lista completa
  if (idx >= 0) {
    const cur = chordsList.children[idx];
    if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
  function renderSetlist() {
    const list = Array.isArray(state.server?.setlist) ? state.server.setlist : [];
    const currentId = state.server?.currentSongId;
    setlistContainer.innerHTML = '';

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'setlist-empty';
      empty.textContent = 'Nessun brano in setlist.';
      setlistContainer.appendChild(empty);
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


  // ---------------------------
  // Boot
  // ---------------------------
  connectWS();
  loadCSSVars();


  // Se vuoi caricare una sessione demo al primo avvio, inviala qui:
  // send('state/loadSession', { session: { id:'demo', title:'Demo', songs:[ ... ] } });
})();
