import { store, setState } from '../state/store.js';
import { createEditorPanel } from '../ui/editorPanel.js';
import { addDemoToStore } from '../state/store.js';

export function renderSetlist() {
  const wrap = document.createElement('section');
  wrap.className = 'view view-setlist';

  const header = document.createElement('header');
  header.className = 'view-header';
  header.innerHTML = `
    <h2>Setlist</h2>
    <div class="spacer"></div>
    <button id="btn-add" class="btn primary">+ Add Song</button>
  `;

  // Layout complessivo (sidebar + editor)
  const layout = document.createElement('div');
  layout.className = 'setlist-layout';

  // Sidebar setlist
  const sidebar = document.createElement('div');
  sidebar.className = 'setlist-sidebar';

  const body = document.createElement('div');
  body.className = 'setlist-body';   // <— contenitore dedicato agli item
  sidebar.appendChild(body);

  if (!store.data.setlist || store.data.setlist.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <p class="muted">Nessun brano in setlist.</p>
      <div class="actions"><button id="btn-load-demo" class="btn">Load Demo Content</button></div>
    `;
    empty.querySelector('#btn-load-demo')?.addEventListener('click', () => {
      addDemoToStore();
      location.hash = '#/setlist';
    });
    body.appendChild(empty);
  } else {
    store.data.setlist.forEach((id) => {
      const song = store.data.songs[id];
      if (!song) return;
      const item = document.createElement('div');
      item.className = 'song-item';
      if (store.ui.selectedSongId === id) item.classList.add('selected');
      item.innerHTML = `
        <div class="song-meta">
          <strong>${song.title}</strong>
          <span class="muted">${song.bpm ?? '—'} BPM · ${song.duration ? (Math.floor(song.duration/60)+':'+String(song.duration%60).padStart(2,'0')) : '—:—'}</span>
        </div>
        <button class="icon-button edit-btn" title="Edit">✎</button>
      `;
      item.addEventListener('click', () => {
        setState(s => { s.ui.selectedSongId = id; s.ui.editorSongId = id; });
        // refresh highlight
        [...body.children].forEach(c => c.classList?.remove('selected'));
        item.classList.add('selected');
      });
      item.addEventListener('dblclick', () => openEditor(id));
      item.querySelector('.edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation(); openEditor(id);
      });
      body.appendChild(item);
    });
  }

  // Host editor (a destra)
  const editorHost = document.createElement('div');
  editorHost.className = 'editor-host';

  function openEditor(songId) {
    setState(s => { s.ui.editorOpen = true; s.ui.editorSongId = songId; s.ui.selectedSongId = songId; });
    location.hash = `#/setlist/${songId}/edit`;
    renderEditor();
  }
  function closeEditor() {
    setState(s => { s.ui.editorOpen = false; s.ui.editorSongId = null; });
    location.hash = '#/setlist';
    renderEditor();
  }
  function renderEditor() {
    editorHost.replaceChildren();
    if (!store.ui.editorOpen || !store.ui.editorSongId) {
      wrap.classList.remove('split');
      return;
    }
    const song = store.data.songs[store.ui.editorSongId];
    if (!song) { closeEditor(); return; }
    wrap.classList.add('split');
    editorHost.appendChild(createEditorPanel(song)); // vertical editor
  }

  layout.append(sidebar, editorHost);
  wrap.append(header, layout);

  // Se atterri direttamente su rotta edit
  if (store.ui.route.startsWith('#/setlist/') && store.ui.route.endsWith('/edit')) {
    const songId = store.ui.route.split('/')[2];
    if (songId) setTimeout(() => openEditor(songId), 0);
  }

  // (Futuro) Add Song → modal
  header.querySelector('#btn-add')?.addEventListener('click', () => { /* TODO */ });

  return wrap;
}
