// web/js/pages/settings.js — versione pulita e strutturata (nessun cambiamento funzionale)
// =============================================================================
// NOTE
// - Riorganizzazione in sezioni con commenti chiari.
// - Nessuna modifica alla logica o al comportamento runtime.
// - Stile e spaziatura uniformi per facilitare la manutenzione.
// =============================================================================

// ──────────────────────────────────────────────────────────────────────────────
// Import
// ──────────────────────────────────────────────────────────────────────────────
import { store, setState } from '../state/store.js';
import { savePersisted, loadPersisted, clearPersisted } from '../state/persistence.js';
import { modalConfirm, modalAlert } from '../ui/modals.js';
import { DEFAULT_PREFS } from '../state/defaults.js'; // Defaults globali

// ──────────────────────────────────────────────────────────────────────────────
// Costanti & utilità di base
// ──────────────────────────────────────────────────────────────────────────────
// CSS vars override-abili da Settings per performance.css
const RUNTIME_VARS = [
  '--perf-bg', '--perf-fg', '--current-fg',
  '--lyrics-fg', '--lyrics-current-fg', '--chords-fg', '--chords-current-fg',
  '--lyrics-size', '--lyrics-current-scale', '--lyrics-secondary-scale',
  '--chords-size', '--chords-current-scale', '--chords-secondary-scale',
  '--line-gap', '--section-gap', '--chords-line-gap', '--chords-section-gap',
  '--section-fg', '--title-fg', '--section-scale', '--title-scale',
  '--perf-left', '--perf-right', '--perf-top', '--perf-bottom'
];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers: accesso/merge prefs
// ──────────────────────────────────────────────────────────────────────────────
// setIn/getIn per path tipo 'lyrics.lineColor'
function setIn(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys.at(-1)] = value;
}
function getIn(obj, path, fallback) {
  try { return path.split('.').reduce((o, k) => o?.[k], obj) ?? fallback; }
  catch { return fallback; }
}

function deepMerge(base, add) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (add && typeof add === 'object') {
    for (const [k, v] of Object.entries(add)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(base?.[k] ?? {}, v);
      else out[k] = v;
    }
  }
  return out;
}

function getPrefs() { return deepMerge(DEFAULT_PREFS, store.prefs || {}); }

