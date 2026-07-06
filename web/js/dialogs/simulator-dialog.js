import { el } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { showError, clearError } from '../error-banner.js';

// `onSaved(position)` is called after a successful add, with the position
// the session ended up at, so app.js can navigate to that page.
export function createSimulatorDialog({ onSaved }) {
  const dialog = el('sim-dialog');
  const form = el('sim-form');
  el('sim-cancel').addEventListener('click', () => dialog.close());

  function open() {
    clearError();
    form.reset();
    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const data = {
      session_date: el('sim-session-date').value,
      fstd_type: el('sim-fstd-type').value,
      duration_minutes: Number(el('sim-duration').value),
      remarks: el('sim-remarks').value || null,
    };
    const position = el('sim-position').value ? Number(el('sim-position').value) : null;
    if (position != null) data.position = position;

    try {
      const landedAt = logbookApi.addSimulatorSession(data);
      dialog.close();
      onSaved(landedAt);
    } catch (err) {
      showError(err.message);
    }
  });

  return { open };
}
