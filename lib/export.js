// Shared between api/ (Node) and web/ (browser) - see README.md.
// Plain functions taking `db` explicitly (like aircraft.js/entries.js) - all
// read-only, so no factory/withTransaction needed.
//
// Both functions below serve two features that turn out to need the exact
// same query shape: the CSV/PDF date-range export (only ever passes
// `{from,to}`) and the on-screen PIC/aircraft/role/kind/airport/date filter
// (passes any combination). Rather than duplicate the query, both criteria
// sets are folded into one dynamic, additive WHERE clause - same technique
// as lib/flights.js's updateFlight building its dynamic SET clause.
//
// `target` is 'entries' (querying logbook_page_report, for getEntriesForExport)
// or 'view' (querying logbook_view, for getExportTotals's aggregate) - the two
// expose slightly different raw columns, which only matters for `role` and
// `kind` below.
function buildConditions({ pic, registration, aircraftType, role, kind, airport, from, to }, target) {
  const conditions = [];
  const params = [];
  if (pic) {
    conditions.push('pic_name LIKE ? COLLATE NOCASE');
    params.push(`%${pic}%`);
  }
  if (registration) {
    conditions.push('registration = ?');
    params.push(registration);
  }
  if (aircraftType) {
    conditions.push('type = ?');
    params.push(aircraftType);
  }
  if (airport) {
    // "Airport" means departure OR arrival, not destination-only.
    conditions.push('(departure = ? OR destination = ?)');
    params.push(airport, airport);
  }
  if (role) {
    if (target === 'view') {
      conditions.push('role = ?');
      params.push(role);
    } else {
      // logbook_page_report doesn't expose raw role, only the role-derived
      // pic_time/sic_time/dual_time columns - exactly one of those is
      // non-null per flight iff role matches, so that's an equivalent
      // filter without needing a schema change to add a raw role column.
      const column = { PIC: 'pic_time', SIC: 'sic_time', DUAL: 'dual_time' }[role];
      conditions.push(`${column} IS NOT NULL`);
    }
  }
  if (kind) {
    if (target === 'view') {
      conditions.push('entry_type = ?');
      params.push(kind.toUpperCase());
    } else if (kind === 'flight') {
      conditions.push('registration IS NOT NULL');
    } else if (kind === 'simulator') {
      conditions.push('fstd_type IS NOT NULL');
    } else if (kind === 'remark') {
      conditions.push('registration IS NULL AND fstd_type IS NULL');
    }
  }
  if (from && to) {
    conditions.push('date BETWEEN ? AND ?');
    params.push(from, to);
  } else if (from) {
    conditions.push('date >= ?');
    params.push(from);
  } else if (to) {
    conditions.push('date <= ?');
    params.push(to);
  }
  return { conditions, params };
}

// Real entries (flights/simulator sessions/remarks, not the page-total/
// brought-forward/running-total sub-rows) matching the given criteria, in
// on-screen order. Omit all criteria for the whole book.
//
// Reads from logbook_page_report rather than logbook_pretty even though
// only entry rows are wanted: logbook_pretty has no ordering tiebreaker
// within a page (the same bug already found and fixed once for
// logbook_page_report by adding `line` - see that view's comment in
// schema.sql), so using it here would resurrect that bug.
export function getEntriesForExport(db, criteria = {}) {
  const { conditions, params } = buildConditions(criteria, 'entries');
  const where = ['sort_order = 0', ...conditions].join(' AND ');
  return db.prepare(`SELECT * FROM logbook_page_report WHERE ${where} ORDER BY page, line`).all(...params);
}

