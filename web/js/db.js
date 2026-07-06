// sql.js (SQLite-via-WASM) wrapper. Exposes the same shape the ported
// lib/*.js files expect from api/db.js: db.prepare(sql).get/all/run(...params)
// and withTransaction(fn) - so those files read almost identically to their
// api/lib originals.

let SQL = null;
let db = null;
let rawDb = null;

async function initSql() {
  if (!SQL) {
    SQL = await window.initSqlJs({ locateFile: (file) => `vendor/${file}` });
  }
  return SQL;
}

// sql.js's Statement only has bind/step/getAsObject/free - this adapts it to
// the get/all/run ergonomics the ported lib files are written against.
function wrapDb(rawDb) {
  return {
    prepare(sql) {
      return {
        get(...params) {
          const stmt = rawDb.prepare(sql);
          stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all(...params) {
          const stmt = rawDb.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        run(...params) {
          const stmt = rawDb.prepare(sql);
          stmt.bind(params);
          stmt.step();
          stmt.free();
          const idRow = rawDb.exec('SELECT last_insert_rowid() AS id')[0];
          const lastInsertRowid = idRow ? idRow.values[0][0] : undefined;
          return { lastInsertRowid };
        },
      };
    },
    exec(sql) {
      rawDb.exec(sql);
    },
  };
}

// Loads a logbook.db file (as an ArrayBuffer) into a fresh in-memory
// database, replacing whatever was previously open. Returns the wrapped
// adapter that the rest of the app and the ported lib/*.js files use.
async function loadDatabase(arrayBuffer) {
  await initSql();
  rawDb = new SQL.Database(new Uint8Array(arrayBuffer));
  rawDb.exec('PRAGMA foreign_keys = ON;');
  db = wrapDb(rawDb);
  return db;
}

function getDb() {
  if (!db) throw new Error('No database loaded yet');
  return db;
}

// The current in-memory database as bytes (sql.js's built-in serialization),
// used to save back to GitHub - see github-storage.js.
function exportDatabase() {
  if (!rawDb) throw new Error('No database loaded yet');
  return rawDb.export();
}

// Same BEGIN/COMMIT/ROLLBACK pattern as api/db.js's withTransaction.
function withTransaction(fn) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

export { loadDatabase, getDb, withTransaction, exportDatabase };
