// Ported from api/lib/remarks.js (CommonJS -> ES module). Keep in sync by hand.
import { withTransaction } from '../db.js';
import { nextPosition, makeRoomAt } from './entries.js';

// Adds a new stand-alone remark/blank-line entry (text may be null/omitted
// for a genuinely blank line). `data.position` is optional (default: append
// at the end). Returns the position the remark was placed at.
export function addRemark(data) {
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
