// Shared between api/ (Node) and web/ (browser) - see README.md.
import { nextPosition, makeRoomAt, getEntryAt } from './entries.js';
import { NotFoundError } from './errors.js';

const UPDATABLE_FIELDS = ['session_date', 'fstd_type', 'duration_minutes', 'remarks'];

// Distinct FSTD types already used, for prefilling a picker when adding a
// new session (there's no separate "simulator types" table - fstd_type is
// just free text - so this is the closest equivalent to listAircraft()).
export function listFstdTypes(db) {
  return db
    .prepare('SELECT DISTINCT fstd_type FROM simulator WHERE fstd_type IS NOT NULL ORDER BY fstd_type')
    .all()
    .map((row) => row.fstd_type);
}

export function createSimulatorApi({ getDb, withTransaction }) {
  // Adds a new simulator session entry. `data.position` is optional (default:
  // append at the end). Returns the position the session was placed at.
  function addSimulatorSession(data) {
    return withTransaction((db) => {
      const position = data.position != null ? data.position : nextPosition(db);
      if (data.position != null) makeRoomAt(db, position);

      const result = db
        .prepare(
          'INSERT INTO simulator (session_date, fstd_type, duration_minutes, remarks) VALUES (?, ?, ?, ?)'
        )
        .run(data.session_date, data.fstd_type, data.duration_minutes, data.remarks ?? null);

      db.prepare('INSERT INTO logbook_entries (position, simulator_id) VALUES (?, ?)').run(
        position,
        Number(result.lastInsertRowid)
      );

      return position;
    });
  }

  // Edits an existing simulator session's fields in place - position/ordering
  // is never touched by this function.
  function updateSimulatorSession(position, changes) {
    return withTransaction((db) => {
      const entry = getEntryAt(db, position);
      if (!entry.simulator_id) {
        throw new NotFoundError(`Entry at position ${position} is not a simulator session`);
      }

      const sets = [];
      const values = [];
      for (const field of UPDATABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(changes, field)) {
          sets.push(`${field} = ?`);
          values.push(changes[field]);
        }
      }
      if (sets.length === 0) return; // nothing to do

      values.push(entry.simulator_id);
      db.prepare(`UPDATE simulator SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    });
  }

  // Raw simulator fields + position, for editing/inspection.
  function getSimulatorSession(position) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT e.position, s.*
         FROM logbook_entries e
         JOIN simulator s ON e.simulator_id = s.id
         WHERE e.position = ?`
      )
      .get(position);
    if (!row) throw new NotFoundError(`No simulator session at position ${position}`);
    return row;
  }

  return { addSimulatorSession, updateSimulatorSession, getSimulatorSession };
}
