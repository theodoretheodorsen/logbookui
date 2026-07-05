const { ValidationError } = require('./errors');

// Looks up an aircraft by registration and returns its id if it already
// exists - type/pilot_operation/engine_configuration are ignored in that
// case (the aircraft table is the source of truth for an aircraft's
// classification, not each individual flight-add request). Those fields are
// only required when the registration is genuinely new, since they're
// needed to create the row.
function findOrCreateAircraft(db, { registration, type, pilot_operation, engine_configuration }) {
  const existing = db.prepare('SELECT id FROM aircraft WHERE registration = ?').get(registration);
  if (existing) return existing.id;

  if (!type || !pilot_operation || !engine_configuration) {
    throw new ValidationError(
      `Aircraft ${registration} is new - type, pilot_operation, and engine_configuration are required to create it.`
    );
  }

  const result = db
    .prepare(
      'INSERT INTO aircraft (registration, type, pilot_operation, engine_configuration) VALUES (?, ?, ?, ?)'
    )
    .run(registration, type, pilot_operation, engine_configuration);
  return Number(result.lastInsertRowid);
}

function listAircraft(db) {
  return db.prepare('SELECT * FROM aircraft ORDER BY registration').all();
}

module.exports = { findOrCreateAircraft, listAircraft };
