import { logbookApi } from '../logbook-api.js';
import { COLUMNS } from '../views/page-view.js';

const TOTALS_LABELS = { 1: 'Page total', 2: 'Previous page total', 3: 'Running total' };

const PRINT_STYLES = `
  @page { size: landscape; margin: 1cm; }
  body { font-family: system-ui, sans-serif; font-size: 9pt; color: #000; }
  h1 { font-size: 12pt; margin: 0 0 0.3em 0; }
  h2 { font-size: 10pt; font-weight: normal; color: #444; margin: 0 0 0.6em 0; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
  th, td { border: 1px solid #999; padding: 2px 5px; text-align: left; white-space: nowrap; }
  thead { background: #eee; }
  tr.totals-row { font-weight: bold; background: #eef4fb; }
  /* Remarks is always the last column - unlike the others it's free text and
     can be long, so it wraps instead of silently overflowing/getting cut
     off at the page edge. */
  th:last-child, td:last-child { white-space: normal; overflow-wrap: break-word; max-width: 12em; }
  /* printEntryList only - the owner/licence title repeated via the <thead>
     row trick (see buildHeaderRow's comment), so it reads like a title
     rather than a table cell. */
  th.print-title-row {
    font-size: 11pt;
    font-weight: bold;
    text-align: left;
    white-space: nowrap;
    background: #fff;
    border-left: none;
    border-right: none;
  }

  /* "Logbook pages" mode only (printLogbookPages): three physical logbook
     pages per printed sheet, stacked vertically at full page width (not a
     grid - full width keeps columns far more legible per pixel of font
     size than splitting into side-by-side halves would). Four per sheet
     isn't physically achievable at a readable size: stacked vertically,
     each page block only gets a quarter of the sheet's height (a 2x2 grid
     gets a half, since each grid row holds two blocks side by side), which
     measured out to needing an illegible ~3.3pt font. Three fits
     comfortably around 6pt.

     Each sheet's height is left to grow with its content rather than
     forced into three equal thirds - a forced equal split clips whichever
     page block happens to run long (e.g. an unusually long remark wrapping
     to extra lines), silently dropping rows off the bottom. Left free to
     grow, that page block just makes its sheet a bit taller instead, which
     can occasionally push a page onto its own sheet rather than sharing
     one with the other two - rarer than every sheet holding a full three,
     but never loses data.

     Columns get proportional (not equal) widths - see COLUMN_WIDTH_PERCENT
     below - because an equal split starves the two genuinely variable-length
     columns (PIC Name, Remarks) of room, forcing them to wrap onto several
     lines on nearly every row and blowing the height budget. Remarks gets
     its own smaller font on top of that - it's the one column that can
     contain an arbitrarily long free-text note (see the "Autorise vol
     local..." case that motivated this), so it alone gets shrunk further
     rather than shrinking every column to accommodate its worst case. */
  .sheet {
    page-break-after: always;
  }
  .sheet:last-child { page-break-after: auto; }
  .sheet .page-block { break-inside: avoid; margin-bottom: 1.5mm; }
  .sheet .page-block:last-child { margin-bottom: 0; }
  .sheet h1 { font-size: 7pt; margin: 0 0 0.4mm 0; }
  /* One of these per sheet (= one per printed page) - see
     appendTitleBanner's comment - slightly larger/bolder than the "Page N"
     headings above so it still reads as the page's title, not another one
     of them. */
  .sheet h1.sheet-title { font-size: 7.5pt; font-weight: bold; margin: 0 0 0.6mm 0; }
  .sheet table { table-layout: fixed; margin-bottom: 0; }
  .sheet th, .sheet td {
    font-size: 6pt;
    line-height: 1.05;
    padding: 0.15mm 0.8mm;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: break-word;
    max-width: none;
  }
  .sheet th:last-child, .sheet td:last-child { font-size: 4pt; }
`;

// Relative column widths for the dense "Logbook pages" print mode (applied
// via a <colgroup> in buildPageBlock) - PIC Name and Remarks are the only
// genuinely variable-length columns, so they get noticeably more room than
// the mostly-short fixed-format ones (times, counts); Date also gets extra
// room since the totals rows' "Previous page total"/"Running total" labels
// live in that column and mustn't wrap. Don't need to sum to 100 - the
// browser scales them proportionally to fill the table's width.
const COLUMN_WIDTH_PERCENT = {
  date: 9,
  departure: 4,
  off_block_time: 5,
  destination: 4,
  on_block_time: 5,
  type: 5,
  registration: 5,
  pic_name: 10,
  se_time: 4,
  me_time: 4,
  multipilot_time: 4,
  total_time: 4,
  ifr_time: 4,
  pic_time: 4,
  cop_time: 4,
  dual_time: 4,
  day_landings: 3,
  night_landings: 3,
  night_time: 4,
  fstd_type: 7,
  simulator_time: 4,
  remarks: 10,
};

// "Logbook <owner's name> <licence number>" - falls back to a generic title
// if there's no owner row yet (see app.js's refreshOwnerInfo, same check).
// Doubles as the filename browsers suggest when saving the print output as
// a PDF, so it's worth being identifiable rather than generic.
function buildDocTitle() {
  const owner = logbookApi.getOwner();
  if (owner?.first_name) {
    const name = [owner.first_name, owner.family_name].filter(Boolean).join(' ');
    return ['Logbook', name, owner.license_number].filter(Boolean).join(' ');
  }
  return 'Logbook export';
}

