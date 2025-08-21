import { store, setState, subscribe } from '../state/store.js';

// Util: indice riga corrente da caret
function caretLine(textarea) {
  const pos = textarea.selectionStart ?? 0;
  const txt = textarea.value.slice(0, pos);
  return txt.split(/\r?\n/).length - 1;
}

// Util: trova nome section corrente scorrendo a ritroso da una riga
function currentSectionName(lines, fromIdx) {
  for (let i = fromIdx; i >= 0; i--) {
    const s = lines[i]?.trim();
    const m = s && s.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) return m[1].trim();
  }
  return 'Default';
}

// Util: calcola token index corrente in una riga di accordi rispetto alla colonna caret
function chordTokenIndexAt(line, caretCol) {
  if (!line) return 0;
  const parts = line.split(/(\s+)/); // mantieni spazi
  let col = 0, tokenIdx = 0, logicalIdx = -1;
  for (const p of parts) {
    const isSpace = /^\s+$/.test(p);
    const start = col;
    col += p.length;
    if (!isSpace) {
      logicalIdx++;
      // se caret cade dentro o subito dopo questo token → seleziona questo
      if (caretCol <= col) { tokenIdx = Math.max(0, logicalIdx); break; }
      tokenIdx = logicalIdx;
    }
  }
  return Math.max(0, tokenIdx);
}

function renderChordCarousel(tokens, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'chord-carousel';
  tokens.forEach((t, i) => {
    const span = document.createElement('span');
    span.textContent = t;
    span.className = 'chord-token ' + (i === idx ? 'now' : Math.abs(i - idx) === 1 ? 'near' : 'far');
    wrap.appendChild(span);
  });
  return wrap;
}

export function createEditorPanel(song) {
  const root = document.createElement('div');
  root.className = 'editor-panel vertical';

  // Testi grezzi come li salvi
  const lyricsRaw = (song.lyrics || []).map(l => l.text).join('\n');
  const chordsRaw = (song.chords || []).map(c => c.chord).join('\n');

  root.innerHTML = `
    <div class="editor-topbar">
      <div>Section: <strong id="sec-name">Default</strong></div>
      <button id="btn-close" class="btn danger">✕</button>
    </div>

    <div class="editor-block">
      <h3>Lyrics</h3>
      <textarea id="ta-lyrics" spellcheck="false"></textarea>
      <div class="preview">
        <div class="preview-title">Riga corrente</div>
        <div id="lyric-current" class="lyric-current"></div>
      </div>
    </div>

    <div class="editor-block">
      <h3>Chords</h3>
      <textarea id="ta-chords" spellcheck="false"></textarea>
      <div class="preview">
        <div class="preview-title">Linea corrente</div>
        <div id="chords-carousel"></div>
      </div>
    </div>
  `;

  const $sec = root.querySelector('#sec-name');
  const $close = root.querySelector('#btn-close');
  const $taL = root.querySelector('#ta-lyrics');
  const $taC = root.querySelector('#ta-chords');
  const $lyrCurrent = root.querySelector('#lyric-current');
  const $car = root.querySelector('#chords-carousel');

  // Inizializza contenuti
  $taL.value = lyricsRaw || '';
  $taC.value = chordsRaw || '';

  function updateLyricsPreview() {
    const lines = $taL.value.split(/\r?\n/);
    const li = caretLine($taL);
    const secName = currentSectionName(lines, li);
    $sec.textContent = secName;
    // la riga corrente (se è [Section], mostra stringa vuota)
    const raw = (lines[li] || '').trim();
    const isSection = /^\s*\[([^\]]+)\]\s*$/.test(raw);
    $lyrCurrent.textContent = isSection ? '' : raw;
  }

  function updateChordsPreview() {
    const lines = $taC.value.split(/\r?\n/);
    const li = caretLine($taC);
    const line = (lines[li] || '').trim();
    if (!line) { $car.replaceChildren(); return; }
    // indice token da caret col
    const caretCol = ($taC.selectionStart ?? 0) - ($taC.value.slice(0, $taC.selectionStart ?? 0).lastIndexOf('\n') + 1);
    const tokens = line.split(/\s+/).filter(Boolean);
    const tokenIdx = chordTokenIndexAt(line, caretCol);
    $car.replaceChildren(renderChordCarousel(tokens, Math.min(tokenIdx, Math.max(0, tokens.length - 1))));
  }

  // Salvataggio in song (manteniamo [Section] nel testo)
  function writeBack() {
    const lyr = $taL.value.split(/\r?\n/).map(x => ({ text: x }));
    const cho = $taC.value.split(/\r?\n/).map(x => ({ chord: x }));
    song.lyrics = lyr;
    song.chords = cho;
  }

  // Eventi editor
  ['input','keyup','click'].forEach(ev => $taL.addEventListener(ev, updateLyricsPreview));
  ['input','keyup','click'].forEach(ev => $taC.addEventListener(ev, updateChordsPreview));
  $taL.addEventListener('input', writeBack);
  $taC.addEventListener('input', writeBack);

  // Close editor
  $close.addEventListener('click', () => {
    writeBack();
    setState(s => { s.ui.editorOpen = false; s.ui.editorSongId = null; });
    location.hash = '#/setlist';
  });

  // Lock → read-only
  subscribe(s => {
    const ro = !!s.ui.lock;
    $taL.readOnly = ro;
    $taC.readOnly = ro;
    root.classList.toggle('read-only', ro);
  });

  // Prime preview
  updateLyricsPreview();
  updateChordsPreview();

  return root;
}
