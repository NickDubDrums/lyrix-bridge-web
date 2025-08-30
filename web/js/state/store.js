import { loadPersisted, savePersisted } from './persistence.js';


const subscribers = new Set();

export const store = {
  ui: {
    route: location.hash || '#/setlist',
    drawerOpen: false,
    lock: false,
    editorOpen: false,
    editorSongId: null,
    selectedSongId: null,          // NEW: selezione in lista anche senza editor
  },
  data: { songs: {}, setlist: [] },
  prefs: { showClock: true },
  runtime: {
    wsStatus: 'disconnected',
    // cursori usati in PERFORMANCE (non in editor)
    lyricsLineIdx: 0,
    chordsLineIdx: 0,
    sectionIdx: 0,
    transport: {
      playing: false,
      playingSongId: null,     // id del brano in esecuzione
      startedAt: 0,            // timestamp ms di inizio progress corrente
      loopCount: 0,            // contatore ripetizioni (per LoopSection)
      pendingNextAfterLoop: false, // se true (in Loop "until input"), passa a next a fine ciclo
    },  }
};

export function setState(mutator) {
  mutator(store);
  try { savePersisted({ data: store.data, prefs: store.prefs }); } catch {}
  subscribers.forEach(fn => fn(store));
}


export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// --- Demo seeding ------------------------------------------------------------
export function addDemoToStore() {
  const demoSongs = {
    "song1": {
      id: "song1",
      title: "Be The One",
      bpm: 87,
      duration: 210,
      lyrics: [
        { text: "[Verse 1]" },
        { text: "I see the light inside your eyes" },
        { text: "You make me feel alive" },
        { text: "[Chorus]" },
        { text: "Be the one, oh oh" },
      ],
      chords: [
        { chord: "[Verse 1]" },
        { chord: "Am F C G" },
        { chord: "Am F C G" },
        { chord: "[Chorus]" },
        { chord: "F G Am G" },
        { chord: "F G Am G" },
      ],
    },
    "song2": {
      id: "song2",
      title: "Midnight Drive",
      bpm: 120,
      duration: 180,
      lyrics: [
        { text: "[Intro]" },
        { text: "Lights passing by" },
        { text: "[Verse]" },
        { text: "Keep on moving through the night" },
      ],
      chords: [
        { chord: "[Intro]" },
        { chord: "C G Am F" },
        { chord: "[Verse]" },
        { chord: "C G Am F" },
      ],
    },
    "song3": {
      id: "song3",
      title: "Ocean Waves",
      bpm: 100,
      duration: 240,
      lyrics: [
        { text: "[Verse]" },
        { text: "Hear the ocean, feel the breeze" },
        { text: "[Chorus]" },
        { text: "Carry me away with ease" },
      ],
      chords: [
        { chord: "[Verse]" },
        { chord: "Dm Bb F C" },
        { chord: "[Chorus]" },
        { chord: "Dm Bb F C" },
      ],
    }
  };

  setState(s => {
    // Unisci senza sovrascrivere eventuali ID esistenti
    s.data.songs = { ...demoSongs, ...s.data.songs };
    const ids = Object.keys(demoSongs);
    // Aggiungi in coda solo gli ID che mancano
    ids.forEach(id => { if (!s.data.setlist.includes(id)) s.data.setlist.push(id); });
  });
}

