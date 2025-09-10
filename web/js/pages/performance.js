// ──────────────────────────────────────────────────────────────────────────────
// Import
// ──────────────────────────────────────────────────────────────────────────────
import { store, setState, subscribe } from '../state/store.js';

// ──────────────────────────────────────────────────────────────────────────────
// Costanti & RegEx
// ──────────────────────────────────────────────────────────────────────────────
// Riconosce linee tipo [Verse], [Chorus 2], ecc.
const RE_SECTION = /^\s*\[[^\]]+\]\s*$/;

// Split modes: 1..4 = V(L|R), H(L|C), V(C|L), H(C|L)
const SPLIT_V_LYR_L__CHORDS_R = 1; // verticale (columns) — Lyrics sx / Chords dx
const SPLIT_H_LYR_T__CHORDS_B = 2; // orizzontale (rows)   — Lyrics top / Chords bottom
const SPLIT_V_CHORDS_L__LYR_R = 3; // verticale (columns) — Chords sx / Lyrics dx
const SPLIT_H_CHORDS_T__LYR_B = 4; // orizzontale (rows)   — Chords top / Lyrics bottom

// Padding dinamici (percentuale area visibile) per centratura delle righe
const PAD_RATIO = { lyrTop: 0.22, lyrBottom: 0.26, choTop: 0.22, choBottom: 0.20 };

// Revisione dei defaults delle prefs performance (per reset mirati)
const PERF_DEFAULTS_REV = 5;

// Default prefs locali (merge con quelle persistite)
const PERF_DEFAULTS = { splitRatio: 50, lastSplit: SPLIT_V_LYR_L__CHORDS_R };

// ──────────────────────────────────────────────────────────────────────────────
// Stato locale (riferimenti runtime interni alla view)
// ──────────────────────────────────────────────────────────────────────────────
let _vLyrics = null;                 // container Lyrics (single view)
let _vChords = null;                 // container Chords (single view)
let _splitTargets = null;            // { lyrTarget, choTarget } nella split view
let _lastChordsState = { songId: null, line: -1, tok: -1 }; // cache selezione

// ──────────────────────────────────────────────────────────────────────────────
// Utilità generiche
// ──────────────────────────────────────────────────────────────────────────────
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function px(n) { return `${Math.round(Number(n) || 0)}px`; }

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
}

