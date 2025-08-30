// web/js/ui/dragdrop.js
// Wrapper minimale su SortableJS con handle a sinistra.

import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js";

/**
 * @param {HTMLElement} container
 * @param {object} opts
 *  - itemSelector: '.song-item'
 *  - handleSelector: '.drag-handle'
 *  - onReorder: (ids: string[]) => void
 */
export function makeSortable(container, opts = {}) {
  const itemSelector   = opts.itemSelector   || '.song-item';
  const handleSelector = opts.handleSelector || '.drag-handle';
  const onReorder = typeof opts.onReorder === 'function' ? opts.onReorder : () => {};
  const isLocked  = typeof opts.isLocked === 'function' ? opts.isLocked : () => false;

  if (!container) return null;
  if (container._sortable) { try { container._sortable.destroy(); } catch {} }

  const sortable = new Sortable(container, {
    draggable: itemSelector,
    handle: handleSelector,
    animation: 150,
    easing: 'cubic-bezier(.2,0,.2,1)',
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    dragClass: 'dragging',
    direction: 'vertical',
    preventOnFilter: true,
    filter: 'a, input, textarea, select, .icon-button, button:not(.drag-handle)',

    // ⛔️ Disabilitato quando il lock è ON
    disabled: isLocked(),

    // Se per qualunque motivo dovesse partire, lo annulliamo sul move
    onMove() {
      return !isLocked();
    },

    onEnd: () => {
      const ids = [...container.querySelectorAll(itemSelector)]
        .map(el => el.dataset.id || '')
        .filter(Boolean);
      onReorder(ids);
    },
  });

  container._sortable = sortable;

  // Controller per aggiornare lo stato disabled da fuori
  function setLocked(disable) {
    try { sortable.option('disabled', !!disable); } catch {}
  }

  return {
    destroy() { try { sortable.destroy(); } catch {} container._sortable = null; },
    setLocked,
  };
}
