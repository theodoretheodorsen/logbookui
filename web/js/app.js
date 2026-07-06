import { loadDatabase, getDb, withTransaction } from './db.js';
import { listAircraft } from '/lib/aircraft.js';
import { createFlightsApi } from '/lib/flights.js';
import { createSimulatorApi } from '/lib/simulator.js';
import { createRemarksApi } from '/lib/remarks.js';
import { deleteEntryAt } from '/lib/entries.js';
import { createPagesApi } from '/lib/pages.js';

const { addFlight, updateFlight, getFlight } = createFlightsApi({ getDb, withTransaction });
const { addSimulatorSession } = createSimulatorApi({ withTransaction });
const { addRemark } = createRemarksApi({ withTransaction });
const { getPage, getLastPageNumber } = createPagesApi({ getDb });

let currentPage = 1;

const el = (id) => document.getElementById(id);

const openPanel = el('open-panel');
const app = el('app');
const errorBox = el('error-box');
const filenameEl = el('filename');
const pageInput = el('page-input');
const lastPageEl = el('last-page');
const tableBody = el('page-table-body');
const cardList = el('page-card-list');

el('file-input').addEventListener('change', onFileChosen);
el('btn-first').addEventListener('click', () => goToPage(1));
el('btn-prev').addEventListener('click', () => goToPage(currentPage - 1));
el('btn-next').addEventListener('click', () => goToPage(currentPage + 1));
el('btn-last').addEventListener('click', () => goToPage(getLastPageNumber()));
el('btn-go').addEventListener('click', () => goToPage(Number(pageInput.value)));
el('btn-add-flight').addEventListener('click', () => openFlightDialog());
el('btn-add-sim').addEventListener('click', () => openSimDialog());
el('btn-add-remark').addEventListener('click', () => openRemarkDialog());

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

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function goToPage(pageNumber) {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return;
  clearError();
  try {
    const rows = getPage(pageNumber);
    currentPage = pageNumber;
    renderTable(rows);
    renderCards(rows);
    pageInput.value = currentPage;
    lastPageEl.textContent = getLastPageNumber();
  } catch (err) {
    showError(err.message);
  }
}

const TOTALS_LABELS = { 1: 'Page total', 2: 'Brought forward', 3: 'Running total' };

// Shared by the table (desktop) and card (mobile) renderers, in table-header order.
const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'departure', label: 'From' },
  { key: 'off_block_time', label: 'Off' },
  { key: 'destination', label: 'To' },
  { key: 'on_block_time', label: 'On' },
  { key: 'type', label: 'Type' },
  { key: 'registration', label: 'Reg' },
  { key: 'pic_name', label: 'PIC Name' },
  { key: 'se_time', label: 'SE' },
  { key: 'me_time', label: 'ME' },
  { key: 'multipilot_time', label: 'MP' },
  { key: 'total_time', label: 'Total' },
  { key: 'ifr_time', label: 'IFR' },
  { key: 'pic_time', label: 'PIC' },
  { key: 'sic_time', label: 'SIC' },
  { key: 'dual_time', label: 'DUAL' },
  { key: 'day_landings', label: 'Day Ldg' },
  { key: 'night_landings', label: 'Night Ldg' },
  { key: 'fstd_type', label: 'Sim Type' },
  { key: 'simulator_time', label: 'Sim' },
  { key: 'remarks', label: 'Remarks' },
];

// Card-view summary line already shows these fields per row kind, so the
// expanded detail list skips them to avoid repeating information.
const SUMMARY_KEYS = {
  flight: ['date', 'departure', 'off_block_time', 'destination', 'on_block_time'],
  simulator: ['date', 'fstd_type', 'simulator_time'],
  remark: ['date', 'remarks'],
  totals: ['total_time'],
};

function rowKind(row) {
  if (row.fstd_type != null) return 'simulator';
  if (row.registration != null || row.departure != null) return 'flight';
  return 'remark';
}

function positionOf(row) {
  return (row.page - 1) * 10 + row.line;
}

function buildActionButtons(position, kind) {
  const buttons = [];
  if (kind === 'flight') {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openFlightDialog(position));
    buttons.push(editBtn);
  }
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => onDelete(position));
  buttons.push(deleteBtn);
  return buttons;
}

function td(text) {
  const cell = document.createElement('td');
  cell.textContent = text ?? '';
  return cell;
}