// The grand-total row for the same criteria, shaped like one row of COLUMNS
// (web/js/views/page-view.js) - total_time/se_time/.../day_landings/
// night_landings - so callers can map straight over COLUMNS for both entry
// rows and this total row.
export function getExportTotals(db, criteria = {}) {
  const { conditions, params } = buildConditions(criteria, 'view');

  if (conditions.length === 0) {
    // No criteria at all: the last page's running total already IS the
    // whole-book total - no new math needed.
    const row = db.prepare('SELECT * FROM running_totals_pretty ORDER BY page DESC LIMIT 1').get();
    if (!row) return {};
    const { page, flight_time, ...rest } = row;
    return { total_time: flight_time, ...rest };
  }

  // Any real criteria need a fresh aggregate query - SQLite views can't take
  // parameters, so this intentionally mirrors page_totals's CASE-WHEN-SUM
  // pattern (schema.sql) rather than reusing it directly, grouped as one
  // row instead of per-page and filtered by the same dynamic conditions as
  // getEntriesForExport (logbook_view already exposes pic_name/registration/
  // type/role/entry_type/departure/destination, so the same condition
  // strings apply unchanged here).
  const row = db
    .prepare(
      `WITH dated AS (
         SELECT *, COALESCE(strftime('%Y-%m-%d', off_block), session_date) AS date
         FROM logbook_view
       )
       SELECT
         SUM(CASE WHEN entry_type='FLIGHT' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) flight_minutes,
         SUM(CASE WHEN role='PIC' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) pic_minutes,
         SUM(CASE WHEN role='SIC' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) sic_minutes,
         SUM(CASE WHEN role='DUAL' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) dual_minutes,
         SUM(CASE WHEN flight_rules='IFR' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) ifr_minutes,
         SUM(CASE WHEN engine_configuration='SE' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) se_minutes,
         SUM(CASE WHEN engine_configuration='ME' AND pilot_operation='SP' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) me_minutes,
         SUM(CASE WHEN engine_configuration='ME' AND pilot_operation='MP' THEN ROUND((julianday(on_block)-julianday(off_block))*24*60) ELSE 0 END) multipilot_minutes,
         COALESCE(SUM(day_landings),0) day_landings,
         COALESCE(SUM(night_landings),0) night_landings,
         COALESCE(SUM(duration_minutes),0) simulator_minutes
       FROM dated
       WHERE ${conditions.join(' AND ')}`
    )
    .get(...params);

  const fmt = (mins) => `${Math.floor((mins ?? 0) / 60)}:${String((mins ?? 0) % 60).padStart(2, '0')}`;
  return {
    total_time: fmt(row.flight_minutes),
    se_time: fmt(row.se_minutes),
    me_time: fmt(row.me_minutes),
    multipilot_time: fmt(row.multipilot_minutes),
    ifr_time: fmt(row.ifr_minutes),
    pic_time: fmt(row.pic_minutes),
    sic_time: fmt(row.sic_minutes),
    dual_time: fmt(row.dual_minutes),
    simulator_time: fmt(row.simulator_minutes),
    day_landings: row.day_landings,
    night_landings: row.night_landings,
  };
}

// Distinct airports already used - as either a departure or a destination -
// for <datalist> suggestions in the filter dialog's "Airport" field, same
// pattern as listFstdTypes in lib/simulator.js.
export function listAirports(db) {
  return db
    .prepare(
      `SELECT DISTINCT airport FROM (
         SELECT departure AS airport FROM flights
         UNION
         SELECT destination AS airport FROM flights
       ) WHERE airport IS NOT NULL ORDER BY airport`
    )
    .all()
    .map((row) => row.airport);
}

export function listPicNames(db) {
  return db
    .prepare('SELECT DISTINCT pic_name FROM flights WHERE pic_name IS NOT NULL ORDER BY pic_name')
    .all()
    .map((row) => row.pic_name);
}

// Full physical pages (entries + their totals sub-rows) for a page-range
// export. Omit `fromPage`/`toPage` for the whole book.
export function getPagesForExport(db, { fromPage, toPage } = {}) {
  if (fromPage && toPage) {
    return db
      .prepare('SELECT * FROM logbook_page_report WHERE page BETWEEN ? AND ? ORDER BY page, sort_order, line')
      .all(fromPage, toPage);
  }
  return db.prepare('SELECT * FROM logbook_page_report ORDER BY page, sort_order, line').all();
}
