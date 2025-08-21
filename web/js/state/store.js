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

