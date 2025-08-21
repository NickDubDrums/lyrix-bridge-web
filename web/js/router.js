import { store, setState } from './state/store.js';
import { renderSetlist } from './pages/setlist.js';
import { renderPerformance } from './pages/performance.js';

const routes = {
  '#/setlist': renderSetlist,
  '#/performance': renderPerformance,
};

export function navigate(hash) {
  if (!hash.startsWith('#/')) hash = '#/setlist';
  location.hash = hash;
}

export function routerInit(rootEl) {
  function render() {
    const hash = location.hash || '#/setlist';
    setState(s => { s.ui.route = hash; });
    const view = routes[hash] || routes['#/setlist'];
    rootEl.replaceChildren(view());
  }

  window.addEventListener('hashchange', render);
  render();
}
