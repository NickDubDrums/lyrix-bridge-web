// web/js/pages/settings.js
// Settings page: user-customizable experience
// - Performance block: colors and sizes for performance view
// - Setlist block: behavior toggles
// - Export / Import / Reset defaults (with confirm modal)
import { store, setState } from '../state/store.js';
import { savePersisted, loadPersisted, clearPersisted } from '../state/persistence.js';
import { modalConfirm, modalAlert } from '../ui/modals.js';

// ---- Defaults (edit with care) ---------------------------------------------
import { DEFAULT_PREFS } from '../state/defaults.js';


// ---- Helper: deep merge -----------------------------------------------------
function deepMerge(base, add) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (add && typeof add === 'object') {
    for (const [k, v] of Object.entries(add)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = deepMerge(base?.[k] ?? {}, v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

function getPrefs() {
  return deepMerge(DEFAULT_PREFS, store.prefs || {});
}

// ---- Apply CSS vars consumed by Performance view ---------------------------
// These variables should be read by performance.css / performance.js
function applyPerfVars(target=document.documentElement) {
  const p = getPrefs().performance;
  const set = (name, val) => target.style.setProperty(name, val);

  set('--perf-stage-bg', p.stageBg);
  set('--perf-line-fg', p.lineColor);
  set('--perf-current-fg', p.currentLineColor);
  set('--perf-section-fg', p.sectionColor);
  set('--perf-title-fg', p.titleColor);

  set('--perf-line-scale', String(p.lineSizePct));
  set('--perf-current-scale', String(p.currentLineSizePct));
  set('--perf-section-scale', String(p.sectionSizePct));
  set('--perf-title-scale', String(p.titleSizePct));
}

// ---- UI builders ------------------------------------------------------------
function fieldNumber(id, label, min, max, step, value, suffix='%') {
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
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
    </div>`;
}

// ---- Export / Import helpers -----------------------------------------------
function exportPrefs(prefs) {
  const blob = new Blob([JSON.stringify({ prefs }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lyrix-settings.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
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

// ---- Render -----------------------------------------------------------------
export function renderSettings() {
  const el = document.createElement('section');
  el.className = 'view view-settings';

  const prefs = getPrefs();
  const P = prefs.performance;
  const S = prefs.setlist;

  el.innerHTML = `
    <header class="page-header">
      <h2>Settings</h2>
    </header>

    <div class="settings-grid">
      <section class="card">
        <h3>Performance</h3>
        ${fieldColor('stageBg', 'Stage background', P.stageBg)}
        ${fieldColor('lineColor', 'Text color (lines)', P.lineColor)}
        ${fieldColor('currentLineColor', 'Text color (current line)', P.currentLineColor)}
        ${fieldColor('sectionColor', 'Section indicator color', P.sectionColor)}
        ${fieldColor('titleColor', 'Performance title color', P.titleColor)}

        ${fieldNumber('currentLineSizePct', 'Current line size', 50, 200, 1, P.currentLineSizePct)}
        ${fieldNumber('lineSizePct', 'Lines size', 50, 200, 1, P.lineSizePct)}
        ${fieldNumber('sectionSizePct', 'Section indicator size', 50, 200, 1, P.sectionSizePct)}
        ${fieldNumber('titleSizePct', 'Performance title size', 50, 200, 1, P.titleSizePct)}
      </section>

      <section class="card">
        <h3>Setlist</h3>
        ${fieldToggle('playOnClick', 'Play on click (se in pausa)', S.playOnClick)}
        ${fieldToggle('dblClickOpensEditor', 'Doppio click apre l’editor', S.dblClickOpensEditor)}
        ${fieldToggle('lockOnStart', 'Avvia in Lock mode', S.lockOnStart)}
      </section>

      <section class="card">
        <h3>Export / Reset</h3>
        <div class="field row">
          <button id="btnExport" class="btn">Export settings</button>
          <label class="btn">
            Import settings
            <input type="file" id="fileImport" accept="application/json" hidden>
          </label>
          <button id="btnReset" class="btn danger">Reset to defaults…</button>
        </div>
      </section>
    </div>
  `;

// Accetta sia 'btnExport' che '#btnExport'
const $ = (sel) => el.querySelector(sel.startsWith('#') ? sel : '#' + sel);

  // keep hex input in sync with color input
  const bindColor = (baseId, path) => {
    const color = $(baseId);
    const hex = $(`${baseId}-hex`);
    const sync = (val) => { if (hex) hex.value = val; };
    if (color && hex) {
      color.addEventListener('input', () => {
        sync(color.value);
        setState(s => {
          s.prefs = deepMerge(s.prefs || {}, { performance: { [path]: color.value } });
        });
        applyPerfVars();
      });
      hex.addEventListener('change', () => {
        const v = hex.value;
        if (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(v)) {
          color.value = v;
          setState(s => {
            s.prefs = deepMerge(s.prefs || {}, { performance: { [path]: v } });
          });
          applyPerfVars();
        }
      });
    }
    if (color) sync(color.value);
  };

  bindColor('stageBg', 'stageBg');
  bindColor('lineColor', 'lineColor');
  bindColor('currentLineColor', 'currentLineColor');
  bindColor('sectionColor', 'sectionColor');
  bindColor('titleColor', 'titleColor');

  const numBind = (id, path) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      setState(s => { s.prefs = deepMerge(s.prefs || {}, { performance: { [path]: Math.max(50, Math.min(200, n)) } }); });
      applyPerfVars();
    });
  };
  numBind('currentLineSizePct', 'currentLineSizePct');
  numBind('lineSizePct', 'lineSizePct');
  numBind('sectionSizePct', 'sectionSizePct');
  numBind('titleSizePct', 'titleSizePct');

  const toggleBind = (id, path) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('change', () => {
      setState(s => {
        s.prefs = deepMerge(s.prefs || {}, { setlist: { [path]: !!input.checked } });
      });
    });
  };
  toggleBind('playOnClick', 'playOnClick');
  toggleBind('dblClickOpensEditor', 'dblClickOpensEditor');
  toggleBind('lockOnStart', 'lockOnStart');

  // Export
  $('#btnExport')?.addEventListener('click', () => {
    const current = getPrefs();
    exportPrefs(current);
  });

  // Import
  $('#fileImport')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    importPrefsFromFile(f, (next) => {
      setState(s => { s.prefs = next; });
      applyPerfVars();
      savePersisted(store); // persist entire store with new prefs
      modalAlert('Import completato', 'Impostazioni importate correttamente.');
    });
  });

  // Reset
  $('#btnReset')?.addEventListener('click', async () => {
    const ok = await modalConfirm('Ripristina default', 'Vuoi davvero ripristinare tutte le impostazioni ai valori di default?');
    if (!ok) return;
    setState(s => { s.prefs = DEFAULT_PREFS; });
    applyPerfVars();
    savePersisted(store);
  });

  // Apply initial CSS vars on mount
  applyPerfVars();

  return el;
}
