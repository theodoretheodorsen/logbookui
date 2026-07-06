// Shared between api/ (Node) and web/ (browser) - see README.md.
import { nextPosition, makeRoomAt } from './entries.js';

export function createRemarksApi({ withTransaction }) {
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

  return { addRemark };
}
