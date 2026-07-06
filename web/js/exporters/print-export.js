import { logbookApi } from '../logbook-api.js';
import { COLUMNS } from '../views/page-view.js';

const TOTALS_LABELS = { 1: 'Page total', 2: 'Brought forward', 3: 'Running total' };

const PRINT_STYLES = `
  @page { size: landscape; margin: 1cm; }
  body { font-family: system-ui, sans-serif; font-size: 9pt; color: #000; }
  h1 { font-size: 12pt; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
  th, td { border: 1px solid #999; padding: 2px 5px; text-align: left; white-space: nowrap; }
  thead { background: #eee; }
  tr.totals-row { font-weight: bold; background: #eef4fb; }
  /* Remarks is always the last column - unlike the others it's free text and
     can be long, so it wraps instead of silently overflowing/getting cut
     off at the page edge. */
  th:last-child, td:last-child { white-space: normal; overflow-wrap: break-word; max-width: 12em; }
  .page-block { page-break-after: always; }
  .page-block:last-child { page-break-after: auto; }
`;

// Opens a blank tab and writes a minimal, static HTML skeleton into it via
// document.write() (safe here - the skeleton is fixed markup, never user
// data). All dynamic content (remarks, PIC names, ...) is added afterwards
// via createElement/textContent, never string-concatenated into HTML, so it
// can never break out of its cell or inject markup.
function openPrintWindow(title) {
  const printWindow = window.open('', '_blank');
  const doc = printWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title><style></style></head><body></body></html>');
  doc.close();
  doc.title = title;
  doc.querySelector('style').textContent = PRINT_STYLES;
  return { printWindow, doc };
}

function buildHeaderRow(doc) {
  const tr = doc.createElement('tr');
  for (const column of COLUMNS) {
    const th = doc.createElement('th');
    th.textContent = column.label;
    tr.appendChild(th);
  }
  const thead = doc.createElement('thead');
  thead.appendChild(tr);
  return thead;
}

// Describes whichever criteria are actually set (PIC/aircraft/type/role/
// kind/airport/date), not just a date range - printEntryList is used both
// for the plain date-range export and for "export what's currently
// filtered", which can be filtered by any combination of these.
function describeCriteria(criteria) {
  const parts = [];
  if (criteria.pic) parts.push(`PIC "${criteria.pic}"`);
  if (criteria.registration) parts.push(`aircraft ${criteria.registration}`);
  if (criteria.aircraftType) parts.push(`type ${criteria.aircraftType}`);
  if (criteria.role) parts.push(`role ${criteria.role}`);
  if (criteria.kind) parts.push(`${criteria.kind} entries`);
  if (criteria.airport) parts.push(`airport ${criteria.airport}`);
  if (criteria.from && criteria.to) parts.push(`${criteria.from} to ${criteria.to}`);
  else if (criteria.from) parts.push(`from ${criteria.from}`);
  else if (criteria.to) parts.push(`up to ${criteria.to}`);
  return parts.length ? `Flights — ${parts.join(', ')}` : 'Flights — full logbook';
}

function buildRow(doc, values, { bold } = {}) {
  const tr = doc.createElement('tr');
  if (bold) tr.className = 'totals-row';
  for (const value of values) {
    const td = doc.createElement('td');
    td.textContent = value ?? '';
    tr.appendChild(td);
  }
  return tr;
}

// `range` is `{}` for the full book or `{ from, to }` for a date range.
export function printEntryList(range) {
  const entries = logbookApi.getEntriesForExport(range);
  const totals = logbookApi.getExportTotals(range);

  const { printWindow, doc } = openPrintWindow('Logbook export');

  const h1 = doc.createElement('h1');
  h1.textContent = describeCriteria(range);
  doc.body.appendChild(h1);

  const table = doc.createElement('table');
  table.appendChild(buildHeaderRow(doc));

  const tbody = doc.createElement('tbody');
  for (const row of entries) {
    tbody.appendChild(buildRow(doc, COLUMNS.map((column) => row[column.key])));
  }
  tbody.appendChild(
    buildRow(
      doc,
      COLUMNS.map((column) => (column.key === 'date' ? 'Total' : totals[column.key])),
      { bold: true }
    )
  );
  table.appendChild(tbody);
  doc.body.appendChild(table);

  printWindow.focus();
  printWindow.print();
}

// `range` is `{}` for the full book or `{ fromPage, toPage }` for a page range.
export function printLogbookPages(range) {
  const rows = logbookApi.getPagesForExport(range);

  const { printWindow, doc } = openPrintWindow('Logbook export');

  const pages = new Map();
  for (const row of rows) {
    if (!pages.has(row.page)) pages.set(row.page, []);
    pages.get(row.page).push(row);
  }

  for (const [page, pageRows] of pages) {
    const block = doc.createElement('div');
    block.className = 'page-block';

    const h1 = doc.createElement('h1');
    h1.textContent = `Page ${page}`;
    block.appendChild(h1);

    const table = doc.createElement('table');
    table.appendChild(buildHeaderRow(doc));

    const tbody = doc.createElement('tbody');
    for (const row of pageRows) {
      const isEntry = row.sort_order === 0;
      const values = COLUMNS.map((column) =>
        !isEntry && column.key === 'date' ? TOTALS_LABELS[row.sort_order] : row[column.key]
      );
      tbody.appendChild(buildRow(doc, values, { bold: !isEntry }));
    }
    table.appendChild(tbody);
    block.appendChild(table);
    doc.body.appendChild(block);
  }

  printWindow.focus();
  printWindow.print();
}
