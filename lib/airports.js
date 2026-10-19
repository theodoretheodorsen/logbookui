// Shared between api/ (Node) and web/ (browser) - see README.md.
// Takes `db` as an explicit parameter (like aircraft.js/entries.js), so it
// has no dependency on which environment's SQLite driver is behind it.
//
// airport_coords is a persisted CACHE of ICAO -> lat/lon, not vendored app
// data - it lives in logbook.db itself (see schema.sql) and only ever grows
// to cover airports this logbook has actually flown to/from, populated
// lazily by getOrFetchAirportCoords below.

const AIRPORTSAPI_BASE = 'https://airportsapi.com/api/airports/';
const FETCH_TIMEOUT_MS = 4000;

// Looks up one ICAO code's coordinates from the public airportsapi.com
// lookup. Never throws - offline, a timeout, an unknown ICAO, or a
// malformed response are all treated identically as "can't resolve this
// airport right now"; the caller decides what to do about that (see
// night.js - a flight just gets left "pending").
export async function fetchAirportCoordsFromApi(icao) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${AIRPORTSAPI_BASE}${icao}`, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    const attrs = body?.data?.attributes;
    if (typeof attrs?.latitude !== 'number' || typeof attrs?.longitude !== 'number') return null;
    return { lat: attrs.latitude, lon: attrs.longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Checks the local airport_coords cache first; on a miss, attempts a live
// fetch and caches the result for next time. Returns null (never throws)
// if neither the cache nor a live fetch can resolve it.
export async function getOrFetchAirportCoords(db, icao) {
  if (!icao) return null;

  const cached = db.prepare('SELECT lat, lon FROM airport_coords WHERE icao = ?').get(icao);
  if (cached) return cached;

  const fetched = await fetchAirportCoordsFromApi(icao);
  if (!fetched) return null;

  db.prepare('INSERT OR IGNORE INTO airport_coords (icao, lat, lon) VALUES (?, ?, ?)').run(
    icao,
    fetched.lat,
    fetched.lon
  );
  return fetched;
}
