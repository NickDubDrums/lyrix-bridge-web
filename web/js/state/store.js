const subscribers = new Set();

export const store = {
  ui: {
    route: location.hash || '#/setlist',
    drawerOpen: false,
    lock: false,
    editorOpen: false,
    editorSongId: null,
  },
  data: {
    songs: {},
    setlist: [],
  },
  prefs: {
    showClock: true,
  },
  runtime: {
    wsStatus: 'disconnected',
  }
};

export function setState(mutator) {
  mutator(store);
  subscribers.forEach(fn => fn(store));
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