// Opens a new window navigated to a blob: URL rather than the bare
// about:blank left by `window.open('', ...)` - otherwise the browser's
// print header/footer shows the literal string "about:blank" as the
// document's location, which is what this avoids. Navigation is
// asynchronous even for a blob: URL, hence the returned promise, resolved
// once the skeleton has actually loaded and its <style>/<title> can be
// filled in.
//
// The skeleton loaded there is fixed, static markup - no dynamic data goes
// into this HTML string, so it stays safe to construct by concatenation;
// all dynamic content (remarks, PIC names, ...) is still added afterwards
// via createElement/textContent, never string-concatenated into HTML, so it
// can never break out of its cell or inject markup.
function openPrintWindow() {
  const skeleton =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title><style></style></head><body></body></html>';
  const blobUrl = URL.createObjectURL(new Blob([skeleton], { type: 'text/html' }));
  const printWindow = window.open(blobUrl, '_blank');
  return new Promise((resolve) => {
    printWindow.addEventListener('load', () => {
      URL.revokeObjectURL(blobUrl);
      const doc = printWindow.document;
      doc.title = buildDocTitle();
      doc.querySelector('style').textContent = PRINT_STYLES;
      resolve({ printWindow, doc });
    });
  });
}

// Prints the "Logbook <owner name> <licence number>" title as actual page
// content (not just document.title/the browser's optional print header),
// since the latter is unreliable across platforms - notably, mobile export
// flows don't reliably show it at all, whereas this always prints. Appended
// to `container` (default: the whole document) so callers that need it
// repeated once per printed page (see printLogbookPages) can append one
// per page-sized container instead of once for the whole document.
function appendTitleBanner(doc, container = doc.body, className) {
  const h1 = doc.createElement('h1');
  if (className) h1.className = className;
  h1.textContent = buildDocTitle();
  container.appendChild(h1);
  return h1;
}

// `titleRow` (printEntryList only) adds the owner/licence title as an extra
// row inside the <thead>, spanning every column - unlike the single banner
// at the very top of the document, a <thead> natively repeats at the top
// of every printed page a table's <tbody> spans, which is how this list
// (a single long table, not divided into page-sized containers the way
// printLogbookPages is) gets the title on every page too.
function buildHeaderRow(doc, { titleRow } = {}) {
  const thead = doc.createElement('thead');

  if (titleRow) {
    const bannerRow = doc.createElement('tr');
    const th = doc.createElement('th');
    th.colSpan = COLUMNS.length;
    th.className = 'print-title-row';
    th.textContent = titleRow;
    bannerRow.appendChild(th);
    thead.appendChild(bannerRow);
  }

  const tr = doc.createElement('tr');
  for (const column of COLUMNS) {
    const th = doc.createElement('th');
    th.textContent = column.label;
    tr.appendChild(th);
  }
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
export async function printEntryList(range) {
  const entries = logbookApi.getEntriesForExport(range);
  const totals = logbookApi.getExportTotals(range);

  const { printWindow, doc } = await openPrintWindow();

  const docTitle = appendTitleBanner(doc).textContent;
  const h2 = doc.createElement('h2');
  h2.textContent = describeCriteria(range);
  doc.body.appendChild(h2);

  const table = doc.createElement('table');
  table.appendChild(buildHeaderRow(doc, { titleRow: docTitle }));

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

function buildColumnWidthsGroup(doc) {
  const colgroup = doc.createElement('colgroup');
  for (const column of COLUMNS) {
    const col = doc.createElement('col');
    col.style.width = `${COLUMN_WIDTH_PERCENT[column.key] ?? 4}%`;
    colgroup.appendChild(col);
  }
  return colgroup;
}

function buildPageBlock(doc, page, pageRows) {
  const block = doc.createElement('div');
  block.className = 'page-block';

  const h1 = doc.createElement('h1');
  h1.textContent = `Page ${page}`;
  block.appendChild(h1);

  const table = doc.createElement('table');
  table.appendChild(buildColumnWidthsGroup(doc));
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
  return block;
}

// Three physical logbook pages per printed sheet, stacked vertically - see
// the ".sheet" comment in PRINT_STYLES for why (not four, and not a grid).
const PAGES_PER_SHEET = 3;

// `range` is `{}` for the full book or `{ fromPage, toPage }` for a page range.
export async function printLogbookPages(range) {
  const rows = logbookApi.getPagesForExport(range);

  const { printWindow, doc } = await openPrintWindow();

  const pages = new Map();
  for (const row of rows) {
    if (!pages.has(row.page)) pages.set(row.page, []);
    pages.get(row.page).push(row);
  }

  const pageEntries = [...pages.entries()];
  for (let i = 0; i < pageEntries.length; i += PAGES_PER_SHEET) {
    const sheet = doc.createElement('div');
    sheet.className = 'sheet';
    // One banner per sheet (= one printed page), not once for the whole
    // document - see appendTitleBanner's comment.
    appendTitleBanner(doc, sheet, 'sheet-title');
    for (const [page, pageRows] of pageEntries.slice(i, i + PAGES_PER_SHEET)) {
      sheet.appendChild(buildPageBlock(doc, page, pageRows));
    }
    doc.body.appendChild(sheet);
  }

  printWindow.focus();
  printWindow.print();
}
