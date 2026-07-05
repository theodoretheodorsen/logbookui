const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'logbook.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

// Runs `fn(db)` inside a BEGIN/COMMIT, rolling back on any thrown error.
// node:sqlite's DatabaseSync has no built-in transaction() helper (unlike
// better-sqlite3), so this wraps the same BEGIN/COMMIT/ROLLBACK pattern.
function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, withTransaction };
