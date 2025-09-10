import { store, setState } from './state/store.js';
import { renderSetlist } from './pages/setlist.js';
import { renderPerformance } from './pages/performance.js';
import { renderSettings, applyPerfVars } from './pages/settings.js';
import { renderMIDI } from './pages/midi.js';

const routes = {
  '#/setlist': renderSetlist,
  '#/performance': renderPerformance,
  '#/settings': renderSettings,
  '#/midi': renderMIDI,
};

export function navigate(hash) {
  if (!hash.startsWith('#/')) hash = '#/setlist';
  location.hash = hash;
}

export function routerInit(rootEl) {
  // Applica override SOLO se l’utente ha personalizzato
  try {
    const customized = !!(store.prefs && store.prefs.meta && store.prefs.meta.userCustomized);
    if (customized) applyPerfVars(document.documentElement);
  } catch {}
  function render() {
    const hash = location.hash || '#/setlist';
    setState(s => { s.ui.route = hash; });
    // ogni cambio pagina chiude l'hamburger se aperto
    setState(s => { s.ui.drawerOpen = false; });

    const view = routes[hash] || routes['#/setlist'];
    rootEl.replaceChildren(view());
  }

  window.addEventListener('hashchange', render);
  render();
}
