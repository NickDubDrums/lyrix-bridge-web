// web/js/pages/performance.js
import { store, setState, subscribe } from '../state/store.js';

// Riconosce linee tipo [Verse], [Chorus 2], ecc.
const RE_SECTION = /^\s*\[[^\]]+\]\s*$/;


const PERF_DEFAULTS_REV = 4; // incrementa quando cambi i default

const PERF_DEFAULTS = {

  //LYRICS Default
  /*lyricsSize: 42,
  chordsSize: 28,
  textColor: '#f2f2f2',
  currentColor: '#ffffff',
  bgColor: '#101014',
  lineGap: 40,
  splitRatio: 50,
  splitEnabled: true,

// CHORDS defaults
chordsLineGap: 25,
chordsOpacityDim: 0.28,
chordsScaleCurrent: 1.80,
chordsScaleSecondary: 1.5,
chordsSectionGap: 28,*/
};

function isSection(line) {
  const t = (typeof line === 'string' ? line : (line?.text ?? '')).trim();
  return RE_SECTION.test(t);
}

function currentSectionName(lyricsArray, vline) {
  // lyricsArray: array originale (stringhe o {text})
  // vline: indice tra le sole righe “line” (non contando le section)
  const raw = Array.isArray(lyricsArray)
    ? lyricsArray.map(x => (typeof x === 'string' ? x : (x?.text ?? '')))
    : [];

  // Trova l’indice "fisico" che corrisponde alla vline-esima riga di testo
  let visualCount = -1;
  let physicalIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const t = (raw[i] || '').trim();
    if (RE_SECTION.test(t)) continue;   // salta le section
    visualCount++;
    if (visualCount === vline) { physicalIdx = i; break; }
  }
  if (physicalIdx < 0) physicalIdx = 0;

  // Risali finché trovi una [Section]
  for (let i = physicalIdx; i >= 0; i--) {
    const s = (raw[i] || '').trim();
    const m = s.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) return m[1].trim();
  }
  return '';
}


// Converte lyrics grezze in una lista "visuale" dove:
// - le righe normali diventano { type:'line', text: '...' }
// - le [sections] diventano { type:'gap' } (spazio visivo)
// Ritorna anche la mappa per navigare tra le sole righe "line".
function parseLyricsVisual(rawLyrics) {
  const lines = Array.isArray(rawLyrics) ? rawLyrics : [];
  const visual = [];
  const visualToTextIdx = []; // mappa: visualLineIndex -> index in rawLyrics (solo per type 'line')

  for (let i = 0; i < lines.length; i++) {
    const obj = lines[i];
    if (isSection(obj)) {
      // inserisci gap una sola volta se non ci sono già spazi consecutivi
      if (visual.length && visual[visual.length - 1].type !== 'gap') {
        visual.push({ type: 'gap' });
      } else if (!visual.length) {
        // se il brano inizia con una section, non aggiungere gap in testa
      }
      continue;
    }

    const text = (typeof obj === 'string' ? obj : (obj?.text ?? '')).trim();
    visual.push({ type: 'line', text });
    visualToTextIdx.push(i);
  }

  // rimuovi gap finale inutile
  while (visual.length && visual[visual.length - 1].type === 'gap') visual.pop();

  return { visual, visualToTextIdx };
}

// Converte l'array chords (stringhe o oggetti) in visual come i lyrics:
// - righe normali -> { type:'line', text: '...' }
// - [Section]     -> { type:'gap' }
function parseChordsVisual(rawChords) {
  const lines = Array.isArray(rawChords) ? rawChords : [];
  const visual = [];
  for (let i = 0; i < lines.length; i++) {
    const entry = lines[i];
    const s = (typeof entry === 'string'
      ? entry
      : (entry?.chord ?? entry?.text ?? '')
    ).trim();
    if (RE_SECTION.test(s)) {
      if (visual.length && visual[visual.length - 1].type !== 'gap') {
        visual.push({ type: 'gap' });
      }
      continue;
    }
    visual.push({ type:'line', text: s });
  }
  while (visual.length && visual[visual.length - 1].type === 'gap') visual.pop();
  return { visual };
}

