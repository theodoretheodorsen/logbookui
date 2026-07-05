const { NotFoundError } = require('./errors');

// Next free position: append-at-end default for inserts that don't specify one.
function nextPosition(db) {
  const row = db.prepare('SELECT COALESCE(MAX(position),0)+1 AS p FROM logbook_entries').get();
  return row.p;
}

// Makes room at `position` by shifting every entry at or after it up by 1.
// Must run highest-position-first so each UPDATE's target slot is already
// vacated (the current highest position has nothing above it to collide with).
function makeRoomAt(db, position) {
  const rows = db
    .prepare('SELECT position FROM logbook_entries WHERE position >= ? ORDER BY position DESC')
    .all(position);
  const bump = db.prepare('UPDATE logbook_entries SET position = position + 1 WHERE position = ?');
  for (const row of rows) bump.run(row.position);
}

// Closes the gap left by removing `position`, shifting everything after it
// down by 1. Must run lowest-position-first so each UPDATE's target slot
// (position - 1) is already vacated by the deletion or the previous step.
function closeGapAfter(db, position) {
  const rows = db
    .prepare('SELECT position FROM logbook_entries WHERE position > ? ORDER BY position ASC')
    .all(position);
  const drop = db.prepare('UPDATE logbook_entries SET position = position - 1 WHERE position = ?');
  for (const row of rows) drop.run(row.position);
}

function getEntryAt(db, position) {
  const entry = db.prepare('SELECT * FROM logbook_entries WHERE position = ?').get(position);
  if (!entry) throw new NotFoundError(`No entry at position ${position}`);
  return entry;
}

// Generic delete: works the same regardless of whether `position` holds a
// flight, a simulator session, or a remark - it deletes whichever child row
// the entry points to, removes the entry itself, then closes the gap.
function deleteEntryAt(db, position) {
  const entry = getEntryAt(db, position);
  db.prepare('DELETE FROM logbook_entries WHERE position = ?').run(position);
  if (entry.flight_id) db.prepare('DELETE FROM flights WHERE id = ?').run(entry.flight_id);
  if (entry.simulator_id) db.prepare('DELETE FROM simulator WHERE id = ?').run(entry.simulator_id);
  if (entry.remark_id) db.prepare('DELETE FROM remarks WHERE id = ?').run(entry.remark_id);
  closeGapAfter(db, position);
}

module.exports = { nextPosition, makeRoomAt, closeGapAfter, getEntryAt, deleteEntryAt };
