// Shared between api/ (Node) and web/ (browser) - see README.md.
import { NotFoundError } from './errors.js';

export function createPagesApi({ getDb }) {
  // Returns one full physical page: up to ten entries followed by the page
  // total, brought-forward total, and running-total-to-date rows (see
  // logbook_page_report in schema.sql for exact column meanings).
  function getPage(pageNumber) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM logbook_page_report WHERE page = ?').all(pageNumber);
    if (rows.length === 0) throw new NotFoundError(`No such page: ${pageNumber}`);
    return rows;
  }

  function getLastPageNumber() {
    const db = getDb();
    const row = db.prepare('SELECT MAX(page) AS lastPage FROM logbook_view').get();
    return row.lastPage ?? 0;
  }

  return { getPage, getLastPageNumber };
}
