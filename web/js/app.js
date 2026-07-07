import { el } from './dom.js';
import { loadDatabase, exportDatabase, logbookApi } from './logbook-api.js';
import { showError, showSuccess, clearError } from './error-banner.js';
import { createPageView } from './views/page-view.js';
import { createFlightDialog } from './dialogs/flight-dialog.js';
import { createSimulatorDialog } from './dialogs/simulator-dialog.js';
import { createRemarkDialog } from './dialogs/remark-dialog.js';
import { createExportDialog } from './dialogs/export-dialog.js';
import { createFilterDialog } from './dialogs/filter-dialog.js';
import { buildCsv } from './exporters/csv-export.js';
import { getToken, setToken, getDataRepo, setDataRepo, fetchFile, putFile, textToBytes } from './github-storage.js';

const openPanel = el('open-panel');
const app = el('app');
const githubRepoInput = el('github-repo-input');
const githubTokenInput = el('github-token-input');
const githubOpenBox = el('github-open');
const btnOpenGithub = el('btn-open-github');
const fileInput = el('file-input');
const pageInput = el('page-input');
const lastPageEl = el('last-page');
const filterBanner = el('filter-banner');
const filterCountEl = el('filter-count');
const btnMainMenu = el('btn-main-menu');
const mainMenu = el('main-menu');
const btnOpenCreate = el('btn-open-create');
const createMenu = el('create-menu');
const btnOpenNav = el('btn-open-nav');
const pageNav = el('page-nav');

let currentPage = 1;
// The sha of logbook.db as last loaded from or saved to GitHub, used to
// detect whether another device has saved a newer version in between (see
// onSaveToGithub). Stays null when the db was opened from a local file
// instead, since there's then no known remote version to compare against.
let loadedDbSha = null;
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
    btnOpenNav.hidden = true;
    pageNav.hidden = true;
    filterBanner.hidden = false;
  } catch (err) {
    showError(err.message);
  }
}

function clearFilter() {
  activeFilter = null;
  filterBanner.hidden = true;
  btnOpenNav.hidden = false;
  pageNav.hidden = false;
  goToPage(currentPage);
}

// Swipe-to-turn-page for the mobile card list (the desktop table stays
// button/scroll-only, since a horizontal swipe there would fight its own
// horizontal scroll for wide rows). #page-card-list is display:none above
// the 700px breakpoint, so this is inert on desktop even though the
// listeners are always attached. No filtered view (no "page" to turn to)
// and no preventDefault - a swipe's small incidental vertical scroll is
// harmless, and not fighting the browser's own scroll keeps this simple.
const SWIPE_THRESHOLD_PX = 60;

function setupSwipeNavigation(target) {
  let startX = null;
  let startY = null;

  target.addEventListener('touchstart', (event) => {
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  });

  target.addEventListener('touchend', (event) => {
    if (startX == null || activeFilter) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    startX = null;
    startY = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY)) return;
    goToPage(currentPage + (deltaX < 0 ? 1 : -1));
  });
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

setupSwipeNavigation(el('page-card-list'));

githubRepoInput.value = getDataRepo();
githubTokenInput.value = getToken();
fileInput.addEventListener('change', onFileChosen);
btnOpenGithub.addEventListener('click', () => {
  githubOpenBox.hidden = !githubOpenBox.hidden;
  btnOpenGithub.setAttribute('aria-expanded', String(!githubOpenBox.hidden));
  if (!githubOpenBox.hidden) githubTokenInput.focus();
});
el('btn-open-file').addEventListener('click', () => fileInput.click());
el('btn-load-github').addEventListener('click', onLoadFromGithub);
el('btn-save-github').addEventListener('click', onSaveToGithub);
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
el('btn-export').addEventListener('click', () => exportDialog.open(activeFilter));
el('btn-filter').addEventListener('click', () => filterDialog.open());
el('btn-clear-filter').addEventListener('click', clearFilter);

// Everything except page-turning (now swipe-driven) and the always-visible
// filter banner lives behind this one menu button, styled after the cover's
// epaulette. create-menu nests one level deeper for the three "add" actions.
function closeMainMenu() {
  mainMenu.hidden = true;
  btnMainMenu.setAttribute('aria-expanded', 'false');
  btnMainMenu.classList.remove('expanded');
  createMenu.hidden = true;
  btnOpenCreate.setAttribute('aria-expanded', 'false');
}

btnMainMenu.addEventListener('click', () => {
  const opening = mainMenu.hidden;
  if (opening) {
    mainMenu.hidden = false;
    btnMainMenu.setAttribute('aria-expanded', 'true');
    btnMainMenu.classList.add('expanded');
  } else {
    closeMainMenu();
  }
});

btnOpenCreate.addEventListener('click', () => {
  const opening = createMenu.hidden;
  createMenu.hidden = !opening;
  btnOpenCreate.setAttribute('aria-expanded', String(opening));
});

// #page-nav is always visible in the header on wide screens (see style.css) -
// this toggle only matters below the 700px breakpoint, where it's hidden
// until "Go to page" reveals it, same reveal pattern as the main menu.
btnOpenNav.addEventListener('click', () => pageNav.classList.toggle('open'));

// Any menu action other than the Create toggle itself closes the whole
// menu once it's done its own thing (open a dialog, apply a setting, etc).
mainMenu.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button === btnOpenCreate) return;
  closeMainMenu();
});

document.addEventListener('click', (event) => {
  if (!mainMenu.hidden && !mainMenu.contains(event.target) && !btnMainMenu.contains(event.target)) {
    closeMainMenu();
  }
  if (pageNav.classList.contains('open') && !pageNav.contains(event.target) && !btnOpenNav.contains(event.target)) {
    pageNav.classList.remove('open');
  }
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

async function onLoadFromGithub() {
  clearError();
  const dataRepo = githubRepoInput.value.trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(dataRepo)) {
    showError('Data repository must look like owner/repo.');
    return;
  }
  setDataRepo(dataRepo);
  setToken(githubTokenInput.value);
  try {
    const { bytes, sha } = await fetchFile('logbook.db');
    await loadDatabase(bytes.buffer);
    loadedDbSha = sha;
    openPanel.hidden = true;
    app.hidden = false;
    goToPage(logbookApi.getLastPageNumber());
  } catch (err) {
    showError(`Could not load from GitHub: ${err.message}`);
  }
}

async function onSaveToGithub() {
  clearError();
  try {
    loadedDbSha = await putFile('logbook.db', exportDatabase(), 'Update logbook.db', { expectedSha: loadedDbSha });
    await putFile('logbook.csv', textToBytes(buildCsv({})), 'Update logbook.csv');
    showSuccess('Saved to GitHub.');
  } catch (err) {
    showError(`Could not save to GitHub: ${err.message}`);
  }
}
