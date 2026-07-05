# Pilot Flight Logbook Database

This database is a digital mirror of a physical/paper pilot flight logbook
(EASA-style). A paper logbook is a bound book where every flight, simulator
session, or handwritten note is logged as one line, ten lines to a page.
At the bottom of each page the pilot writes three summary rows: the totals
for that page, the totals brought forward from the previous page, and the
running total to date. This schema reproduces that structure exactly, so
querying "page N" returns the same ten lines and the same three summary
rows a pilot would see on the physical page — see the `logbook_page_report`
view.

## Files

- **`logbook.db`** — the SQLite database. This is the source of truth for
  both structure and data.
- **`schema.sql`** — a generated, read-only export of `logbook.db`'s schema
  (tables + views), for browsing and diffing in git. Regenerate it after any
  structural change with:
  ```
  sqlite3 logbook.db ".schema" > schema.sql
  ```
  Never hand-edit `schema.sql` — every table/column/view comment lives
  inside the actual `CREATE` statements in `logbook.db` itself, so the
  export always reflects the true, current structure and can never drift
  out of sync.

## Reading the logbook

```sql
SELECT * FROM logbook_page_report WHERE page = 42;
```

returns page 42 exactly as it would appear on paper: up to ten entries
(flights, simulator sessions, or remarks), followed by that page's totals,
the totals brought forward from page 41, and the running total to date.

## A note on foreign keys

`flights.aircraft_id` and `logbook_entries.flight_id`/`simulator_id`/
`remark_id` are declared as `REFERENCES`, but SQLite does **not** enforce
foreign keys by default. Any connection that writes to this database should
run `PRAGMA foreign_keys = ON;` first if it wants invalid references
rejected.
