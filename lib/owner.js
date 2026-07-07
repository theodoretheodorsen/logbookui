// Shared between api/ (Node) and web/ (browser) - see README.md.
// Takes `db` as an explicit parameter (rather than importing a db.js), so it
// has no dependency on which environment's SQLite driver is behind it.

// The `owner` table holds exactly one row: the pilot this logbook belongs
// to (first_name/family_name/license_number) - not to be confused with
// flights.pic_name, which names whoever was PIC on a given flight (often
// someone else, e.g. an instructor, during training). Returns undefined if
// the table is missing (this UI can point at any data repo - see
// github-storage.js - and an older logbook.db may predate this table) or
// just empty (nobody's filled it in yet).
export function getOwner(db) {
  const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='owner'").get();
  if (!tableExists) return undefined;
  return db.prepare('SELECT first_name, family_name, license_number FROM owner LIMIT 1').get();
}
