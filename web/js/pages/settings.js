
// web/js/pages/settings.js
import { store, setState, subscribe } from '../state/store.js';

function getPerfPrefs() {
  const p = store.prefs?.performance || {};
  return {
    lyricsSize: p.lyricsSize ?? 42,
    chordsSize: p.chordsSize ?? 28,
    textColor: p.textColor ?? '#f2f2f2',
    currentColor: p.currentColor ?? '#ffffff',
    bgColor: p.bgColor ?? '#101014',
    lineGap: p.lineGap ?? 10,
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
  node.style.setProperty('--perf-left', p.splitRatio + 'fr');
  node.style.setProperty('--perf-right', (100 - p.splitRatio) + 'fr');
}

export function renderSettings() {
  const el = document.createElement('section');
  el.className = 'view view-settings';
  el.innerHTML = `
    <header class="view-header">
      <h2>Settings</h2>
      <div class="spacer"></div>
    </header>
    <div class="settings-grid">
      <div class="settings-card">
        <label>Lyrics size (px)</label>
        <input type="number" id="set-lyrics" min="18" max="120" step="1">
        <label>Chords size (px)</label>
        <input type="number" id="set-chords" min="12" max="96" step="1">
        <label>Line gap (px)</label>
        <input type="number" id="set-linegap" min="0" max="64" step="1">
      </div>
      <div class="settings-card">
        <label>Text color</label>
        <input type="color" id="set-text">
        <label>Current line color</label>
        <input type="color" id="set-current">
        <label>Background color</label>
        <input type="color" id="set-bg">
      </div>
      <div class="settings-card">
        <label>Split screen enabled</label>
        <input type="checkbox" id="set-split">
        <label>Split ratio (lyrics | chords)</label>
        <input type="range" id="set-splitratio" min="10" max="90" step="1">
      </div>
    </div>
  `;

  const $ = sel => el.querySelector(sel);
  const cur = getPerfPrefs();
  $('#set-lyrics').value = cur.lyricsSize;
  $('#set-chords').value = cur.chordsSize;
  $('#set-linegap').value = cur.lineGap;
  $('#set-text').value = cur.textColor;
  $('#set-current').value = cur.currentColor;
  $('#set-bg').value = cur.bgColor;
  $('#set-split').checked = !!cur.splitEnabled;
  $('#set-splitratio').value = cur.splitRatio;

  el.addEventListener('input', (e) => {
    const t = e.target;
    setState(s => {
      const p = s.prefs.performance ?? (s.prefs.performance = {});
      if (t.id === 'set-lyrics') p.lyricsSize = Number(t.value);
      if (t.id === 'set-chords') p.chordsSize = Number(t.value);
      if (t.id === 'set-linegap') p.lineGap = Number(t.value);
      if (t.id === 'set-text') p.textColor = t.value;
      if (t.id === 'set-current') p.currentColor = t.value;
      if (t.id === 'set-bg') p.bgColor = t.value;
      if (t.id === 'set-split') p.splitEnabled = t.checked;
      if (t.id === 'set-splitratio') p.splitRatio = Number(t.value);
    });
  });

  const unsub = subscribe((s) => {
    // mirror CSS custom props on <body> so Performance picks them up too
    applyPerfVars(document.body);
  });
  applyPerfVars(document.body);

  el.addEventListener('DOMNodeRemoved', (e) => {
    if (e.target === el) unsub();
  });

  return el;
}