// Converte "song.chords" in un array di stringhe pulite
function normalizeChordsArray(chords) {
  const arr = Array.isArray(chords) ? chords : [];
  return arr.map(x => {
    if (typeof x === 'string') return x.trim();
    return String(x?.chord ?? x?.text ?? '').trim();
  });
}


// Spezza una riga di accordi in token (separati da spazi)
function chordTokens(line) {
  const s = String(line || '').trim();
  if (!s) return [];
  return s.split(/\s+/).map(t => ({ text: t }));
}


// Ricava il nome della [Section] per una data vline (array di stringhe tipo lyrics/chords)
function currentSectionNameFromStrings(strArr, vline) {
  const raw = Array.isArray(strArr) ? strArr.map(x => String(x ?? '').trim()) : [];
  // mappa vline (solo righe non-section) -> indice fisico
  let vcount = -1, phys = -1;
  for (let i = 0; i < raw.length; i++) {
    if (RE_SECTION.test(raw[i])) continue;
    vcount++;
    if (vcount === vline) { phys = i; break; }
  }
  if (phys < 0) phys = 0;
  for (let i = phys; i >= 0; i--) {
    const m = raw[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) return m[1].trim();
  }
  return '';
}


function getPerfPrefs() {
  const u = store.prefs?.performance || {};

  if (u.__rev !== PERF_DEFAULTS_REV) {
    // Campi che vuoi RESETTARE ai nuovi default in questo bump:
const FORCE_RESET = [
  'chordsLineGap',
  'chordsOpacityDim',
  'chordsScaleCurrent',
  'chordsScaleSecondary',
  'chordsSectionGap',
];

    const u2 = { ...u };
    FORCE_RESET.forEach(k => delete u2[k]);

    const merged = { ...PERF_DEFAULTS, ...u2, __rev: PERF_DEFAULTS_REV };
    setState(s => {
      s.prefs = s.prefs || {};
      s.prefs.performance = merged;
    });
    return merged;
  }

  return { ...PERF_DEFAULTS, ...u };
}

function applyPerfVars(node) {
  const p = getPerfPrefs();
  const target = node?.closest('.view.view-performance') || node || document.documentElement;

  // ✅ Runtime/layout vars: imposta SOLO se il valore è valido, altrimenti rimuovi (torna al theme)
  if (Number.isFinite(p.lyricsSize))   target.style.setProperty('--lyrics-size', p.lyricsSize + 'px');
  else                                 target.style.removeProperty('--lyrics-size');

  if (Number.isFinite(p.chordsSize))   target.style.setProperty('--chords-size', p.chordsSize + 'px');
  else                                 target.style.removeProperty('--chords-size');

  if (Number.isFinite(p.lineGap))      target.style.setProperty('--line-gap', p.lineGap + 'px');
  else                                 target.style.removeProperty('--line-gap');

   const left = p.splitRatio / 50; // 50 -> 1fr, 25 -> .5fr ecc.
   const right = (100 - p.splitRatio) / 50;
  // split ratio: solo se è un numero finito (altrimenti non toccare i default)
  if (Number.isFinite(left) && Number.isFinite(right)) {
    target.style.setProperty('--perf-left', left + 'fr');
    target.style.setProperty('--perf-right', right + 'fr');
  } else {
    target.style.removeProperty('--perf-left');
    target.style.removeProperty('--perf-right');
  }

  if (Number.isFinite(p.sectionGap))   target.style.setProperty('--section-gap', p.sectionGap + 'px');
  else                                 target.style.removeProperty('--section-gap');

  if (Number.isFinite(p.lyricsOpacityDim)) target.style.setProperty('--lyrics-dim', String(p.lyricsOpacityDim));
  else                                     target.style.removeProperty('--lyrics-dim');

  if (Number.isFinite(p.chordsLineGap)) target.style.setProperty('--chords-line-gap', p.chordsLineGap + 'px');
  else                                  target.style.removeProperty('--chords-line-gap');

  if (Number.isFinite(p.chordsOpacityDim)) target.style.setProperty('--chords-dim', String(p.chordsOpacityDim));
  else                                     target.style.removeProperty('--chords-dim');

  if (Number.isFinite(p.chordsSectionGap)) target.style.setProperty('--chords-section-gap', p.chordsSectionGap + 'px');
  else                                     target.style.removeProperty('--chords-section-gap');
}
function currentSong(state) {
  const s = state || store;
  const id = s.ui?.selectedSongId || s.data?.setlist?.[0] || null;
  return id ? s.data.songs[id] : null;
}

