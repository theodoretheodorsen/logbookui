import { el } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { showError, clearError } from '../error-banner.js';

// `onSaved(position)` is called after a successful add, with the position
// the remark ended up at, so app.js can navigate to that page.
export function createRemarkDialog({ onSaved }) {
  const dialog = el('remark-dialog');
  const form = el('remark-form');
  el('remark-cancel').addEventListener('click', () => dialog.close());

  function open() {
    clearError();
    form.reset();
    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const data = { text: el('remark-text').value || null };
    const position = el('remark-position').value ? Number(el('remark-position').value) : null;
    if (position != null) data.position = position;

    try {
      const landedAt = logbookApi.addRemark(data);
      dialog.close();
      onSaved(landedAt);
    } catch (err) {
      showError(err.message);
    }
  });

  return { open };
}
