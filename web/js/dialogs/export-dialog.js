import { el } from '../dom.js';
import { showError, clearError } from '../error-banner.js';
import { exportCsv } from '../exporters/csv-export.js';
import { printEntryList, printLogbookPages } from '../exporters/print-export.js';

export function createExportDialog() {
  const dialog = el('export-dialog');
  const form = el('export-form');

  const pdfModeFields = el('export-pdf-mode-fields');
  const dateRangeFields = el('export-date-range-fields');
  const pageRangeFields = el('export-page-range-fields');
  const dateInputs = el('export-date-inputs');
  const pageInputs = el('export-page-inputs');
  const dateFrom = el('export-date-from');
  const dateTo = el('export-date-to');
  const pageFrom = el('export-page-from');
  const pageTo = el('export-page-to');

  el('export-cancel').addEventListener('click', () => dialog.close());

  function selectedValue(name) {
    return form.querySelector(`input[name="${name}"]:checked`).value;
  }

  // Recomputes which fieldsets/inputs are visible from the four radio
  // groups' current state - called on open and on every change, since any
  // of the four can affect what the other three should show.
  function updateVisibility() {
    const format = selectedValue('export-format');
    const pdfMode = selectedValue('export-pdf-mode');

    pdfModeFields.hidden = format !== 'pdf';

    const usesDateRange = format === 'csv' || (format === 'pdf' && pdfMode === 'list');
    const usesPageRange = format === 'pdf' && pdfMode === 'pages';

    dateRangeFields.hidden = !usesDateRange;
    pageRangeFields.hidden = !usesPageRange;

    const showDateInputs = usesDateRange && selectedValue('export-date-range') === 'range';
    const showPageInputs = usesPageRange && selectedValue('export-page-range') === 'range';
    dateInputs.hidden = !showDateInputs;
    pageInputs.hidden = !showPageInputs;

    // A `required` field that's hidden should be excluded from constraint
    // validation per spec, but Chromium's native submit-time validation
    // doesn't reliably skip it - it logs "An invalid form control ... is
    // not focusable" and silently blocks the whole form's submission. So
    // `required` is toggled in lockstep with visibility instead of relying
    // on that.
    dateFrom.required = showDateInputs;
    dateTo.required = showDateInputs;
    pageFrom.required = showPageInputs;
    pageTo.required = showPageInputs;
  }

  form.addEventListener('change', updateVisibility);

  function dateRange() {
    if (selectedValue('export-date-range') !== 'range') return {};
    return { from: el('export-date-from').value, to: el('export-date-to').value };
  }

  function pageRange() {
    if (selectedValue('export-page-range') !== 'range') return {};
    return {
      fromPage: Number(el('export-page-from').value),
      toPage: Number(el('export-page-to').value),
    };
  }

  function open() {
    clearError();
    form.reset();
    updateVisibility();
    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();

    const format = selectedValue('export-format');
    const pdfMode = selectedValue('export-pdf-mode');

    try {
      if (format === 'csv') {
        exportCsv(dateRange());
      } else if (pdfMode === 'list') {
        printEntryList(dateRange());
      } else {
        printLogbookPages(pageRange());
      }
      dialog.close();
    } catch (err) {
      showError(err.message);
    }
  });

  return { open };
}
