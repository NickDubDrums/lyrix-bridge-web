// web/js/pages/performance.js
import { store, setState, subscribe } from '../state/store.js';

// Riconosce linee tipo [Verse], [Chorus 2], ecc.
const RE_SECTION = /^\s*\[[^\]]+\]\s*$/;

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


function getPerfPrefs() {
  const p = store.prefs?.performance || {};
  return {
    lyricsSize: p.lyricsSize ?? 42,
    chordsSize: p.chordsSize ?? 28,
    textColor: p.textColor ?? '#f2f2f2',
    currentColor: p.currentColor ?? '#ffffff',
    bgColor: p.bgColor ?? '#101014',
    lineGap: p.lineGap ?? 40,
    splitRatio: p.splitRatio ?? 50,
    splitEnabled: p.splitEnabled ?? true,
  };
}

function applyPerfVars(node) {
  const p = getPerfPrefs();
  node.style.setProperty('--lyrics-size', p.lyricsSize + 'px');
  node.style.setProperty('--chords-size', p.chordsSize + 'px');
  node.style.setProperty('--perf-fg', p.textColor);
  node.style.setProperty('--current-fg', p.currentColor);
  node.style.setProperty('--perf-bg', p.bgColor);
  node.style.setProperty('--line-gap', p.lineGap + 'px');
  const left = p.splitRatio / 50; // 50 -> 1fr, 25 -> .5fr ecc.
  const right = (100 - p.splitRatio) / 50;
  node.style.setProperty('--perf-left', left + 'fr');
  node.style.setProperty('--perf-right', right + 'fr');
  node.style.setProperty('--section-gap', (p.sectionGap ?? 28) + 'px');
  node.style.setProperty('--lyrics-dim', String(p.lyricsOpacityDim ?? 0.28));
  node.style.setProperty('--lyrics-current-scale', String(p.lyricsScaleCurrent ?? 1.06));

}

function currentSong(state) {
  const s = state || store;
  const id = s.ui?.selectedSongId || s.data?.setlist?.[0] || null;
  return id ? s.data.songs[id] : null;
}

// FIX: runtime sicuro con fallback + inizializzazione
function getRuntimeSafe() {
  let perf = store?.runtime?.performance;
  const needsInit = !perf || typeof perf.vline !== 'number'; // 'vline' = indice visuale
  if (needsInit) {
    perf = { vline: 0, songId: null };
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
        <button class="btn ghost small" id="btn-view-chords" role="tab" aria-pressed="false" title="Soon" disabled>Chords</button>
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
    </div>
  </div>
`;


const stage   = el.querySelector('.performance-stage');
const vTitle  = el.querySelector('#perf-title');
const vSec    = el.querySelector('#perf-section');
const vLyrics = el.querySelector('.lyrics');



  function renderFromState(s) {
    applyPerfVars(stage);
    const song = currentSong(s);

    if (!song) {
      vLyrics.innerHTML = '<p class="muted">Seleziona una song nella Setlist.</p>';
      //vChords.innerHTML = '';
      return;
    }

// Aggiorna titolo brano nell’header dello stage
vTitle.textContent = song.title || 'Untitled';

// Prepara rappresentazione visuale (line/gap)
const { visual, visualToTextIdx } = parseLyricsVisual(song.lyrics);

// Recupera runtime sicuro
const rt = getRuntimeSafe();

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

  // Consideriamo solo su/giù per Lyrics testing
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

  const song = currentSong(store);
  if (!song) return;
  e.preventDefault();

  const { visual } = parseLyricsVisual(song.lyrics);
  const totalLines = visual.filter(item => item.type === 'line').length;

  if (totalLines === 0) return;

  const rt = getRuntimeSafe();
  if (e.key === 'ArrowUp') {
    rt.vline = Math.max(0, rt.vline - 1);
  } else {
    rt.vline = Math.min(totalLines - 1, rt.vline + 1);
  }
  setState(s => { s.runtime.performance = { ...rt }; });
}

window.addEventListener('keydown', onKey);

  // Cleanup
  el.addEventListener('DOMNodeRemoved', (e) => {
    if (e.target === el) {
      unsub();
      window.removeEventListener('keydown', onKey);
    }
  });

  return el;
}