// FIX: runtime sicuro con fallback + inizializzazione
function getRuntimeSafe() {
  let perf = store?.runtime?.performance;
  const needsInit = !perf || typeof perf.vline !== 'number';
  if (needsInit) {
    perf = {
      view: 'lyrics',   // 'lyrics' | 'chords'
      songId: null,
      vline: 0,         // indice tra le sole linee "line" per LYRICS
      choLine: 0,       // indice tra le sole linee "line" per CHORDS
      choTok: 0         // indice token nella riga CHORDS corrente
    };
    setState(s => {
      s.runtime = s.runtime || {};
      s.runtime.performance = { ...perf };
    });
  }
  return perf;
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

// Scroll morbido della riga corrente verso il centro del container
function smoothScrollToCenter(container, target, duration = 280) {
  if (!container || !target) return;
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();

  // targetCenter rispetto al viewport, vogliamo che coincida col centro del container
  const targetCenter = (tRect.top + tRect.bottom) / 2;
  const containerCenter = (cRect.top + cRect.bottom) / 2;

  const current = container.scrollTop;
  const delta = (targetCenter - containerCenter);
  const to = current + delta;

  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    // easeOutCubic
    const k = 1 - Math.pow(1 - p, 3);
    container.scrollTop = current + (to - current) * k;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}


export function renderPerformance() {
  const el = document.createElement('section');
  el.className = 'view view-performance';
  el.innerHTML = `
  <header class="view-header">
    <h2>Performance</h2>
    <div class="spacer"></div>
    <div class="performance-toolbar">
      <!-- (i pulsanti view li lasciamo, ma useremo solo Lyrics per ora) -->
      <div class="segmented" role="tablist" aria-label="View mode">
        <button class="btn ghost small" id="btn-view-lyrics" role="tab" aria-pressed="true">Lyrics</button>
        <button class="btn ghost small" id="btn-view-chords" role="tab" aria-pressed="false">Chords</button>
        <button class="btn ghost small" id="btn-view-split"  role="tab" aria-pressed="false" title="Soon" disabled>Split</button>
      </div>
    </div>
  </header>

  <div class="performance-body">
    <div class="performance-stage">
      <div class="performance-titlebar">
        <div class="performance-title" id="perf-title"></div>
        <div class="section-indicator" id="perf-section"></div>
      </div>
      <div class="lyrics" part="lyrics"></div>
      <div class="chords" part="chords" style="display:none"></div>
    </div>
  </div>
`;


const stage   = el.querySelector('.performance-stage');
const vTitle  = el.querySelector('#perf-title');
const vSec    = el.querySelector('#perf-section');
const vLyrics = el.querySelector('.lyrics');
const vChords = el.querySelector('.chords');
const $btnLyrics = el.querySelector('#btn-view-lyrics');
const $btnChords = el.querySelector('#btn-view-chords');




  function renderFromState(s) {
    applyPerfVars(el);
    const song = currentSong(s);

    if (!song) {
      vLyrics.innerHTML = '<p class="muted">Select a song in the <a href="#/setlist">Setlist</a>.</p>';
      //vChords.innerHTML = '';
      return;
    }

// Aggiorna titolo brano nell’header dello stage
vTitle.textContent = song.title || 'Untitled';

// Prepara rappresentazione visuale (line/gap)
const { visual, visualToTextIdx } = parseLyricsVisual(song.lyrics);

// Recupera runtime sicuro
const rt = getRuntimeSafe();

// Toggle viste + aria-pressed (non tocca la logica dei Lyrics)
$btnLyrics.setAttribute('aria-pressed', String(rt.view === 'lyrics'));
$btnChords.setAttribute('aria-pressed', String(rt.view === 'chords'));

if (rt.view === 'chords') {
  vLyrics.style.display = 'none';
  vChords.style.display = '';

  // 1) Normalizza e costruisci visual chords
  const chordStrings = normalizeChordsArray(song.chords);
  const { visual } = parseChordsVisual(chordStrings);

  // Se non ci sono righe utili, mostra un messaggio chiaro e interrompi
if (!visual.some(x => x.type === 'line')) {
  vChords.dataset.songId = String(song.id);
  vChords.innerHTML = `<p class="muted">No chords found in this song.</p>`;
  vTitle.textContent = song.title || 'Untitled';
  vSec.textContent = '';
  return;
}


  // 2) Rebuild se cambia brano
  const needsBuild = !vChords.dataset.songId || vChords.dataset.songId !== String(song.id);
  if (needsBuild) {
    vChords.dataset.songId = String(song.id);
    vChords.innerHTML = visual.map((item, idx) => {
      if (item.type === 'gap') return `<div class="gap"></div>`;
      const toks = chordTokens(item.text);
      const html = toks.map((t, ti) =>
        `<span class="chord-token" data-tok="${ti}">${t.text}</span>`
      ).join(' ');
      return `<div class="line" data-role="line" data-vidx="${idx}">${html || '&nbsp;'}</div>`;
    }).join('');
  }

  // 3) Inizializza / clamp indici runtime per CHORDS
  const chordLines = visual.filter(x => x.type === 'line');
  const totalChordLines = chordLines.length;
  const rtPerf = getRuntimeSafe();

  // Se è cambiato brano: resetta indici
  if (song.id !== rt.songId) {
    rt.vline = 0;
    rt.choLine = 0;   // <-- aggiunta
    rt.choTok  = 0;   // <-- aggiunta
    rt.songId  = song.id;
    setState(ss => { ss.runtime.performance = { ...rt }; });
  }

  rtPerf.choLine = clamp(rtPerf.choLine ?? 0, 0, Math.max(0, totalChordLines - 1));

  // 4) Mappa choLine -> indice VISUALE
  let targetVisualIdx = -1, count = -1;
  for (let i = 0; i < visual.length; i++) {
    if (visual[i].type === 'line') {
      count++;
      if (count === rtPerf.choLine) { targetVisualIdx = i; break; }
    }
  }
  if (targetVisualIdx < 0) {
    // fallback: prima riga utile
    targetVisualIdx = visual.findIndex(x => x.type === 'line');
  }

  // 5) Toggle della riga corrente + evidenzia token attivo
  vChords.querySelectorAll('.line.current').forEach(n => n.classList.remove('current'));
  vChords.querySelectorAll('.chord-token.now').forEach(n => n.classList.remove('now'));

  const curLineEl = vChords.children[targetVisualIdx];
  if (curLineEl) {
    curLineEl.classList.add('current');

    const toks = curLineEl.querySelectorAll('.chord-token');
    if (toks.length) {
      rtPerf.choTok = clamp(rtPerf.choTok ?? 0, 0, toks.length - 1);
      toks[rtPerf.choTok].classList.add('now');
    } else {
      rtPerf.choTok = 0;
    }

    // 6) Scroll morbido al centro (stessa funzione dei lyrics)
    smoothScrollToCenter(vChords, curLineEl, 420);
  }

  // 7) Header (titolo + section)
  vTitle.textContent = song.title || 'Untitled';
  vSec.textContent = currentSectionNameFromStrings(chordStrings, rtPerf.choLine || 0) || '';

} else {
  // Lyrics invariato
  vChords.style.display = 'none';
  vLyrics.style.display = '';
}

// Se è cambiato brano: resetta vline
if (song.id !== rt.songId) {
  rt.vline = 0;
  rt.songId = song.id;
  setState(ss => { ss.runtime.performance = { ...rt }; });
}

// Build una sola volta per canzone, poi riusa i nodi
const needRebuild = vLyrics.dataset.songId !== String(song.id);

if (needRebuild) {
  vLyrics.dataset.songId = String(song.id);
  vLyrics.innerHTML = visual.map((item, idx) => {
    if (item.type === 'gap') return `<div class="gap"></div>`;
    // mettiamo un data-role per identificare le "line"
    return `<div class="line" data-role="line" data-vidx="${idx}">${item.text || '&nbsp;'}</div>`;
  }).join('');
}

// Calcola l’indice VISUALE della riga corrente (rt.vline è tra le sole "line")
let currentVisualIdx = -1;
{
  let count = -1;
  for (let i = 0; i < visual.length; i++) {
    if (visual[i].type === 'line') {
      count++;
      if (count === rt.vline) { currentVisualIdx = i; break; }
    }
  }
}

// Toggla SOLO la classe .current (no rebuild)
// 1) togli "current" dal vecchio
const prev = vLyrics.querySelector('.line.current');
if (prev) prev.classList.remove('current');

requestAnimationFrame(() => {
  requestAnimationFrame(() => { // doppio raf per garantire layout stabile
  });
});

// 2) aggiungi "current" al nuovo, con un piccolo raf per forzare la transizione
if (currentVisualIdx >= 0) {
  const nodes = vLyrics.children;
  const cur = nodes[currentVisualIdx];

  // forza un reflow prima di aggiungere la classe, per assicurare la transizione
  // (alcuni browser ne beneficiano)
  void cur?.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cur.classList.add('current');
    });
  });

  // Scroll fluido al centro (usa il tuo helper)
  smoothScrollToCenter(vLyrics, cur, 420);
}
const name = currentSectionName(song.lyrics, rt.vline);
vSec.textContent = name || '';
  }

  // Initial render + subscribe
  const unsub = subscribe(renderFromState);
  renderFromState(store);

  // Keyboard controls (testing)
