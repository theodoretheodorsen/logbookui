import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'logbook.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

function getDb() {
  return db;
}

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

export { db, getDb, withTransaction };
