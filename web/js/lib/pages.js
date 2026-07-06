// Ported from api/lib/pages.js (CommonJS -> ES module). Keep in sync by hand.
import { getDb } from '../db.js';
import { NotFoundError } from './errors.js';

// Returns one full physical page: up to ten entries followed by the page
// total, brought-forward total, and running-total-to-date rows (see
// logbook_page_report in schema.sql for exact column meanings).
export function getPage(pageNumber) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM logbook_page_report WHERE page = ?').all(pageNumber);
  if (rows.length === 0) throw new NotFoundError(`No such page: ${pageNumber}`);
  return rows;
}

export function getLastPageNumber() {
  const db = getDb();
  const row = db.prepare('SELECT MAX(page) AS lastPage FROM logbook_view').get();
  return row.lastPage ?? 0;
}
