export function renderSetlist() {
  const el = document.createElement('section');
  el.className = 'view view-setlist';
  el.innerHTML = `
    <header class="view-header">
      <h2>Setlist</h2>
      <div class="spacer"></div>
      <button class="btn primary" disabled>+ Add Song</button>
    </header>
    <div class="setlist-body">
      <p class="muted">Stub iniziale: qui comparirà la lista brani e l'editor inline.</p>
    </div>
  `;
  return el;
}
