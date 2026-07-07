// Caches the last-downloaded-or-saved logbook.db (raw bytes + its GitHub
// sha) in IndexedDB, so "Open from GitHub" can fall back to it when the
// network is unreachable - see app.js's onLoadFromGithub/onSaveToGithub.
// Always replaces whatever was cached before - this is a single
// last-known-good copy, not a history. IndexedDB (not localStorage)
// because it handles large binary blobs natively and has a much bigger
// quota than localStorage's ~5-10MB string-only limit.
const DB_NAME = 'logbook-offline-cache';
const STORE_NAME = 'db-cache';
const CACHE_KEY = 'logbook.db';

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// `bytes` is a Uint8Array - it structured-clones natively into IndexedDB,
// no encoding step needed.
export async function setCachedDb({ bytes, sha }) {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ bytes, sha, savedAt: Date.now() }, CACHE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Returns `{ bytes, sha, savedAt }`, or undefined if nothing's cached yet.
export async function getCachedDb() {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(CACHE_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
