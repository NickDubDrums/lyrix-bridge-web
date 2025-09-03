import { store, setState, subscribe, exportSongJSON } from '../state/store.js';
import { Realtime } from '../state/ws.js';



const RE_SECTION = /^\s*\[([^\]]+)\]\s*$/;

// -------- Utilità caret/line/token ------------------------------------------
function caretLine(textarea) {
  const pos = textarea.selectionStart ?? 0;
  const txt = textarea.value.slice(0, pos);
  return txt.split(/\r?\n/).length - 1;
}
function caretCol(textarea) {
  const pos = textarea.selectionStart ?? 0;
  const before = textarea.value.slice(0, pos);
  const lastNL = before.lastIndexOf('\n');
  return pos - (lastNL + 1);
}
function moveCaretToLine(ta, lineIdx, col = 0) {
  const lines = ta.value.split(/\r?\n/);
  let pos = 0;
  for (let i = 0; i < lineIdx; i++) pos += (lines[i]?.length ?? 0) + 1; // + \n
  pos += Math.max(0, Math.min(col, (lines[lineIdx] || '').length));
  ta.focus();
  ta.setSelectionRange(pos, pos);
}
function chordTokensWithStarts(line) {
  const tokens = [];
  const re = /[^\s]+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    tokens.push({ text: m[0], start: m.index });
  }
  return tokens;
}
function tokenIndexFromCaret(line, caretColumn) {
  const toks = chordTokensWithStarts(line);
  if (toks.length === 0) return { idx: 0, toks };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (caretColumn <= t.start + t.text.length) return { idx: i, toks };
  }
  return { idx: toks.length - 1, toks };
}
function renderChordCarousel(tokens, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'chord-carousel';
  tokens.forEach((t, i) => {
    const span = document.createElement('span');
    span.textContent = t.text ?? t;
    span.className = 'chord-token ' + (i === idx ? 'now' : Math.abs(i - idx) === 1 ? 'near' : 'far');
    wrap.appendChild(span);
  });
  return wrap;
}
function findSectionNameUp(lines, fromIdx) {
  for (let i = fromIdx; i >= 0; i--) {
    const s = (lines[i] || '').trim();
    const m = s.match(RE_SECTION);
    if (m) return m[1].trim();
  }
  return null;
}
function parseDurationToSec(str) {
  if (!str) return undefined;
  const m = String(str).trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return undefined;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  return (min * 60) + sec;
}
function formatSec(sec) {
  if (!Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// -------- Component ----------------------------------------------------------
export function createEditorPanel(song, opts = {}) {
  const root = document.createElement('div');
  root.className = 'editor-panel vertical';

  // --- Dati iniziali ---------------------------------------------------------
  const lyricsRaw = (song.lyrics || []).map(l => l.text ?? '').join('\n');
  const chordsAllLines = (song.chords || []).map(c => c.chord ?? '');
  const chordsVisibleLines = chordsAllLines.filter(line => !RE_SECTION.test((line || '').trim()));
  const chordsRaw = chordsVisibleLines.join('\n');
  const meta = {
    title: song.title ?? '',
    artist: song.artist ?? '',
    bpm: song.bpm ?? '',
    key: song.key ?? '',
    duration: formatSec(song.duration),
    arranger: {
      mode: song.arranger?.mode ?? 'JumpToNext',
      repeats: song.arranger?.repeats ?? 1,
      loopExit: song.arranger?.loopExit ?? 'finish',
    }
  };

  // --- Markup (tabs stile "linguette") --------------------------------------
  root.innerHTML = `
    <div class="editor-topbar">
      <div>Section: <strong id="sec-name">Default</strong></div>
      <div class="actions">
      <button id="btn-save" class="btn primary">Save Song</button>
      <button id="btn-close" class="btn danger">✕</button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="meta">Metadata</button>
      <button class="tab-btn" data-tab="lyrics">Lyrics</button>
      <button class="tab-btn" data-tab="chords">Chords</button>
      <div class="tab-underline"></div>
    </div>

    <div class="tab-panels">
      <section class="tab-panel active" id="tab-meta">
        <div class="editor-block meta-block">
          <div class="meta-grid">
            <label>Title<input id="meta-title" type="text"></label>
            <label>Artist<input id="meta-artist" type="text"></label>
            <label>BPM<input id="meta-bpm" type="number" min="0" step="1"></label>
            <label>Key<input id="meta-key" type="text" placeholder="e.g. Am"></label>
            <label>Duration (mm:ss)<input id="meta-duration" type="text" placeholder="3:45"></label>
            <label>End Mode
              <select id="meta-behavior">
                <option value="JumpToNext">Jump to next song</option>
                <option value="StopAtEnd">Stop at end</option>
                <option value="LoopSection">Loop section</option>
              </select>
            </label>

            <label id="meta-repeats-wrap">Repeats
              <input id="meta-repeats" type="number" min="1" step="1" placeholder="1">
            </label>

            <label id="meta-loopexit-wrap">Loop Exit
              <select id="meta-loop-exit">
                <option value="finish">At End Of Loop</option>
                <option value="bar">1 Bar</option>
                <option value="Instant">Instant</option>
              </select>
            </label>


          </div>
        </div>
      </section>

      <section class="tab-panel" id="tab-lyrics">
        <div class="editor-block">
          <div class="row between">
            <h3>Lyrics</h3>
            <div class="control-group">
              <button id="lyr-prev" class="btn">Prev line</button>
              <button id="lyr-next" class="btn">Next line</button>
            </div>
          </div>
          <textarea id="ta-lyrics" spellcheck="false"></textarea>
          <div class="preview">
            <div class="preview-title">Riga corrente</div>
            <div id="lyric-current" class="lyric-current"></div>
          </div>
        </div>
      </section>

      <section class="tab-panel" id="tab-chords">
        <div class="editor-block">
          <div class="row between">
            <h3>Chords</h3>
            <div class="control-group">
              <button id="cho-line-prev" class="btn">Prev line</button>
              <button id="cho-line-next" class="btn">Next line</button>
              <button id="cho-token-prev" class="btn">◀︎</button>
              <button id="cho-token-next" class="btn">▶︎</button>
            </div>
          </div>
          <textarea id="ta-chords" spellcheck="false"></textarea>
          <div class="preview">
            <div class="preview-title">Linea corrente</div>
            <div id="chords-carousel"></div>
          </div>
        </div>
      </section>

      
    </div>
    <div>
    <button id="btn-export" class="btn primary">Export Song</button>
    </div>
  `;

  // --- Refs ------------------------------------------------------------------
  const $sec = root.querySelector('#sec-name');
  const $btnSave = root.querySelector('#btn-save');
  const $btnClose = root.querySelector('#btn-close');
  const $btnExport = root.querySelector('#btn-export');
  const $tabs = [...root.querySelectorAll('.tab-btn')];
  const $underline = root.querySelector('.tab-underline');
  const $panels = {
    meta: root.querySelector('#tab-meta'),
    lyrics: root.querySelector('#tab-lyrics'),
    chords: root.querySelector('#tab-chords'),
  };

  const $metaTitle = root.querySelector('#meta-title');
  const $metaArtist = root.querySelector('#meta-artist');
  const $metaBpm = root.querySelector('#meta-bpm');
  const $metaKey = root.querySelector('#meta-key');
  const $metaDur = root.querySelector('#meta-duration');
  const $metaBehavior = root.querySelector('#meta-behavior');
  const $metaRepeats  = root.querySelector('#meta-repeats');
  const $metaLoopExit     = root.querySelector('#meta-loop-exit');
  const $metaRepeatsWrap  = root.querySelector('#meta-repeats-wrap');
  const $metaLoopExitWrap = root.querySelector('#meta-loopexit-wrap');



  const $taL = root.querySelector('#ta-lyrics');
  const $taC = root.querySelector('#ta-chords');
  const $lyrPrev = root.querySelector('#lyr-prev');
  const $lyrNext = root.querySelector('#lyr-next');
  const $choLinePrev = root.querySelector('#cho-line-prev');
  const $choLineNext = root.querySelector('#cho-line-next');
  const $choTokPrev = root.querySelector('#cho-token-prev');
  const $choTokNext = root.querySelector('#cho-token-next');

  const $lyrCurrent = root.querySelector('#lyric-current');
  const $car = root.querySelector('#chords-carousel');

  // --- Init contenuti --------------------------------------------------------
  $metaTitle.value = meta.title;
  $metaArtist.value = meta.artist;
  $metaBpm.value = meta.bpm;
  $metaKey.value = meta.key;
  $metaDur.value = meta.duration || '';
  $metaBehavior.value = meta.arranger.mode;
  $metaRepeats.value  = meta.arranger.repeats;
  $metaLoopExit.value = meta.arranger.loopExit; // ⬅️ NEW



  $taL.value = lyricsRaw || '';
  $taC.value = chordsRaw || '';

  let activeTab = 'meta'; // default
  let lyrLine = 0;
  let choLine = 0;
  let choTok = 0;

  function applyArrangerVisibility() {
  const isLoop = ($metaBehavior.value === 'LoopSection');
  // Se è Loop: nascondi Repeats, mostra Loop Exit
  $metaRepeatsWrap.style.display  = isLoop ? 'none' : '';
  $metaLoopExitWrap.style.display = isLoop ? '' : 'none';
}
applyArrangerVisibility();

// Aggiorna visibilità quando cambia la mode nel select
$metaBehavior.addEventListener('change', applyArrangerVisibility);

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

$btnExport.addEventListener('click', () => {
  // salva prima per sicurezza
  saveSong();

  const id = store.ui.editorSongId;
  const payload = exportSongJSON(id);
  if (!payload) return;

  const title = (store.data.songs[id]?.title || id).replace(/\s+/g, '-');
  downloadJSON(`${title}.lyrix-song.json`, payload);

  $btnExport.textContent = 'Exported ✓';
  setTimeout(() => $btnExport.textContent = 'Export Song', 900);
});

  // --- Tabs behavior ---------------------------------------------------------
  function updateUnderline() {
    const current = $tabs.find(b => b.classList.contains('active'));
    if (!current) return;
    const r = current.getBoundingClientRect();
    const pr = current.parentElement.getBoundingClientRect();
    const x = r.left - pr.left;
    $underline.style.transform = `translateX(${x}px)`;
    $underline.style.width = `${r.width}px`;
  }
  function setActiveTab(name) {
    activeTab = name;
    $tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    Object.entries($panels).forEach(([k, p]) => p.classList.toggle('active', k === name));
    updateUnderline();
  }
  $tabs.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));

  // --- Lock handling ---------------------------------------------------------
  function applyLock(on) {
    const ro = !!on;
    // metadata
    [$metaTitle, $metaArtist, $metaBpm, $metaKey, $metaDur].forEach(inp => inp.disabled = ro);
    // textareas
    $taL.readOnly = ro;
    $taC.readOnly = ro;
    // bottoni
    [$btnSave, $lyrPrev, $lyrNext, $choLinePrev, $choLineNext, $choTokPrev, $choTokNext]
      .forEach(btn => btn.disabled = ro);
    root.classList.toggle('read-only', ro);
  }
  applyLock(opts.readOnly ?? store.ui.lock);
  subscribe(s => applyLock(s.ui.lock));

  // --- Section indicator (priorità Lyrics, fallback Chords) ------------------
  function updateSectionIndicator() {
    const lyrLines = $taL.value.split(/\r?\n/);
    const lIdx = caretLine($taL);
    let name = findSectionNameUp(lyrLines, lIdx);
    if (!name) {
      const all = (song.chords || []).map(c => c.chord ?? '');
      // approx: stessa riga del caret nei chords editor
      const cIdx = caretLine($taC);
      name = findSectionNameUp(all, cIdx);
    }
    $sec.textContent = name || 'Default';
  }

  // --- Lyrics preview --------------------------------------------------------
  function updateLyricsPreview() {
    const lines = $taL.value.split(/\r?\n/);
    lyrLine = caretLine($taL);
    updateSectionIndicator();
    const raw = (lines[lyrLine] || '').trim();
    $lyrCurrent.textContent = RE_SECTION.test(raw) ? '' : raw;
  }

  // --- Chords preview & navigation ------------------------------------------
  function getChordLineClean(lineIdx) {
    const lines = $taC.value.split(/\r?\n/).filter(l => !RE_SECTION.test((l || '').trim()));
    return { lines, line: (lines[lineIdx] || '') };
  }
  function moveCaretToChordToken(ta, visualLineIdx, startCol) {
    const all = ta.value.split(/\r?\n/);
    const visibleIdxs = [];
    for (let i = 0; i < all.length; i++) {
      if (!RE_SECTION.test((all[i] || '').trim())) visibleIdxs.push(i);
    }
    const physicalLineIdx = visibleIdxs[Math.max(0, Math.min(visibleIdxs.length - 1, visualLineIdx))] ?? 0;
    let pos = 0;
    for (let i = 0; i < physicalLineIdx; i++) pos += (all[i]?.length ?? 0) + 1;
    pos += startCol;
    ta.focus();
    ta.setSelectionRange(pos, pos);
  }
  function updateChordsPreview({ fromCaret = false } = {}) {
    const { lines } = getChordLineClean(choLine);
    if (choLine < 0) choLine = 0;
    if (choLine > lines.length - 1) choLine = Math.max(0, lines.length - 1);

    const cur = (lines[choLine] || '').trim();
    if (!cur) { $car.replaceChildren(); return; }

    const { idx, toks } = tokenIndexFromCaret(cur, caretCol($taC));
    if (fromCaret) {
      choTok = Math.min(idx, Math.max(0, toks.length - 1));
    } else {
      choTok = Math.min(choTok, Math.max(0, toks.length - 1));
      moveCaretToChordToken($taC, choLine, toks[choTok].start);
    }
    $car.replaceChildren(renderChordCarousel(toks, choTok));
  }
  function nextChordToken() {
    const { lines } = getChordLineClean(choLine);
    if (lines.length === 0) return;
    let line = (lines[choLine] || '').trim();
    let toks = chordTokensWithStarts(line);
    if (toks.length === 0) {
      let n = choLine + 1;
      while (n < lines.length) {
        const tl = (lines[n] || '').trim();
        const tt = chordTokensWithStarts(tl);
        if (tt.length > 0) { choLine = n; choTok = 0; updateChordsPreview({ fromCaret: false }); return; }
        n++;
      }
      return;
    }
    if (choTok < toks.length - 1) {
      choTok++;
      updateChordsPreview({ fromCaret: false });
    } else {
      let n = choLine + 1;
      while (n < lines.length) {
        const tl = (lines[n] || '').trim();
        const tt = chordTokensWithStarts(tl);
        if (tt.length > 0) { choLine = n; choTok = 0; updateChordsPreview({ fromCaret: false }); return; }
        n++;
      }
    }
  }
  function prevChordToken() {
    const { lines } = getChordLineClean(choLine);
    if (lines.length === 0) return;
    let line = (lines[choLine] || '').trim();
    let toks = chordTokensWithStarts(line);
    if (toks.length === 0) {
      let p = choLine - 1;
      while (p >= 0) {
        const tl = (lines[p] || '').trim();
        const tt = chordTokensWithStarts(tl);
        if (tt.length > 0) { choLine = p; choTok = tt.length - 1; updateChordsPreview({ fromCaret: false }); return; }
        p--;
      }
      return;
    }
    if (choTok > 0) {
      choTok--;
      updateChordsPreview({ fromCaret: false });
    } else {
      let p = choLine - 1;
      while (p >= 0) {
        const tl = (lines[p] || '').trim();
        const tt = chordTokensWithStarts(tl);
        if (tt.length > 0) { choLine = p; choTok = tt.length - 1; updateChordsPreview({ fromCaret: false }); return; }
        p--;
      }
    }
  }

  // --- Save ------------------------------------------------------------------
  function saveSong() {
    song.title = $metaTitle.value.trim();
    song.artist = $metaArtist.value.trim();
    song.bpm = $metaBpm.value ? Number($metaBpm.value) : undefined;
    song.key = $metaKey.value.trim();
    const dur = parseDurationToSec($metaDur.value);
    song.duration = dur ?? song.duration;
    song.arranger = song.arranger || {};
    song.arranger.mode = $metaBehavior.value;
    song.arranger.repeats = Math.max(1, parseInt($metaRepeats.value || '1', 10));
    // In Loop salviamo anche la sotto-modalità; altrimenti la rimuoviamo
    if (song.arranger.mode === 'LoopSection') {
      song.arranger.loopExit = $metaLoopExit.value || 'finish';
    } else {
      delete song.arranger.loopExit;
    }


    song.lyrics = $taL.value.split(/\r?\n/).map(x => ({ text: x }));
    song.chords = $taC.value
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(x => x.length && !RE_SECTION.test(x))
      .map(x => ({ chord: x }));
  }

  // --- Eventi ---------------------------------------------------------------
$btnSave.addEventListener('click', () => {
  // 1) Aggiorna lo stato locale del brano (UI istantanea)
  saveSong();

  // 2) Seleziona il brano in editing lato server,
  //    così 'editor/apply' agisce sul brano giusto
  Realtime.send('song/selectById', { id: song.id });

  // 3) Metadati
  const durationSec = parseDurationToSec($metaDur.value);
  Realtime.send('song/updateMeta', {
    id:     song.id,
    title:  $metaTitle.value.trim(),
    artist: $metaArtist.value.trim(),
    bpm:    $metaBpm.value ? Number($metaBpm.value) : undefined,
    key:    $metaKey.value.trim(),
    duration: Number.isFinite(durationSec) ? durationSec : song.duration
  });

  // 4) Behavior / Arranger
  const rep = Math.max(1, parseInt($metaRepeats.value || '1', 10));
  const settings = { arranger: { mode: $metaBehavior.value, repeats: rep } };
  if ($metaBehavior.value === 'LoopSection') {
    settings.arranger.loopExit = ($metaLoopExit.value || 'finish').toLowerCase();
  }
  Realtime.send('song/updateSettings', { id: song.id, settings });

  // 5) Testi (Lyrics + Chords)
  Realtime.send('editor/apply', {
    lyricsText: $taL.value,
    chordsText: $taC.value
  });

  // 6) Feedback UI
  $btnSave.textContent = 'Saved ✓';
  setTimeout(() => $btnSave.textContent = 'Save Song', 900);
  // (facoltativo) aggiornare subito la lista visiva se necessario:
  window.dispatchEvent(new HashChangeEvent('hashchange'));
});

$btnClose.addEventListener('click', () => {
  // Per non perdere modifiche quando si chiude direttamente:
  saveSong();

  // Ripetiamo l’invio veloce (come in Save)
  Realtime.send('song/selectById', { id: song.id });

  const durationSec = parseDurationToSec($metaDur.value);
  Realtime.send('song/updateMeta', {
    id:     song.id,
    title:  $metaTitle.value.trim(),
    artist: $metaArtist.value.trim(),
    bpm:    $metaBpm.value ? Number($metaBpm.value) : undefined,
    key:    $metaKey.value.trim(),
    duration: Number.isFinite(durationSec) ? durationSec : song.duration
  });

  const rep = Math.max(1, parseInt($metaRepeats.value || '1', 10));
  const settings = { arranger: { mode: $metaBehavior.value, repeats: rep } };
  if ($metaBehavior.value === 'LoopSection') {
    settings.arranger.loopExit = ($metaLoopExit.value || 'finish').toLowerCase();
  }
  Realtime.send('song/updateSettings', { id: song.id, settings });

  Realtime.send('editor/apply', {
    lyricsText: $taL.value,
    chordsText: $taC.value
  });

  // Chiudi editor
  setState(s => { s.ui.editorOpen = false; s.ui.editorSongId = null; });
  location.hash = '#/setlist';
});


  // Lyrics prev/next
  $lyrPrev.addEventListener('click', () => {
    const lines = $taL.value.split(/\r?\n/);
    lyrLine = Math.max(0, lyrLine - 1);
    moveCaretToLine($taL, lyrLine, 0);
    updateLyricsPreview();
  });
  $lyrNext.addEventListener('click', () => {
    const lines = $taL.value.split(/\r?\n/);
    lyrLine = Math.min(lines.length - 1, lyrLine + 1);
    moveCaretToLine($taL, lyrLine, 0);
    updateLyricsPreview();
  });

  // Chords line prev/next
  $choLinePrev.addEventListener('click', () => {
    choLine = Math.max(0, choLine - 1);
    choTok = 0;
    updateChordsPreview({ fromCaret: false });
  });
  $choLineNext.addEventListener('click', () => {
    const { lines } = getChordLineClean(choLine);
    choLine = Math.min(lines.length - 1, choLine + 1);
    choTok = 0;
    updateChordsPreview({ fromCaret: false });
  });

  // Chords token prev/next
  $choTokPrev.addEventListener('click', () => prevChordToken());
  $choTokNext.addEventListener('click', () => nextChordToken());

  // Keybindings locali all’editor
  root.addEventListener('keydown', (e) => {
    if (document.activeElement === $taL) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); $lyrPrev.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); $lyrNext.click(); }
    }
    if (document.activeElement === $taC) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); $choLinePrev.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); $choLineNext.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); $choTokPrev.click(); }
      if (e.key === 'ArrowRight'){ e.preventDefault(); $choTokNext.click(); }
    }
  }, true);

  // Updates on input
  ['input','keyup','click'].forEach(ev => $taL.addEventListener(ev, updateLyricsPreview));
  ['input','keyup','click'].forEach(ev => $taC.addEventListener(ev, () => updateChordsPreview({ fromCaret: true })));

  // Prime render
  setActiveTab('meta');
  updateLyricsPreview();
  updateChordsPreview({ fromCaret: true });

  // Recompute underline on resize (prettiness)
  window.addEventListener('resize', updateUnderline);

  return root;
}
