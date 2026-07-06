// Shared between api/ (Node) and web/ (browser) - see README.md.
import { nextPosition, makeRoomAt, getEntryAt } from './entries.js';
import { NotFoundError } from './errors.js';

export function createRemarksApi({ getDb, withTransaction }) {
  // Adds a new stand-alone remark/blank-line entry (text may be null/omitted
  // for a genuinely blank line). `data.position` is optional (default: append
  // at the end). Returns the position the remark was placed at.
  function addRemark(data) {
    return withTransaction((db) => {
      const position = data.position != null ? data.position : nextPosition(db);
      if (data.position != null) makeRoomAt(db, position);

      const result = db.prepare('INSERT INTO remarks (text) VALUES (?)').run(data.text ?? null);

      db.prepare('INSERT INTO logbook_entries (position, remark_id) VALUES (?, ?)').run(
        position,
        Number(result.lastInsertRowid)
      );

      return position;
    });
  }

  // Edits an existing remark's text in place - position/ordering is never
  // touched by this function.
  function updateRemark(position, changes) {
    return withTransaction((db) => {
      const entry = getEntryAt(db, position);
      if (!entry.remark_id) {
        throw new NotFoundError(`Entry at position ${position} is not a remark`);
      }
      if (!Object.prototype.hasOwnProperty.call(changes, 'text')) return; // nothing to do

      db.prepare('UPDATE remarks SET text = ? WHERE id = ?').run(changes.text, entry.remark_id);
    });
  }

  // Raw remark fields + position, for editing/inspection.
  function getRemark(position) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT e.position, r.*
         FROM logbook_entries e
         JOIN remarks r ON e.remark_id = r.id
         WHERE e.position = ?`
      )
      .get(position);
    if (!row) throw new NotFoundError(`No remark at position ${position}`);
    return row;
  }

  return { addRemark, updateRemark, getRemark };
}
