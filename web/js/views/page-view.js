// Renders one logbook page (rows from logbookApi.getPage) as both the
// desktop table and the mobile card list - see style.css for which one is
// actually visible at a given viewport width.

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

function td(text) {
  const cell = document.createElement('td');
  cell.textContent = text ?? '';
  return cell;
}

// Compact "card" summary for narrow/mobile screens: date + off-block/on-block
// + departure/destination for a flight, the closest analog for
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

// `onEditFlight(position)` and `onDeleteEntry(position)` are supplied by the
// caller (app.js) rather than imported directly, so this module doesn't need
// to know about dialogs.
export function createPageView({ tableBody, cardList, onEditFlight, onDeleteEntry }) {
  function buildActionButtons(position, kind) {
    const buttons = [];
    if (kind === 'flight') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => onEditFlight(position));
      buttons.push(editBtn);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => onDeleteEntry(position));
    buttons.push(deleteBtn);
    return buttons;
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

  return { renderTable, renderCards };
}