// --- ID helpers --------------------------------------------------------------
function slugify(str) {
  return String(str || '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'song';
}
function uniqueIdFromTitle(title) {
  const base = slugify(title);
  let id = base;
  let i = 2;
  const exists = () => !!store.data.songs[id];
  while (exists()) { id = `${base}-${i++}`; }
  return id;
}

// --- CRUD API ----------------------------------------------------------------
export function addSong(song) {
  const id = song?.id && !store.data.songs[song.id] ? String(song.id)
           : uniqueIdFromTitle(song?.title || 'New Song');

  const safeSong = {
    id,
    title: song?.title || 'New Song',
    bpm: song?.bpm ?? null,
    duration: song?.duration ?? null,
    lyrics: Array.isArray(song?.lyrics) ? song.lyrics : [],
    chords: Array.isArray(song?.chords) ? song.chords : [],
    arranger: song?.arranger || {},
  };

  setState(s => {
    s.data.songs[id] = safeSong;
    if (!s.data.setlist.includes(id)) s.data.setlist.push(id);
    s.ui.selectedSongId = id;
    s.ui.editorSongId = id;
  });
  return id;
}

export function updateSong(id, patch) {
  id = String(id || '');
  if (!id || !store.data.songs[id]) return false;
  setState(s => {
    s.data.songs[id] = { ...s.data.songs[id], ...patch, id };
  });
  return true;
}

export function removeSong(id) {
  id = String(id || '');
  if (!id || !store.data.songs[id]) return false;
  setState(s => {
    delete s.data.songs[id];
    s.data.setlist = s.data.setlist.filter(x => x !== id);
    if (s.ui.selectedSongId === id) {
      s.ui.selectedSongId = s.data.setlist[0] || null;
      s.ui.editorSongId = s.ui.selectedSongId;
    }
  });
  return true;
}

export function reorderSetlist(nextIds) {
  const safe = (Array.isArray(nextIds) ? nextIds : []).filter(id => !!store.data.songs[id]);
  setState(s => { s.data.setlist = safe; });
}

// --- Export / Import ---------------------------------------------------------
export function exportSongJSON(id) {
  id = String(id || '');
  const song = store.data.songs[id];
  if (!song) return null;
  return { schema: 'lyrix-song-v1', song };
}

export function exportSetlistJSON() {
  const ids = (store.data.setlist || []).map(x => String(x));
  const songs = {};
  ids.forEach(id => { if (store.data.songs[id]) songs[id] = store.data.songs[id]; });
  return { schema: 'lyrix-setlist-v1', setlist: ids, songs };
}

export function importSongJSON(obj, opts = {}) {
  if (!obj || typeof obj !== 'object') return null;
  const raw = obj.song || obj;
  let id = String(raw?.id || '');
  const replace = opts.replace === true;
  if (!id || (store.data.songs[id] && !replace)) {
    id = uniqueIdFromTitle(raw?.title || 'Imported Song');
  }
  const song = { ...raw, id };
  setState(s => {
    s.data.songs[id] = song;
    if (!s.data.setlist.includes(id)) s.data.setlist.push(id);
    s.ui.selectedSongId = id;
    s.ui.editorSongId = id;
  });
  return id;
}

export function importSetlistJSON(obj, opts = {}) {
  if (!obj || typeof obj !== 'object') return { imported: 0 };
  const mode = (opts.mode === 'replace') ? 'replace' : 'merge';
  const inSongs = obj.songs || {};
  const inOrder = Array.isArray(obj.setlist) ? obj.setlist.map(String) : Object.keys(inSongs);

  setState(s => {
    if (mode === 'replace') {
      s.data.songs = {};
      s.data.setlist = [];
    }
    for (const id of inOrder) {
      const raw = inSongs[id] || s.data.songs[id];
      if (!raw) continue;
      const useId = s.data.songs[id] ? uniqueIdFromTitle(raw.title || id) : id;
      s.data.songs[useId] = { ...raw, id: useId };
      if (!s.data.setlist.includes(useId)) s.data.setlist.push(useId);
    }
  });
  return { imported: inOrder.length };
}

// --- Initial hydrate from localStorage --------------------------------------
(function hydrateFromStorage(){
  try {
    const persisted = loadPersisted();
    if (persisted && persisted.data) {
      setState(s => {
        if (persisted.data.songs) s.data.songs = persisted.data.songs;
        if (persisted.data.setlist) s.data.setlist = persisted.data.setlist;
        if (persisted.prefs) s.prefs = { ...s.prefs, ...persisted.prefs };
      });
    }
  } catch (e) {
    console.warn('Hydrate error', e);
  }
})();
