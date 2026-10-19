// Shared between api/ (Node) and web/ (browser) - see README.md.
// Computes how many minutes of a flight happened at EASA "night" (civil
// twilight - sun below -6° elevation), given only departure/destination
// ICAO codes and off_block/on_block UTC timestamps - no GPS track is
// recorded, so the aircraft's position is approximated by assuming constant
// ground speed along the great-circle path between the two airports.
import { getPosition } from './vendor/suncalc.js';
import { getOrFetchAirportCoords } from './airports.js';

const NIGHT_THRESHOLD_DEG = -6; // EASA civil twilight

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function angularDistance(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Standard aviation-formulary "intermediate point" formula: position at
// elapsed-time fraction f (0..1) along the great-circle path, assuming
// constant ground speed. d===0 (e.g. a local/currency flight landing back
// at the departure airport) degenerates to "stationary at that point"
// rather than dividing by zero.
function intermediatePoint(lat1, lon1, lat2, lon2, f, d) {
  if (d < 1e-9) return { lat: lat1, lon: lon1 };
  const phi1 = toRad(lat1);
  const lambda1 = toRad(lon1);
  const phi2 = toRad(lat2);
  const lambda2 = toRad(lon2);
  const a = Math.sin((1 - f) * d) / Math.sin(d);
  const b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(phi1) * Math.cos(lambda1) + b * Math.cos(phi2) * Math.cos(lambda2);
  const y = a * Math.cos(phi1) * Math.sin(lambda1) + b * Math.cos(phi2) * Math.sin(lambda2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);
  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

// Minute-by-minute: for each minute of the flight, sample the interpolated
// position at that minute's midpoint and classify day/night via suncalc.
// Brute-force per-minute rather than solving for exact twilight-crossing
// times - simpler, and even a 16h flight is under 1000 cheap trig calls.
// `departure`/`destination` are {lat, lon}.
export function computeNightMinutes({ offBlock, onBlock, departure, destination }) {
  const start = new Date(`${offBlock.replace(' ', 'T')}Z`);
  const end = new Date(`${onBlock.replace(' ', 'T')}Z`);
  const totalMinutes = Math.round((end - start) / 60000);
  if (totalMinutes <= 0) return 0;

  const d = angularDistance(departure.lat, departure.lon, destination.lat, destination.lon);
  let nightMinutes = 0;
  for (let m = 0; m < totalMinutes; m++) {
    const f = (m + 0.5) / totalMinutes;
    const { lat, lon } = intermediatePoint(departure.lat, departure.lon, destination.lat, destination.lon, f, d);
    const t = new Date(start.getTime() + (m + 0.5) * 60000);
    const { altitude } = getPosition(t, lat, lon); // already in degrees (see vendor/suncalc.js)
    if (altitude < NIGHT_THRESHOLD_DEG) nightMinutes++;
  }
  return nightMinutes;
}

// Resolves both airports' coordinates (cache-or-live-fetch) and computes
// night_minutes, or returns null ("pending") if either airport can't be
// resolved right now.
export async function computeNightMinutesForFlight(db, { off_block, on_block, departure, destination }) {
  const [depCoords, destCoords] = await Promise.all([
    getOrFetchAirportCoords(db, departure),
    getOrFetchAirportCoords(db, destination),
  ]);
  if (!depCoords || !destCoords) return null;
  return computeNightMinutes({ offBlock: off_block, onBlock: on_block, departure: depCoords, destination: destCoords });
}

// Re-attempts resolution for every flight still "pending" (night_minutes IS
// NULL) - backs both the "retry on any edit" behavior in flights.js and the
// manual "Resolve pending night times" toolbar action.
export async function resolvePendingNightMinutes(db) {
  const pending = db
    .prepare('SELECT id, off_block, on_block, departure, destination FROM flights WHERE night_minutes IS NULL')
    .all();

  let resolved = 0;
  for (const flight of pending) {
    const minutes = await computeNightMinutesForFlight(db, flight);
    if (minutes != null) {
      db.prepare('UPDATE flights SET night_minutes = ? WHERE id = ?').run(minutes, flight.id);
      resolved++;
    }
  }
  return { attempted: pending.length, resolved };
}