function onKey(e) {
  if (!document.body.contains(el)) return;

  const song = currentSong(store);
  if (!song) return;

  const rt = getRuntimeSafe();

  // === LYRICS: su/giù (come prima)
  if (rt.view === 'lyrics' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const { visual } = parseLyricsVisual(song.lyrics);
    const totalLines = visual.filter(item => item.type === 'line').length;
    if (totalLines === 0) return;

    if (e.key === 'ArrowUp')   rt.vline = Math.max(0, rt.vline - 1);
    if (e.key === 'ArrowDown') rt.vline = Math.min(totalLines - 1, rt.vline + 1);

    setState(s => { s.runtime.performance = { ...rt }; });
    return;
  }

  // === CHORDS: sinistra/destra con wrap automatico
  if (rt.view === 'chords' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();

    const chordStrings = normalizeChordsArray(song.chords);
    const { visual } = parseChordsVisual(chordStrings);
    const chordLines = visual.filter(x => x.type === 'line');
    if (!chordLines.length) return;

    rt.choLine = clamp(rt.choLine ?? 0, 0, chordLines.length - 1);
    const tokens = chordTokens(chordLines[rt.choLine]?.text || '');
    const lastTokIdx = Math.max(0, tokens.length - 1);

    if (e.key === 'ArrowRight') {
      if ((rt.choTok ?? 0) < lastTokIdx) {
        rt.choTok = (rt.choTok ?? 0) + 1;
      } else if (rt.choLine < chordLines.length - 1) {
        rt.choLine += 1;
        rt.choTok = 0;
      }
    } else if (e.key === 'ArrowLeft') {
      if ((rt.choTok ?? 0) > 0) {
        rt.choTok = (rt.choTok ?? 0) - 1;
      } else if (rt.choLine > 0) {
        rt.choLine -= 1;
        const prevTokens = chordTokens(chordLines[rt.choLine]?.text || '');
        rt.choTok = Math.max(0, prevTokens.length - 1);
      }
    }

    setState(s => { s.runtime.performance = { ...rt }; });
    return;
  }
}

window.addEventListener('keydown', onKey);

$btnLyrics.addEventListener('click', () => {
  const rt = getRuntimeSafe();
  if (rt.view !== 'lyrics') {
    setState(s => { s.runtime.performance.view = 'lyrics'; });
  }
});

$btnChords.addEventListener('click', () => {
  const rt = getRuntimeSafe();
  if (rt.view !== 'chords') {
    setState(s => { s.runtime.performance.view = 'chords'; });
  }
});


  // Cleanup
  el.addEventListener('DOMNodeRemoved', (e) => {
    if (e.target === el) {
      unsub();
      window.removeEventListener('keydown', onKey);
    }
  });

  return el;
}
