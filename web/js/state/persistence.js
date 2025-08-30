// web/js/state/persistence.js
// Simple localStorage persistence for data + prefs

const KEY = 'lyrix.store.v1';

export function loadPersisted() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    console.warn('Persistence load error', e);
    return null;
  }
}

export function savePersisted(obj) {
  try {
    const payload = {
      data: obj?.data ?? { songs: {}, setlist: [] },
      prefs: obj?.prefs ?? {},
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Persistence save error', e);
  }
}

export function clearPersisted() {
  try { localStorage.removeItem(KEY); } catch {}
}
