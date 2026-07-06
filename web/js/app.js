import { el } from './dom.js';
import { loadDatabase, logbookApi } from './logbook-api.js';
import { showError, clearError } from './error-banner.js';
import { createPageView } from './views/page-view.js';
import { createFlightDialog } from './dialogs/flight-dialog.js';
import { createSimulatorDialog } from './dialogs/simulator-dialog.js';
import { createRemarkDialog } from './dialogs/remark-dialog.js';

const openPanel = el('open-panel');
const app = el('app');
const filenameEl = el('filename');
const pageInput = el('page-input');
const lastPageEl = el('last-page');

let currentPage = 1;

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

function onDelete(position) {
  if (!confirm(`Delete entry at position ${position}? This renumbers every later entry.`)) return;
  clearError();
  try {
    logbookApi.deleteEntry(position);
    goToPage(currentPage);
  } catch (err) {
    showError(err.message);
  }
}

const pageView = createPageView({
  tableBody: el('page-table-body'),
  cardList: el('page-card-list'),
  onEditFlight: (position) => flightDialog.open(position),
  onDeleteEntry: onDelete,
});

const flightDialog = createFlightDialog({ onSaved: (position) => goToPage(pageForPosition(position)) });
const simDialog = createSimulatorDialog({ onSaved: (position) => goToPage(pageForPosition(position)) });
const remarkDialog = createRemarkDialog({ onSaved: (position) => goToPage(pageForPosition(position)) });

el('file-input').addEventListener('change', onFileChosen);
el('btn-first').addEventListener('click', () => goToPage(1));
el('btn-prev').addEventListener('click', () => goToPage(currentPage - 1));
el('btn-next').addEventListener('click', () => goToPage(currentPage + 1));
el('btn-last').addEventListener('click', () => goToPage(logbookApi.getLastPageNumber()));
el('btn-go').addEventListener('click', () => goToPage(Number(pageInput.value)));
el('btn-add-flight').addEventListener('click', () => flightDialog.open());
el('btn-add-sim').addEventListener('click', () => simDialog.open());
el('btn-add-remark').addEventListener('click', () => remarkDialog.open());

async function onFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    await loadDatabase(buffer);
    filenameEl.textContent = file.name;
    openPanel.hidden = true;
    app.hidden = false;
    goToPage(1);
  } catch (err) {
    showError(`Could not open ${file.name}: ${err.message}`);
  }
}
