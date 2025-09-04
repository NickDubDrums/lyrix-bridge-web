// web/js/ui/modal.js
let modalHost = null;

function ensureHost() {
  if (modalHost) return modalHost;
  modalHost = document.createElement('div');
  modalHost.id = 'modal-host';
  document.body.appendChild(modalHost);
  return modalHost;
}

function focusTrap(modalEl) {
  const focusables = modalEl.querySelectorAll(
    'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusables[0];
  const last  = focusables[focusables.length - 1];
  function onKey(e) {
    if (e.key === 'Tab') {
      if (focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus(); return;
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus(); return;
      }
    }
  }
  modalEl.addEventListener('keydown', onKey);
  return () => modalEl.removeEventListener('keydown', onKey);
}

function renderModal({ title, message, html, actions, input, variant = 'default' }) {
  ensureHost();

  return new Promise((resolve) => {
    // overlay + dialog
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.dataset.variant = variant;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h3 class="modal-title">${title ?? ''}</h3>`;

    const body = document.createElement('div');
    body.className = 'modal-body';
    if (html) body.innerHTML = html;
    else if (message) body.textContent = message;

    let inputEl = null;
    if (input) {
      inputEl = document.createElement(input.multiline ? 'textarea' : 'input');
      inputEl.className = 'modal-input';
      if (input.placeholder) inputEl.placeholder = input.placeholder;
      if (typeof input.value === 'string') inputEl.value = input.value;
      body.appendChild(inputEl);
    }

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const btns = (actions && actions.length ? actions : [{ id: 'ok', label: 'OK', kind: 'primary' }]);
    btns.forEach((a) => {
      const b = document.createElement('button');
      b.className = `modal-btn ${a.kind || 'default'}`;
      b.textContent = a.label || a.id;
      b.addEventListener('click', () => {
        const result = inputEl ? inputEl.value : a.id;
        cleanup(); resolve(a.value !== undefined ? a.value : result);
      });
      footer.appendChild(b);
    });

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    wrap.appendChild(overlay);
    wrap.appendChild(dialog);
    modalHost.appendChild(wrap);

    // focus, esc, click overlay
    const untrap = focusTrap(dialog);
    const prevActive = document.activeElement;
    setTimeout(() => (inputEl || dialog.querySelector('.modal-btn.primary') || dialog).focus(), 0);

    function onKey(e) {
      if (e.key === 'Escape') { cleanup(); resolve(null); }
      if (e.key === 'Enter' && inputEl && !e.isComposing) {
        e.preventDefault();
        cleanup(); resolve(inputEl.value);
      }
    }
    function onOverlayClick(e) {
      if (e.target === overlay) { cleanup(); resolve(null); }
    }

    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', onOverlayClick);

    function cleanup() {
      document.removeEventListener('keydown', onKey);
      wrap.removeEventListener('mousedown', onOverlayClick);
      untrap();
      wrap.remove();
      prevActive && prevActive.focus?.();
    }
  });
}

// API comode
export function modalAlert(message, opts = {}) {
  return renderModal({
    title: opts.title ?? 'Attention',
    message,
    actions: [{ id: 'ok', label: opts.okText ?? 'OK', kind: 'primary' }],
    variant: 'alert',
  });
}

export function modalConfirm(message, opts = {}) {
  return renderModal({
    title: opts.title ?? 'Confirm',
    message,
    actions: [
      { id: 'cancel', label: opts.cancelText ?? 'Cancel' },
      { id: 'ok',     label: opts.okText ?? 'Confirm', kind: 'primary', value: true },
    ],
    variant: 'confirm',
  }).then(v => v === true);
}

export function modalPrompt(message, opts = {}) {
  return renderModal({
    title: opts.title ?? 'Insert',
    message,
    input: { placeholder: opts.placeholder ?? '', value: opts.value ?? '', multiline: !!opts.multiline },
    actions: [
      { id: 'cancel', label: opts.cancelText ?? 'Cancel' },
      { id: 'ok',     label: opts.okText ?? 'OK', kind: 'primary' },
    ],
    variant: 'prompt',
  });
}

// un modal generico super-personalizzabile
export function showModal(options) {
  return renderModal(options || {});
}
