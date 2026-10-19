// One-time backfill: adds flights.night_minutes + airport_coords to the
// schema (if not already present) and computes night_minutes for every
// existing flight. Idempotent - safe to re-run after an interruption.
//
// IMPORTANT: run this against a SCRATCH COPY of logbook-data/logbook.db
// first, never the live working copy, until you've verified the result.
// This script only mutates the database file at --db; it does NOT
// regenerate schema.sql, touch logbook.csv, or commit/push anything - see
// the plan's Verification section for the manual steps that follow.
//
// Usage: node scripts/backfill-night-minutes.mjs --db /path/to/logbook.db

import { DatabaseSync } from 'node:sqlite';
import { computeNightMinutesForFlight } from '../lib/night.js';

const dbPathArgIndex = process.argv.indexOf('--db');
if (dbPathArgIndex === -1 || !process.argv[dbPathArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-night-minutes.mjs --db /path/to/logbook.db');
  process.exit(1);
}
const dbPath = process.argv[dbPathArgIndex + 1];

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

function hasTable(name) {
  return !!db.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', name);
}
function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}
function viewAlreadyMigrated(viewName) {
  const row = db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('view', viewName);
  return !!row && row.sql.includes('night_minutes');
}

// Full CREATE VIEW statements for every view in the logbook_view ->
// page_totals/running_totals/previous_page_totals -> *_pretty ->
// logbook_pretty/logbook_page_report chain, identical to logbook-data's
// current schema.sql except for night_minutes/night_time threaded through
// exactly like day_landings/night_landings (a plain stored/summed value,
// NOT a julianday()-derived one). Comments are preserved verbatim - the
// `/* viewname(col1,col2,...) */` trailing comments seen in schema.sql are
// NOT part of this (sqlite3's `.schema` CLI command appends those itself
// when schema.sql is regenerated - they don't need to be written here).
const VIEWS_SQL = `
CREATE VIEW logbook_view AS
-- Joins logbook_entries to whichever of flights/simulator/remarks it points
-- to, and derives:
--   page        = which physical page this entry falls on (10 entries/page)
--   line        = the line number (1-10) within that page
--   entry_type  = 'FLIGHT' | 'SIMULATOR' | 'REMARK'
--   remarks     = whichever of the remark/flight/simulator remark text
--                 applies to this entry (COALESCE picks the first non-null)
-- This is the foundation every other view builds on.
SELECT
  e.position,
  ((e.position-1)/10)+1 page,             -- 10 entries per physical page
  ((e.position-1)%10)+1 line,             -- position-within-page, 1-10
  CASE
    WHEN e.flight_id IS NOT NULL THEN 'FLIGHT'
    WHEN e.simulator_id IS NOT NULL THEN 'SIMULATOR'
    ELSE 'REMARK'
  END entry_type,
  f.off_block, f.on_block, f.departure, f.destination, f.pic_name, f.role, f.flight_rules,
  f.day_landings, f.night_landings, f.night_minutes,
  a.registration, a.type, a.pilot_operation, a.engine_configuration,
  s.session_date, s.fstd_type, s.duration_minutes,
  COALESCE(r.text, f.remarks, s.remarks) remarks
FROM logbook_entries e
LEFT JOIN flights f ON e.flight_id = f.id
LEFT JOIN aircraft a ON f.aircraft_id = a.id
LEFT JOIN simulator s ON e.simulator_id = s.id
LEFT JOIN remarks r ON e.remark_id = r.id;

CREATE VIEW page_totals AS
    -- Sums, per page, every time category a paper logbook tracks. All figures
    -- are in MINUTES (see the *_pretty views further down for "H:MM" formatting).
    --
    -- se_minutes / me_minutes / multipilot_minutes are mutually exclusive per
    -- flight and, critically, me_minutes only counts SINGLE-PILOT multi-engine
    -- flying (e.g. a DA42) - it deliberately EXCLUDES multi-pilot jets/turboprops
    -- (A320, DH8D, etc.), which are counted separately as multipilot_minutes.
    -- This matches how a paper EASA logbook has distinct "Multi-Pilot" and
    -- "Multi-Engine" columns rather than merging the two.
    SELECT
      page,
      SUM(CASE WHEN entry_type='FLIGHT' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) flight_minutes,
      SUM(CASE WHEN role='PIC' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) pic_minutes,
      SUM(CASE WHEN role='COP' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) cop_minutes,
      SUM(CASE WHEN role='DUAL' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) dual_minutes,
      SUM(CASE WHEN flight_rules='IFR' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) ifr_minutes,
      SUM(CASE WHEN engine_configuration='SE' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) se_minutes,
      SUM(CASE WHEN engine_configuration='ME' AND pilot_operation='SP' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) me_minutes,
      SUM(CASE WHEN engine_configuration='ME' AND pilot_operation='MP' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) multipilot_minutes,
      COALESCE(SUM(day_landings),0) day_landings,
      COALESCE(SUM(night_landings),0) night_landings,
      COALESCE(SUM(night_minutes),0) night_minutes,
      COALESCE(SUM(duration_minutes),0) simulator_minutes
    FROM logbook_view
    GROUP BY page;

CREATE VIEW running_totals AS
    -- Cumulative version of page_totals: for each page, the total of everything
    -- from page 1 through that page (i.e. "total time to date" as of this page).
    -- Uses a window function (SUM ... OVER ORDER BY page) rather than a subquery.
    SELECT
      page,
      SUM(flight_minutes) OVER(ORDER BY page) flight_minutes,
      SUM(pic_minutes) OVER(ORDER BY page) pic_minutes,
      SUM(cop_minutes) OVER(ORDER BY page) cop_minutes,
      SUM(dual_minutes) OVER(ORDER BY page) dual_minutes,
      SUM(ifr_minutes) OVER(ORDER BY page) ifr_minutes,
      SUM(se_minutes) OVER(ORDER BY page) se_minutes,
      SUM(me_minutes) OVER(ORDER BY page) me_minutes,
      SUM(multipilot_minutes) OVER(ORDER BY page) multipilot_minutes,
      SUM(day_landings) OVER(ORDER BY page) day_landings,
      SUM(night_landings) OVER(ORDER BY page) night_landings,
      SUM(night_minutes) OVER(ORDER BY page) night_minutes,
      SUM(simulator_minutes) OVER(ORDER BY page) simulator_minutes
    FROM page_totals;

CREATE VIEW previous_page_totals AS
    -- The running total as it stood BEFORE this page - i.e. the "brought
    -- forward" figures a pilot copies from the bottom of the previous page onto
    -- the top of the current one. Implemented with LAG() over running_totals,
    -- ordered by page; COALESCE(...,0) makes page 1 show all zeroes, since
    -- there is no page before the first one.
    SELECT
      page,
      COALESCE(LAG(flight_minutes) OVER (ORDER BY page),0) flight_minutes,
      COALESCE(LAG(pic_minutes) OVER (ORDER BY page),0) pic_minutes,
      COALESCE(LAG(cop_minutes) OVER (ORDER BY page),0) cop_minutes,
      COALESCE(LAG(dual_minutes) OVER (ORDER BY page),0) dual_minutes,
      COALESCE(LAG(ifr_minutes) OVER (ORDER BY page),0) ifr_minutes,
      COALESCE(LAG(se_minutes) OVER (ORDER BY page),0) se_minutes,
      COALESCE(LAG(me_minutes) OVER (ORDER BY page),0) me_minutes,
      COALESCE(LAG(multipilot_minutes) OVER (ORDER BY page),0) multipilot_minutes,
      COALESCE(LAG(day_landings) OVER (ORDER BY page),0) day_landings,
      COALESCE(LAG(night_landings) OVER (ORDER BY page),0) night_landings,
      COALESCE(LAG(night_minutes) OVER (ORDER BY page),0) night_minutes,
      COALESCE(LAG(simulator_minutes) OVER (ORDER BY page),0) simulator_minutes
    FROM running_totals;

CREATE VIEW page_totals_pretty AS
    -- Formatting-only wrapper around page_totals: every *_minutes column becomes
    -- a "H:MM" string (e.g. 1782 minutes -> '29:42'). Landing counts pass
    -- through unchanged.
    SELECT page,
    printf('%d:%02d',flight_minutes/60,flight_minutes%60) flight_time,
    printf('%d:%02d',pic_minutes/60,pic_minutes%60) pic_time,
    printf('%d:%02d',cop_minutes/60,cop_minutes%60) cop_time,
    printf('%d:%02d',dual_minutes/60,dual_minutes%60) dual_time,
    printf('%d:%02d',ifr_minutes/60,ifr_minutes%60) ifr_time,
    printf('%d:%02d',se_minutes/60,se_minutes%60) se_time,
    printf('%d:%02d',me_minutes/60,me_minutes%60) me_time,
    printf('%d:%02d',multipilot_minutes/60,multipilot_minutes%60) multipilot_time,
    printf('%d:%02d',simulator_minutes/60,simulator_minutes%60) simulator_time,
    day_landings,night_landings,
    printf('%d:%02d',night_minutes/60,night_minutes%60) night_time
    FROM page_totals;

CREATE VIEW running_totals_pretty AS
    -- Same H:MM formatting, wrapping running_totals instead of page_totals.
    SELECT page,
    printf('%d:%02d',flight_minutes/60,flight_minutes%60) flight_time,
    printf('%d:%02d',pic_minutes/60,pic_minutes%60) pic_time,
    printf('%d:%02d',cop_minutes/60,cop_minutes%60) cop_time,
    printf('%d:%02d',dual_minutes/60,dual_minutes%60) dual_time,
    printf('%d:%02d',ifr_minutes/60,ifr_minutes%60) ifr_time,
    printf('%d:%02d',se_minutes/60,se_minutes%60) se_time,
    printf('%d:%02d',me_minutes/60,me_minutes%60) me_time,
    printf('%d:%02d',multipilot_minutes/60,multipilot_minutes%60) multipilot_time,
    printf('%d:%02d',simulator_minutes/60,simulator_minutes%60) simulator_time,
    day_landings,night_landings,
    printf('%d:%02d',night_minutes/60,night_minutes%60) night_time
    FROM running_totals;

CREATE VIEW previous_page_totals_pretty AS
    -- Same H:MM formatting, wrapping previous_page_totals instead.
    SELECT page,
    printf('%d:%02d',flight_minutes/60,flight_minutes%60) flight_time,
    printf('%d:%02d',pic_minutes/60,pic_minutes%60) pic_time,
    printf('%d:%02d',cop_minutes/60,cop_minutes%60) cop_time,
    printf('%d:%02d',dual_minutes/60,dual_minutes%60) dual_time,
    printf('%d:%02d',ifr_minutes/60,ifr_minutes%60) ifr_time,
    printf('%d:%02d',se_minutes/60,se_minutes%60) se_time,
    printf('%d:%02d',me_minutes/60,me_minutes%60) me_time,
    printf('%d:%02d',multipilot_minutes/60,multipilot_minutes%60) multipilot_time,
    printf('%d:%02d',simulator_minutes/60,simulator_minutes%60) simulator_time,
    day_landings,night_landings,
    printf('%d:%02d',night_minutes/60,night_minutes%60) night_time
    FROM previous_page_totals;

CREATE VIEW logbook_pretty AS
    -- One human-readable row per logbook entry (flight, simulator session, or
    -- remark), with times already split into a plain date plus "HH:MMZ"
    -- clock times, and every duration category (SE/ME/multipilot/total/IFR/
    -- PIC/COP/DUAL/simulator) pre-computed and formatted as "H:MM". For a given
    -- entry, only the columns that apply to its type/role/rules are non-NULL -
    -- e.g. a VFR COP flight will have cop_time and total_time filled in but
    -- pic_time, dual_time and ifr_time NULL.
    --
    -- night_time is 'pending' (not NULL) for a FLIGHT whose night_minutes
    -- hasn't been resolved yet (no connectivity to look up an airport's
    -- coordinates - see airport_coords/lib/airports.js), so it reads
    -- distinctly from a genuine zero ('0:00').
    --
    -- The \`base\` CTE computes flight_minutes once so it can be reused by every
    -- CASE expression below without repeating the julianday() subtraction.
    WITH base AS (
      SELECT *, CASE WHEN entry_type='FLIGHT' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) END AS flight_minutes
      FROM logbook_view
    )
    SELECT
    page,
    COALESCE(strftime('%Y-%m-%d',off_block),session_date) AS date,
    departure,
    CASE WHEN off_block IS NOT NULL THEN strftime('%H:%MZ',off_block) END AS off_block_time,
    destination,
    CASE WHEN on_block IS NOT NULL THEN strftime('%H:%MZ',on_block) END AS on_block_time,
    type,
    registration,
    pic_name,
    CASE WHEN engine_configuration='SE' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS se_time,
    CASE WHEN engine_configuration='ME' AND pilot_operation='SP' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS me_time,
    CASE WHEN engine_configuration='ME' AND pilot_operation='MP' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS multipilot_time,
    CASE WHEN entry_type='FLIGHT' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS total_time,
    day_landings,
    night_landings,
    CASE WHEN entry_type='FLIGHT' AND night_minutes IS NULL THEN 'pending'
         WHEN entry_type='FLIGHT' THEN printf('%d:%02d',night_minutes/60,night_minutes%60)
    END AS night_time,
    CASE WHEN flight_rules='IFR' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS ifr_time,
    flight_rules,
    CASE WHEN role='PIC' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS pic_time,
    CASE WHEN role='COP' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS cop_time,
    CASE WHEN role='DUAL' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS dual_time,
    fstd_type,
    CASE WHEN duration_minutes IS NOT NULL THEN printf('%d:%02d',duration_minutes/60,duration_minutes%60) END AS simulator_time,
    remarks
    FROM base;

CREATE VIEW logbook_page_report AS
    -- **THE MAIN VIEW FOR READING THE LOGBOOK.**
    -- Reproduces one full physical page exactly: query
    --   SELECT * FROM logbook_page_report WHERE page = 42
    -- and you get, in order:
    --   1. the (up to) ten entries on that page, same columns as logbook_pretty,
    --      each tagged with page_position = '<page>_<line>' (e.g. '42_1' .. '42_10')
    --   2. one row with that page's own totals            (page_totals_pretty)
    --   3. one row with the totals brought forward         (previous_page_totals_pretty)
    --   4. one row with the running total to date          (running_totals_pretty)
    -- Row (2) + row (3) always equal row (4), column for column - that is the
    -- same arithmetic check a pilot does by hand at the bottom of a paper page.
    --
    -- The three summary rows are told apart from real entries simply by having
    -- a NULL page_position (entries always have one); sort_order fixes the
    -- required ordering (0=entries, 1=page total, 2=brought forward, 3=running
    -- total) since a plain UNION ALL has no inherent order of its own. \`line\` is
    -- a second tiebreaker needed ONLY to order the ten entries against each
    -- other correctly: sort_order alone can't do it since all ten share the
    -- same value (0) - without \`line\`, SQLite falls back to physical row
    -- storage order, which normally matches line order but silently breaks the
    -- moment a row is inserted/edited out of sequence (e.g. via the API).
    WITH base AS (
      SELECT *, CASE WHEN entry_type='FLIGHT' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) END AS flight_minutes
      FROM logbook_view
    )
    SELECT
    page,
    printf('%d_%d',page,line) AS page_position,
    COALESCE(strftime('%Y-%m-%d',off_block),session_date) AS date,
    departure,
    CASE WHEN off_block IS NOT NULL THEN strftime('%H:%MZ',off_block) END AS off_block_time,
    destination,
    CASE WHEN on_block IS NOT NULL THEN strftime('%H:%MZ',on_block) END AS on_block_time,
    type,
    registration,
    pic_name,
    CASE WHEN engine_configuration='SE' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS se_time,
    CASE WHEN engine_configuration='ME' AND pilot_operation='SP' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS me_time,
    CASE WHEN engine_configuration='ME' AND pilot_operation='MP' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS multipilot_time,
    CASE WHEN entry_type='FLIGHT' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS total_time,
    day_landings,
    night_landings,
    CASE WHEN entry_type='FLIGHT' AND night_minutes IS NULL THEN 'pending'
         WHEN entry_type='FLIGHT' THEN printf('%d:%02d',night_minutes/60,night_minutes%60)
    END AS night_time,
    CASE WHEN flight_rules='IFR' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS ifr_time,
    flight_rules,
    CASE WHEN role='PIC' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS pic_time,
    CASE WHEN role='COP' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS cop_time,
    CASE WHEN role='DUAL' THEN printf('%d:%02d',flight_minutes/60,flight_minutes%60) END AS dual_time,
    fstd_type,
    CASE WHEN duration_minutes IS NOT NULL THEN printf('%d:%02d',duration_minutes/60,duration_minutes%60) END AS simulator_time,
    remarks,
    0 AS sort_order,
    line
    FROM base
    UNION ALL
    SELECT page,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    se_time,me_time,multipilot_time,flight_time,day_landings,night_landings,night_time,ifr_time,NULL,pic_time,cop_time,dual_time,
    NULL,simulator_time,NULL,1,NULL
    FROM page_totals_pretty
    UNION ALL
    SELECT page,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    se_time,me_time,multipilot_time,flight_time,day_landings,night_landings,night_time,ifr_time,NULL,pic_time,cop_time,dual_time,
    NULL,simulator_time,NULL,2,NULL
    FROM previous_page_totals_pretty
    UNION ALL
    SELECT page,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    se_time,me_time,multipilot_time,flight_time,day_landings,night_landings,night_time,ifr_time,NULL,pic_time,cop_time,dual_time,
    NULL,simulator_time,NULL,3,NULL
    FROM running_totals_pretty
    ORDER BY page,sort_order,line;
`;

