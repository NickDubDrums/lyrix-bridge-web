import { store, setState, subscribe } from '../state/store.js';

export function initShell() {
  const btn = document.getElementById('btn-hamburger');
  const drawer = document.getElementById('app-drawer');
  const btnLock = document.getElementById('btn-lock');  const wsInd = document.getElementById('ws-indicator');
  const clock = document.getElementById('clock');

  btn?.addEventListener('click', () => {
    setState(s => { s.ui.drawerOpen = !s.ui.drawerOpen; });
  });

// Chiudi drawer cliccando fuori
document.addEventListener('click', (e) => {
  const t = e.target;
  const insideDrawer = t?.closest?.('#app-drawer');
  const onHamburger = t?.closest?.('#btn-hamburger');
  if (store.ui.drawerOpen && !insideDrawer && !onHamburger) {
    const drawer = document.getElementById('app-drawer');
    // Se il focus è dentro il drawer, spostalo
    if (drawer && drawer.contains(document.activeElement)) {
      document.getElementById('btn-hamburger')?.focus();
    }
    drawer?.setAttribute('inert',''); // evita focus e interazioni
    setState(s => { s.ui.drawerOpen = false; });
  }
});
// Chiudi drawer quando navighi
window.addEventListener('hashchange', () => {
  const drawer = document.getElementById('app-drawer');
  if (drawer && drawer.contains(document.activeElement)) {
    document.getElementById('btn-hamburger')?.focus();
  }
  drawer?.setAttribute('inert','');
  setState(s => { s.ui.drawerOpen = false; });
});
// Rimuovi inert quando si riapre
subscribe(s => {
  const drawer = document.getElementById('app-drawer');
  if (!drawer) return;
  const open = !!s.ui.drawerOpen;
  drawer.toggleAttribute('inert', !open);
});

    // CLICK sul lucchetto
  btnLock?.addEventListener('click', () => {
    setState(s => { s.ui.lock = !s.ui.lock; });
    // micro anim
    btnLock.classList.add('pulse');
    setTimeout(() => btnLock.classList.remove('pulse'), 250);
  });

  // Scorciatoia: Ctrl+Shift+L per toggle Lock
  window.addEventListener('keydown', (e) => {
    // evita conflitti in input/textarea
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    const isEditing = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;

    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      if (isEditing) return;
      setState(s => { s.ui.lock = !s.ui.lock; });
      btnLock?.classList.add('pulse');
      setTimeout(() => btnLock?.classList.remove('pulse'), 250);
    }

  // Space → Play/Pause SOLO se non stai scrivendo
  if (e.code === 'Space') {
    if (isEditing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lyrix:togglePlay'));
  }
  // Ctrl + ArrowRight / ArrowLeft → Next / Prev
  if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? +1 : -1;
    window.dispatchEvent(new CustomEvent('lyrix:navigateSong', { detail: { delta } }));
  }
}, true);


  // reactive UI
  subscribe(s => {
    drawer?.setAttribute('aria-hidden', String(!s.ui.drawerOpen));
    document.body.classList.toggle('drawer-open', s.ui.drawerOpen);

    // lock ui state
    if (btnLock) {
      btnLock.setAttribute('aria-checked', String(!!s.ui.lock));
      btnLock.classList.toggle('on', !!s.ui.lock);
    }

    // ws indicator color
    wsInd?.classList.toggle('ok', s.runtime.wsStatus === 'connected');
    wsInd?.classList.toggle('bad', s.runtime.wsStatus !== 'connected');

    clock?.classList.toggle('hidden', !s.prefs.showClock);
  });


  // clock (già presente)
  setInterval(() => {
    if (!store.prefs.showClock || !clock) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    clock.textContent = `${hh}:${mm}`;
  }, 1000);
}
