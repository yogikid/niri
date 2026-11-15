import { escapeHTML as esc, initials } from '../core/utils.js';

const ICONS = {
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 9h18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checks: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 9 1 1 2-2m-3 7 1 1 2-2m3-5h4m-4 6h4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 4H4v16h5m0-8h12m-5-5 5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warning: '<path d="M12 3 2 21h20Z"/><path d="M12 9v5m0 3v1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v2"/>',
  sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  flag: '<path d="M5 22V3m0 1c5-5 9 5 15 0v11c-6 5-10-5-15 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
};
export function icon(name, className = '') {
  return `<svg class="icon ${esc(className)}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.info}</svg>`;
}
export function brand(className = '') {
  const href = new URL('../../assets/logo.svg#wordmark', import.meta.url).href;
  return `<svg class="brand-logo ${esc(className)}" width="155" height="51" viewBox="0 0 178 58" role="img" aria-label="NiRi"><use href="${esc(href)}"></use></svg>`;
}
export function windowDots() { return `<span class="window-dots" aria-hidden="true">${icon('heart')}<i></i><i></i></span>`; }
export function avatar(name, tone = 0, extraClass = '') {
  return `<span class="avatar avatar-tone-${Math.abs(Number(tone) || 0) % 5} ${esc(extraClass)}" title="${esc(name || 'Anggota')}">${esc(initials(name))}</span>`;
}
export function emptyState({ title, description, action = '', symbol = 'folder' }) {
  return `<div class="empty-state"><div class="empty-art">${icon(symbol)}</div><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
}
export function skeleton(count = 3) { return `<div class="project-grid" role="status" aria-label="Memuat proyek">${Array.from({ length: count }, () => '<div class="skeleton" aria-hidden="true"></div>').join('')}</div>`; }

export function toast(message, type = 'success') {
  const region = document.querySelector('#toast-region'); if (!region) return;
  const node = document.createElement('div'); node.className = `toast${type === 'error' ? ' toast-error' : ''}`;
  node.innerHTML = `${icon(type === 'error' ? 'warning' : 'check')}<span>${esc(message)}</span><button type="button" aria-label="Tutup notifikasi">${icon('close')}</button>`;
  region.append(node);
  const timer = setTimeout(() => node.remove(), 9000);
  node.querySelector('button').addEventListener('click', () => { clearTimeout(timer); node.remove(); });
}

export function showModal({ title, content, signal, onClose }) {
  const dialog = document.createElement('dialog'); dialog.className = 'dialog';
  const id = `dialog-${crypto.randomUUID()}`; const previousFocus = document.activeElement;
  dialog.setAttribute('aria-labelledby', id);
  dialog.innerHTML = `<div class="window-bar"><div class="row">${windowDots()}<h2 id="${id}">${esc(title)}</h2></div><button type="button" class="btn btn-icon btn-quiet" data-close aria-label="Tutup dialog">${icon('close')}</button></div><div class="dialog-content">${content}</div>`;
  const nativeClose = dialog.close.bind(dialog);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    signal?.removeEventListener('abort', close); dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus(); onClose?.();
  };
  const close = (value) => { nativeClose(value); cleanup(); };
  dialog.close = close;
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.addEventListener('cancel', (event) => { if (dialog.dataset.busy === 'true') event.preventDefault(); });
  dialog.querySelector('[data-close]').addEventListener('click', () => { if (dialog.dataset.busy !== 'true') close(); });
  // NiRi: showModal() membuat latar inert; perangkap fokus melengkapi dialog native.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const nodes = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter((node) => !node.disabled && !node.hidden && node.getClientRects().length);
    const first = nodes[0]; const last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  if (signal?.aborted) return null;
  document.body.append(dialog); dialog.showModal();
  signal?.addEventListener('abort', close, { once: true });
  (dialog.querySelector('[autofocus]') ?? dialog.querySelector('input, button'))?.focus();
  return dialog;
}

export function confirmAction({ title, message, label = 'Hapus', signal, symbol = 'trash', destructive = true }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const dialog = showModal({ title, signal, content: `<div class="alert alert-error">${icon('warning')}<p>${esc(message)}</p></div><div class="dialog-actions"><button type="button" class="btn" data-cancel>Batal</button><button type="button" class="btn ${destructive ? 'btn-danger' : 'btn-dark'}" data-confirm>${icon(symbol)}${esc(label)}</button></div>`, onClose: () => resolve(confirmed) });
    if (!dialog) { resolve(false); return; }
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-confirm]').addEventListener('click', () => { confirmed = true; dialog.close(); });
    dialog.querySelector('[data-cancel]').focus();
  });
}

export function showFieldErrors(form, error) {
  for (const element of form.querySelectorAll('[data-error]')) element.textContent = '';
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  const fields = error?.fields ?? {};
  for (const [name, message] of Object.entries(fields)) {
    const target = form.querySelector(`[data-error="${CSS.escape(name)}"]`); if (target) target.textContent = message;
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`); if (input) input.setAttribute('aria-invalid', 'true');
  }
  form.querySelector('[aria-invalid=true]')?.focus();
}

export function setFormBusy(form, busy) {
  const dialog = form.closest('dialog'); if (dialog) dialog.dataset.busy = String(busy);
  form.setAttribute('aria-busy', String(busy));
  for (const button of form.querySelectorAll('button')) button.disabled = busy;
  const button = form.querySelector('[type=submit]');
  if (button) { if (busy) { button.dataset.label = button.innerHTML; button.textContent = 'Menyimpan…'; } else if (button.dataset.label) button.innerHTML = button.dataset.label; }
}
