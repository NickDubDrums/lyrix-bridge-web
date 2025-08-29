// web/js/pages/setlist.js
import { store, setState, subscribe, addDemoToStore } from '../state/store.js';
import { createEditorPanel } from '../ui/editorPanel.js';
import { makeSortable } from '../ui/dragdrop.js';


export function renderSetlist() {
  const wrap = document.createElement('section');
  wrap.className = 'view view-setlist';

  // ───────────────── Header con transport ─────────────────
  const header = document.createElement('header');
  header.className = 'view-header';
  header.innerHTML = `
    <h2>Setlist</h2>
    <div class="transport">
      <button id="btn-prev" class="icon-button" title="Previous Song">⏮︎</button>
      <button id="btn-play" class="icon-button" title="Play/Pause">▶︎</button>
      <button id="btn-stop" class="icon-button" title="Stop">⏹</button>
      <button id="btn-next" class="icon-button" title="Next Song">⏭︎</button>
    </div>
    <div class="spacer"></div>
    <button id="btn-add" class="btn primary">+ Add Song</button>
  `;
  const btnPrev = header.querySelector('#btn-prev');
  const btnPlay = header.querySelector('#btn-play');
  const btnStop = header.querySelector('#btn-stop');
  const btnNext = header.querySelector('#btn-next');



  // Allinea SUBITO l’icona Play/Pause allo stato corrente (fix quando apri l’editor)
  btnPlay.textContent = store.runtime.transport.playing ? '⏸' : '▶︎';

  // ───────────────── Helpers ─────────────────
function ensureSelected() {
  const ids = (store.data.setlist || []).map(nId);
  if (ids.length && !store.ui.selectedSongId) {
    setState(s => { s.ui.selectedSongId = ids[0]; s.ui.editorSongId = ids[0] ?? null; });
  }
}

  function durSecOf(song) {
    const sec = Number(song?.duration ?? 0);
    return Number.isFinite(sec) && sec > 0 ? sec : 180; // fallback 3:00
  }
// ── Icons for Loop Exit (tutte a currentColor)
const ICON_LOOP_FINISH = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" aria-hidden="true" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M6 8a.5.5 0 0 0 .5.5h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L12.293 7.5H6.5A.5.5 0 0 0 6 8m-2.5 7a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 1 0v13a.5.5 0 0 1-.5.5"/>
</svg>`;
const ICON_LOOP_BAR = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" aria-hidden="true" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M4.146 3.646a.5.5 0 0 0 0 .708L7.793 8l-3.647 3.646a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708 0M11.5 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5"/>
</svg>`;
const ICON_LOOP_INSTANT = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" aria-hidden="true" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M3.646 14.854a.5.5 0 0 0 .708 0L8 11.207l3.646 3.647a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 0 0 0 .708m0-13.708a.5.5 0 0 1 .708 0L8 4.793l3.646-3.647a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 0-.708M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8"/>
</svg>`;

// Normalizza il valore di loopExit: 'finish' | 'bar' | 'instant'
function getLoopExit(song) {
  const raw = (song?.arranger?.loopExit ?? 'finish').toString().trim().toLowerCase();
  if (raw === 'instant') return 'instant';
  if (raw === 'bar' || raw === '1 bar' || raw === '1bar') return 'bar';
  // 'finish', 'end', 'at end of loop', ecc. -> finish
  if (raw === 'finish' || raw === 'end' || raw === 'at end of loop' || raw === 'endofloop') return 'finish';
  return 'finish';
}


function behaviorBadge(song) {
  const mode = song?.arranger?.mode || 'JumpToNext';
  const reps = song?.arranger?.repeats;

  // SOLO per Jump/Stop mostriamo ×N se >1; in Loop niente numeri
  const repText = (mode === 'LoopSection')
    ? ''
    : (reps && Number(reps) > 1 ? `×${Number(reps)}` : '');

  if (mode === 'LoopSection') {
    // LOOP: doppia icona (loop + exit)
    const exit = getLoopExit(song); // 'finish' | 'bar' | 'instant'
    const exitIcon = exit === 'instant' ? ICON_LOOP_INSTANT
                  : exit === 'bar'     ? ICON_LOOP_BAR
                  :                      ICON_LOOP_FINISH;

    // tua icona loop + icona exit; stesso colore (fill=currentColor)
    const loopIcon = `
      <svg class="icon loop-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M 7.59375 3 L 9.0625 5 L 13 5 C 16.324219 5 19 7.675781 19 11 L 19 15 L 16 15 L 20 20.46875 L 24 15 L 21 15 L 21 11 C 21 6.59375 17.40625 3 13 3 Z M 4 3.53125 L 0 9 L 3 9 L 3 13 C 3 17.40625 6.59375 21 11 21 L 16.40625 21 L 14.9375 19 L 11 19 C 7.675781 19 5 16.324219 5 13 L 5 9 L 8 9 Z"></path>
      </svg>`;

    return `<span class="behavior-badge is-loop" title="Loop: ${exit}">
      ${loopIcon}${exitIcon}
    </span>`;
  }

  // Jump/Stop → icona + (eventuale) ×N
  const iconHtml = (mode === 'StopAtEnd') ? '⏸' : '⏭︎';
  return `<span class="behavior-badge" title="${mode}">
    ${iconHtml}${repText ? `<span class="rep">${repText}</span>` : ''}
  </span>`;
}


  function formatMMSS(sec) {
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
  }

  const nId = v => String(v ?? '');

  // evidenzia la selected
function highlightSelection() {
  const want = nId(store.ui.selectedSongId);
  for (const [id, refs] of itemEls) {
    refs.item.classList.toggle('selected', id === want);
  }
}

  // Aggiorna la classe "selected" direttamente nel DOM (robusto anche se itemEls è stale)
function highlightSelectionDOM() {
  // Prendi il contenitore sempre dal DOM, anche se 'body' non è ancora creato in questo scope
  const container = wrap.querySelector('.setlist-body');
  if (!container) return;
  const want = String(store.ui.selectedSongId ?? '');
  const list = container.querySelectorAll('.song-item');
  list.forEach(el => {
    el.classList.toggle('selected', (el.dataset.id || '') === want);
  });
}


// Evidenzia "in coda" (blinking) nel DOM
function highlightQueuedDOM() {
  // Rende robusto: cerca sempre nel pannello setlist
  const container = document.querySelector('.view-setlist .setlist-body') || document;
  const queued = String(store.runtime.transport?.queuedSongId ?? '');
  const els = container.querySelectorAll('[data-id]');
  els.forEach(el => {
    const isQueued = (String(el.dataset.id || '') === queued);
    if (isQueued) el.classList.add('queued');
    else el.classList.remove('queued');
  });
}



// Seleziona IMMEDIATAMENTE nel DOM la song con id dato (senza aspettare il render)
function forceSelectNow(id) {
  const container = wrap.querySelector('.setlist-body');
  if (!container) return;
  const want = String(id ?? '');
  container.querySelectorAll('.song-item').forEach(el => {
    el.classList.toggle('selected', (el.dataset.id || '') === want);
  });
}




  // ────────────── Stato pausa ──────────────
  function clearPauseState() {
    setState(s => {
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    });
  }

  // STOP hard: azzera tutto e reset barre
  function hardStop() {
    setState(s => {
      s.runtime.transport.playing = false;
      s.runtime.transport.playingSongId = null;
      s.runtime.transport.startedAt = 0;
      s.runtime.transport.loopCount = 0;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    });
    btnPlay.textContent = '▶︎';
    // reset visivo immediato
    for (const { progress, item } of itemEls.values()) {
      if (!progress) continue;
      progress.style.clipPath = 'inset(0 100% 0 0)';
      item.classList.remove('playing');
    }
    updateProgressImmediate();
    highlightSelectionDOM(); // <— NEW
    highlightQueuedDOM();

  }

  // Play/Pause con resume intelligente
  function setPlaying(on) {
    const wasPlaying = store.runtime.transport.playing;
    const now = performance.now();

    setState(s => {
      if (on && !wasPlaying) {
        const ids = (s.data.setlist || []).map(nId);
        const sel = nId(s.ui.selectedSongId || ids[0] || null);


        // resume se pausa della stessa song
        if (s.runtime.transport.pausedSongId === sel && (s.runtime.transport.pausedElapsedMs || 0) > 0) {
          s.runtime.transport.playing = true;
          s.runtime.transport.playingSongId = sel;
          s.runtime.transport.startedAt = now - s.runtime.transport.pausedElapsedMs;
          s.runtime.transport.loopCount = 0;
          s.runtime.transport.pendingNextAfterLoop = false;
          s.runtime.transport.pausedSongId = null;
          s.runtime.transport.pausedElapsedMs = 0;
          // assicurati che la selected segua
          s.ui.selectedSongId = sel;
          s.ui.editorSongId = sel;
          return;
        }

        // start da zero sulla selected
        s.ui.selectedSongId = sel;
        s.ui.editorSongId = sel;
        s.runtime.transport.playing = true;
        s.runtime.transport.playingSongId = sel;
        s.runtime.transport.startedAt = now;
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
        return;
      }

      // pausa: salva posizione
      if (!on && wasPlaying) {
        const elapsed = Math.max(0, now - (s.runtime.transport.startedAt || 0));
        s.runtime.transport.pausedSongId = s.runtime.transport.playingSongId;
        s.runtime.transport.pausedElapsedMs = elapsed;
        s.runtime.transport.playing = false;
        s.runtime.transport.playingSongId = null;
        s.runtime.transport.startedAt = 0;
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        return;
      }
      // stop già fermo → non fare nada (usiamo hardStop per lo stop vero)
    });

    btnPlay.textContent = on ? '⏸' : '▶︎';
    highlightSelection();
    highlightSelectionDOM(); // <— NEW
    highlightQueuedDOM();
    updateProgressImmediate();
  }

function selectSongByDelta(delta, { keepPlayState = true } = {}) {
  const ids = (store.data.setlist || []).map(nId);
  if (!ids.length) return;

  const fallbackId = nId(store.ui.selectedSongId ?? ids[0]);
  const baseId = nId(store.runtime.transport.playingSongId ?? fallbackId);

  const idx = Math.max(0, ids.indexOf(baseId));
  const nextIdx = Math.max(0, Math.min(ids.length - 1, idx + delta));
  const nextId = ids[nextIdx];

  const wasPlaying = store.runtime.transport.playing;

  setState(s => {
    s.ui.selectedSongId = nextId;
    s.ui.editorSongId = nextId;
    if (!wasPlaying) {
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    }
  });

    // Forza subito l’highlight sul DOM (utile anche a editor chiuso)
    forceSelectNow(nextId);


  if (keepPlayState && wasPlaying) {
    setState(s => {
      s.runtime.transport.playingSongId = nextId;
      s.runtime.transport.startedAt = performance.now();
      s.runtime.transport.loopCount = 0;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    });
    updateProgressImmediate();
  }

  if (store.ui.editorOpen) openEditor(nextId);
  highlightSelection();
  highlightSelectionDOM();
  highlightQueuedDOM();
  // TODO: DAW -> Program Change
}

  // ───────────────── Layout: sidebar + editor ─────────────────
  const layout = document.createElement('div');
  layout.className = 'setlist-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'setlist-sidebar';

  const body = document.createElement('div');
  body.className = 'setlist-body';
  sidebar.appendChild(body);

  // Mappa per aggiornare rapidamente progress e selezione
  const itemEls = new Map();

  // Lista o stato vuoto con demo
  if (!store.data.setlist || store.data.setlist.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <p class="muted">Nessun brano in setlist.</p>
      <div class="actions"><button id="btn-load-demo" class="btn">Load Demo Content</button></div>
    `;
    empty.querySelector('#btn-load-demo')?.addEventListener('click', () => {
      addDemoToStore();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    body.appendChild(empty);
  } else {
    ensureSelected();
    store.data.setlist.forEach((id) => {
      const song = store.data.songs[id];
      if (!song) return;

      const item = document.createElement('div');
      item.className = 'song-item';
      item.dataset.id = id;
      if (store.ui.selectedSongId === id) item.classList.add('selected');

      // Abilita drag & drop sulla lista
    makeSortable(body, {
      itemSelector: '.song-item',
      handleSelector: '.drag-handle',
      longPressMs: 250,
      onReorder: (ids) => {
        // Mantieni solo id validi che esistono nei songs
        const next = ids.filter(id => id && store.data.songs[id]);
        setState(s => { s.data.setlist = next; });
      }
    });


      // progress overlay
      const progress = document.createElement('div');
      progress.className = 'song-progress';
      item.appendChild(progress);

      // drag handle
      const handle = document.createElement('button');
      handle.className = 'drag-handle';
      handle.title = 'Drag to reorder';
      handle.setAttribute('aria-label', 'Drag to reorder');
      handle.textContent = '⋮⋮';
      item.appendChild(handle);


      // meta
      const meta = document.createElement('div');
      meta.className = 'song-meta';
      meta.innerHTML = `
        <strong>${song.title}</strong>
        <span class="muted">
          ${song.bpm ?? '—'} BPM · ${song.duration ? formatMMSS(song.duration) : '—:—'}
          ${behaviorBadge(song)}
        </span>
      `;
      item.appendChild(meta);

      // edit button
      const edit = document.createElement('button');
      edit.className = 'icon-button edit-btn';
      edit.title = 'Edit';
      edit.textContent = '✎';
      edit.addEventListener('click', (e) => { e.stopPropagation(); openEditor(id); });
      item.appendChild(edit);

      // click/dblclick
      item.addEventListener('click', () => {
        const wasPlaying = store.runtime.transport.playing;
        const pausedId = store.runtime.transport.pausedSongId;
        setState(s => { s.ui.selectedSongId = id; s.ui.editorSongId = id; });

        // ── Se siamo in LoopSection, gestiamo le 3 sotto-modalità:
const current = store.data.songs[store.runtime.transport.playingSongId ?? ''];
const loopMode = current?.arranger?.mode === 'LoopSection';
if (store.runtime.transport.playing && loopMode) {
const loopExit = getLoopExit(current);
  if (loopExit === 'instant') {
    // switch immediato
    const now = performance.now();
    setState(s => {
      s.ui.selectedSongId = id; s.ui.editorSongId = id;
      s.runtime.transport.playingSongId = id;
      s.runtime.transport.startedAt = now;
      s.runtime.transport.loopCount = 0;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.queuedSongId = null;
      s.runtime.transport.barSwitchAtMs = null;
      s.runtime.transport.loopExitMode = 'instant';
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    });
    forceSelectNow(id);
    highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
    updateProgressImmediate();
    return; // ← niente altro
  }

  // finish | bar → metti in coda e arma l’uscita
  setState(s => {
    s.ui.selectedSongId = id; s.ui.editorSongId = id; // visivamente selezionata
    s.runtime.transport.pendingNextAfterLoop = true;
    s.runtime.transport.queuedSongId = id;
    s.runtime.transport.loopExitMode = loopExit;
    // calcoleremo barSwitchAtMs in updateProgress
  });
  forceSelectNow(id);
  highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
  return; // ← in loop non switchiamo subito (tranne instant)
}


        if (wasPlaying) {
          // cambi subito il brano in play e resetti barra
          setState(s => {
            s.runtime.transport.playingSongId = id;
            s.runtime.transport.startedAt = performance.now();
            s.runtime.transport.loopCount = 0;
            s.runtime.transport.pendingNextAfterLoop = false;
            s.runtime.transport.pausedSongId = null;
            s.runtime.transport.pausedElapsedMs = 0;
          });
          updateProgressImmediate();
        } else {
          // in pausa: se cambi selezione, resetta l’immagine di pausa
          if (pausedId && pausedId !== id) clearPauseState();
          updateProgressImmediate();
        }

        highlightSelection();
        highlightSelectionDOM();
        highlightQueuedDOM();
      });

      item.addEventListener('dblclick', () => openEditor(id));

      body.appendChild(item);
      itemEls.set(nId(id), { item, progress });
    });

    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
  }

  // Host editor (a destra)
  const editorHost = document.createElement('div');
  editorHost.className = 'editor-host';

  function openEditor(songId) {
    setState(s => {
      s.ui.editorOpen = true;
      s.ui.editorSongId = songId;
      s.ui.selectedSongId = songId;
    });
    location.hash = `#/setlist/${songId}/edit`;
    renderEditor();
    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
  }


  function closeEditor() {
    setState(s => { s.ui.editorOpen = false; s.ui.editorSongId = null; });
    location.hash = '#/setlist';
    renderEditor();
  }

  function renderEditor() {
    editorHost.replaceChildren();

    if (!store.ui.editorOpen || !store.ui.editorSongId) {
      wrap.classList.remove('split');
      if (editorHost.isConnected) editorHost.remove();
      return;
    }
    const song = store.data.songs[store.ui.editorSongId];
    if (!song) { closeEditor(); return; }

    if (!editorHost.isConnected) layout.appendChild(editorHost);
    editorHost.classList.remove('enter');

    const panel = createEditorPanel(song, { readOnly: store.ui.lock });
    editorHost.appendChild(panel);

    // Reflow chiuso
    // eslint-disable-next-line no-unused-expressions
    editorHost.offsetWidth;

    // Attiva split + fade/slide
    wrap.classList.add('split');
    // eslint-disable-next-line no-unused-expressions
    editorHost.offsetWidth;
    editorHost.classList.add('enter');
  }

  // ───────────────── Transport wiring ─────────────────
function onNextClick() {
  if (store.ui.lock) return;

  const t = store.runtime.transport;
  const playing = !!t.playing && !!t.playingSongId;
  const currentId = nId(t.playingSongId || store.ui.selectedSongId);
  const current = store.data.songs[currentId];

  // Se non stiamo suonando o non siamo in loop → comportamento standard
  if (!playing || !current || (current?.arranger?.mode !== 'LoopSection' && current?.arranger?.mode !== 'Loop')) {
    const keep = store.runtime.transport.playing;
    selectSongByDelta(+1, { keepPlayState: keep });
    return;
  }

  // Siamo in Loop: rispetta loopExit
  const loopExit = getLoopExit(current);
  const ids = (store.data.setlist || []).map(nId);
  const baseIdx = Math.max(0, ids.indexOf(currentId));
  const nextIdx = Math.max(0, Math.min(ids.length - 1, baseIdx + 1));
  const nextId = ids[nextIdx];

  if (loopExit === 'instant') {
    // Switch immediato
    const keep = true;
    setState(s => {
      s.ui.selectedSongId = nextId;
      s.ui.editorSongId = nextId;
    });
    forceSelectNow(nextId);
    selectSongByDelta(+1, { keepPlayState: keep });
    // pulizia coda/flag
    setState(s => {
      s.runtime.transport.queuedSongId = null;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.barSwitchAtMs = null;
      s.runtime.transport.loopExitMode = 'instant';
    });
    highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
    return;
  }

  // finish | bar → metti in coda e arma l'uscita (non switchare ora)
  setState(s => {
    s.runtime.transport.pendingNextAfterLoop = true;
    s.runtime.transport.queuedSongId = nextId;
    s.runtime.transport.loopExitMode = loopExit; // serve a updateProgress per 'bar'
    s.ui.selectedSongId = nextId; // vedo già selezionata la prossima
    s.ui.editorSongId = nextId;
  });
  forceSelectNow(nextId);
  highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
}

  function onPrevClick() {
    if (store.ui.lock) return; // lock anche per click
    const keep = store.runtime.transport.playing;
    selectSongByDelta(-1, { keepPlayState: keep });
  }

  btnPrev?.addEventListener('click', onPrevClick);
  btnNext?.addEventListener('click', onNextClick);
  btnPlay?.addEventListener('click', () => {
    if (store.ui.lock) return;
    setPlaying(!store.runtime.transport.playing);
  });
  btnStop?.addEventListener('click', () => {
    if (store.ui.lock) return;
    hardStop();
  });

  // Disabilita transport in lock SUBITO e poi reattivo
  const applyLockToTransport = () => {
    const dis = !!store.ui.lock;
    [btnPrev, btnPlay, btnStop, btnNext].forEach(b => b && (b.disabled = dis));
  };
  applyLockToTransport();
  const unsubscribeLock = subscribe(() => applyLockToTransport());

  // Eventi globali (space, ctrl+arrows) -> emessi da shell.js
  if (window.__lyrixPlayHandler) window.removeEventListener('lyrix:togglePlay', window.__lyrixPlayHandler);
  window.__lyrixPlayHandler = () => {
    if (store.ui.lock) return; // lock anche per shortcut
    setPlaying(!store.runtime.transport.playing);
  };
  window.addEventListener('lyrix:togglePlay', window.__lyrixPlayHandler);

  if (window.__lyrixNavHandler) window.removeEventListener('lyrix:navigateSong', window.__lyrixNavHandler);
  window.__lyrixNavHandler = (ev) => {
    if (store.ui.lock) return; // lock anche per shortcut
    const { delta = 0 } = ev.detail || {};
  
    // Usa la stessa logica dei bottoni, così rispettiamo LoopExit.
    if (delta > 0) {
      for (let i = 0; i < delta; i++) onNextClick();
      return;
    }
    if (delta < 0) {
      for (let i = 0; i < Math.abs(delta); i++) onPrevClick();
      return;
    }
    // delta = 0 => no-op
  };
  window.addEventListener('lyrix:navigateSong', window.__lyrixNavHandler);


  // ───────────────── Progress bar anim + sync selected↔playing ─────────────────
  let rafId = 0;
  let lastAlignedPlayingId = null; // evita riallineamenti ripetuti

function updateProgress() {
  rafId = requestAnimationFrame(updateProgress);

  const t = store.runtime.transport;

  // NON in play → mostra fermo immagine se in pausa, reset altrimenti
  if (!t.playing || !t.playingSongId) {
    lastAlignedPlayingId = null;
    const pausedId = store.runtime.transport.pausedSongId;
    const pausedMs = store.runtime.transport.pausedElapsedMs || 0;

    for (const [id, refs] of itemEls) {
      if (!refs?.progress) continue;

      if (pausedId && nId(id) === nId(pausedId) && pausedMs > 0) {
        const song = store.data.songs[id];
        const durMs = durSecOf(song) * 1000;
        const ratio = Math.min(1, pausedMs / durMs);
        const right = `${Math.max(0, 100 - ratio * 100)}%`;
        refs.progress.style.clipPath = `inset(0 ${right} 0 0)`;
      } else {
        refs.progress.style.clipPath = 'inset(0 100% 0 0)';
      }
      refs.item.classList.remove('playing');
    }
    return;
  }

  // In play → reset dei NON correnti, aggiorna solo il corrente
  for (const [id, refs] of itemEls) {
    if (!refs?.progress) continue;
    if (id !== nId(t.playingSongId)) {
      refs.progress.style.clipPath = 'inset(0 100% 0 0)';
      refs.item.classList.remove('playing');
    }
  }

  // === IMPORTANTE: definisci song PRIMA di usarla nel blocco 'bar' ===
  const song = store.data.songs[t.playingSongId];
  if (!song) return;

  // ── Gestione loopExit 'bar': stacca alla prossima boundary di battuta
  if (
    store.runtime.transport.pendingNextAfterLoop &&
    store.runtime.transport.loopExitMode === 'bar' &&
    store.runtime.transport.queuedSongId
  ) {
    const bpm = Number(song?.bpm || 0);
    const meterNum = Number(song?.meter?.num || 4); // default 4/4
    const meterDen = Number(song?.meter?.den || 4);

    if (bpm > 0 && meterNum > 0 && meterDen > 0) {
      const beatMs = 60000 / bpm;
      const barMs = beatMs * meterNum; // 4/4 ⇒ 4 beats
      // calcola barSwitchAtMs una volta sola
      if (!store.runtime.transport.barSwitchAtMs) {
        const start = t.startedAt || performance.now();
        const k = Math.ceil((performance.now() - start) / barMs);
        const at = start + k * barMs;
        setState(s => { s.runtime.transport.barSwitchAtMs = at; });
      }
      if (performance.now() >= (store.runtime.transport.barSwitchAtMs || 0)) {
        // switch alla queued subito
        const qid = nId(store.runtime.transport.queuedSongId);
        setState(s => {
          s.runtime.transport.playingSongId = qid;
          s.runtime.transport.startedAt = performance.now();
          s.runtime.transport.loopCount = 0;
          s.runtime.transport.pendingNextAfterLoop = false;
          s.runtime.transport.queuedSongId = null;
          s.runtime.transport.barSwitchAtMs = null;
          s.runtime.transport.pausedSongId = null;
          s.runtime.transport.pausedElapsedMs = 0;
        });
        forceSelectNow(qid);
        setState(s => { s.ui.selectedSongId = qid; s.ui.editorSongId = qid; });
        highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
        updateProgressImmediate();
        return; // abbiamo già switched
      }
    } else {
      // Fallback: se non abbiamo BPM/metro → comportati come 'finish'
      // (rimani armato per fine loop e passerai in handleSongEndBehavior)
    }
  }

  // NEW: assicurati che la riga in play sia anche visualmente "selected"
  forceSelectNow(nId(t.playingSongId));

  // 🔁 SYNC LIVE: se cambia la song in play, aggiorna anche la selected
  if (
    t.playingSongId &&
    nId(store.ui.selectedSongId) !== nId(t.playingSongId) &&
    lastAlignedPlayingId !== nId(t.playingSongId)
  ) {
    lastAlignedPlayingId = nId(t.playingSongId);
    const pid = nId(t.playingSongId);
    setState(s => { s.ui.selectedSongId = pid; s.ui.editorSongId = pid; });
    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
  }

  const duration = durSecOf(song) * 1000;
  const elapsed = Math.max(0, performance.now() - t.startedAt);
  const ratio = Math.min(1, elapsed / duration);

  const refs = itemEls.get(nId(t.playingSongId));
  if (refs?.progress) {
    refs.item.classList.add('playing');
    const right = `${Math.max(0, 100 - ratio * 100)}%`;
    refs.progress.style.clipPath = `inset(0 ${right} 0 0)`;
  }

  if (ratio >= 1) {
    handleSongEndBehavior(song);
  }
}

  function updateProgressImmediate() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(updateProgress);
  }

function handleSongEndBehavior(song) {
  const mode = song?.arranger?.mode || 'JumpToNext';
  const repsRaw = song?.arranger?.repeats;
  const reps = Number.isFinite(Number(repsRaw)) ? Number(repsRaw) : 1;

  // Helper: restart current song from the beginning, keep playing
  function restartCurrentFromZero() {
    setState(s => {
      s.runtime.transport.startedAt = performance.now();
    });
    updateProgressImmediate();
  }

  // LOOP SECTION: unchanged (supports finite loops and "pending next after loop")
// ───────────────── Loop: ignora sempre repeats, loop infinito ─────────────────
if (song?.arranger?.mode === 'LoopSection' || song?.arranger?.mode === 'Loop') {
  const loopExit = (song?.arranger?.loopExit || 'finish'); // 'finish' | 'bar' | 'instant'

  // Helper locale per riavviare subito il brano corrente
  function restartCurrentFromZero() {
    setState(s => {
      s.runtime.transport.startedAt = performance.now();
      // reset contatori che non servono in loop puro
      s.runtime.transport.loopCount = 0;
    });
    updateProgressImmediate();
  }

  // 'instant' non dovrebbe arrivare qui (già gestito su click/next).
  // Se capita, fallback: passa subito al prossimo e continua a suonare.
  if (loopExit === 'instant') {
    selectSongByDelta(+1, { keepPlayState: true });
    const pid = nId(store.runtime.transport.playingSongId);
    forceSelectNow(pid);
    setState(s => {
      s.ui.selectedSongId = pid;
      s.ui.editorSongId = pid;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.queuedSongId = null;
      s.runtime.transport.barSwitchAtMs = null;
      s.runtime.transport.loopExitMode = 'instant';
    });
    highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
    updateProgressImmediate();
    return;
  }

  // Se abbiamo armato un'uscita (utente ha cliccato Next o selezionato una canzone)
  // allora allo "Stop" del loop corrente passiamo a queued (se c'è) o al next.
  if (store.runtime.transport.pendingNextAfterLoop) {
    const qid = nId(store.runtime.transport.queuedSongId);
    if (qid) {
      setState(s => {
        s.runtime.transport.playingSongId = qid;
        s.runtime.transport.startedAt = performance.now();
        s.runtime.transport.pendingNextAfterLoop = false;
        s.runtime.transport.queuedSongId = null;
        s.runtime.transport.barSwitchAtMs = null;
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
      });
      forceSelectNow(qid);
      setState(s => { s.ui.selectedSongId = qid; s.ui.editorSongId = qid; });
      highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
      updateProgressImmediate();
      return;
    }

    // nessuna queued → passa al prossimo
    selectSongByDelta(+1, { keepPlayState: true });
    const pid = nId(store.runtime.transport.playingSongId);
    forceSelectNow(pid);
    setState(s => {
      s.ui.selectedSongId = pid; s.ui.editorSongId = pid;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.barSwitchAtMs = null;
      s.runtime.transport.loopExitMode = loopExit;
    });
    highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
    updateProgressImmediate();
    return;
  }

  // Nessuna uscita armata: loop infinito → riavvia il brano da capo
  // NB: per 'bar' lo stacco avviene in updateProgress(); se arriviamo qui
  // significa che non c'era coda armata, quindi continuiamo a loopare.
  restartCurrentFromZero();
  return;
}

  // JUMP/STOP: gestisci ripetizioni n (default 1 = nessuna ripetizione)
  const currentCount = Number(store.runtime.transport.loopCount || 0);
  const nextCount = currentCount + 1;

  // Se dobbiamo ripetere il brano (non LoopSection)
  if (reps > 1 && nextCount < reps) {
    setState(s => { s.runtime.transport.loopCount = nextCount; });
    restartCurrentFromZero();
    return;
  }

  // Fine ultima ripetizione
if (mode === 'StopAtEnd') {
    // Seleziona il prossimo brano e metti in pausa (pronto a Play)
    const ids = (store.data.setlist || []).map(nId);
    if (ids.length) {
      const baseId = nId(store.runtime.transport.playingSongId || store.ui.selectedSongId || ids[0]);
      const idx = Math.max(0, ids.indexOf(baseId));
      const nextIdx = Math.max(0, Math.min(ids.length - 1, idx + 1));
      const nextId = ids[nextIdx];

      setState(s => {
        s.runtime.transport.playing = false;
        s.runtime.transport.playingSongId = null;
        s.runtime.transport.startedAt = 0;
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
        s.ui.selectedSongId = nextId;
        s.ui.editorSongId = nextId;
      });

      // ⬇️ Forza subito la selezione anche a DOM (fix visivo)
      forceSelectNow(nextId);

      highlightSelection();
      highlightSelectionDOM();
      highlightQueuedDOM();
    } else {
      hardStop();
    }
    return;
  }

  // Default: JumpToNext → passa alla successiva e continua a suonare
  selectSongByDelta(+1, { keepPlayState: true });

  // Forza subito la selected sul DOM + stato
  const pidNext = nId(store.runtime.transport.playingSongId);
  forceSelectNow(pidNext);
  setState(s => { s.ui.selectedSongId = pidNext; s.ui.editorSongId = pidNext; });
  highlightSelection();
  highlightSelectionDOM();
  highlightQueuedDOM();
}

  // ───────────────── Mount ─────────────────
  layout.append(sidebar, editorHost);
  wrap.append(header, layout);

  // Se atterri direttamente su /edit, apri subito
  if (store.ui.route.startsWith('#/setlist/') && store.ui.route.endsWith('/edit')) {
    const songId = store.ui.route.split('/')[2];
    if (songId) setTimeout(() => openEditor(songId), 0);
  }

  // Avvia il loop di progress
  updateProgressImmediate();

  // Mantieni l’icona Play/Pause sempre coerente allo stato (anche se riapri l’editor)
  const unsubPlayIcon = subscribe(s => {
    if (!btnPlay) return;
    btnPlay.textContent = s.runtime.transport.playing ? '⏸' : '▶︎';
  });

  // Cleanup quando la view viene smontata
  wrap.addEventListener('DOMNodeRemoved', (e) => {
    if (e.target === wrap) {
      cancelAnimationFrame(rafId);
      unsubscribeLock?.();
      unsubPlayIcon?.();
      if (window.__lyrixPlayHandler) window.removeEventListener('lyrix:togglePlay', window.__lyrixPlayHandler);
      if (window.__lyrixNavHandler) window.removeEventListener('lyrix:navigateSong', window.__lyrixNavHandler);
      window.__lyrixPlayHandler = null;
      window.__lyrixNavHandler = null;
    }
  });

  return wrap;
}
