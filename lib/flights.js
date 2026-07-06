// Shared between api/ (Node) and web/ (browser) - see README.md.
// Wrapped in a factory rather than importing a db.js directly: each
// environment's db.js exposes {getDb, withTransaction} slightly differently
// under the hood (node:sqlite vs sql.js), so the caller supplies its own.
import { findOrCreateAircraft } from './aircraft.js';
import { nextPosition, makeRoomAt, getEntryAt } from './entries.js';
import { NotFoundError } from './errors.js';

const UPDATABLE_FIELDS = [
  'off_block',
  'on_block',
  'departure',
  'destination',
  'pic_name',
  'role',
  'flight_rules',
  'day_landings',
  'night_landings',
  'remarks',
];

export function createFlightsApi({ getDb, withTransaction }) {
  // Adds a new flight entry. `data.position` is optional (default: append at
  // the end); `data.aircraft_id` (existing aircraft) or `data.aircraft`
  // ({registration, type, pilot_operation, engine_configuration}, find-or-create)
  // must be provided. Returns the position the flight was placed at.
  function addFlight(data) {
    return withTransaction((db) => {
      const aircraftId =
        data.aircraft_id != null ? data.aircraft_id : findOrCreateAircraft(db, data.aircraft);

      const position = data.position != null ? data.position : nextPosition(db);
      if (data.position != null) makeRoomAt(db, position);

      const result = db
        .prepare(
          `INSERT INTO flights
             (off_block, on_block, departure, destination, aircraft_id, pic_name, role, flight_rules, day_landings, night_landings, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.off_block,
          data.on_block,
          data.departure,
          data.destination,
          aircraftId,
          data.pic_name ?? null,
          data.role,
          data.flight_rules,
          data.day_landings ?? null,
          data.night_landings ?? null,
          data.remarks ?? ''
        );

      db.prepare('INSERT INTO logbook_entries (position, flight_id) VALUES (?, ?)').run(
        position,
        Number(result.lastInsertRowid)
      );

      return position;
    });
  }

  // Edits an existing flight's fields in place - position/ordering is never
  // touched by this function. `changes` may include any of UPDATABLE_FIELDS
  // plus optionally `aircraft_id` or `aircraft` (find-or-create) to reassign
  // the aircraft.
  function updateFlight(position, changes) {
    return withTransaction((db) => {
      const entry = getEntryAt(db, position);
      if (!entry.flight_id) {
        throw new NotFoundError(`Entry at position ${position} is not a flight`);
      }

      const sets = [];
      const values = [];

      for (const field of UPDATABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(changes, field)) {
          sets.push(`${field} = ?`);
          values.push(changes[field]);
        }
      }

      if (changes.aircraft_id != null) {
        sets.push('aircraft_id = ?');
        values.push(changes.aircraft_id);
      } else if (changes.aircraft) {
        sets.push('aircraft_id = ?');
        values.push(findOrCreateAircraft(db, changes.aircraft));
      }

      if (sets.length === 0) return; // nothing to do

      values.push(entry.flight_id);
      db.prepare(`UPDATE flights SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    });
  }

  // Raw flight fields + aircraft info + position, for editing/inspection.
  // (Use pages.getPage() for the human-readable, paper-logbook formatted view.)
  function getFlight(position) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT e.position, f.*, a.registration, a.type, a.pilot_operation, a.engine_configuration
         FROM logbook_entries e
         JOIN flights f ON e.flight_id = f.id
         JOIN aircraft a ON f.aircraft_id = a.id
         WHERE e.position = ?`
      )
      .get(position);
    if (!row) throw new NotFoundError(`No flight at position ${position}`);
    return row;
  }

  return { addFlight, updateFlight, getFlight };
}
