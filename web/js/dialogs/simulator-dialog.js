import { el } from '../dom.js';
import { logbookApi } from '../logbook-api.js';
import { showError, clearError } from '../error-banner.js';
import { isEditModeEnabled } from '../edit-mode.js';
import { restrictDigits } from '../input-restrict.js';
import { todayUtc } from '../date-utils.js';

// The db stores duration_minutes as a plain integer - HHMM is just how the
// dialog collects it, converted here before it ever reaches logbookApi.
function toDurationMinutes(hhmm) {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
}
function toHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

// `onSaved(position)` is called after a successful add or edit, with the
// position the session ended up at, so app.js can navigate to that page.
export function createSimulatorDialog({ onSaved }) {
  const dialog = el('sim-dialog');
  const form = el('sim-form');
  const fstdTypeList = el('sim-fstd-type-list');
  el('sim-cancel').addEventListener('click', () => dialog.close());

  restrictDigits(el('sim-duration'), 4);

  let editingPosition = null;

  // `position` omitted -> Add mode; passed -> Edit mode, prefilled from that session.
  function open(position) {
    clearError();
    editingPosition = position ?? null;
    el('sim-dialog-title').textContent = editingPosition ? 'Edit Simulator Session' : 'Add Simulator Session';

    fstdTypeList.textContent = '';
    for (const fstdType of logbookApi.listFstdTypes()) {
      const option = document.createElement('option');
      option.value = fstdType;
      fstdTypeList.appendChild(option);
    }

    // The position override is a structural, renumbering operation - same as
    // Edit/Delete, so it's also gated behind the edit-mode toggle.
    el('sim-position').closest('label').hidden = Boolean(editingPosition) || !isEditModeEnabled();

    if (editingPosition) {
      const session = logbookApi.getSimulatorSession(editingPosition);
      el('sim-position').value = '';
      el('sim-session-date').value = session.session_date ?? '';
      el('sim-fstd-type').value = session.fstd_type ?? '';
      el('sim-duration').value = toHHMM(session.duration_minutes ?? 0);
      el('sim-remarks').value = session.remarks ?? '';
    } else {
      form.reset();
      el('sim-session-date').value = todayUtc();
    }

    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    const data = {
      session_date: el('sim-session-date').value,
      fstd_type: el('sim-fstd-type').value,
      duration_minutes: toDurationMinutes(el('sim-duration').value),
      remarks: el('sim-remarks').value || null,
    };

    try {
      if (editingPosition) {
        logbookApi.updateSimulatorSession(editingPosition, data);
        dialog.close();
        onSaved(editingPosition);
      } else {
        const position = el('sim-position').value ? Number(el('sim-position').value) : null;
        if (position != null) data.position = position;
        const landedAt = logbookApi.addSimulatorSession(data);
        dialog.close();
        onSaved(landedAt);
      }
    } catch (err) {
      showError(err.message);
    }
  });

  return { open };
}
