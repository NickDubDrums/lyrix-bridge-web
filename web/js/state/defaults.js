export const DEFAULT_PREFS = {
  performance: {
    stageBg: '#101014',
    // NEW: blocchi separati
    lyrics: {
      lineColor: '#f2f2f2',
      currentLineColor: '#ffffff',
      lineSizePct: 100,         // -> --lyrics-secondary-scale
      currentLineSizePct: 108,  // -> --lyrics-current-scale
      // NEW
      dim: 0.28,                // -> --lyrics-dim (0..1)
      lineGap: 20,              // px -> --line-gap
      sectionGap: 28            // px -> --section-gap
    },
    chords: {
      lineColor: '#f2f2f2',
      currentLineColor: '#ffffff',
      lineSizePct: 100,         // -> --chords-secondary-scale
      currentLineSizePct: 106,  // -> --chords-current-scale
      // NEW
      dim: 0.28,                // -> --chords-dim (0..1)
      lineGap: 20,              // px -> --chords-line-gap
      sectionGap: 28,           // px -> --chords-section-gap
      gap: 20                   // px -> --chords-gap (spaziatura token)
    },
    // Section / Title (opzionali)
    sectionColor: '#b8c1ff',
    titleColor: '#f2f2f2',
    sectionSizePct: 90,
    titleSizePct: 90,
   },
  setlist: {
    playOnClick: false,
    dblClickOpensEditor: true,
    lockOnStart: false,
    import: {
      showModal: true,   // mostra il modale scelta ogni import
      mode: 'add'        // default se il modale è disattivato
    }
  }
 };