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

## API

`api/` is a small Node.js REST API for reading and editing the logbook
without hand-writing SQL — meant as the backend for an eventual phone/web
front-end.

```
cd api
npm install
npm start          # listens on http://localhost:3000
```

It's structured as a library (`api/lib/*.js` — the actual business logic:
find-or-create aircraft, position renumbering, CRUD per entry type) with a
thin Express layer (`api/server.js`) on top, so a CLI could reuse the same
library later without duplicating logic. Uses Node's built-in `node:sqlite`
(no native build step required).

**Position handling**: `logbook_entries.position` must stay contiguous
(page/line are computed from it), so inserts and deletes both renumber
everything after them in a transaction — insert accepts an optional
`position` (default: append at the end) and shifts later entries up by one;
delete always shifts later entries down by one to close the gap.

| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| GET    | `/pages/:page`        | Full page: entries + page total + brought-forward + running total |
| GET    | `/pages`              | `{ lastPage }` |
| GET    | `/aircraft`           | List all aircraft |
| GET    | `/flights/:position`  | Raw fields for one flight (editing/inspection) |
| POST   | `/flights`            | Add a flight (`aircraft_id` or `aircraft: {registration,type,pilot_operation,engine_configuration}`; optional `position`) |
| PUT    | `/flights/:position`  | Edit a flight's fields (position never changes) |
| POST   | `/simulator-sessions` | Add a simulator session |
| POST   | `/remarks`            | Add a remark/blank line |
| DELETE | `/entries/:position`  | Delete any entry type at that position, renumbering |

Errors: invalid enum/reference values → 400, unknown position → 404,
aircraft registration conflict → 409.