function smoothScrollToCenter(container, target, duration = 280) {
  // Perché: migliora la leggibilità durante le avanzate di riga/token.
  if (!container || !target) return;
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const targetCenter = (tRect.top + tRect.bottom) / 2;
  const containerCenter = (cRect.top + cRect.bottom) / 2;
  const current = container.scrollTop;
  const delta = (targetCenter - containerCenter);
  const to = current + delta;
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const k = 1 - Math.pow(1 - p, 3); // easeOutCubic
    container.scrollTop = current + (to - current) * k;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function measureEl(el) {
  const r = el?.getBoundingClientRect?.();
  return { w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Preferences: get/apply
// ──────────────────────────────────────────────────────────────────────────────
function getPerfPrefs() {
  const u = store.prefs?.performance || {};
  if (u.__rev !== PERF_DEFAULTS_REV) {
    const FORCE_RESET = [ 'chordsLineGap', 'chordsOpacityDim', 'chordsScaleCurrent', 'chordsScaleSecondary', 'chordsSectionGap' ];
    const u2 = { ...u }; FORCE_RESET.forEach(k => delete u2[k]);
    const merged = { ...PERF_DEFAULTS, ...u2, __rev: PERF_DEFAULTS_REV };
    setState(s => { s.prefs = s.prefs || {}; s.prefs.performance = merged; });
    return merged;
  }
  return { ...PERF_DEFAULTS, ...u };
}

function applyPerfVars(node) {
  const p = getPerfPrefs();
  const target = node?.closest?.('.view.view-performance') || node || document.documentElement;

  if (Number.isFinite(p.lyricsSize)) target.style.setProperty('--lyrics-size', p.lyricsSize + 'px');
  else target.style.removeProperty('--lyrics-size');

  if (Number.isFinite(p.chordsSize)) target.style.setProperty('--chords-size', p.chordsSize + 'px');
  else target.style.removeProperty('--chords-size');

  if (Number.isFinite(p.lineGap)) target.style.setProperty('--line-gap', p.lineGap + 'px');
  else target.style.removeProperty('--line-gap');

  const left = p.splitRatio / 50; const right = (100 - p.splitRatio) / 50;
  if (Number.isFinite(left) && Number.isFinite(right)) {
    target.style.setProperty('--perf-left', left + 'fr');
    target.style.setProperty('--perf-right', right + 'fr');
    target.style.setProperty('--perf-top', left + 'fr');
    target.style.setProperty('--perf-bottom', right + 'fr');
  } else {
    target.style.removeProperty('--perf-left');
    target.style.removeProperty('--perf-right');
    target.style.removeProperty('--perf-top');
    target.style.removeProperty('--perf-bottom');
  }

  if (Number.isFinite(p.sectionGap)) target.style.setProperty('--section-gap', p.sectionGap + 'px');
  else target.style.removeProperty('--section-gap');

  if (Number.isFinite(p.lyricsOpacityDim)) target.style.setProperty('--lyrics-dim', String(p.lyricsOpacityDim));
  else target.style.removeProperty('--lyrics-dim');

  if (Number.isFinite(p.chordsLineGap)) target.style.setProperty('--chords-line-gap', p.chordsLineGap + 'px');
  else target.style.removeProperty('--chords-line-gap');

  if (Number.isFinite(p.chordsOpacityDim)) target.style.setProperty('--chords-dim', String(p.chordsOpacityDim));
  else target.style.removeProperty('--chords-dim');

  if (Number.isFinite(p.chordsSectionGap)) target.style.setProperty('--chords-section-gap', p.chordsSectionGap + 'px');
  else target.style.removeProperty('--chords-section-gap');
}

// ──────────────────────────────────────────────────────────────────────────────
// Runtime sicuro
// ──────────────────────────────────────────────────────────────────────────────
function getRuntimeSafe() {
  let perf = store?.runtime?.performance;
  const needsInit = !perf || typeof perf.vline !== 'number';
  if (needsInit) {
    perf = { view: 'lyrics', songId: null, vline: 0, choLine: 0, choTok: 0 };
    setState(s => { s.runtime = s.runtime || {}; s.runtime.performance = { ...perf }; });
    requestAnimationFrame(recenterBothIfSplit);
  }
  return perf;
}

// ──────────────────────────────────────────────────────────────────────────────
// Parsing contenuti (Lyrics/Chords → visual model)
// ──────────────────────────────────────────────────────────────────────────────
function isSection(line) {
  const t = (typeof line === 'string' ? line : (line?.text ?? '')).trim();
  return RE_SECTION.test(t);
}

function parseLyricsVisual(rawLyrics) {
  const lines = Array.isArray(rawLyrics) ? rawLyrics : [];
  const visual = []; const visualToTextIdx = [];
  for (let i = 0; i < lines.length; i++) {
    const obj = lines[i];
    if (isSection(obj)) {
      if (visual.length && visual[visual.length - 1].type !== 'gap') visual.push({ type: 'gap' });
      continue;
    }
    const text = (typeof obj === 'string' ? obj : (obj?.text ?? '')).trim();
    visual.push({ type: 'line', text });
    visualToTextIdx.push(i);
  }
  while (visual.length && visual[visual.length - 1].type === 'gap') visual.pop();
  return { visual, visualToTextIdx };
}

function normalizeChordsArray(chords) {
  const arr = Array.isArray(chords) ? chords : [];
  return arr.map(x => (typeof x === 'string' ? x.trim() : String(x?.chord ?? x?.text ?? '').trim()));
}

function parseChordsVisual(rawChords) {
  const lines = Array.isArray(rawChords) ? rawChords : [];
  const visual = [];
  for (let i = 0; i < lines.length; i++) {
    const entry = lines[i];
    const s = (typeof entry === 'string' ? entry : (entry?.chord ?? entry?.text ?? '')).trim();
    if (RE_SECTION.test(s)) {
      if (visual.length && visual[visual.length - 1].type !== 'gap') visual.push({ type: 'gap' });
      continue;
    }
    visual.push({ type: 'line', text: s });
  }
  while (visual.length && visual[visual.length - 1].type === 'gap') visual.pop();
  return { visual };
}

function chordTokens(line) { return String(line || '').trim().split(/\s+/).filter(Boolean).map(t => ({ text: t })); }

function currentSectionName(lyricsArray, vline) {
  const raw = Array.isArray(lyricsArray) ? lyricsArray.map(x => (typeof x === 'string' ? x : (x?.text ?? ''))) : [];
  let visualCount = -1; let physicalIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const t = (raw[i] || '').trim();
    if (RE_SECTION.test(t)) continue;
    visualCount++; if (visualCount === vline) { physicalIdx = i; break; }
  }
  if (physicalIdx < 0) physicalIdx = 0;
  for (let i = physicalIdx; i >= 0; i--) {
    const s = (raw[i] || '').trim();
    const m = s.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) return m[1].trim();
  }
  return '';
}

function currentSectionNameFromStrings(strArr, vline) {
  const raw = Array.isArray(strArr) ? strArr.map(x => String(x ?? '').trim()) : [];
  let vcount = -1, phys = -1;
  for (let i = 0; i < raw.length; i++) { if (!RE_SECTION.test(raw[i])) { vcount++; if (vcount === vline) { phys = i; break; } } }
  if (phys < 0) phys = 0;
  for (let i = phys; i >= 0; i--) { const m = raw[i].match(/^\s*\[([^\]]+)\]\s*$/); if (m) return m[1].trim(); }
  return '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Calcolo padding dinamici per split view
// ──────────────────────────────────────────────────────────────────────────────
function setPanePads(el, kind) {
  if (!el) return;
  const h = el.clientHeight || el.getBoundingClientRect().height || 0;
  const top = Math.round(h * (kind === 'lyrics' ? PAD_RATIO.lyrTop : PAD_RATIO.choTop));
  const bottom = Math.round(h * (kind === 'lyrics' ? PAD_RATIO.lyrBottom : PAD_RATIO.choBottom));
  el.style.setProperty('--pad-top', px(top));
  el.style.setProperty('--pad-bottom', px(bottom));
}

function refreshSplitPads() {
  if (_splitTargets) {
    setPanePads(_splitTargets.lyrTarget, 'lyrics');
    setPanePads(_splitTargets.choTarget, 'chords');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Layout helpers (Split)
// ──────────────────────────────────────────────────────────────────────────────
function buildSplitDOM(container) {
  container.innerHTML = `
    <div class="pane pane-lyrics"><div class="lyrics"></div></div>
    <div class="split-handle" id="split-handle"></div>
    <div class="pane pane-chords"><div class="chords"></div></div>
  `;
  return {
    paneLyrics: container.querySelector('.pane-lyrics .lyrics'),
    paneChords: container.querySelector('.pane-chords .chords'),
    handle: container.querySelector('#split-handle')
  };
}

function setSplitLayoutClass(container, mode) {
  container.classList.remove('split-h','split-v');
  if (mode === SPLIT_V_LYR_L__CHORDS_R || mode === SPLIT_V_CHORDS_L__LYR_R) container.classList.add('split-h');
  else container.classList.add('split-v');
}

function fillSplitPanes(container, els, mode, song, rt) {
  const lyrTarget = (mode === SPLIT_V_CHORDS_L__LYR_R || mode === SPLIT_H_CHORDS_T__LYR_B) ? els.paneChords : els.paneLyrics;
  const choTarget = (lyrTarget === els.paneLyrics) ? els.paneChords : els.paneLyrics;
  lyrTarget.classList.remove('chords'); lyrTarget.classList.add('lyrics');
  choTarget.classList.remove('lyrics'); choTarget.classList.add('chords');

  // Lyrics → HTML
  const { visual: lyrVisual } = parseLyricsVisual(song.lyrics);
  lyrTarget.dataset.songId = String(song.id);
  lyrTarget.innerHTML = lyrVisual.map((item, idx) => item.type === 'gap'
    ? `<div class="gap"></div>`
    : `<div class="line" data-role="line" data-vidx="${idx}">${item.text || '&nbsp;'}</div>`).join('');

  // Chords → HTML
  const chordStrings = normalizeChordsArray(song.chords);
  const { visual: choVisual } = parseChordsVisual(chordStrings);
  choTarget.dataset.songId = String(song.id);
  choTarget.innerHTML = choVisual.length
    ? choVisual.map((item, idx) => item.type === 'gap'
        ? `<div class="gap"></div>`
        : (() => { const toks = chordTokens(item.text); const html = toks.map((t, ti) => `<span class="chord-token" data-tok="${ti}">${t.text}</span>`).join(' '); return `<div class="line" data-role="line" data-vidx="${idx}">${html || '&nbsp;'}</div>`; })()
      ).join('')
    : `<p class="muted">No chords found in this song.</p>`;

  return { lyrTarget, choTarget };
}

function attachSplitDrag(container, handle) {
  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    const isH = container.classList.contains('split-h');
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
    let ratio = 50;
    if (isH) { const x = clamp(clientX - rect.left, 0, rect.width); ratio = Math.round((x / rect.width) * 100); }
    else { const y = clamp(clientY - rect.top, 0, rect.height); ratio = Math.round((y / rect.height) * 100); }
    ratio = clamp(ratio, 10, 90);
    setState(s => { s.prefs = s.prefs || {}; s.prefs.performance = { ...(s.prefs.performance || {}), splitRatio: ratio, __rev: PERF_DEFAULTS_REV }; });
    applyPerfVars(container); refreshSplitPads(); requestAnimationFrame(recenterBothIfSplit);
  };
  const onDown = () => { dragging = true; handle.classList.add('is-dragging'); document.addEventListener('mousemove', onMove); document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('mouseup', onUp); document.addEventListener('touchend', onUp); };
  const onUp = () => { dragging = false; handle.classList.remove('is-dragging'); document.removeEventListener('mousemove', onMove); document.removeEventListener('touchmove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchend', onUp); };
  handle.addEventListener('mousedown', onDown); handle.addEventListener('touchstart', onDown, { passive: true });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers di vista corrente
// ──────────────────────────────────────────────────────────────────────────────
function currentSong(state) {
  const s = state || store; const id = s.ui?.selectedSongId || s.data?.setlist?.[0] || null; return id ? s.data.songs[id] : null;
}

function recenterCurrentLine() {
  const rt = getRuntimeSafe();
  if (rt.view === 'chords') {
    const cur = _vChords?.querySelector('.line.current'); if (cur) smoothScrollToCenter(_vChords, cur, 320);
  } else {
    const cur = _vLyrics?.querySelector('.line.current'); if (cur) smoothScrollToCenter(_vLyrics, cur, 320);
  }
}

function recenterBothIfSplit() {
  const rt = getRuntimeSafe();
  if (rt.view === 'split') {
    const lyr = _splitTargets?.lyrTarget || document.querySelector('.pane-lyrics .lyrics, .pane-chords .lyrics');
    const cho = _splitTargets?.choTarget || document.querySelector('.pane-lyrics .chords, .pane-chords .chords');
    const curL = lyr?.querySelector('.line.current'); const curC = cho?.querySelector('.line.current');
    if (curL) smoothScrollToCenter(lyr, curL, 320); if (curC) smoothScrollToCenter(cho, curC, 320);
  } else { recenterCurrentLine(); }
}

// ──────────────────────────────────────────────────────────────────────────────
// Render principale
// ──────────────────────────────────────────────────────────────────────────────
export function renderPerformance() {
  const el = document.createElement('section');
  el.className = 'view view-performance';
  el.innerHTML = `
<header class="view-header perf-chrome">
  <h2>Performance</h2>
  <div class="spacer"></div>
  <div class="performance-toolbar">
    <div class="segmented" role="tablist" aria-label="View mode">
      <button class="btn ghost small" id="btn-view-lyrics" role="tab" aria-pressed="true">Lyrics</button>
      <button class="btn ghost small" id="btn-view-chords" role="tab" aria-pressed="false">Chords</button>
      <button class="btn ghost small" id="btn-view-split"  role="tab" aria-pressed="false" title="Split">Split</button>
    </div>
  </div>
</header>
<div class="performance-body">
  <div class="performance-stage perf-core">
    <div class="performance-titlebar">
      <div class="performance-title" id="perf-title"></div>
      <div class="section-indicator" id="perf-section"></div>
    </div>
    <div class="lyrics single" part="lyrics"></div>
    <div class="chords single" part="chords" style="display:none"></div>
    <div class="stage-content" id="stage-content"></div>
  </div>
</div>`;

  // Riferimenti DOM
  const wrap = el; const stage = el.querySelector('.performance-stage');
  const vTitle = el.querySelector('#perf-title'); const vSec = el.querySelector('#perf-section');
  const vLyrics = el.querySelector('.lyrics'); const vChords = el.querySelector('.chords');
  const $btnLyrics = el.querySelector('#btn-view-lyrics'); const $btnChords = el.querySelector('#btn-view-chords'); const $btnSplit = el.querySelector('#btn-view-split');
  const stageContent = el.querySelector('#stage-content');
  _vLyrics = vLyrics; _vChords = vChords;

  // ────────────────────────────────────────────────────────────────────────────
  // Fullscreen (UI + logica + scorciatoie)
  // ────────────────────────────────────────────────────────────────────────────
  const fsBtn = document.createElement('button');
  fsBtn.className = 'btn-icon btn-fs-toggle'; fsBtn.type = 'button'; fsBtn.setAttribute('aria-label', 'Toggle fullscreen');
  fsBtn.innerHTML = `
    <svg class="icon-fs-enter" fill="var(--fg)" height="18" width="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5v3h1v-2h2v-1zm9 9v2h-2v1h3v-3zm1-9h-3v1h2v2h1zm-11 11h3v-1h-2v-2h-1z"/></svg>
    <svg class="icon-fs-exit" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--fg)" d="M7 7h4V5H5v6h2zm10 10h-4v2h6v-6h-2zM17 7v4h2V5h-6v2zM7 17v-4H5v6h6v-2z"/></svg>
  `;
  wrap.appendChild(fsBtn);

  document.addEventListener('fullscreenchange', () => { if (!isFullscreen()) wrap.classList.remove('is-fullscreen', 'is-fullscreen-fallback'); requestAnimationFrame(recenterCurrentLine); refreshSplitPads(); });

  async function enterFS(elm) {
    try {
      if (elm.requestFullscreen) await elm.requestFullscreen();
      else if (elm.webkitRequestFullscreen) await elm.webkitRequestFullscreen();
      else if (elm.mozRequestFullScreen) await elm.mozRequestFullScreen();
      else elm.classList.add('is-fullscreen-fallback');
      elm.classList.add('is-fullscreen');
    } catch { elm.classList.add('is-fullscreen', 'is-fullscreen-fallback'); }
    requestAnimationFrame(() => { wrap.focus({ preventScroll: true }); recenterCurrentLine(); });
  }
  async function exitFS(elm) { try { if (isFullscreen()) { if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) await document.webkitExitFullscreen(); else if (document.mozCancelFullScreen) await document.mozCancelFullScreen(); } } finally { elm.classList.remove('is-fullscreen', 'is-fullscreen-fallback'); } }
  fsBtn.addEventListener('click', () => { if (isFullscreen() || wrap.classList.contains('is-fullscreen-fallback')) exitFS(wrap); else enterFS(wrap); });
  document.addEventListener('fullscreenchange', () => { if (!isFullscreen()) wrap.classList.remove('is-fullscreen', 'is-fullscreen-fallback'); });
  wrap.addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); fsBtn.click(); } });
  wrap.setAttribute('tabindex', '-1');

  // ────────────────────────────────────────────────────────────────────────────
  // Resize handling (split)
  // ────────────────────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => { if (getRuntimeSafe().view === 'split') { refreshSplitPads(); requestAnimationFrame(recenterBothIfSplit); } });
  ro.observe(stageContent);
  const onWinResize = () => { if (getRuntimeSafe().view === 'split') { refreshSplitPads(); requestAnimationFrame(recenterBothIfSplit); } };
  window.addEventListener('resize', onWinResize);

  // ────────────────────────────────────────────────────────────────────────────
  // Render reattivo da stato
  // ────────────────────────────────────────────────────────────────────────────
  function renderFromState(s) {
    applyPerfVars(el);
    const song = currentSong(s);
    if (!song) { vLyrics.innerHTML = '<p class="muted">Select a song in the <a href="#/setlist">Setlist</a>.</p>'; return; }

    const rt = getRuntimeSafe();
    const { visual, visualToTextIdx } = parseLyricsVisual(song.lyrics);
    
    // Toolbar aria-state
    el.querySelector('#btn-view-lyrics')?.setAttribute('aria-pressed', String(rt.view === 'lyrics'));
    el.querySelector('#btn-view-chords')?.setAttribute('aria-pressed', String(rt.view === 'chords'));
    el.querySelector('#btn-view-split')?.setAttribute('aria-pressed', String(rt.view === 'split'));

    // NEW: sincronizza anche la classe .active per l'effetto "acceso"
    $btnLyrics.classList.toggle('active', rt.view === 'lyrics');
    $btnChords.classList.toggle('active', rt.view === 'chords');
    $btnSplit.classList.toggle('active', rt.view === 'split');


    // Header
    vTitle.textContent = song.title || 'Untitled';

    // Branch: SPLIT
    if (rt.view === 'split') {
      vLyrics.style.display = 'none'; vChords.style.display = 'none'; el.classList.add('is-split'); stageContent.classList.add('is-on');
      const { lastSplit = SPLIT_V_LYR_L__CHORDS_R } = getPerfPrefs(); setSplitLayoutClass(stageContent, lastSplit);
      const needBuildSplit = !stageContent.dataset.songId || stageContent.dataset.songId !== String(song.id);
      if (needBuildSplit) {
        stageContent.dataset.songId = String(song.id);
        const els = buildSplitDOM(stageContent);
        _splitTargets = fillSplitPanes(stageContent, els, lastSplit, song, rt);
        refreshSplitPads(); attachSplitDrag(stageContent, els.handle); _lastChordsState = { songId: null, line: -1, tok: -1 };
      } else {
        const paneL = stageContent.querySelector('.pane-lyrics'); const paneC = stageContent.querySelector('.pane-chords');
        const lyrNode = stageContent.querySelector('.pane-lyrics > .lyrics, .pane-chords > .lyrics');
        const choNode = stageContent.querySelector('.pane-lyrics > .chords, .pane-chords > .chords');
        const lyrOnRightOrBottom = (lastSplit === SPLIT_V_CHORDS_L__LYR_R || lastSplit === SPLIT_H_CHORDS_T__LYR_B);
        if (lyrOnRightOrBottom) { if (lyrNode?.parentElement !== paneC) paneC?.appendChild(lyrNode); if (choNode?.parentElement !== paneL) paneL?.appendChild(choNode); }
        else { if (lyrNode?.parentElement !== paneL) paneL?.appendChild(lyrNode); if (choNode?.parentElement !== paneC) paneC?.appendChild(choNode); }
        _splitTargets = { lyrTarget: lyrNode, choTarget: choNode }; stageContent.dataset.mode = String(lastSplit);
      }

      // Evidenzia Lyrics corrente + scroll
      (function () { const lines = visual.filter(x => x.type === 'line'); const idx = clamp(rt.vline || 0, 0, Math.max(0, lines.length - 1)); let vIdx = -1, c = -1; for (let i = 0; i < visual.length; i++) { if (visual[i].type === 'line') { c++; if (c === idx) { vIdx = i; break; } } } const lyr = _splitTargets?.lyrTarget; if (lyr && vIdx >= 0) { lyr.querySelectorAll('.line.current').forEach(n => n.classList.remove('current')); const node = lyr.querySelector(`.line[data-vidx="${vIdx}"]`); node?.classList.add('current'); smoothScrollToCenter(lyr, node, 420); } })();

      // Evidenzia Chords corrente + token
      (function () { const chordStrings = normalizeChordsArray(song.chords); const { visual: V } = parseChordsVisual(chordStrings); const chordLines = V.filter(x => x.type === 'line'); if (chordLines.length) { rt.choLine = clamp(rt.choLine ?? 0, 0, chordLines.length - 1); let tgt = -1, cnt = -1; for (let i = 0; i < V.length; i++) { if (V[i].type === 'line') { cnt++; if (cnt === rt.choLine) { tgt = i; break; } } } const cho = _splitTargets?.choTarget; const changed = (_lastChordsState.songId !== song.id) || (_lastChordsState.line !== rt.choLine) || (_lastChordsState.tok !== (rt.choTok ?? 0)); if (changed) { cho?.querySelectorAll('.line.current').forEach(n => n.classList.remove('current')); cho?.querySelectorAll('.chord-token.now').forEach(n => n.classList.remove('now')); const curLineEl = cho?.querySelector(`.line[data-vidx="${tgt}"]`); if (curLineEl) { curLineEl.classList.add('current'); const toks = curLineEl.querySelectorAll('.chord-token'); if (toks.length) { rt.choTok = clamp(rt.choTok ?? 0, 0, toks.length - 1); toks[rt.choTok].classList.add('now'); } else { rt.choTok = 0; } smoothScrollToCenter(cho, curLineEl, 420); } _lastChordsState = { songId: song.id, line: rt.choLine ?? 0, tok: rt.choTok ?? 0 }; } } })();

      vSec.textContent = currentSectionName(song.lyrics, rt.vline || 0) || '';
      return; // fine branch split
    }

    // Branch: CHORDS (single)
    if (rt.view === 'chords') {
      vLyrics.style.display = 'none'; vChords.style.display = '';
      const chordStrings = normalizeChordsArray(song.chords); const { visual: V } = parseChordsVisual(chordStrings);
      if (!V.some(x => x.type === 'line')) { vChords.dataset.songId = String(song.id); vChords.innerHTML = `<p class="muted">No chords found in this song.</p>`; vSec.textContent = ''; return; }
      const needsBuild = !vChords.dataset.songId || vChords.dataset.songId !== String(song.id);
      if (needsBuild) { vChords.dataset.songId = String(song.id); vChords.innerHTML = V.map((item, idx) => item.type === 'gap' ? `<div class="gap"></div>` : (() => { const toks = chordTokens(item.text); const html = toks.map((t, ti) => `<span class="chord-token" data-tok="${ti}">${t.text}</span>`).join(' '); return `<div class="line" data-role="line" data-vidx="${idx}">${html || '&nbsp;'}</div>`; })()).join(''); }
      const chordLines = V.filter(x => x.type === 'line'); const totalChordLines = chordLines.length; const rtPerf = getRuntimeSafe();
      if (song.id !== rt.songId) { rt.vline = 0; rt.choLine = 0; rt.choTok = 0; rt.songId = song.id; setState(ss => { ss.runtime.performance = { ...rt }; }); requestAnimationFrame(recenterBothIfSplit); }
      rtPerf.choLine = clamp(rtPerf.choLine ?? 0, 0, Math.max(0, totalChordLines - 1));
      let targetVisualIdx = -1, count = -1; for (let i = 0; i < V.length; i++) { if (V[i].type === 'line') { count++; if (count === rtPerf.choLine) { targetVisualIdx = i; break; } } }
      if (targetVisualIdx < 0) targetVisualIdx = V.findIndex(x => x.type === 'line');
      vChords.querySelectorAll('.line.current').forEach(n => n.classList.remove('current')); vChords.querySelectorAll('.chord-token.now').forEach(n => n.classList.remove('now'));
      const curLineEl = vChords.children[targetVisualIdx]; if (curLineEl) { curLineEl.classList.add('current'); const toks = curLineEl.querySelectorAll('.chord-token'); if (toks.length) { rtPerf.choTok = clamp(rtPerf.choTok ?? 0, 0, toks.length - 1); toks[rtPerf.choTok].classList.add('now'); } else { rtPerf.choTok = 0; } smoothScrollToCenter(vChords, curLineEl, 420); }
      vSec.textContent = currentSectionNameFromStrings(chordStrings, rtPerf.choLine || 0) || '';
    } else {
      // Branch: LYRICS (single)
      vChords.style.display = 'none'; vLyrics.style.display = '';
      el.classList.remove('is-split'); stageContent.classList.remove('is-on');
      stageContent.querySelectorAll('.lyrics .line.current').forEach(n => n.classList.remove('current')); stageContent.querySelectorAll('.chords .line.current').forEach(n => n.classList.remove('current'));
      if (song.id !== rt.songId) { rt.vline = 0; rt.songId = song.id; setState(ss => { ss.runtime.performance = { ...rt }; }); requestAnimationFrame(recenterBothIfSplit); }
      const needRebuild = vLyrics.dataset.songId !== String(song.id);
      if (needRebuild) { vLyrics.dataset.songId = String(song.id); vLyrics.innerHTML = visual.map((item, idx) => item.type === 'gap' ? `<div class="gap"></div>` : `<div class="line" data-role="line" data-vidx="${idx}">${item.text || '&nbsp;'}</div>`).join(''); }
      let currentVisualIdx = -1; { let count = -1; for (let i = 0; i < visual.length; i++) { if (visual[i].type === 'line') { count++; if (count === rt.vline) { currentVisualIdx = i; break; } } } }
      const prev = vLyrics.querySelector('.line.current'); if (prev) prev.classList.remove('current');
      if (currentVisualIdx >= 0) { const nodes = vLyrics.children; const cur = nodes[currentVisualIdx]; void cur?.offsetHeight; requestAnimationFrame(() => { requestAnimationFrame(() => { cur.classList.add('current'); }); }); smoothScrollToCenter(vLyrics, cur, 420); }
      vSec.textContent = currentSectionName(song.lyrics, rt.vline) || '';
    }
  }

  const unsub = subscribe(renderFromState); renderFromState(store);

  // ────────────────────────────────────────────────────────────────────────────
  // Interazioni (Keyboard & Toolbar)
  // ────────────────────────────────────────────────────────────────────────────
  function onKey(e) {
    if (!document.body.contains(el)) return; const song = currentSong(store); if (!song) return; const rt = getRuntimeSafe();

    // Lyrics: su/giù
    if (rt.view === 'lyrics' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault(); const { visual } = parseLyricsVisual(song.lyrics); const totalLines = visual.filter(it => it.type === 'line').length; if (!totalLines) return;
      if (e.key === 'ArrowUp') rt.vline = Math.max(0, rt.vline - 1); if (e.key === 'ArrowDown') rt.vline = Math.min(totalLines - 1, rt.vline + 1);
      setState(s => { s.runtime.performance = { ...rt }; }); requestAnimationFrame(recenterBothIfSplit); return;
    }

    // Chords: sx/dx con wrap
    if (rt.view === 'chords' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); const chordStrings = normalizeChordsArray(song.chords); const { visual } = parseChordsVisual(chordStrings); const chordLines = visual.filter(x => x.type === 'line'); if (!chordLines.length) return;
      rt.choLine = clamp(rt.choLine ?? 0, 0, chordLines.length - 1); const tokens = chordTokens(chordLines[rt.choLine]?.text || ''); const lastTokIdx = Math.max(0, tokens.length - 1);
      if (e.key === 'ArrowRight') { if ((rt.choTok ?? 0) < lastTokIdx) rt.choTok = (rt.choTok ?? 0) + 1; else if (rt.choLine < chordLines.length - 1) { rt.choLine += 1; rt.choTok = 0; } }
      else if (e.key === 'ArrowLeft') { if ((rt.choTok ?? 0) > 0) rt.choTok = (rt.choTok ?? 0) - 1; else if (rt.choLine > 0) { rt.choLine -= 1; const prevTokens = chordTokens(chordLines[rt.choLine]?.text || ''); rt.choTok = Math.max(0, prevTokens.length - 1); } }
      setState(s => { s.runtime.performance = { ...rt }; }); requestAnimationFrame(recenterBothIfSplit); return;
    }

    // Split: su/giù -> lyrics, sx/dx -> chords
    if (rt.view === 'split') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); const { visual } = parseLyricsVisual(song.lyrics); const total = visual.filter(it => it.type === 'line').length; if (total > 0) { if (e.key === 'ArrowUp') rt.vline = Math.max(0, (rt.vline ?? 0) - 1); if (e.key === 'ArrowDown') rt.vline = Math.min(total - 1, (rt.vline ?? 0) + 1); setState(s => { s.runtime.performance = { ...rt }; }); requestAnimationFrame(recenterBothIfSplit); } return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); const chordStrings = normalizeChordsArray(song.chords); const { visual } = parseChordsVisual(chordStrings); const chordLines = visual.filter(x => x.type === 'line'); if (chordLines.length) { rt.choLine = clamp(rt.choLine ?? 0, 0, chordLines.length - 1); const tokens = chordTokens(chordLines[rt.choLine]?.text || ''); const lastTokIdx = Math.max(0, tokens.length - 1); if (e.key === 'ArrowRight') { if ((rt.choTok ?? 0) < lastTokIdx) rt.choTok = (rt.choTok ?? 0) + 1; else if (rt.choLine < chordLines.length - 1) { rt.choLine += 1; rt.choTok = 0; } } else { if ((rt.choTok ?? 0) > 0) rt.choTok = (rt.choTok ?? 0) - 1; else if (rt.choLine > 0) { rt.choLine -= 1; rt.choTok = Math.max(0, chordTokens(chordLines[rt.choLine]?.text || '').length - 1); } } setState(s => { s.runtime.performance = { ...rt }; }); requestAnimationFrame(recenterBothIfSplit); } return;
      }
    }
  }

  window.addEventListener('keydown', onKey);

  // Toolbar: switch view
  $btnLyrics.addEventListener('click', () => { const rt = getRuntimeSafe(); if (rt.view !== 'lyrics') { setState(s => { s.runtime.performance.view = 'lyrics'; }); requestAnimationFrame(recenterCurrentLine); } });
  $btnChords.addEventListener('click', () => { const rt = getRuntimeSafe(); if (rt.view !== 'chords') { setState(s => { s.runtime.performance.view = 'chords'; }); requestAnimationFrame(recenterBothIfSplit); } });
  $btnSplit.addEventListener('click', () => { const rt = getRuntimeSafe(); const prefs = getPerfPrefs(); let next = prefs.lastSplit || SPLIT_V_LYR_L__CHORDS_R; if (rt.view !== 'split') { setState(s => { s.runtime.performance.view = 'split'; s.prefs = s.prefs || {}; s.prefs.performance = { ...(s.prefs.performance || {}), lastSplit: next, __rev: PERF_DEFAULTS_REV }; }); _lastChordsState = { songId: null, line: -1, tok: -1 }; } else { next = (next % 4) + 1; setState(s => { s.prefs = s.prefs || {}; s.prefs.performance = { ...(s.prefs.performance || {}), lastSplit: next, __rev: PERF_DEFAULTS_REV }; }); requestAnimationFrame(() => renderFromState(store)); _lastChordsState = { songId: null, line: -1, tok: -1 }; } });

  // ────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ────────────────────────────────────────────────────────────────────────────
  el.addEventListener('DOMNodeRemoved', (e) => { if (e.target === el) { unsub?.(); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onWinResize); ro?.disconnect?.(); } });

  return el;
}
