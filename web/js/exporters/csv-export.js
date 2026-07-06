import { logbookApi } from '../logbook-api.js';
import { COLUMNS } from '../views/page-view.js';

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsvRow(values) {
  return values.map(csvEscape).join(',');
}

// `range` is `{}` for the full book or `{ from, to }` ('YYYY-MM-DD' each) for
// a date range - see lib/export.js.
export function buildCsv(range) {
  const entries = logbookApi.getEntriesForExport(range);
  const totals = logbookApi.getExportTotals(range);

  const lines = [toCsvRow(COLUMNS.map((column) => column.label))];
  for (const row of entries) {
    lines.push(toCsvRow(COLUMNS.map((column) => row[column.key])));
  }
  lines.push(toCsvRow(COLUMNS.map((column) => (column.key === 'date' ? 'Total' : totals[column.key]))));

  return lines.join('\r\n');
}

export function exportCsv(range) {
  const blob = new Blob([buildCsv(range)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'logbook-export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can race the browser actually starting the
  // download from the blob: URL - give it a moment first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
