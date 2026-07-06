// Binds the shared /lib/ business logic (see README.md) to this app's own
// db.js (sql.js). Everything else in web/js/ should go through `logbookApi`
// rather than importing /lib/*.js or db.js directly, so there is one place
// that knows how the UI is wired to the database.
import { loadDatabase, getDb, withTransaction } from './db.js';
import { listAircraft as listAircraftRaw } from '/lib/aircraft.js';
import { createFlightsApi } from '/lib/flights.js';
import { createSimulatorApi, listFstdTypes as listFstdTypesRaw } from '/lib/simulator.js';
import { createRemarksApi } from '/lib/remarks.js';
import { deleteEntryAt } from '/lib/entries.js';
import { createPagesApi } from '/lib/pages.js';
import {
  getEntriesForExport as getEntriesForExportRaw,
  getExportTotals as getExportTotalsRaw,
  getPagesForExport as getPagesForExportRaw,
} from '/lib/export.js';

const { addFlight, updateFlight, getFlight, getLastFlight } = createFlightsApi({ getDb, withTransaction });
const { addSimulatorSession, updateSimulatorSession, getSimulatorSession } = createSimulatorApi({
  getDb,
  withTransaction,
});
const { addRemark, updateRemark, getRemark } = createRemarksApi({ getDb, withTransaction });
const { getPage, getLastPageNumber } = createPagesApi({ getDb });

function listAircraft() {
  return listAircraftRaw(getDb());
}

function listFstdTypes() {
  return listFstdTypesRaw(getDb());
}

function deleteEntry(position) {
  withTransaction((db) => deleteEntryAt(db, position));
}

function getEntriesForExport(range) {
  return getEntriesForExportRaw(getDb(), range);
}

function getExportTotals(range) {
  return getExportTotalsRaw(getDb(), range);
}

function getPagesForExport(range) {
  return getPagesForExportRaw(getDb(), range);
}

export { loadDatabase };

export const logbookApi = {
  addFlight,
  updateFlight,
  getFlight,
  getLastFlight,
  addSimulatorSession,
  updateSimulatorSession,
  getSimulatorSession,
  addRemark,
  updateRemark,
  getRemark,
  getPage,
  getLastPageNumber,
  listAircraft,
  listFstdTypes,
  deleteEntry,
  getEntriesForExport,
  getExportTotals,
  getPagesForExport,
};
