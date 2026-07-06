import { el } from './dom.js';
import { loadDatabase, logbookApi } from './logbook-api.js';
import { showError, clearError } from './error-banner.js';
import { createPageView } from './views/page-view.js';
import { createFlightDialog } from './dialogs/flight-dialog.js';
import { createSimulatorDialog } from './dialogs/simulator-dialog.js';
import { createRemarkDialog } from './dialogs/remark-dialog.js';
import { createExportDialog } from './dialogs/export-dialog.js';
import { createFilterDialog } from './dialogs/filter-dialog.js';

const openPanel = el('open-panel');
const app = el('app');
const pageInput = el('page-input');
const lastPageEl = el('last-page');
const toolbar = el('toolbar');
const toggleToolbarBtn = el('btn-toggle-toolbar');
const pageNav = el('page-nav');
const filterBanner = el('filter-banner');
const filterCountEl = el('filter-count');

let currentPage = 1;
// Set while the filtered-results view (see applyFilter) is showing instead
// of a physical page, so mutations know whether to re-run the filter or go
// back to normal page navigation.
let activeFilter = null;

function pageForPosition(position) {
  return Math.floor((position - 1) / 10) + 1;
}

function goToPage(pageNumber) {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return;
  clearError();
  try {
    const rows = logbookApi.getPage(pageNumber);
    currentPage = pageNumber;
    pageView.renderTable(rows);
    pageView.renderCards(rows);
    pageInput.value = currentPage;
    lastPageEl.textContent = logbookApi.getLastPageNumber();
  } catch (err) {
    showError(err.message);
  }
}

// Every matching entry at once (no pagination - a filtered set isn't
// sequential physical pages) plus one synthetic "Filter total" row built
// from getExportTotals, rendered through the same table/card view as
// normal pages.
function applyFilter(filters) {
  clearError();
  try {
    const rows = logbookApi.getEntriesForExport(filters);
    const totals = logbookApi.getExportTotals(filters);
    activeFilter = filters;
    pageView.renderTable([...rows, { sort_order: 4, ...totals }]);
    pageView.renderCards([...rows, { sort_order: 4, ...totals }]);
    filterCountEl.textContent = rows.length;
    pageNav.hidden = true;
    filterBanner.hidden = false;
  } catch (err) {
    showError(err.message);
  }
}

function clearFilter() {
  activeFilter = null;
  filterBanner.hidden = true;
  pageNav.hidden = false;
  goToPage(currentPage);
}

// After adding/editing/deleting, re-run the active filter if one is showing
// instead of always falling back to normal page navigation.
function refreshAfterSave(position) {
  if (activeFilter) applyFilter(activeFilter);
  else goToPage(pageForPosition(position));
}

function refreshAfterDelete() {
  if (activeFilter) applyFilter(activeFilter);
  else goToPage(currentPage);
}

function onDelete(position) {
  if (!confirm(`Delete entry at position ${position}? This renumbers every later entry.`)) return;
  clearError();
  try {
    logbookApi.deleteEntry(position);
    refreshAfterDelete();
  } catch (err) {
    showError(err.message);
  }
}

function onEdit(position, kind) {
  if (kind === 'flight') flightDialog.open(position);
  else if (kind === 'simulator') simDialog.open(position);
  else remarkDialog.open(position);
}

const pageView = createPageView({
  tableBody: el('page-table-body'),
  cardList: el('page-card-list'),
  onEdit,
  onDeleteEntry: onDelete,
});

const flightDialog = createFlightDialog({ onSaved: refreshAfterSave });
const simDialog = createSimulatorDialog({ onSaved: refreshAfterSave });
const remarkDialog = createRemarkDialog({ onSaved: refreshAfterSave });
const exportDialog = createExportDialog();
const filterDialog = createFilterDialog({ onApply: applyFilter, onClear: clearFilter });

el('file-input').addEventListener('change', onFileChosen);
el('btn-first').addEventListener('click', () => goToPage(1));
el('btn-prev').addEventListener('click', () => goToPage(currentPage - 1));
el('btn-next').addEventListener('click', () => goToPage(currentPage + 1));
el('btn-last').addEventListener('click', () => goToPage(logbookApi.getLastPageNumber()));
pageInput.addEventListener('change', () => goToPage(Number(pageInput.value)));
pageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') goToPage(Number(pageInput.value));
});
el('btn-add-flight').addEventListener('click', () => flightDialog.open());
el('btn-add-sim').addEventListener('click', () => simDialog.open());
el('btn-add-remark').addEventListener('click', () => remarkDialog.open());
el('btn-export').addEventListener('click', () => exportDialog.open());
el('btn-filter').addEventListener('click', () => filterDialog.open());
el('btn-clear-filter').addEventListener('click', clearFilter);

toggleToolbarBtn.addEventListener('click', () => {
  toolbar.hidden = !toolbar.hidden;
  toggleToolbarBtn.classList.toggle('expanded', !toolbar.hidden);
});

el('edit-mode-toggle').addEventListener('change', (event) => {
  app.classList.toggle('editing-enabled', event.target.checked);
});

async function onFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    await loadDatabase(buffer);
    openPanel.hidden = true;
    app.hidden = false;
    goToPage(logbookApi.getLastPageNumber());
  } catch (err) {
    showError(`Could not open ${file.name}: ${err.message}`);
  }
}