function renderTable(rows) {
  tableBody.textContent = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    const isEntry = row.sort_order === 0;
    tr.className = isEntry ? 'entry-row' : 'totals-row';

    tr.appendChild(td(isEntry ? row.page_position : TOTALS_LABELS[row.sort_order]));
    for (const column of COLUMNS) tr.appendChild(td(row[column.key]));

    const actionsCell = document.createElement('td');
    if (isEntry) {
      actionsCell.append(...buildActionButtons(positionOf(row), rowKind(row)));
    }
    tr.appendChild(actionsCell);

    tableBody.appendChild(tr);
  }
}

// Compact "card" summary for narrow/mobile screens: date + off-block/on-block
// + departure/destination for a flight (per request), the closest analog for
// simulator/remark/totals rows, with everything else tucked behind Expand.
function summaryFor(row, kind) {
  if (kind === 'totals') {
    return { main: TOTALS_LABELS[row.sort_order], sub: row.total_time ? `Total ${row.total_time}` : '' };
  }
  if (kind === 'simulator') {
    return { main: `Simulator: ${row.fstd_type ?? ''}`, sub: [row.date, row.simulator_time].filter(Boolean).join(' · ') };
  }
  if (kind === 'remark') {
    return { main: row.remarks || '(blank line)', sub: row.date ?? '' };
  }
  return {
    main: `${row.departure ?? '—'} → ${row.destination ?? '—'}`,
    sub: [row.date, [row.off_block_time, row.on_block_time].filter(Boolean).join('–')].filter(Boolean).join(' · '),
  };
}

function renderCards(rows) {
  cardList.textContent = '';
  for (const row of rows) {
    const isEntry = row.sort_order === 0;
    const kind = isEntry ? rowKind(row) : 'totals';
    const { main, sub } = summaryFor(row, kind);

    const card = document.createElement('div');
    card.className = isEntry ? 'entry-card' : 'entry-card totals-card';

    const summaryBtn = document.createElement('button');
    summaryBtn.type = 'button';
    summaryBtn.className = 'card-summary';
    summaryBtn.innerHTML = `
      <span class="summary-tag">${isEntry ? row.page_position : ''}</span>
      <span class="summary-text"><span class="summary-main"></span><span class="summary-sub"></span></span>
      <span class="chevron" aria-hidden="true">▾</span>
    `;
    summaryBtn.querySelector('.summary-main').textContent = main;
    summaryBtn.querySelector('.summary-sub').textContent = sub;

    const details = document.createElement('div');
    details.className = 'card-details';
    details.hidden = true;

    const skip = SUMMARY_KEYS[kind] ?? [];
    for (const column of COLUMNS) {
      if (skip.includes(column.key)) continue;
      const value = row[column.key];
      if (value == null || value === '') continue;
      const field = document.createElement('div');
      field.className = 'card-field';
      field.innerHTML = `<span class="card-field-label"></span><span class="card-field-value"></span>`;
      field.querySelector('.card-field-label').textContent = column.label;
      field.querySelector('.card-field-value').textContent = value;
      details.appendChild(field);
    }

    if (isEntry) {
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.append(...buildActionButtons(positionOf(row), kind));
      details.appendChild(actions);
    }

    summaryBtn.addEventListener('click', () => {
      details.hidden = !details.hidden;
      summaryBtn.classList.toggle('expanded', !details.hidden);
    });

    card.append(summaryBtn, details);
    cardList.appendChild(card);
  }
}

function onDelete(position) {
  if (!confirm(`Delete entry at position ${position}? This renumbers every later entry.`)) return;
  clearError();
  try {
    withTransaction((db) => deleteEntryAt(db, position));
    goToPage(currentPage);
  } catch (err) {
    showError(err.message);
  }
}

// ---- Flight add/edit dialog ----

const flightDialog = el('flight-dialog');
const flightForm = el('flight-form');
const flightAircraftSelect = el('flight-aircraft-select');
const flightNewAircraftFields = el('flight-new-aircraft-fields');
const NEW_AIRCRAFT_VALUE = '__new__';

flightAircraftSelect.addEventListener('change', () => {
  flightNewAircraftFields.hidden = flightAircraftSelect.value !== NEW_AIRCRAFT_VALUE;
});
el('flight-cancel').addEventListener('click', () => flightDialog.close());

function populateAircraftSelect() {
  flightAircraftSelect.textContent = '';
  for (const aircraft of listAircraft(getDb())) {
    const option = document.createElement('option');
    option.value = aircraft.id;
    option.textContent = `${aircraft.registration} (${aircraft.type})`;
    flightAircraftSelect.appendChild(option);
  }
  const newOption = document.createElement('option');
  newOption.value = NEW_AIRCRAFT_VALUE;
  newOption.textContent = '+ New aircraft...';
  flightAircraftSelect.appendChild(newOption);
}

