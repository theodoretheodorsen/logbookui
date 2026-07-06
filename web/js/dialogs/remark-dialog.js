import { el } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { showError, clearError } from '../error-banner.js';
import { isEditModeEnabled } from '../edit-mode.js';

// `onSaved(position)` is called after a successful add or edit, with the
// position the remark ended up at, so app.js can navigate to that page.
export function createRemarkDialog({ onSaved }) {
  const dialog = el('remark-dialog');
  const form = el('remark-form');
  el('remark-cancel').addEventListener('click', () => dialog.close());

  let editingPosition = null;

  // `position` omitted -> Add mode; passed -> Edit mode, prefilled from that remark.
  function open(position) {
    clearError();
    editingPosition = position ?? null;
    el('remark-dialog-title').textContent = editingPosition ? 'Edit Remark' : 'Add Remark';
    // The position override is a structural, renumbering operation - same as
    // Edit/Delete, so it's also gated behind the edit-mode toggle.
    el('remark-position').closest('label').hidden = Boolean(editingPosition) || !isEditModeEnabled();

    if (editingPosition) {
      const remark = logbookApi.getRemark(editingPosition);
      el('remark-position').value = '';
      el('remark-text').value = remark.text ?? '';
    } else {
      form.reset();
    }

    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const data = { text: el('remark-text').value || null };

    try {
      if (editingPosition) {
        logbookApi.updateRemark(editingPosition, data);
        dialog.close();
        onSaved(editingPosition);
      } else {
        const position = el('remark-position').value ? Number(el('remark-position').value) : null;
        if (position != null) data.position = position;
        const landedAt = logbookApi.addRemark(data);
        dialog.close();
        onSaved(landedAt);
      }
    } catch (err) {
      showError(err.message);
    }
  });

  return { open };
}