function markCustomized() {
  // Perché: abilita override runtime solo dopo personalizzazione esplicita
  setState(s => {
    s.prefs = s.prefs || {};
    s.prefs.meta = { ...(s.prefs.meta || {}), userCustomized: true };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// UI builders (HTML snippet)
// ──────────────────────────────────────────────────────────────────────────────
function fieldPercent(id, label, valuePct = 100) {
  return `
    <div class="field">
      <label for="${id}">${label} (%)</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="range" id="${id}" min="0" max="200" step="1" value="${valuePct}">
        <input type="number" id="${id}-n" min="0" max="200" step="1" value="${valuePct}" inputmode="numeric">
      </div>
    </div>`;
}
function fieldDim(id, label, valuePct = 28) {
  return `
    <div class="field">
      <label for="${id}">${label} (%)</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="range" id="${id}" min="0" max="100" step="1" value="${valuePct}">
        <input type="number" id="${id}-n" min="0" max="100" step="1" value="${valuePct}" inputmode="numeric">
      </div>
    </div>`;
}
function fieldPx(id, label, valuePx = 0, min = 0, max = 600, step = 1) {
  return `
    <div class="field">
      <label for="${id}">${label} (px)</label>
      <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${valuePx}" inputmode="numeric">
    </div>`;
}
function fieldNumber(id, label, min, max, step, value, suffix = '%') {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" inputmode="numeric">
      <span class="suffix">${suffix}</span>
    </div>`;
}
function fieldColor(id, label, value) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input type="color" id="${id}" value="${value}">
      <input type="text" id="${id}-hex" value="${value}" pattern="^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$" />
    </div>`;
}
function fieldToggle(id, label, checked) {
  return `
    <div class="field toggle">
      <label for="${id}">${label}</label>
      <label class="switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span class="ui"></span>
      </label>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Apply CSS vars (usate in performance.css)
// ──────────────────────────────────────────────────────────────────────────────
export function applyPerfVars(target = document.documentElement) {
  const customized = !!(store.prefs?.meta?.userCustomized);
  if (!customized) return; // Usa theme.css finché l'utente non personalizza

  const p = getPrefs().performance;
  const set = (name, val) => target.style.setProperty(name, val);

  // Stage
  set('--perf-bg', p.stageBg);

  // Colors (fallback compat vecchi prefs)
  const ly = p.lyrics || {};
  const ch = p.chords || {};
  set('--perf-fg', ly.lineColor ?? ch.lineColor ?? '#f2f2f2');
  set('--current-fg', ly.currentLineColor ?? ch.currentLineColor ?? '#ffffff');
  set('--lyrics-fg', ly.lineColor ?? 'var(--perf-fg)');
  set('--lyrics-current-fg', ly.currentLineColor ?? 'var(--current-fg)');
  set('--chords-fg', ch.lineColor ?? 'var(--perf-fg)');
  set('--chords-current-fg', ch.currentLineColor ?? 'var(--current-fg)');

  // Scale: % → fattori (100% = 1)
  const lyCur = (ly.currentLineSizePct ?? 108) / 100;
  const lySec = (ly.lineSizePct ?? 100) / 100;
  const chCur = (ch.currentLineSizePct ?? 106) / 100;
  const chSec = (ch.lineSizePct ?? 100) / 100;
  set('--lyrics-current-scale', String(lyCur));
  set('--lyrics-secondary-scale', String(lySec));
  set('--chords-current-scale', String(chCur));
  set('--chords-secondary-scale', String(chSec));

  // Gap (solo se impostati dall'utente)
  if (Number.isFinite(ly.lineGap)) set('--line-gap', ly.lineGap + 'px');
  if (Number.isFinite(ly.sectionGap)) set('--section-gap', ly.sectionGap + 'px');
  if (Number.isFinite(ch.lineGap)) set('--chords-line-gap', ch.lineGap + 'px');
  if (Number.isFinite(ch.sectionGap)) set('--chords-section-gap', ch.sectionGap + 'px');

  // Dim & spacing
  if (Number.isFinite(ly.dim)) set('--lyrics-dim', String(ly.dim));
  if (Number.isFinite(ch.dim)) set('--chords-dim', String(ch.dim));
  if (Number.isFinite(ch.gap)) set('--chords-gap', ch.gap + 'px');

  // Section/Title (opzionali)
  if (p.sectionColor) set('--section-fg', p.sectionColor);
  if (p.titleColor) set('--title-fg', p.titleColor);
  if (p.sectionSizePct) set('--section-scale', String(p.sectionSizePct / 100));
  if (p.titleSizePct) set('--title-scale', String(p.titleSizePct / 100));
}

// ──────────────────────────────────────────────────────────────────────────────
// Export / Import helpers
// ──────────────────────────────────────────────────────────────────────────────
function exportPrefs(prefs) {
  const blob = new Blob([JSON.stringify({ prefs }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'lyrix-settings.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function importPrefsFromFile(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(String(reader.result || '{}'));
      const next = deepMerge(DEFAULT_PREFS, json?.prefs || {});
      onDone(next);
    } catch (e) {
      console.warn('Invalid settings file', e);
      modalAlert('Import failed', 'Il file selezionato non contiene impostazioni valide.');
    }
  };
  reader.readAsText(file);
}

// ──────────────────────────────────────────────────────────────────────────────
// Binder helpers (collega UI → prefs → runtime vars)
// ──────────────────────────────────────────────────────────────────────────────
function bindColorFactory($, baseId, path) {
  const color = $(baseId);
  const hex = $(`${baseId}-hex`);
  if (!color) return;

  const sync = (val) => { if (hex) hex.value = val; };

  color.addEventListener('input', () => {
    setState(s => { s.prefs = s.prefs || {}; const perf = (s.prefs.performance = s.prefs.performance || {}); setIn(perf, path, color.value); });
    markCustomized(); savePersisted(store); applyPerfVars(); sync(color.value);
  });

  if (hex) {
    hex.addEventListener('change', () => {
      const v = hex.value; if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(v)) return;
      color.value = v;
      setState(s => { s.prefs = s.prefs || {}; const perf = (s.prefs.performance = s.prefs.performance || {}); setIn(perf, path, v); });
      markCustomized(); savePersisted(store); applyPerfVars();
    });
  }
  sync(color.value);
}

function bindPercentFactory($, id, path) {
  const r = $(id), n = $(`${id}-n`); if (!r || !n) return;
  const sync = (val) => { r.value = String(val); n.value = String(val); };
  const write = (val) => {
    const v = clamp(Number(val) || 0, 0, 200);
    setState(s => { s.prefs = s.prefs || {}; const perf = (s.prefs.performance = s.prefs.performance || {}); setIn(perf, path, v); });
    markCustomized(); savePersisted(store); applyPerfVars(); sync(v);
  };
  r.addEventListener('input', () => write(r.value));
  n.addEventListener('input', () => write(n.value));
}

function bindDimFactory($, id, path) {
  const r = $(id), n = $(`${id}-n`); if (!r || !n) return;
  const sync = (valPct) => { r.value = String(valPct); n.value = String(valPct); };
  const write = (val) => {
    const vp = clamp(Number(val) || 0, 0, 100);
    const f = Math.round((vp / 100) * 100) / 100; // 0..1, 2 decimali
    setState(s => { s.prefs = s.prefs || {}; const perf = (s.prefs.performance = s.prefs.performance || {}); setIn(perf, path, f); });
    markCustomized(); savePersisted(store); applyPerfVars(); sync(vp);
  };
  r.addEventListener('input', () => write(r.value));
  n.addEventListener('input', () => write(n.value));
}

function bindPxFactory($, id, path, { min = 0, max = 600 } = {}) {
  const input = $(id); if (!input) return;
  input.addEventListener('input', () => {
    const n = clamp(Number(input.value) || 0, min, max);
    setState(s => { s.prefs = s.prefs || {}; const perf = (s.prefs.performance = s.prefs.performance || {}); setIn(perf, path, n); });
    markCustomized(); savePersisted(store); applyPerfVars();
  });
}

function bindToggleFactory($, id, path) {
  const input = $(id); if (!input) return;
  input.addEventListener('change', () => {
    setState(s => { s.prefs = deepMerge(s.prefs || {}, { setlist: { [path]: !!input.checked } }); });
    savePersisted(store);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Render principale
// ──────────────────────────────────────────────────────────────────────────────
export function renderSettings() {
  const el = document.createElement('section');
  el.className = 'view view-settings';

  const prefs = getPrefs();
  const P = prefs.performance;
  const S = prefs.setlist;

  el.innerHTML = `
    <header class="view-header"><h2>Settings</h2></header>
    <div class="settings-grid">
      <section class="card">
        <h3>Stage</h3>
        ${fieldColor('stageBg', 'Stage background', P.stageBg)}
        ${fieldColor('sectionColor', 'Section indicator color', P.sectionColor)}
        ${fieldColor('titleColor', 'Performance title color', P.titleColor)}
        ${fieldPercent('sectionSizePct', 'Section indicator size', P.sectionSizePct)}
        ${fieldPercent('titleSizePct', 'Performance title size', P.titleSizePct)}
      </section>

      <section class="card">
        <h3>Lyrics</h3>
        ${fieldColor('lyricsLineColor', 'Text color (lines)', getIn(P, 'lyrics.lineColor', '#f2f2f2'))}
        ${fieldColor('lyricsCurrentLineColor', 'Text color (current line)', getIn(P, 'lyrics.currentLineColor', '#ffffff'))}
        ${fieldPercent('lyricsCurrentLineSizePct', 'Current line size', getIn(P, 'lyrics.currentLineSizePct', 108))}
        ${fieldPercent('lyricsLineSizePct', 'Lines size', getIn(P, 'lyrics.lineSizePct', 100))}
        ${fieldDim('lyricsDim', 'Lyrics Line Dim', Math.round((getIn(P, 'lyrics.dim', .28)) * 100))}
        ${fieldPx('lyricsLineGap', 'Line gap', getIn(P, 'lyrics.lineGap', Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--line-gap')) || 20), 0, 200, 1)}
        ${fieldPx('lyricsSectionGap', 'Section gap', getIn(P, 'lyrics.sectionGap', Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--section-gap')) || 28), 0, 600, 1)}
      </section>

      <section class="card">
        <h3>Chords</h3>
        ${fieldColor('chordsLineColor', 'Text color (lines)', getIn(P, 'chords.lineColor', '#f2f2f2'))}
        ${fieldColor('chordsCurrentLineColor', 'Text color (current line)', getIn(P, 'chords.currentLineColor', '#ffffff'))}
        ${fieldPercent('chordsCurrentLineSizePct', 'Current line size', getIn(P, 'chords.currentLineSizePct', 106))}
        ${fieldPercent('chordsLineSizePct', 'Lines size', getIn(P, 'chords.lineSizePct', 100))}
        ${fieldDim('chordsDim', 'Chords Line Dim', Math.round((getIn(P, 'chords.dim', .28)) * 100))}
        ${fieldPx('chordsLineGap', 'Line gap', getIn(P, 'chords.lineGap', Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chords-line-gap')) || 20), 0, 200, 1)}
        ${fieldPx('chordsSectionGap', 'Section gap', getIn(P, 'chords.sectionGap', Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chords-section-gap')) || 28), 0, 600, 1)}
        ${fieldPx('chordsGap', 'Chords spacing', getIn(P, 'chords.gap', Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chords-gap')) || 16), 0, 80, 1)}
      </section>

      <section class="card">
        <h3>Setlist</h3>
        ${fieldToggle('playOnClick', 'Play on click (if paused)', S.playOnClick)}
        ${fieldToggle('dblClickOpensEditor', 'Double click opens the editor', S.dblClickOpensEditor)}
        ${fieldToggle('lockOnStart', 'Open in Lock mode', S.lockOnStart)}
        <hr class="sep">
        <h4 style="margin:.5rem 0 0.25rem;">Import mode</h4>
        ${fieldToggle('importShowModal', 'Show import modal at import', (S.import?.showModal ?? true))}
        <div class="field">
          <label>Default action</label>
          <div class="segmented" id="importModeSeg">
            <button class="seg-item ${(S.import?.mode ?? 'add') === 'add' ? 'active' : ''}" data-val="add">Add</button>
            <button class="seg-item ${(S.import?.mode ?? 'add') === 'replace' ? 'active' : ''}" data-val="replace">Replace</button>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Export / Reset</h3>
        <div class="field row">
          <button id="btnExport" class="btn">Export settings</button>
          <label class="btn">Import settings <input type="file" id="fileImport" accept="application/json" hidden></label>
          <button id="btnReset" class="btn danger">Reset to defaults…</button>
        </div>
      </section>
    </div>`;

  // Helper selector: accetta sia 'id' che '#id'
  const $ = (sel) => el.querySelector(sel.startsWith('#') ? sel : '#' + sel);

  // Prefill esplicito (ridondante ma innocuo; mantiene compat con HTML generato)
  $('#lyricsLineColor').value = P.lyrics?.lineColor ?? '#f2f2f2';
  $('#lyricsCurrentLineColor').value = P.lyrics?.currentLineColor ?? '#ffffff';
  $('#lyricsCurrentLineSizePct').value = P.lyrics?.currentLineSizePct ?? 108;
  $('#lyricsLineSizePct').value = P.lyrics?.lineSizePct ?? 100;
  $('#chordsLineColor').value = P.chords?.lineColor ?? '#f2f2f2';
  $('#chordsCurrentLineColor').value = P.chords?.currentLineColor ?? '#ffffff';
  $('#chordsCurrentLineSizePct').value = P.chords?.currentLineSizePct ?? 106;
  $('#chordsLineSizePct').value = P.chords?.lineSizePct ?? 100;

  // Binders
  const bindColor = (id, path) => bindColorFactory($, id, path);
  const bindPercent = (id, path) => bindPercentFactory($, id, path);
  const bindDim = (id, path) => bindDimFactory($, id, path);
  const bindPx = (id, path, opts) => bindPxFactory($, id, path, opts);

  // Stage
  bindColor('stageBg', 'stageBg');
  bindColor('sectionColor', 'sectionColor');
  bindColor('titleColor', 'titleColor');
  bindPercent('sectionSizePct', 'sectionSizePct');
  bindPercent('titleSizePct', 'titleSizePct');

  // Lyrics
  bindColor('lyricsLineColor', 'lyrics.lineColor');
  bindColor('lyricsCurrentLineColor', 'lyrics.currentLineColor');
  bindPercent('lyricsCurrentLineSizePct', 'lyrics.currentLineSizePct');
  bindPercent('lyricsLineSizePct', 'lyrics.lineSizePct');
  bindDim('lyricsDim', 'lyrics.dim');
  bindPx('lyricsLineGap', 'lyrics.lineGap', { min: 0, max: 400 });
  bindPx('lyricsSectionGap', 'lyrics.sectionGap', { min: 0, max: 600 });

  // Chords
  bindColor('chordsLineColor', 'chords.lineColor');
  bindColor('chordsCurrentLineColor', 'chords.currentLineColor');
  bindPercent('chordsCurrentLineSizePct', 'chords.currentLineSizePct');
  bindPercent('chordsLineSizePct', 'chords.lineSizePct');
  bindDim('chordsDim', 'chords.dim');
  bindPx('chordsLineGap', 'chords.lineGap', { min: 0, max: 400 });
  bindPx('chordsSectionGap', 'chords.sectionGap', { min: 0, max: 600 });
  bindPx('chordsGap', 'chords.gap', { min: 0, max: 80 });

  // Setlist toggles
  const bindToggle = (id, path) => bindToggleFactory($, id, path);
  bindToggle('playOnClick', 'playOnClick');
  bindToggle('dblClickOpensEditor', 'dblClickOpensEditor');
  bindToggle('lockOnStart', 'lockOnStart');

  // Import mode — show modal
  const importShowEl = $('#importShowModal');
  if (importShowEl) {
    importShowEl.addEventListener('change', () => {
      setState(s => {
        s.prefs = s.prefs || {};
        s.prefs.setlist = s.prefs.setlist || {};
        s.prefs.setlist.import = s.prefs.setlist.import || {};
        s.prefs.setlist.import.showModal = !!importShowEl.checked;
      });
      savePersisted(store);
    });
  }

  // Import mode — segmented (add/replace)
  const seg = el.querySelector('#importModeSeg');
  if (seg) {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-item'); if (!btn) return;
      seg.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = (btn.dataset.val === 'replace') ? 'replace' : 'add';
      setState(s => {
        s.prefs = s.prefs || {};
        s.prefs.setlist = s.prefs.setlist || {};
        s.prefs.setlist.import = s.prefs.setlist.import || {};
        s.prefs.setlist.import.mode = val;
      });
      savePersisted(store);
    });
  }

  // Export
  $('#btnExport')?.addEventListener('click', () => {
    const current = getPrefs();
    exportPrefs(current);
  });

  // Import
  $('#fileImport')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    importPrefsFromFile(f, (next) => {
      setState(s => { s.prefs = next; });
      applyPerfVars();
      savePersisted(store);
      modalAlert('Import completato', 'Impostazioni importate correttamente.');
    });
  });

  // Reset → defaults
  $('#btnReset')?.addEventListener('click', async () => {
    const ok = await modalConfirm('Ripristina default', 'Vuoi davvero ripristinare tutte le impostazioni ai valori di default?');
    if (!ok) return;
    setState(s => { s.prefs = structuredClone(DEFAULT_PREFS); });
    setState(s => { s.prefs.meta = { userCustomized: false }; });
    savePersisted(store);
    const root = document.documentElement;
    RUNTIME_VARS.forEach(v => root.style.removeProperty(v));
    requestAnimationFrame(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  });

  // Apply iniziale su mount (lasciato intenzionalmente disabilitato)
  // applyPerfVars();

  return el;
}
