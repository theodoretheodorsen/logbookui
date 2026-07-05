const { withTransaction } = require('../db');
const { nextPosition, makeRoomAt } = require('./entries');

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

module.exports = { addSimulatorSession };
