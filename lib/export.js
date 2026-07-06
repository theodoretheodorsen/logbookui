// Shared between api/ (Node) and web/ (browser) - see README.md.
// Plain functions taking `db` explicitly (like aircraft.js/entries.js) - all
// read-only, so no factory/withTransaction needed.

// Real entries (flights/simulator sessions/remarks, not the page-total/
// brought-forward/running-total sub-rows) for a flat-list export, in
// on-screen order. Omit `from`/`to` for the whole book.
//
// Reads from logbook_page_report rather than logbook_pretty even though
// only entry rows are wanted: logbook_pretty has no ordering tiebreaker
// within a page (the same bug already found and fixed once for
// logbook_page_report by adding `line` - see that view's comment in
// schema.sql), so using it here would resurrect that bug.
export function getEntriesForExport(db, { from, to } = {}) {
  if (from && to) {
    return db
      .prepare('SELECT * FROM logbook_page_report WHERE sort_order = 0 AND date BETWEEN ? AND ? ORDER BY page, line')
      .all(from, to);
  }
  return db.prepare('SELECT * FROM logbook_page_report WHERE sort_order = 0 ORDER BY page, line').all();
}

// The grand-total row for the same range, shaped like one row of COLUMNS
// (web/js/views/page-view.js) - total_time/se_time/.../day_landings/
// night_landings - so callers can map straight over COLUMNS for both entry
// rows and this total row.
export function getExportTotals(db, { from, to } = {}) {
  if (!from || !to) {
    // Full book: the last page's running total already IS the whole-book
    // total - no new math needed.
    const row = db.prepare('SELECT * FROM running_totals_pretty ORDER BY page DESC LIMIT 1').get();
    if (!row) return {};
    const { page, flight_time, ...rest } = row;
    return { total_time: flight_time, ...rest };
  }

  // A date range needs a fresh aggregate query - SQLite views can't take
  // parameters, so this intentionally mirrors page_totals's CASE-WHEN-SUM
  // pattern (schema.sql) rather than reusing it directly, grouped as one
  // row instead of per-page and filtered by the same date expression the
  // *_pretty views use.
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
       WHERE date BETWEEN ? AND ?`
    )
    .get(from, to);

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
