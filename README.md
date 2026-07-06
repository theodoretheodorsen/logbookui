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

## Shared business logic (`lib/`)

`lib/*.js` — find-or-create aircraft, position renumbering, and CRUD per
entry type — is the one copy of the logbook's business logic, used by both
`api/` and `web/` below (and any future consumer, e.g. a CLI). It doesn't
know which SQLite driver it's running on: `aircraft.js`/`entries.js` take a
`db` handle as an explicit function argument, and `flights.js`/`simulator.js`/
`remarks.js`/`pages.js` export a factory (`createFlightsApi({ getDb,
withTransaction })`, etc.) that each environment calls with its own
`{ getDb, withTransaction }` — supplied by that environment's own `db.js`
(`api/db.js` wraps `node:sqlite`; `web/js/db.js` wraps `sql.js`/WASM, since
the browser can't use `node:sqlite`).

**Position handling**: `logbook_entries.position` must stay contiguous
(page/line are computed from it), so inserts and deletes both renumber
everything after them in a transaction — insert accepts an optional
`position` (default: append at the end) and shifts later entries up by one;
delete always shifts later entries down by one to close the gap.

## API

`api/` is a small Node.js REST API for reading and editing the logbook
without hand-writing SQL — meant as the backend for an eventual phone/web
front-end.

```
cd api
npm install
npm start          # listens on http://localhost:3000
```

It's a thin Express layer (`api/server.js`) over the shared `lib/` above,
using Node's built-in `node:sqlite` (no native build step required).

| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| GET    | `/pages/:page`        | Full page: entries + page total + brought-forward + running total |
| GET    | `/pages`              | `{ lastPage }` |
| GET    | `/aircraft`           | List all aircraft |
| GET    | `/flights/:position`  | Raw fields for one flight (editing/inspection) |
| POST   | `/flights`            | Add a flight (`aircraft_id` or `aircraft: {registration,type,pilot_operation,engine_configuration}`; optional `position`) |
| PUT    | `/flights/:position`  | Edit a flight's fields (position never changes) |
| GET    | `/simulator-sessions/:position` | Raw fields for one simulator session |
| POST   | `/simulator-sessions` | Add a simulator session |
| PUT    | `/simulator-sessions/:position` | Edit a simulator session's fields (position never changes) |
| GET    | `/remarks/:position`  | Raw fields for one remark |
| POST   | `/remarks`            | Add a remark/blank line |
| PUT    | `/remarks/:position`  | Edit a remark's text (position never changes) |
| DELETE | `/entries/:position`  | Delete any entry type at that position, renumbering |

Errors: invalid enum/reference/missing-required-field values → 400, unknown
position → 404.

## Web UI

`web/` is a static, serverless page (no backend, no bundler) that runs
SQLite entirely in the browser via `sql.js` (WASM), for editing the logbook
without installing anything. It imports the same `lib/` as the API.

```
node web/serve.js   # listens on http://localhost:8080 (needed because
                     # sql.js's .wasm fetch requires http://, not file://)
```

Open the page, pick `logbook.db` from disk, and edit freely — under 700px
width the page/line table collapses into tap-to-expand cards for one-handed
phone use. **Nothing is saved back to disk yet**: everything happens in
browser memory and is lost on refresh. Persistence (and committing changes
back to GitHub) is intentionally not built yet.
