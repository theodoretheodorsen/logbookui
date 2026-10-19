// Shared between api/ (Node) and web/ (browser) - see README.md.
// Wrapped in a factory rather than importing a db.js directly: each
// environment's db.js exposes {getDb, withTransaction} slightly differently
// under the hood (node:sqlite vs sql.js), so the caller supplies its own.
import { findOrCreateAircraft } from './aircraft.js';
import { nextPosition, makeRoomAt, getEntryAt } from './entries.js';
import { NotFoundError } from './errors.js';
import { computeNightMinutesForFlight, resolvePendingNightMinutes } from './night.js';

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

// night_minutes is deliberately NOT in UPDATABLE_FIELDS - it's never set
// directly by a caller, only derived (see addFlight/updateFlight below).
const ROUTE_OR_TIME_FIELDS = ['off_block', 'on_block', 'departure', 'destination'];

export function createFlightsApi({ getDb, withTransaction }) {
  // Adds a new flight entry. `data.position` is optional (default: append at
  // the end); `data.aircraft_id` (existing aircraft) or `data.aircraft`
  // ({registration, type, pilot_operation, engine_configuration}, find-or-create)
  // must be provided. Returns the position the flight was placed at.
  async function addFlight(data) {
    // Resolved before opening the transaction - this may do a live network
    // fetch (see lib/night.js/lib/airports.js), which shouldn't happen
    // while a BEGIN/COMMIT is held open.
    const night_minutes = await computeNightMinutesForFlight(getDb(), data);

    return withTransaction((db) => {
      const aircraftId =
        data.aircraft_id != null ? data.aircraft_id : findOrCreateAircraft(db, data.aircraft);

      const position = data.position != null ? data.position : nextPosition(db);
      if (data.position != null) makeRoomAt(db, position);

      const result = db
        .prepare(
          `INSERT INTO flights
             (off_block, on_block, departure, destination, aircraft_id, pic_name, role, flight_rules, day_landings, night_landings, night_minutes, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          night_minutes,
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
  async function updateFlight(position, changes) {
    const db = getDb();
    const entry = getEntryAt(db, position);
    if (!entry.flight_id) {
      throw new NotFoundError(`Entry at position ${position} is not a flight`);
    }

    // Recompute night_minutes if this edit touches the route/time fields it
    // depends on, OR if the flight is still "pending" (night_minutes IS
    // NULL) - any edit to a pending flight is a free opportunity to retry
    // resolving it, since the pilot is online and looking at it right now.
    const current = db
      .prepare('SELECT off_block, on_block, departure, destination, night_minutes FROM flights WHERE id = ?')
      .get(entry.flight_id);
    const touchesRouteOrTime = ROUTE_OR_TIME_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(changes, field)
    );
    const recompute = touchesRouteOrTime || current.night_minutes == null;

    let night_minutes;
    if (recompute) {
      night_minutes = await computeNightMinutesForFlight(db, { ...current, ...changes });
    }

    return withTransaction((db) => {
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

      if (recompute) {
        sets.push('night_minutes = ?');
        values.push(night_minutes);
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

  // The most recent flight by position (regardless of any simulator/remark
  // entries after it), or undefined if none exist yet. Used to prefill a new
  // flight's route/aircraft from where the logbook last left off.
  function getLastFlight() {
    const db = getDb();
    return db
      .prepare(
        `SELECT e.position, f.*, a.registration, a.type, a.pilot_operation, a.engine_configuration
         FROM logbook_entries e
         JOIN flights f ON e.flight_id = f.id
         JOIN aircraft a ON f.aircraft_id = a.id
         ORDER BY e.position DESC
         LIMIT 1`
      )
      .get();
  }

  function resolvePendingNight() {
    return resolvePendingNightMinutes(getDb());
  }

  return { addFlight, updateFlight, getFlight, getLastFlight, resolvePendingNightMinutes: resolvePendingNight };
}