function migrate() {
  if (!hasColumn('flights', 'night_minutes')) {
    console.log('Adding flights.night_minutes column...');
    db.exec(
      `ALTER TABLE flights ADD COLUMN night_minutes INTEGER /* minutes of this flight flown during EASA civil-twilight night (sun below -6 degrees elevation); NULL = not yet resolved ("pending" - see airport_coords), contributes 0 to every total via COALESCE(SUM(...),0) */;`
    );
  } else {
    console.log('flights.night_minutes already exists, skipping.');
  }

  if (!viewAlreadyMigrated('page_totals')) {
    console.log('Rebuilding views to thread night_minutes/night_time through...');
    db.exec(`
      DROP VIEW IF EXISTS logbook_page_report;
      DROP VIEW IF EXISTS logbook_pretty;
      DROP VIEW IF EXISTS previous_page_totals_pretty;
      DROP VIEW IF EXISTS running_totals_pretty;
      DROP VIEW IF EXISTS page_totals_pretty;
      DROP VIEW IF EXISTS previous_page_totals;
      DROP VIEW IF EXISTS running_totals;
      DROP VIEW IF EXISTS page_totals;
      DROP VIEW IF EXISTS logbook_view;
    `);
    db.exec(VIEWS_SQL);
  } else {
    console.log('Views already migrated, skipping.');
  }

  if (!hasTable('airport_coords')) {
    console.log('Creating airport_coords table...');
    db.exec(`
      CREATE TABLE "airport_coords"(
        -- Cache of ICAO -> coordinates, used only to approximate aircraft
        -- position over a flight for night-time calculation (flights.night_minutes).
        -- Populated lazily: an ICAO not yet here triggers a live lookup
        -- (lib/airports.js) that inserts the result on success.
        icao TEXT PRIMARY KEY,
        lat REAL NOT NULL,
        lon REAL NOT NULL
      );
    `);
  } else {
    console.log('airport_coords table already exists, skipping.');
  }
}