// datetime-local gives "YYYY-MM-DDTHH:MM"; the db stores full UTC timestamps
// as plain "YYYY-MM-DD HH:MM:SS" text (see schema.sql).
function toDbTimestamp(datetimeLocalValue) {
  return `${datetimeLocalValue.replace('T', ' ')}:00`;
}
function toDatetimeLocalValue(dbTimestamp) {
  return dbTimestamp ? dbTimestamp.slice(0, 16).replace(' ', 'T') : '';
}

let editingPosition = null;

function openFlightDialog(position) {
  clearError();
  populateAircraftSelect();
  flightNewAircraftFields.hidden = true;
  editingPosition = position ?? null;
  el('flight-dialog-title').textContent = editingPosition ? 'Edit Flight' : 'Add Flight';
  el('flight-position').closest('label').hidden = Boolean(editingPosition);

  if (editingPosition) {
    const flight = getFlight(editingPosition);
    el('flight-position').value = '';
    el('flight-off-block').value = toDatetimeLocalValue(flight.off_block);
    el('flight-on-block').value = toDatetimeLocalValue(flight.on_block);
    el('flight-departure').value = flight.departure ?? '';
    el('flight-destination').value = flight.destination ?? '';
    flightAircraftSelect.value = String(flight.aircraft_id);
    el('flight-pic-name').value = flight.pic_name ?? '';
    el('flight-role').value = flight.role;
    el('flight-rules').value = flight.flight_rules;
    el('flight-day-landings').value = flight.day_landings ?? '';
    el('flight-night-landings').value = flight.night_landings ?? '';
    el('flight-remarks').value = flight.remarks ?? '';
  } else {
    flightForm.reset();
  }

  flightDialog.showModal();
}

flightForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearError();

  const data = {
    off_block: toDbTimestamp(el('flight-off-block').value),
    on_block: toDbTimestamp(el('flight-on-block').value),
    departure: el('flight-departure').value,
    destination: el('flight-destination').value,
    pic_name: el('flight-pic-name').value || null,
    role: el('flight-role').value,
    flight_rules: el('flight-rules').value,
    day_landings: el('flight-day-landings').value ? Number(el('flight-day-landings').value) : null,
    night_landings: el('flight-night-landings').value ? Number(el('flight-night-landings').value) : null,
    remarks: el('flight-remarks').value || '',
  };

  if (flightAircraftSelect.value === NEW_AIRCRAFT_VALUE) {
    data.aircraft = {
      registration: el('flight-new-registration').value,
      type: el('flight-new-type').value,
      pilot_operation: el('flight-new-pilot-operation').value,
      engine_configuration: el('flight-new-engine-configuration').value,
    };
  } else {
    data.aircraft_id = Number(flightAircraftSelect.value);
  }

  try {
    if (editingPosition) {
      updateFlight(editingPosition, data);
      flightDialog.close();
      goToPage(currentPage);
    } else {
      const position = el('flight-position').value ? Number(el('flight-position').value) : null;
      if (position != null) data.position = position;
      const landedAt = addFlight(data);
      flightDialog.close();
      goToPage(Math.floor((landedAt - 1) / 10) + 1);
    }
  } catch (err) {
    showError(err.message);
  }
});

// ---- Simulator session add dialog ----

const simDialog = el('sim-dialog');
const simForm = el('sim-form');
el('sim-cancel').addEventListener('click', () => simDialog.close());

function openSimDialog() {
  clearError();
  simForm.reset();
  simDialog.showModal();
}

simForm.addEventListener('submit', (event) => {
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
    const landedAt = addSimulatorSession(data);
    simDialog.close();
    goToPage(Math.floor((landedAt - 1) / 10) + 1);
  } catch (err) {
    showError(err.message);
  }
});

// ---- Remark add dialog ----

const remarkDialog = el('remark-dialog');
const remarkForm = el('remark-form');
el('remark-cancel').addEventListener('click', () => remarkDialog.close());

function openRemarkDialog() {
  clearError();
  remarkForm.reset();
  remarkDialog.showModal();
}

remarkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearError();
  const data = { text: el('remark-text').value || null };
  const position = el('remark-position').value ? Number(el('remark-position').value) : null;
  if (position != null) data.position = position;

  try {
    const landedAt = addRemark(data);
    remarkDialog.close();
    goToPage(Math.floor((landedAt - 1) / 10) + 1);
  } catch (err) {
    showError(err.message);
  }
});
