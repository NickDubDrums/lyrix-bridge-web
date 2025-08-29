// web/js/ui/dragdrop.js
// Wrapper minimale su SortableJS, stessa API del tuo makeSortable.
// Mantiene handle a sinistra ed elimina long-press e placeholder “a buchi”.

import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js";

/**
 * @param {HTMLElement} container
 * @param {object} opts
 *  - itemSelector: string (es. '.song-item')
 *  - handleSelector: string (es. '.drag-handle')
 *  - onReorder: (ids: string[]) => void
 *  - longPressMs: ignorato (usiamo solo handle)
 */
export function makeSortable(container, opts = {}) {
  const itemSelector = opts.itemSelector || '>*';
  const handleSelector = opts.handleSelector || null;
  const onReorder = typeof opts.onReorder === 'function' ? opts.onReorder : () => {};

  if (!container) return null;

  // Evita più istanze sullo stesso container
  if (container._sortable) {
    try { container._sortable.destroy(); } catch {}
    container._sortable = null;
  }

  const sortable = new Sortable(container, {
    draggable: itemSelector,
    handle: handleSelector || undefined,  // usa SOLO la maniglia
    animation: 150,
    easing: 'cubic-bezier(.2,.0,.2,1)',
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    dragClass: 'dragging',
    forceFallback: true,         // comportamento uniforme anche su mobile
    fallbackOnBody: true,
    fallbackTolerance: 5,
    direction: 'vertical',
    swapThreshold: 0.5,
    filter: 'button, .icon-button, a, input, textarea, select',
    preventOnFilter: true,

    onStart: () => {
      // blocca l’altezza per evitare micro-salti
      const r = container.getBoundingClientRect();
      container.style.minHeight = r.height + 'px';
    },
    onEnd: () => {
      container.style.minHeight = '';

      // Leggi il nuovo ordine dai nodi DOM
      const ids = [...container.querySelectorAll(itemSelector)]
        .map(el => el.dataset.id || '')
        .filter(Boolean);

      onReorder(ids);
    }
  });

  container._sortable = sortable;

  // API di cleanup compatibile
  return {
    destroy() { try { sortable.destroy(); } catch {} container._sortable = null; }
  };
}