async function backfillFlights() {
  const flights = db
    .prepare('SELECT id, off_block, on_block, departure, destination FROM flights ORDER BY id')
    .all();

  const airportsBefore = db.prepare('SELECT COUNT(*) AS n FROM airport_coords').get().n;
  let resolved = 0;
  let pending = 0;
  let skipped = 0;

  for (const [i, flight] of flights.entries()) {
    const current = db.prepare('SELECT night_minutes FROM flights WHERE id = ?').get(flight.id);
    if (current.night_minutes != null) {
      skipped++;
    } else {
      const minutes = await computeNightMinutesForFlight(db, flight);
      if (minutes == null) {
        pending++;
      } else {
        db.prepare('UPDATE flights SET night_minutes = ? WHERE id = ?').run(minutes, flight.id);
        resolved++;
      }
    }
    if ((i + 1) % 100 === 0 || i + 1 === flights.length) {
      console.log(`  ${i + 1}/${flights.length} flights processed...`);
    }
  }

  const airportsAfter = db.prepare('SELECT COUNT(*) AS n FROM airport_coords').get().n;

  console.log('');
  console.log('Backfill summary:');
  console.log(`  Flights: ${flights.length} total`);
  console.log(`    - ${skipped} already had night_minutes (skipped)`);
  console.log(`    - ${resolved} resolved just now`);
  console.log(`    - ${pending} still pending (airport coordinates unresolved)`);
  console.log(`  Airports: ${airportsAfter - airportsBefore} newly fetched, ${airportsBefore} already cached`);
}

console.log(`Running backfill against: ${dbPath}`);
migrate();
await backfillFlights();

console.log('');
console.log('Done. This script did NOT modify schema.sql, logbook.csv, or any git state. Next steps:');
console.log(`  1. sqlite3 ${dbPath} ".schema" > schema.sql   (regenerate, from this db)`);
console.log('  2. Open this logbook.db once in the local web UI and click "Save to GitHub"');
console.log('     (produces a fresh logbook.csv for free, alongside logbook.db).');
console.log('  3. Commit schema.sql separately in logbook-data.');
