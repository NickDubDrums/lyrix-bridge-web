// web/js/state/persistence.js
const KEY = 'lyrix_store_v1';

export function loadPersisted() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('loadPersisted error', e);
    return null;
  }
}

 export function savePersisted(store) {
   try {
    const payload = {
      data: {
        songs: store?.data?.songs ?? [],
        setlist: store?.data?.setlist ?? [],
      },
      prefs: store?.prefs ?? {},  // include performance.lyrics/chords + meta
    };
     localStorage.setItem(KEY, JSON.stringify(payload));
   } catch (e) {
     console.warn('savePersisted error', e);
   }
 }

export function clearPersisted() {
  localStorage.removeItem(KEY);
}
