import { store, setState, subscribe } from '../state/store.js';

export function initShell() {
  const btn = document.getElementById('btn-hamburger');
  const drawer = document.getElementById('app-drawer');
  const toggleLock = document.getElementById('toggle-lock');
  const wsInd = document.getElementById('ws-indicator');
  const clock = document.getElementById('clock');

  btn?.addEventListener('click', () => {
    setState(s => { s.ui.drawerOpen = !s.ui.drawerOpen; });
  });

  toggleLock?.addEventListener('change', (e) => {
    const on = e.target.checked;
    setState(s => { s.ui.lock = on; });
  });

  subscribe(s => {
    drawer?.setAttribute('aria-hidden', String(!s.ui.drawerOpen));
    document.body.classList.toggle('drawer-open', s.ui.drawerOpen);
    if (toggleLock) toggleLock.checked = s.ui.lock;

    wsInd?.classList.toggle('ok', s.runtime.wsStatus === 'connected');
    wsInd?.classList.toggle('bad', s.runtime.wsStatus !== 'connected');

    clock?.classList.toggle('hidden', !s.prefs.showClock);
  });

  setInterval(() => {
    if (!store.prefs.showClock || !clock) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    clock.textContent = `${hh}:${mm}`;
  }, 1000);
}
