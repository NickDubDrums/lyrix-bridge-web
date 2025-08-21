export function renderPerformance() {
  const el = document.createElement('section');
  el.className = 'view view-performance';
  el.innerHTML = `
    <header class="view-header">
      <h2>Performance</h2>
      <div class="spacer"></div>
      <div class="muted">Split Lyrics/Chords arriverà qui.</div>
    </header>
    <div class="performance-body">
      <p class="muted">Stub iniziale della pagina Performance.</p>
    </div>
  `;
  return el;
}
