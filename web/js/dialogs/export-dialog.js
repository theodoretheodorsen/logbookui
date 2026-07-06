import { el } from '../dom.js';
import { showError, clearError } from '../error-banner.js';
import { exportCsv } from '../exporters/csv-export.js';
import { printEntryList, printLogbookPages } from '../exporters/print-export.js';

export function createExportDialog() {
  const dialog = el('export-dialog');
  const title = el('export-dialog-title');
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

  // Set (to the active filter's criteria) when opened while the filtered-
  // results view is showing - exporting then means "export exactly what's
  // currently on screen": no logbook-pages mode (a filtered set isn't
  // page-aligned) and no separate range to pick, just CSV or PDF.
  let filterCriteria = null;

  el('export-cancel').addEventListener('click', () => dialog.close());

  function selectedValue(name) {
    return form.querySelector(`input[name="${name}"]:checked`).value;
  }

  // Recomputes which fieldsets/inputs are visible from the four radio
  // groups' current state - called on open and on every change, since any
  // of the four can affect what the other three should show.
  function updateVisibility() {
    if (filterCriteria) {
      pdfModeFields.hidden = true;
      dateRangeFields.hidden = true;
      pageRangeFields.hidden = true;
      dateFrom.required = false;
      dateTo.required = false;
      pageFrom.required = false;
      pageTo.required = false;
      return;
    }

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

  // `activeFilter` is the currently-applied filter criteria (see
  // app.js/filter-dialog.js) if the filtered-results view is showing, or
  // null/undefined for the normal "export the whole book or a range" flow.
  function open(activeFilter) {
    clearError();
    form.reset();
    filterCriteria = activeFilter || null;
    title.textContent = filterCriteria ? 'Export Filtered Results' : 'Export Logbook';
    updateVisibility();
    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();

    const format = selectedValue('export-format');
    const pdfMode = selectedValue('export-pdf-mode');

    try {
      if (filterCriteria) {
        if (format === 'csv') exportCsv(filterCriteria);
        else printEntryList(filterCriteria);
      } else if (format === 'csv') {
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
