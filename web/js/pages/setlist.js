import {
  store,
  setState,
  subscribe,
  addSong,
  removeSong,
  exportSetlistJSON,
  importSongJSON,
  importSetlistJSON,
} from "../state/store.js";
import { Realtime } from "../state/ws.js";
import { createEditorPanel } from "../ui/editorPanel.js";
import { makeSortable } from "../ui/dragdrop.js";
import { modalAlert } from "../ui/modals.js"; // modalConfirm definita localmente qui sotto
import { savePersisted } from "../state/persistence.js";

// ──────────────────────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────────────────────
export function renderSetlist() {
  // Root
  const wrap = document.createElement("section");
  wrap.className = "view view-setlist";

  // ────────────────────────────────────────────────────────────────────────────
  // Costanti UI (icone SVG, tutte a currentColor)
  // ────────────────────────────────────────────────────────────────────────────
  const ICON_LOOP_FINISH = `
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M6 8a.5.5 0 0 0 .5.5h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L12.293 7.5H6.5A.5.5 0 0 0 6 8m-2.5 7a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 1 0v13a.5.5 0 0 1-.5.5"/>
    </svg>`;
  const ICON_LOOP_BAR = `
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M4.146 3.646a.5.5 0 0 0 0 .708L7.793 8l-3.647 3.646a.5.5 0 0 0 .708.708l4-4a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708 0M11.5 1a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-1 0v-13a.5.5 0 0 1 .5-.5"/>
    </svg>`;
  const ICON_LOOP_INSTANT = `
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M3.646 14.854a.5.5 0 0 0 .708 0L8 11.207l3.646 3.647a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 0 0 0 .708m0-13.708a.5.5 0 0 1 .708 0L8 4.793l3.646-3.647a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 0-.708M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8"/>
    </svg>`;

  const ICON_PLAY = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5v9l7-4.5-7-4.5z" />
    </svg>`;
  const ICON_PAUSE = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 3h3v10H4zM9 3h3v10H9z" />
    </svg>`;
  const ICON_STOP = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.2" />
    </svg>`;
  const ICON_NEXT = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4v8l6-4-6-4zM12 4h1v8h-1z" />
    </svg>`;
  const ICON_PREV = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13 12V4l-6 4 6 4zM3 12h1V4H3z" />
    </svg>`;
  const ICON_EDIT = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.8 2.2a1.2 1.2 0 0 1 1.7 1.7L6.6 10.8 4 11.5l.7-2.6zM4 12.5h8v1H4z"/>
    </svg>`;
  const ICON_TRASH = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2h4l.5 1H13v1H3V3h2.5zM4 6h8l-.5 7a1 1 0 0 1-1 .9H5.5a1 1 0 0 1-1-.9z" />
    </svg>`;

  const ICON_LOOP = `
    <svg class="icon loop-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M 7.59375 3 L 9.0625 5 L 13 5 C 16.324219 5 19 7.675781 19 11 L 19 15 L 16 15 L 20 20.46875 L 24 15 L 21 15 L 21 11 C 21 6.59375 17.40625 3 13 3 Z M 4 3.53125 L 0 9 L 3 9 L 3 13 C 3 17.40625 6.59375 21 11 21 L 16.40625 21 L 14.9375 19 L 11 19 C 7.675781 19 5 16.324219 5 13 L 5 9 L 8 9 Z"></path>
    </svg>`;


  // badge: riuso di STOP/NEXT
  const ICON_BADGE_STOP = ICON_STOP;
  const ICON_BADGE_NEXT = ICON_NEXT;


  // ────────────────────────────────────────────────────────────────────────────
  // Utilità
  // ────────────────────────────────────────────────────────────────────────────
  const nId = (v) => String(v ?? "");

  function isLocked() {
    const s = store?.getState ? store.getState() : store.state;
    return !!s?.ui?.lock;
  }

  function ensureSelected() {
    const ids = (store.data.setlist || []).map(nId);
    if (ids.length && !store.ui.selectedSongId) {
      setState((s) => {
        s.ui.selectedSongId = ids[0];
        s.ui.editorSongId = ids[0] ?? null;
      });
    }
  }

  function durSecOf(song) {
    const sec = Number(song?.duration ?? 0);
    return Number.isFinite(sec) && sec > 0 ? sec : 180; // fallback 3:00
  }

  function formatMMSS(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  function getLoopExit(song) {
    const raw = (song?.arranger?.loopExit ?? "finish").toString().trim().toLowerCase();
    if (raw === "instant") return "instant";
    if (raw === "bar" || raw === "1 bar" || raw === "1bar") return "bar";
    if (raw === "finish" || raw === "end" || raw === "at end of loop" || raw === "endofloop") return "finish";
    return "finish";
  }

  function behaviorBadge(song) {
    const mode = song?.arranger?.mode || "JumpToNext";
    const reps = song?.arranger?.repeats;

    const repText = mode === "LoopSection" ? "" : reps && Number(reps) > 1 ? `×${Number(reps)}` : "";

    if (mode === "LoopSection") {
      const exit = getLoopExit(song);
      const exitIcon = exit === "instant" ? ICON_LOOP_INSTANT : exit === "bar" ? ICON_LOOP_BAR : ICON_LOOP_FINISH;
      return `<span class="behavior-badge is-loop" title="Loop: ${exit}">${ICON_LOOP}${exitIcon}</span>`;
    }

    const iconHtml = mode === "StopAtEnd" ? ICON_PAUSE : ICON_BADGE_NEXT;
    return `<span class="behavior-badge" title="${mode}">${iconHtml}${repText ? `<span class="rep">${repText}</span>` : ""}</span>`;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Stato locale
  // ────────────────────────────────────────────────────────────────────────────
  const itemEls = new Map(); // mappa id → { item, progress }
  let importBusy = false; // evita import doppi

  // ────────────────────────────────────────────────────────────────────────────
  // Preferenze import (modal)
  // ────────────────────────────────────────────────────────────────────────────
  function getImportPrefs() {
    const imp = store?.prefs?.setlist?.import || {};
    return {
      showModal: imp.showModal !== false, // default: true
      mode: imp.mode === "replace" ? "replace" : "add",
    };
  }

  function setImportPrefs(next) {
    setState((s) => {
      s.prefs = s.prefs || {};
      s.prefs.setlist = s.prefs.setlist || {};
      s.prefs.setlist.import = { ...(s.prefs.setlist.import || {}), ...next };
    });
    savePersisted(store);
  }

  function modalImportChoice(kind = "auto") {
    const prefs = getImportPrefs();
    if (!prefs.showModal) return Promise.resolve(prefs.mode);

    return new Promise((resolve) => {
      const root = document.createElement("div");
      root.className = "modal-wrap";
      root.dataset.variant = "confirm";
      root.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-dialog modal-import">
          <div class="modal-header">
            <h3 class="modal-title">Import ${kind === "song" ? "Song" : kind === "setlist" ? "Setlist" : "File"}</h3>
          </div>
          <div class="modal-body">
            <p class="muted" style="margin-bottom:10px;">Scegli cosa fare con il contenuto importato:</p>
            <div class="segmented" id="im-seg">
              <button class="seg-item ${prefs.mode === "add" ? "active" : ""}" data-mode="add">Add (append)</button>
              <button class="seg-item ${prefs.mode === "replace" ? "active" : ""}" data-mode="replace">Replace (overwrite)</button>
            </div>
            <div class="field toggle" style="margin-top:12px; display:flex; align-items:center; gap:10px;">
              <label class="switch">
                <input id="im-noshow" type="checkbox" />
                <span class="ui"></span>
              </label>
              <span>Don’t show again (usa sempre questa scelta)</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn" data-close>Cancel</button>
            <button class="modal-btn primary" data-accept>Continue</button>
          </div>
        </div>`;
      document.body.appendChild(root);

      let selected = prefs.mode;
      root.querySelectorAll("#im-seg .seg-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          root.querySelectorAll("#im-seg .seg-item").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          selected = btn.dataset.mode === "replace" ? "replace" : "add";
        });
      });

      const finish = (mode) => {
        const noshow = root.querySelector("#im-noshow")?.checked;
        if (noshow && mode) setImportPrefs({ showModal: false, mode });
        else if (mode) setImportPrefs({ mode });
        root.remove();
        resolve(mode);
      };

      root.querySelector("[data-accept]")?.addEventListener("click", () => finish(selected));
      root.querySelector("[data-close]")?.addEventListener("click", () => finish(null));
      root.querySelector(".modal-overlay")?.addEventListener("click", () => finish(null));
      const onEsc = (ev) => {
        if (ev.key === "Escape") {
          finish(null);
          window.removeEventListener("keydown", onEsc);
        }
      };
      window.addEventListener("keydown", onEsc);
    });
  }

  // Conferma generica (accetta string o oggetto)
  function modalConfirm(arg) {
    const opts = typeof arg === "string" ? { title: arg } : arg || {};
    const { title = "Are you sure?", message = "", acceptLabel = "OK", danger = false } = opts;

    return new Promise((resolve) => {
      const root = document.createElement("div");
      root.className = "modal-wrap";
      root.dataset.variant = "confirm";
      root.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-dialog">
          <div class="modal-header"><h3 class="modal-title">${title}</h3></div>
          <div class="modal-body"><p class="muted">${message}</p></div>
          <div class="modal-footer">
            <button class="modal-btn" data-close>Cancel</button>
            <button class="modal-btn ${danger ? "danger" : "primary"}" data-accept autofocus>${acceptLabel}</button>
          </div>
        </div>`;
      document.body.appendChild(root);

      const acceptBtn = root.querySelector("[data-accept]");
      acceptBtn?.focus();

      const finish = (ok) => {
        root.remove();
        resolve(!!ok);
      };

      root.querySelector("[data-accept]")?.addEventListener("click", () => finish(true));
      root.querySelector("[data-close]")?.addEventListener("click", () => finish(false));
      root.querySelector(".modal-overlay")?.addEventListener("click", () => finish(false));
      const onEsc = (ev) => {
        if (ev.key === "Escape") {
          finish(false);
          window.removeEventListener("keydown", onEsc);
        }
      };
      window.addEventListener("keydown", onEsc);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Import JSON (song/setlist)
  // ────────────────────────────────────────────────────────────────────────────
  async function importFromFile(file, opts = {}) {
    const triggerBtn = opts?.triggerBtn || null; // spinner finché si chiude il modale
    if (!file) {
      if (triggerBtn) setBtnLoading(triggerBtn, false);
      return;
    }
    if (importBusy) {
      if (triggerBtn) setBtnLoading(triggerBtn, false);
      return;
    }

    importBusy = true;
    try {
      // Leggi & parsa prima, per errori veloci
      let json;
      try {
        const text = await file.text();
        json = JSON.parse(text);
      } catch {
        await modalAlert("Unrecognized or invalid file. Please provide a valid Lyrix Setlist or Song JSON.");
        return;
      }

      const schema = String(json?.schema || "");
      const isSong = schema.startsWith("lyrix-song") || !!json.song;
      const isSetlist = schema.startsWith("lyrix-setlist") || Array.isArray(json?.setlist) || Array.isArray(json?.songs);

      if (!isSong && !isSetlist) {
        await modalAlert("Unsupported JSON schema. Provide a valid Lyrix Setlist or Song export.");
        return;
      }

      // Preferenze ADD/REPLACE
      const choice = await modalImportChoice(isSong ? "song" : "setlist"); // 'add' | 'replace' | null
      if (choice == null) return; // cancel

      if (isSong) {
        if (choice === "replace") {
          setState((s) => {
            s.data.setlist = [];
          });
        }
        importSongJSON(json);
        softRefresh();
        const ids = store.data.setlist || [];
        const songs = ids.map((i) => store.data.songs[i]).filter(Boolean);
        Realtime.send("state/setlist", { songs });
      } else if (isSetlist) {
        const mode = choice === "replace" ? "replace" : "append";
        importSetlistJSON(json, { mode });
        softRefresh();

        if (mode === "replace" && Array.isArray(json?.songs)) {
          Realtime.send("state/loadSession", { session: json });
        } else {
          const ids = store.data.setlist || [];
          const songs = ids.map((i) => store.data.songs[i]).filter(Boolean);
          Realtime.send("state/setlist", { songs });
        }
      }
    } catch {
      await modalAlert("Import failed due to an unexpected error.");
    } finally {
      importBusy = false;
      if (triggerBtn) setBtnLoading(triggerBtn, false);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Header con transport
  // ────────────────────────────────────────────────────────────────────────────
  const header = document.createElement("header");
  header.className = "view-header";
  header.innerHTML = `
    <h2>Setlist</h2>
    <div class="transport">
      <button id="btn-prev" class="icon-button" title="Previous Song" aria-label="Previous Song">${ICON_PREV}</button>
      <button id="btn-play" class="icon-button" title="Play/Pause" aria-label="Play/Pause">${ICON_PLAY}</button>
      <button id="btn-stop" class="icon-button" title="Stop" aria-label="Stop">${ICON_STOP}</button>
      <button id="btn-next" class="icon-button" title="Next Song" aria-label="Next Song">${ICON_NEXT}</button>
    </div>
    <div class="spacer"></div>
    <div class="setlist-tools">
      <button id="btn-add-song" class="btn">+ Add Song</button>
      <button id="btn-export-setlist" class="btn">Export Setlist</button>
      <input id="file-import" type="file" accept="application/json,application/*+json" hidden />
    </div>`;

  const btnPrev = header.querySelector("#btn-prev");
  const btnPlay = header.querySelector("#btn-play");
  const btnStop = header.querySelector("#btn-stop");
  const btnNext = header.querySelector("#btn-next");

  function setPlayButtonIcon(isPlaying) {
  if (!btnPlay) return;
  btnPlay.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
  btnPlay.setAttribute("title", isPlaying ? "Pause" : "Play");
  btnPlay.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

  // Allinea subito Play/Pause (SVG)
  setPlayButtonIcon(!!store.runtime.transport.playing);

  // Sync "queued" dal server
  const onQueuedSync = (ev) => {
    const qid = ev?.detail?.queuedSongId ?? undefined;
    highlightQueuedDOM(qid);
  };
  window.addEventListener("lyrix:queued-sync", onQueuedSync);

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers DOM
  // ────────────────────────────────────────────────────────────────────────────
  function highlightSelection() {
    const want = nId(store.ui.selectedSongId);
    for (const [id, refs] of itemEls) refs.item.classList.toggle("selected", id === want);
  }

  function highlightSelectionDOM() {
    const container = wrap.querySelector(".setlist-body");
    if (!container) return;
    const want = String(store.ui.selectedSongId ?? "");
    container.querySelectorAll(".song-item").forEach((el) => {
      el.classList.toggle("selected", (el.dataset.id || "") === want);
    });
  }

  function highlightQueuedDOM(overrideId) {
    const container = wrap.querySelector(".setlist-body") || wrap;
    if (!container) return;

    const queued = String(
      overrideId !== undefined ? overrideId : store.runtime.transport?.queuedSongId ?? ""
    );

    container.querySelectorAll("[data-id]").forEach((el) => {
      const isQueued = String(el.dataset.id || "") === queued && !!queued;
      el.classList.toggle("queued", isQueued);
    });
  }

  function forceSelectNow(id) {
    const container = wrap.querySelector(".setlist-body");
    if (!container) return;
    const want = String(id ?? "");
    container.querySelectorAll(".song-item").forEach((el) => {
      el.classList.toggle("selected", (el.dataset.id || "") === want);
    });
  }

  function clearPauseState() {
    setState((s) => {
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    });
  }

  function hardStop() {
    setState((s) => {
      s.runtime.transport.playing = false;
      s.runtime.transport.playingSongId = null;
      s.runtime.transport.startedAt = 0;
      s.runtime.transport.loopCount = 0;
      s.runtime.transport.pendingNextAfterLoop = false;
      s.runtime.transport.pausedSongId = null;
      s.runtime.transport.pausedElapsedMs = 0;
    });
    setPlayButtonIcon(false);
    for (const { progress, item } of itemEls.values()) {
      if (!progress) continue;
      progress.style.clipPath = "inset(0 100% 0 0)";
      item.classList.remove("playing");
    }
    updateProgressImmediate();
    highlightSelectionDOM();
    highlightQueuedDOM();
    Realtime.send("transport/stop");
  }

  // Play/Pause con resume intelligente
  function setPlaying(on, origin = "local") {
    const wasPlaying = store.runtime.transport.playing;
    const now = performance.now();

    const prevSongId = store.runtime.transport.playingSongId || store.ui.selectedSongId;
    const prevStartedAt = store.runtime.transport.startedAt || 0;
    const pausedForServer = !on && wasPlaying ? Math.max(0, now - prevStartedAt) : 0;

    setState((s) => {
      if (on && !wasPlaying) {
        const ids = (s.data.setlist || []).map(nId);
        const sel = nId(s.ui.selectedSongId || ids[0] || null);

        // resume
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

        // start da zero
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

      // pausa
      if (!on && wasPlaying) {
        s.runtime.transport.pausedSongId = s.runtime.transport.playingSongId;
        s.runtime.transport.pausedElapsedMs = pausedForServer;
        s.runtime.transport.playing = false;
        s.runtime.transport.playingSongId = null;
        s.runtime.transport.startedAt = 0;
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        return;
      }
    });

    if (origin === "local") {
      if (on) {
        Realtime.send("transport/play");
      } else {
        Realtime.send("transport/pause", { songId: prevSongId, elapsedMs: Math.floor(pausedForServer) });
      }
    }

    setPlayButtonIcon(on);
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

    setState((s) => {
      s.ui.selectedSongId = nextId;
      s.ui.editorSongId = nextId;
      if (!wasPlaying) {
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
      }
    });

    // feedback immediato
    forceSelectNow(nextId);

    if (keepPlayState && wasPlaying) {
      setState((s) => {
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

  // ────────────────────────────────────────────────────────────────────────────
  // Layout base (sidebar + editor)
  // ────────────────────────────────────────────────────────────────────────────
  const layout = document.createElement("div");
  layout.className = "setlist-layout";

  const dropHint = document.createElement("div");
  dropHint.className = "drop-hint";
  dropHint.innerHTML = `<p>Rilascia qui il file <strong>.json</strong> di Song o Setlist</p>`;

  const sidebar = document.createElement("div");
  sidebar.className = "setlist-sidebar";

  const body = document.createElement("div");
  body.className = "setlist-body";
  sidebar.appendChild(body);

  wrap.appendChild(dropHint);

  // Spinner mini nei bottoni (Import)
  function setBtnLoading(btn, on) {
    if (!btn) return;
    if (on) {
      if (!btn.querySelector('[data-role="btn-spin"]')) {
        const sp = document.createElement("span");
        sp.className = "spinner-mini";
        sp.setAttribute("data-role", "btn-spin");
        btn.appendChild(sp);
      }
      btn.disabled = true;
      btn.classList.add("is-loading");
    } else {
      btn.querySelector('[data-role="btn-spin"]')?.remove();
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Lista setlist o stato vuoto
  // ────────────────────────────────────────────────────────────────────────────
  if (!store.data.setlist || store.data.setlist.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-import">
        <div id="drop-import" class="dropzone" tabindex="0" aria-label="Dropzone import">
          <h3>Setlist Empty</h3>
          <p class="muted">Drop here file <strong>.json</strong> of <strong>Setlist</strong> or <strong>Song</strong>.</p>
          <p class="muted">Or press <strong>Import</strong>.</p>
          <button id="btn-import-general" class="btn">Import</button>
        </div>
      </div>`;

    const dz = empty.querySelector("#drop-import");
    const btnImport = empty.querySelector("#btn-import-general");
    const fileInput = header.querySelector("#file-import");

    // Import via pulsante (spinner fino a chiusura modale)
    btnImport?.addEventListener("click", () => {
      if (!fileInput) return;
      setBtnLoading(btnImport, true);
      fileInput.value = "";

      let changed = false;
      let cancelTimer = null;

      const onFocusBack = () => {
        cancelTimer = setTimeout(() => {
          if (!changed) setBtnLoading(btnImport, false);
          window.removeEventListener("focus", onFocusBack);
          cancelTimer = null;
        }, 400);
      };
      window.addEventListener("focus", onFocusBack, { once: true });

      fileInput.onchange = async () => {
        changed = true;
        if (cancelTimer) {
          clearTimeout(cancelTimer);
          cancelTimer = null;
        }
        window.removeEventListener("focus", onFocusBack);
        const f = fileInput.files?.[0];
        if (f) {
          await importFromFile(f, { triggerBtn: btnImport });
        } else {
          setBtnLoading(btnImport, false);
        }
        fileInput.value = "";
        fileInput.onchange = null;
      };

      fileInput.click();
    });

    // Drag & Drop nell'empty state
    ["dragenter", "dragover"].forEach((ev) => dz?.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("hover");
    }));
    ["dragleave", "drop"].forEach((ev) => dz?.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("hover");
    }));

    body.appendChild(empty);
  } else {
    ensureSelected();

    store.data.setlist.forEach((id) => {
      const song = store.data.songs[id];
      if (!song) return;

      const item = document.createElement("div");
      item.className = "song-item";
      item.dataset.id = id;
      if (store.ui.selectedSongId === id) item.classList.add("selected");

      const progress = document.createElement("div");
      progress.className = "song-progress";
      item.appendChild(progress);

      const handle = document.createElement("button");
      handle.className = "drag-handle";
      handle.type = "button";
      handle.title = "Drag to order";
      handle.setAttribute("aria-label", "Drag to order");
      handle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" viewBox="0 0 16 16">
          <path fill="currentColor" d="M5 3.25a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 3.25m0 4a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 7.25m0 4a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 11.25M10.5 3.25A1.25 1.25 0 1 1 9.25 2a1.25 1.25 0 0 1 1.25 1.25m0 4A1.25 1.25 0 1 1 9.25 6a1.25 1.25 0 0 1 1.25 1.25m0 4A1.25 1.25 0 1 1 9.25 10a1.25 1.25 0 0 1 1.25 1.25"/>
        </svg>`;
      item.appendChild(handle);
      if (isLocked()) handle.classList.add("disabled");

      const meta = document.createElement("div");
      meta.className = "song-meta";
      meta.innerHTML = `
        <strong>${song.title}</strong>
        <span class="muted">
          ${song.bpm ?? "—"} BPM · ${song.duration ? formatMMSS(song.duration) : "—:—"}
          ${behaviorBadge(song)}
        </span>`;

      const left = document.createElement("div");
      left.className = "song-left";
      left.appendChild(handle);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "song-actions";

      const edit = document.createElement("button");
      edit.className = "icon-button edit-btn";
      edit.title = "Edit";
      edit.innerHTML = ICON_EDIT;
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor(id);
      });
      actions.appendChild(edit);

      const btnDel = document.createElement("button");
      btnDel.className = "icon-button delete-btn";
      btnDel.title = "Remove from setlist";
      btnDel.innerHTML = ICON_TRASH;
        btnDel.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await modalConfirm(`Remove "${song.title}" from setlist?`);
        if (!ok) return;
        removeSong(id);
        const ids = store.data.setlist || [];
        const songs = ids.map((i) => store.data.songs[i]).filter(Boolean);
        Realtime.send("state/setlist", { songs });
        softRefresh();
      });
      actions.appendChild(btnDel);

      item.appendChild(left);
      item.appendChild(actions);

      item.addEventListener("click", () => {
        const wasPlaying = store.runtime.transport.playing;
        const pausedId = store.runtime.transport.pausedSongId;
        setState((s) => {
          s.ui.selectedSongId = id;
          s.ui.editorSongId = id;
        });

        const current = store.data.songs[store.runtime.transport.playingSongId ?? ""];
        const loopMode = current?.arranger?.mode === "LoopSection";
        if (store.runtime.transport.playing && loopMode) {
          const loopExit = getLoopExit(current);
          if (loopExit === "instant") {
            const now = performance.now();
            setState((s) => {
              s.ui.selectedSongId = id;
              s.ui.editorSongId = id;
              s.runtime.transport.playingSongId = id;
              s.runtime.transport.startedAt = now;
              s.runtime.transport.loopCount = 0;
              s.runtime.transport.pendingNextAfterLoop = false;
              s.runtime.transport.queuedSongId = null;
              s.runtime.transport.barSwitchAtMs = null;
              s.runtime.transport.loopExitMode = "instant";
              s.runtime.transport.pausedSongId = null;
              s.runtime.transport.pausedElapsedMs = 0;
            });
            forceSelectNow(id);
            highlightSelection();
            highlightSelectionDOM();
            highlightQueuedDOM();
            updateProgressImmediate();
            Realtime.send("song/selectById", { id });
            return;
          }

          // finish | bar → coda
          setState((s) => {
            s.ui.selectedSongId = id;
            s.ui.editorSongId = id;
            s.runtime.transport.pendingNextAfterLoop = true;
            s.runtime.transport.queuedSongId = id;
            s.runtime.transport.loopExitMode = loopExit;
          });
          forceSelectNow(id);
          highlightSelection();
          highlightSelectionDOM();
          highlightQueuedDOM();
          Realtime.send("transport/queueNext", { queuedSongId: id, mode: loopExit });
          return;
        }

        if (wasPlaying) {
          setState((s) => {
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
          if (store.prefs?.setlist?.playOnClick) btnPlay.click?.();
        }

        highlightSelection();
        highlightSelectionDOM();
        highlightQueuedDOM();
        Realtime.send("song/selectById", { id });
      });

      if (store.prefs?.setlist?.dblClickOpensEditor !== false) {
        item.addEventListener("dblclick", () => openEditor(id));
      }

      body.appendChild(item);
      itemEls.set(nId(id), { item, progress });
    });

    // Footer Import/Delete
    const importFooter = document.createElement("div");
    importFooter.className = "setlist-import-footer";
    importFooter.innerHTML = `
      <div class="footer-left">
        <button id="btn-import-general" class="btn">Import</button>
      </div>
      <div class="footer-right">
        <button id="btn-delete-all" class="btn danger ghost">Delete all</button>
      </div>`;
    sidebar.appendChild(importFooter);

    const fileInput = header.querySelector("#file-import");
    const btnImportFooter = importFooter.querySelector("#btn-import-general");

    btnImportFooter?.addEventListener("click", () => {
      if (!fileInput) return;
      setBtnLoading(btnImportFooter, true);
      fileInput.value = "";

      let changed = false;
      let cancelTimer = null;

      const onFocusBack = () => {
        cancelTimer = setTimeout(() => {
          if (!changed) setBtnLoading(btnImportFooter, false);
          window.removeEventListener("focus", onFocusBack);
          cancelTimer = null;
        }, 400);
      };
      window.addEventListener("focus", onFocusBack, { once: true });

      fileInput.onchange = async () => {
        changed = true;
        if (cancelTimer) {
          clearTimeout(cancelTimer);
          cancelTimer = null;
        }
        window.removeEventListener("focus", onFocusBack);
        const f = fileInput.files?.[0];
        if (f) {
          await importFromFile(f, { triggerBtn: btnImportFooter });
        } else {
          setBtnLoading(btnImportFooter, false);
        }
        fileInput.value = "";
        fileInput.onchange = null;
      };

      fileInput.click();
    });

    importFooter.querySelector("#btn-delete-all")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await modalConfirm({
        title: "Delete entire setlist?",
        message: "This will permanently clear the setlist. This action cannot be undone.",
        acceptLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      setState((s) => {
        s.data.setlist = [];
      });
      softRefresh();
      Realtime.send("state/setlist", { songs: [] });
    });

    // Drag&Drop ordinamento
    const dnd = makeSortable(body, {
      itemSelector: ".song-item",
      handleSelector: ".drag-handle",
      isLocked,
      onReorder: (ids) => {
        const next = ids.filter((id) => id && store.data.songs[id]);
        setState((s) => {
          s.data.setlist = next;
        });
        const songs = next.map((id) => store.data.songs[id]).filter(Boolean);
        Realtime.send("state/setlist", { songs });
      },
    });

    const unsubDndLock = subscribe((s) => dnd?.setLocked?.(!!s?.ui?.lock));

    wrap.addEventListener("DOMNodeRemoved", (e) => {
      if (e.target === wrap) {
        unsubDndLock?.();
        unsubLockClasses?.();
        dnd?.destroy?.();
        window.removeEventListener("lyrix:queued-sync", onQueuedSync);
      }
    });

    // CSS feedback lock
    function applyLockClasses() {
      const lock = !!store.ui.lock;
      wrap.classList.toggle("is-locked", lock);
      body.querySelectorAll(".drag-handle").forEach((h) => h.classList.toggle("disabled", lock));
    }

    applyLockClasses();
    const unsubLockClasses = subscribe(() => applyLockClasses());

    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
  }

  // Host editor (destra)
  const editorHost = document.createElement("div");
  editorHost.className = "editor-host";

  function openEditor(songId) {
    setState((s) => {
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
    setState((s) => {
      s.ui.editorOpen = false;
      s.ui.editorSongId = null;
    });
    location.hash = "#/setlist";
    renderEditor();
  }

  function renderEditor() {
    editorHost.replaceChildren();

    if (!store.ui.editorOpen || !store.ui.editorSongId) {
      wrap.classList.remove("split");
      if (editorHost.isConnected) editorHost.remove();
      return;
    }

    const song = store.data.songs[store.ui.editorSongId];
    if (!song) {
      closeEditor();
      return;
    }

    if (!editorHost.isConnected) layout.appendChild(editorHost);
    editorHost.classList.remove("enter");

    const panel = createEditorPanel(song, { readOnly: store.ui.lock });
    editorHost.appendChild(panel);

    // trigger reflow
    // eslint-disable-next-line no-unused-expressions
    editorHost.offsetWidth;

    wrap.classList.add("split");
    // eslint-disable-next-line no-unused-expressions
    editorHost.offsetWidth;
    editorHost.classList.add("enter");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Transport wiring
  // ────────────────────────────────────────────────────────────────────────────
  function onNextClick() {
    if (store.ui.lock) return;

    const t = store.runtime.transport;
    const playing = !!t.playing && !!t.playingSongId;
    const currentId = nId(t.playingSongId || store.ui.selectedSongId);
    const current = store.data.songs[currentId];

    if (!playing || !current || (current?.arranger?.mode !== "LoopSection" && current?.arranger?.mode !== "Loop")) {
      const keep = store.runtime.transport.playing;
      selectSongByDelta(+1, { keepPlayState: keep });
      Realtime.send("transport/next");
      return;
    }

    const loopExit = getLoopExit(current);
    const ids = (store.data.setlist || []).map(nId);
    const baseIdx = Math.max(0, ids.indexOf(currentId));
    const nextIdx = Math.max(0, Math.min(ids.length - 1, baseIdx + 1));
    const nextId = ids[nextIdx];

    if (loopExit === "instant") {
      const keep = true;
      setState((s) => {
        s.ui.selectedSongId = nextId;
        s.ui.editorSongId = nextId;
      });
      forceSelectNow(nextId);
      selectSongByDelta(+1, { keepPlayState: keep });

      const now = performance.now();
      setState((s) => {
        s.ui.selectedSongId = nextId;
        s.ui.editorSongId = nextId;
        s.runtime.transport.playingSongId = nextId;
        s.runtime.transport.startedAt = now;
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        s.runtime.transport.queuedSongId = null;
        s.runtime.transport.barSwitchAtMs = null;
        s.runtime.transport.loopExitMode = "instant";
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
      });
      forceSelectNow(nextId);
      highlightSelection();
      highlightSelectionDOM();
      highlightQueuedDOM();
      updateProgressImmediate();
      Realtime.send("transport/next");
      return;
    }

    setState((s) => {
      s.runtime.transport.pendingNextAfterLoop = true;
      s.runtime.transport.queuedSongId = nextId;
      s.runtime.transport.loopExitMode = loopExit;
      s.ui.selectedSongId = nextId;
      s.ui.editorSongId = nextId;
    });
    forceSelectNow(nextId);
    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
    Realtime.send("transport/queueNext", { queuedSongId: nextId, mode: loopExit });
  }

  function onPrevClick() {
    if (store.ui.lock) return;

    const t = store.runtime.transport;
    const playing = !!t.playing && !!t.playingSongId;
    const currentId = nId(t.playingSongId || store.ui.selectedSongId);
    const current = store.data.songs[currentId];

    if (!playing || !current || (current?.arranger?.mode !== "LoopSection" && current?.arranger?.mode !== "Loop")) {
      const keep = store.runtime.transport.playing;
      selectSongByDelta(-1, { keepPlayState: keep });
      Realtime.send("transport/prev");
      return;
    }

    const loopExit = getLoopExit(current);
    const ids = (store.data.setlist || []).map(nId);
    const baseIdx = Math.max(0, ids.indexOf(currentId));
    const prevIdx = Math.max(0, Math.min(ids.length - 1, baseIdx - 1));
    const prevId = ids[prevIdx];

    if (loopExit === "instant") {
      setState((s) => {
        s.ui.selectedSongId = prevId;
        s.ui.editorSongId = prevId;
        s.runtime.transport.playingSongId = prevId;
        s.runtime.transport.startedAt = performance.now();
        s.runtime.transport.loopCount = 0;
        s.runtime.transport.pendingNextAfterLoop = false;
        s.runtime.transport.queuedSongId = null;
        s.runtime.transport.barSwitchAtMs = null;
        s.runtime.transport.loopExitMode = "instant";
        s.runtime.transport.pausedSongId = null;
        s.runtime.transport.pausedElapsedMs = 0;
      });
      forceSelectNow(prevId);
      highlightSelection();
      highlightSelectionDOM();
      highlightQueuedDOM();
      updateProgressImmediate();
      Realtime.send("transport/prev");
      return;
    }

    setState((s) => {
      s.runtime.transport.pendingNextAfterLoop = true;
      s.runtime.transport.queuedSongId = prevId;
      s.runtime.transport.loopExitMode = loopExit;
      s.ui.selectedSongId = prevId;
      s.ui.editorSongId = prevId;
    });
    forceSelectNow(prevId);
    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
    Realtime.send("transport/queueNext", { queuedSongId: prevId, mode: loopExit });
  }

  btnPrev?.addEventListener("click", onPrevClick);
  btnNext?.addEventListener("click", onNextClick);
  btnPlay?.addEventListener("click", () => {
    if (store.ui.lock) return;
    setPlaying(!store.runtime.transport.playing);
  });
  btnStop?.addEventListener("click", () => {
    if (store.ui.lock) return;
    hardStop();
    Realtime.send("transport/stop");
  });

  const applyLockToTransport = () => {
    const dis = !!store.ui.lock;
    [btnPrev, btnPlay, btnStop, btnNext].forEach((b) => b && (b.disabled = dis));
  };
  applyLockToTransport();
  const unsubscribeLock = subscribe(() => applyLockToTransport());

  if (window.__lyrixPlayHandler) window.removeEventListener("lyrix:togglePlay", window.__lyrixPlayHandler);
  window.__lyrixPlayHandler = () => {
    if (store.ui.lock) return;
    setPlaying(!store.runtime.transport.playing);
  };
  window.addEventListener("lyrix:togglePlay", window.__lyrixPlayHandler);

  if (window.__lyrixPlayRemote) window.removeEventListener("lyrix:play-remote", window.__lyrixPlayRemote);
  window.__lyrixPlayRemote = () => {
    if (store.ui.lock) return;
    setPlayButtonIcon(true);
    highlightSelectionDOM();
    highlightQueuedDOM();
    updateProgressImmediate();
  };
  window.addEventListener("lyrix:play-remote", window.__lyrixPlayRemote);

  if (window.__lyrixStopRemote) window.removeEventListener("lyrix:stop-remote", window.__lyrixStopRemote);
  window.__lyrixStopRemote = () => {
    if (store.ui.lock) return;
    setPlayButtonIcon(false);
    highlightSelectionDOM();
    highlightQueuedDOM();
    updateProgressImmediate();
  };
  window.addEventListener("lyrix:stop-remote", window.__lyrixStopRemote);

  if (window.__lyrixNavHandler) window.removeEventListener("lyrix:navigateSong", window.__lyrixNavHandler);
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
  window.addEventListener("lyrix:navigateSong", window.__lyrixNavHandler);

  // ────────────────────────────────────────────────────────────────────────────
  // Progress bar + fine brano
  // ────────────────────────────────────────────────────────────────────────────
  let rafId = 0;
  let lastAlignedPlayingId = null;

  function updateProgress() {
    rafId = requestAnimationFrame(updateProgress);

    const t = store.runtime.transport;

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
          refs.progress.style.clipPath = "inset(0 100% 0 0)";
        }
        refs.item.classList.remove("playing");
      }
      return;
    }

    for (const [id, refs] of itemEls) {
      if (!refs?.progress) continue;
      if (id !== nId(t.playingSongId)) {
        refs.progress.style.clipPath = "inset(0 100% 0 0)";
        refs.item.classList.remove("playing");
      }
    }

    const song = store.data.songs[t.playingSongId];
    if (!song) return;

    // switch su 'bar' alla misura successiva
    if (store.runtime.transport.pendingNextAfterLoop && store.runtime.transport.loopExitMode === "bar" && store.runtime.transport.queuedSongId) {
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
          setState((s) => {
            s.runtime.transport.barSwitchAtMs = at;
          });
        }
        if (performance.now() >= (store.runtime.transport.barSwitchAtMs || 0)) {
          const qid = nId(store.runtime.transport.queuedSongId);
          setState((s) => {
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
          setState((s) => {
            s.ui.selectedSongId = qid;
            s.ui.editorSongId = qid;
          });
          highlightSelection();
          highlightSelectionDOM();
          highlightQueuedDOM();
          updateProgressImmediate();
          Realtime.send("song/selectById", { id: qid });
          return;
        }
      }
      // fallback 'finish' gestito a fine brano
    }

    // sync visuale selected ← playing
    forceSelectNow(nId(t.playingSongId));
    if (t.playingSongId && nId(store.ui.selectedSongId) !== nId(t.playingSongId) && lastAlignedPlayingId !== nId(t.playingSongId)) {
      lastAlignedPlayingId = nId(t.playingSongId);
      const pid = nId(t.playingSongId);
      setState((s) => {
        s.ui.selectedSongId = pid;
        s.ui.editorSongId = pid;
      });
      highlightSelection();
      highlightSelectionDOM();
      highlightQueuedDOM();
    }

    const duration = durSecOf(song) * 1000;
    const elapsed = Math.max(0, performance.now() - t.startedAt);
    const ratio = Math.min(1, elapsed / duration);

    const refs = itemEls.get(nId(t.playingSongId));
    if (refs?.progress) {
      refs.item.classList.add("playing");
      const right = `${Math.max(0, 100 - ratio * 100)}%`;
      refs.progress.style.clipPath = `inset(0 ${right} 0 0)`;
    }

    if (ratio >= 1) handleSongEndBehavior(song);
  }

  function updateProgressImmediate() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(updateProgress);
  }

  function handleSongEndBehavior(song) {
    const mode = song?.arranger?.mode || "JumpToNext";
    const repsRaw = song?.arranger?.repeats;
    const reps = Number.isFinite(Number(repsRaw)) ? Number(repsRaw) : 1;

    function restartCurrentFromZero() {
      setState((s) => {
        s.runtime.transport.startedAt = performance.now();
      });
      updateProgressImmediate();
    }

    // Loop infinito (ignora repeats)
    if (song?.arranger?.mode === "LoopSection" || song?.arranger?.mode === "Loop") {
      const loopExit = song?.arranger?.loopExit || "finish";

      function restartLoopFromZero() {
        setState((s) => {
          s.runtime.transport.startedAt = performance.now();
          s.runtime.transport.loopCount = 0;
        });
        updateProgressImmediate();
      }

      if (loopExit === "instant") {
        selectSongByDelta(+1, { keepPlayState: true });
        const pid = nId(store.runtime.transport.playingSongId);
        forceSelectNow(pid);
        setState((s) => {
          s.ui.selectedSongId = pid;
          s.ui.editorSongId = pid;
          s.runtime.transport.pendingNextAfterLoop = false;
          s.runtime.transport.queuedSongId = null;
          s.runtime.transport.barSwitchAtMs = null;
          s.runtime.transport.loopExitMode = "instant";
        });
        highlightSelection();
        highlightSelectionDOM();
        highlightQueuedDOM();
        updateProgressImmediate();
        return;
      }

      if (store.runtime.transport.pendingNextAfterLoop) {
        const qid = nId(store.runtime.transport.queuedSongId);
        if (qid) {
          setState((s) => {
            s.runtime.transport.playingSongId = qid;
            s.runtime.transport.startedAt = performance.now();
            s.runtime.transport.pendingNextAfterLoop = false;
            s.runtime.transport.queuedSongId = null;
            s.runtime.transport.barSwitchAtMs = null;
            s.runtime.transport.pausedSongId = null;
            s.runtime.transport.pausedElapsedMs = 0;
          });
          forceSelectNow(qid);
          setState((s) => {
            s.ui.selectedSongId = qid;
            s.ui.editorSongId = qid;
          });
          highlightSelection();
          highlightSelectionDOM();
          highlightQueuedDOM();
          updateProgressImmediate();
          Realtime.send("song/selectById", { id: qid });
          return;
        }

        selectSongByDelta(+1, { keepPlayState: true });
        const pid = nId(store.runtime.transport.playingSongId);
        forceSelectNow(pid);
        setState((s) => {
          s.ui.selectedSongId = pid;
          s.ui.editorSongId = pid;
          s.runtime.transport.pendingNextAfterLoop = false;
          s.runtime.transport.barSwitchAtMs = null;
          s.runtime.transport.loopExitMode = loopExit;
        });
        highlightSelection();
        highlightSelectionDOM();
        highlightQueuedDOM();
        updateProgressImmediate();
        Realtime.send("transport/next");
        return;
      }

      restartLoopFromZero();
      return;
    }

    // Jump/Stop con repeats
    const currentCount = Number(store.runtime.transport.loopCount || 0);
    const nextCount = currentCount + 1;

    if (reps > 1 && nextCount < reps) {
      setState((s) => {
        s.runtime.transport.loopCount = nextCount;
      });
      restartCurrentFromZero();
      return;
    }

    if (mode === "StopAtEnd") {
      const ids = (store.data.setlist || []).map(nId);
      if (ids.length) {
        const baseId = nId(store.runtime.transport.playingSongId || store.ui.selectedSongId || ids[0]);
        const idx = Math.max(0, ids.indexOf(baseId));
        const nextIdx = Math.max(0, Math.min(ids.length - 1, idx + 1));
        const nextId = ids[nextIdx];

        setState((s) => {
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
        Realtime.send("song/selectById", { id: nextId });
      } else {
        hardStop();
      }
      return;
    }

    // Default: JumpToNext
    selectSongByDelta(+1, { keepPlayState: true });
    const pidNext = nId(store.runtime.transport.playingSongId);
    forceSelectNow(pidNext);
    setState((s) => {
      s.ui.selectedSongId = pidNext;
      s.ui.editorSongId = pidNext;
    });
    highlightSelection();
    highlightSelectionDOM();
    highlightQueuedDOM();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Toolbar header
  // ────────────────────────────────────────────────────────────────────────────
  header.querySelector("#btn-add-song")?.addEventListener("click", () => {
    const newId = addSong({
      title: "New Song",
      bpm: null,
      duration: null,
      lyrics: [{ text: "[Verse 1]" }, { text: "" }, { text: "[Chorus]" }],
      chords: [{ chord: "[Verse 1]" }, { chord: "" }, { chord: "[Chorus]" }],
      arranger: { mode: "JumpToNext", repeats: 1, loopExit: "finish" },
    });
    const ids = store.data.setlist || [];
    const songs = ids.map((id) => store.data.songs[id]).filter(Boolean);
    Realtime.send("state/setlist", { songs });
    openEditor(newId);
  });

  function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  header.querySelector("#btn-export-setlist")?.addEventListener("click", () => {
    const payload = exportSetlistJSON();
    downloadJSON("setlist.lyrix.json", payload);
  });

  function softRefresh() {
    // Forza il router a ridisegnare la vista corrente
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Mount
  // ────────────────────────────────────────────────────────────────────────────
  layout.append(sidebar, editorHost);
  wrap.append(header, layout);

  if (store.ui.route.startsWith("#/setlist/") && store.ui.route.endsWith("/edit")) {
    const songId = store.ui.route.split("/")[2];
    if (songId) setTimeout(() => openEditor(songId), 0);
  }

  updateProgressImmediate();

  const unsubPlayIcon = subscribe((s) => {
    if (!btnPlay) return;
    setPlayButtonIcon(!!s.runtime.transport.playing);
  });

  wrap.addEventListener("DOMNodeRemoved", (e) => {
    if (e.target === wrap) {
      cancelAnimationFrame(rafId);
      unsubscribeLock?.();
      unsubPlayIcon?.();
      if (window.__lyrixPlayHandler) window.removeEventListener("lyrix:togglePlay", window.__lyrixPlayHandler);
      if (window.__lyrixNavHandler) window.removeEventListener("lyrix:navigateSong", window.__lyrixNavHandler);
      window.__lyrixPlayHandler = null;
      window.__lyrixNavHandler = null;
      if (window.__lyrixPlayRemote) window.removeEventListener("lyrix:play-remote", window.__lyrixPlayRemote);
      if (window.__lyrixStopRemote) window.removeEventListener("lyrix:stop-remote", window.__lyrixStopRemote);
      window.__lyrixPlayRemote = null;
      window.__lyrixStopRemote = null;
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Drag & Drop pagina intera (solo Files)
  // ────────────────────────────────────────────────────────────────────────────
  const fileInputGlobal = header.querySelector("#file-import");
  let dragDepth = 0;

  function isFileDrag(e) {
    const types = e?.dataTransfer?.types;
    return types && Array.from(types).includes("Files");
  }

  function setDragover(on, e) {
    wrap.classList.toggle("is-dragover", !!on);
    if (on && e) {
      const r = wrap.getBoundingClientRect();
      wrap.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      wrap.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    }
  }

  const onDragEnter = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    setDragover(true, e);
  };

  const onDragOver = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setDragover(true, e);
  };

  const onDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragover(false);
  };

  const onDrop = async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    setDragover(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) await importFromFile(f);
  };

  wrap.addEventListener("dragenter", onDragEnter);
  wrap.addEventListener("dragover", onDragOver);
  wrap.addEventListener("dragleave", onDragLeave);
  wrap.addEventListener("drop", onDrop);

  return wrap;
}
