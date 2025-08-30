// web/js/pages/setlist.js
import {
  store, setState, subscribe, addDemoToStore,
  addSong, removeSong,
  exportSetlistJSON, importSongJSON, importSetlistJSON
} from '../state/store.js';

import { createEditorPanel } from '../ui/editorPanel.js';
import { makeSortable } from '../ui/dragdrop.js';
import { modalAlert, modalConfirm, modalPrompt } from '../ui/modals.js';


export function renderSetlist() {
  const wrap = document.createElement('section');
  wrap.className = 'view view-setlist';

  function isLocked() {
  const s = store?.getState ? store.getState() : store.state;
  return !!s?.ui?.lock;
}

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
    <div class="setlist-tools">
          <button id="btn-add-song" class="btn">+ Add Song</button>
          <button id="btn-import-song" class="btn">Import Song</button>
          <button id="btn-import-setlist" class="btn">Import Setlist</button>
          <button id="btn-export-setlist" class="btn">Export Setlist</button>
          <input id="file-import" type="file" accept="application/json" hidden />
        </div>  `;
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
    highlightSelectionDOM();
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
      // stop già fermo → non fare nada
    });

    btnPlay.textContent = on ? '⏸' : '▶︎';
    highlightSelection();
    highlightSelectionDOM();
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

    // Forza subito l’highlight sul DOM
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

      // progress overlay
      const progress = document.createElement('div');
      progress.className = 'song-progress';
      item.appendChild(progress);

      // drag handle
      const handle = document.createElement('button');
      handle.className = 'drag-handle';
      handle.type = 'button';
      handle.title = 'Drag to order';
      handle.setAttribute('aria-label', 'Drag to order');
      handle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" viewBox="0 0 16 16">
          <path fill="currentColor" d="M5 3.25a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 3.25m0 4a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 7.25m0 4a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 11.25M10.5 3.25A1.25 1.25 0 1 1 9.25 2a1.25 1.25 0 0 1 1.25 1.25m0 4A1.25 1.25 0 1 1 9.25 6a1.25 1.25 0 0 1 1.25 1.25m0 4A1.25 1.25 0 1 1 9.25 10a1.25 1.25 0 0 1 1.25 1.25"/>
        </svg>`;
      item.appendChild(handle);

      if (isLocked()) handle.classList.add('disabled');

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
          
      // WRAPPER SINISTRO (handle + meta)
      const left = document.createElement('div');
      left.className = 'song-left';
      left.appendChild(handle);
      left.appendChild(meta);
          
      // WRAPPER DESTRO (azioni)
      const actions = document.createElement('div');
      actions.className = 'song-actions';
          
      // EDIT
      const edit = document.createElement('button');
      edit.className = 'icon-button edit-btn';
      edit.title = 'Edit';
      edit.textContent = '✎';
      edit.addEventListener('click', (e) => { e.stopPropagation(); openEditor(id); });
      actions.appendChild(edit);
          
      // DELETE
      const btnDel = document.createElement('button');
      btnDel.className = 'icon-button delete-btn';
      btnDel.title = 'Remove from setlist';
      btnDel.textContent = '🗑';
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await modalConfirm(`Remove "${song.title}" from setlist?`);
        if (!ok) return;
        removeSong(id);
        softRefresh(); // aggiorna lista subito
      });

      actions.appendChild(btnDel);
      
      // APPEND alla riga
      item.appendChild(left);
      item.appendChild(actions);


      // click/dblclick
      item.addEventListener('click', () => {
        const wasPlaying = store.runtime.transport.playing;
        const pausedId = store.runtime.transport.pausedSongId;
        setState(s => { s.ui.selectedSongId = id; s.ui.editorSongId = id; });

        // Gestione LoopSection e sotto-modalità
        const current = store.data.songs[store.runtime.transport.playingSongId ?? ''];
        const loopMode = current?.arranger?.mode === 'LoopSection';
        if (store.runtime.transport.playing && loopMode) {
          const loopExit = getLoopExit(current);
          if (loopExit === 'instant') {
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
            return;
          }

          // finish | bar → metti in coda e arma l’uscita
          setState(s => {
            s.ui.selectedSongId = id; s.ui.editorSongId = id;
            s.runtime.transport.pendingNextAfterLoop = true;
            s.runtime.transport.queuedSongId = id;
            s.runtime.transport.loopExitMode = loopExit;
          });
          forceSelectNow(id);
          highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
          return;
        }

        if (wasPlaying) {
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

// ✅ Abilita drag & drop e collegalo al lock
const dnd = makeSortable(body, {
  itemSelector: '.song-item',
  handleSelector: '.drag-handle',
  isLocked, 
  onReorder: (ids) => {
    const next = ids.filter(id => id && store.data.songs[id]);
    setState(s => { s.data.setlist = next; });
  }
});

// Mantieni il disabled del DnD allineato ai cambi di lock
const unsubDndLock = subscribe((s) => {
  dnd?.setLocked?.(!!(s?.ui?.lock));
});

// …poi più giù, nel cleanup della view, aggiungi:
wrap.addEventListener('DOMNodeRemoved', (e) => {
  if (e.target === wrap) {
    unsubDndLock?.();
    unsubLockClasses?.();
    dnd?.destroy?.();
  }
});

// ⇄ Aggiorna classi CSS quando cambia il lock (UI feedback)
function applyLockClasses() {
  const lock = !!store.ui.lock;
  // Aggiunge/toglie .is-locked al wrapper della vista
  wrap.classList.toggle('is-locked', lock);
  // Spegne/accende visivamente le maniglie già presenti
  body.querySelectorAll('.drag-handle').forEach(h => h.classList.toggle('disabled', lock));
}

// Applica subito lo stato corrente...
applyLockClasses();
// ...e reagisci ai cambi di lock
const unsubLockClasses = subscribe(() => applyLockClasses());


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
      const keep = true;
      setState(s => {
        s.ui.selectedSongId = nextId;
        s.ui.editorSongId = nextId;
      });
      forceSelectNow(nextId);
      selectSongByDelta(+1, { keepPlayState: keep });
      const now = performance.now();
      setState(s => {
        s.ui.selectedSongId = nextId;
        s.ui.editorSongId = nextId;
        s.runtime.transport.playingSongId = nextId;
        s.runtime.transport.startedAt = now;
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        s.runtime.transport.queuedSongId = null;
        s.runtime.transport.barSwitchAtMs = null;
        s.runtime.transport.loopExitMode = 'instant';
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
      });
      forceSelectNow(nextId);
      highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
      updateProgressImmediate();
      return;    
    }

    // finish | bar → metti in coda e arma l'uscita (non switchare ora)
    setState(s => {
      s.runtime.transport.pendingNextAfterLoop = true;
      s.runtime.transport.queuedSongId = nextId;
      s.runtime.transport.loopExitMode = loopExit;
      s.ui.selectedSongId = nextId;
      s.ui.editorSongId = nextId;
    });
    forceSelectNow(nextId);
    highlightSelection(); highlightSelectionDOM(); highlightQueuedDOM();
  }

  function onPrevClick() {
    if (store.ui.lock) return;
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
    if (store.ui.lock) return;
    setPlaying(!store.runtime.transport.playing);
  };
  window.addEventListener('lyrix:togglePlay', window.__lyrixPlayHandler);

  if (window.__lyrixNavHandler) window.removeEventListener('lyrix:navigateSong', window.__lyrixNavHandler);
  window.__lyrixNavHandler = (ev) => {
    if (store.ui.lock) return;
    const { delta = 0 } = ev.detail || {};
    if (delta > 0) {
      for (let i = 0; i < delta; i++) onNextClick();
      return;
    }
    if (delta < 0) {
      for (let i = 0; i < Math.abs(delta); i++) onPrevClick();
      return;
    }
  };
  window.addEventListener('lyrix:navigateSong', window.__lyrixNavHandler);

  // ───────────────── Progress bar anim + sync selected↔playing ─────────────────
  let rafId = 0;
  let lastAlignedPlayingId = null;

  function updateProgress() {
    rafId = requestAnimationFrame(updateProgress);

    const t = store.runtime.transport;

    // NON in play → show pausa/idle
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

    // In play → reset dei NON correnti
    for (const [id, refs] of itemEls) {
      if (!refs?.progress) continue;
      if (id !== nId(t.playingSongId)) {
        refs.progress.style.clipPath = 'inset(0 100% 0 0)';
        refs.item.classList.remove('playing');
      }
    }

    const song = store.data.songs[t.playingSongId];
    if (!song) return;

    // Gestione loopExit 'bar'
    if (
      store.runtime.transport.pendingNextAfterLoop &&
      store.runtime.transport.loopExitMode === 'bar' &&
      store.runtime.transport.queuedSongId
    ) {
      const bpm = Number(song?.bpm || 0);
      const meterNum = Number(song?.meter?.num || 4);
      const meterDen = Number(song?.meter?.den || 4);

      if (bpm > 0 && meterNum > 0 && meterDen > 0) {
        const beatMs = 60000 / bpm;
        const barMs = beatMs * meterNum;
        if (!store.runtime.transport.barSwitchAtMs) {
          const start = t.startedAt || performance.now();
          const k = Math.ceil((performance.now() - start) / barMs);
          const at = start + k * barMs;
          setState(s => { s.runtime.transport.barSwitchAtMs = at; });
        }
        if (performance.now() >= (store.runtime.transport.barSwitchAtMs || 0)) {
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
          return;
        }
      }
      // else: fallback 'finish' gestito a fine brano
    }

    // Assicura visual sync
    forceSelectNow(nId(t.playingSongId));

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

    // ───────────────── Loop: ignora sempre repeats, loop infinito ─────────────────
    if (song?.arranger?.mode === 'LoopSection' || song?.arranger?.mode === 'Loop') {
      const loopExit = (song?.arranger?.loopExit || 'finish'); // 'finish' | 'bar' | 'instant'

      function restartCurrentFromZero() {
        setState(s => {
          s.runtime.transport.startedAt = performance.now();
          s.runtime.transport.loopCount = 0;
        });
        updateProgressImmediate();
      }

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

      // loop infinito
      restartCurrentFromZero();
      return;
    }

    // JUMP/STOP: gestisci ripetizioni n (default 1 = nessuna ripetizione)
    const currentCount = Number(store.runtime.transport.loopCount || 0);
    const nextCount = currentCount + 1;

    if (reps > 1 && nextCount < reps) {
      setState(s => { s.runtime.transport.loopCount = nextCount; });
      restartCurrentFromZero();
      return;
    }

    if (mode === 'StopAtEnd') {
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

    const pidNext = nId(store.runtime.transport.playingSongId);
    forceSelectNow(pidNext);
    setState(s => { s.ui.selectedSongId = pidNext; s.ui.editorSongId = pidNext; });
    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
  }

  // Header tool handlers
const fileInput = header.querySelector('#file-import');

header.querySelector('#btn-add-song')?.addEventListener('click', () => {
  const newId = addSong({
    title: 'New Song',
    bpm: null,
    duration: null,
    lyrics: [{ text: "[Verse 1]" }, { text: "" }, { text: "[Chorus]" }],
    chords: [{ chord: "[Verse 1]" }, { chord: "" }, { chord: "[Chorus]" }],
    arranger: { mode: 'JumpToNext', repeats: 1, loopExit: 'finish' }
  });
  openEditor(newId); // apre subito l’editor sul nuovo brano
});


function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

header.querySelector('#btn-export-setlist')?.addEventListener('click', () => {
  const payload = exportSetlistJSON();
  downloadJSON('setlist.lyrix.json', payload);
});

function handleImport(kind) {
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(String(reader.result || '{}'));
        if (kind === 'song' || (json.schema || '').startsWith('lyrix-song')) {
          importSongJSON(json);
          softRefresh();
        } else {
          importSetlistJSON(json, { mode: 'replace' });
          softRefresh();
        }
      } catch (e) {
        await modalAlert('Invalid JSON file');
      } finally {
        fileInput.value = '';
      }
    };
    reader.readAsText(file);
  };
  fileInput.click();
}

header.querySelector('#btn-import-song')?.addEventListener('click', () => handleImport('song'));
header.querySelector('#btn-import-setlist')?.addEventListener('click', () => handleImport('setlist'));


function softRefresh() {
  // Forza il router a ridisegnare la vista corrente senza ricaricare la pagina
  window.dispatchEvent(new HashChangeEvent('hashchange'));
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

  // Mantieni l’icona Play/Pause sempre coerente allo stato
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
