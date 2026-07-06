// Binds the shared /lib/ business logic (see README.md) to this app's own
// db.js (sql.js). Everything else in web/js/ should go through `logbookApi`
// rather than importing /lib/*.js or db.js directly, so there is one place
// that knows how the UI is wired to the database.
import { loadDatabase, getDb, withTransaction } from './db.js';
import { listAircraft as listAircraftRaw } from '/lib/aircraft.js';
import { createFlightsApi } from '/lib/flights.js';
import { createSimulatorApi } from '/lib/simulator.js';
import { createRemarksApi } from '/lib/remarks.js';
import { deleteEntryAt } from '/lib/entries.js';
import { createPagesApi } from '/lib/pages.js';

const { addFlight, updateFlight, getFlight } = createFlightsApi({ getDb, withTransaction });
const { addSimulatorSession } = createSimulatorApi({ withTransaction });
const { addRemark } = createRemarksApi({ withTransaction });
const { getPage, getLastPageNumber } = createPagesApi({ getDb });

function listAircraft() {
  return listAircraftRaw(getDb());
}

function deleteEntry(position) {
  withTransaction((db) => deleteEntryAt(db, position));
}

export { loadDatabase };

export const logbookApi = {
  addFlight,
  updateFlight,
  getFlight,
  addSimulatorSession,
  addRemark,
  getPage,
  getLastPageNumber,
  listAircraft,
  deleteEntry,
};
