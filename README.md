# Pilot Flight Logbook

This app is a digital mirror of a physical/paper pilot flight logbook
(EASA-style). A paper logbook is a bound book where every flight, simulator
session, or handwritten note is logged as one line, ten lines to a page.
At the bottom of each page the pilot writes three summary rows: the totals
for that page, the totals brought forward from the previous page, and the
running total to date. This schema reproduces that structure exactly, so
querying "page N" returns the same ten lines and the same three summary
rows a pilot would see on the physical page — see the `logbook_page_report`
view.

## Data lives in a separate repo

`logbook.db` and `schema.sql` are **not** in this repo — they live in
[`logbook-data`](https://github.com/theodoretheodorsen/logbook-data), on
purpose: every save is a commit (data entry, not software development, so
mixing the two would bury each repo's history in the other's noise), that
history is a real backup/rollback mechanism and is never rewritten, and the
data repo is private forever while this app repo has no sensitive content
of its own.

This repo (`logbookui`) is public and hosted on GitHub Pages, since it's
just the generic app code with no personal data in it.

For local development, a working copy of `logbook.db` (and, if you
regenerate it, `schema.sql`) still needs to sit at the root of this repo —
copy it from `logbook-data` — but it's gitignored here, not tracked.

## Files

- **`logbook.db`** (gitignored, local working copy only — see above) — the
  SQLite database, source of truth for both structure and data.
- **`schema.sql`** (gitignored, local working copy only) — a generated,
  read-only export of `logbook.db`'s schema (tables + views). Regenerate it
  after any structural change with:
  ```
  sqlite3 logbook.db ".schema" > schema.sql
  ```
  Never hand-edit `schema.sql` — every table/column/view comment lives
  inside the actual `CREATE` statements in `logbook.db` itself, so the
  export always reflects the true, current structure and can never drift
  out of sync. Copy both files over to `logbook-data` and commit them there
  when you want the change to persist.

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

Open the page and either load `logbook.db` straight from the `logbook-data`
repo (paste a fine-grained GitHub PAT scoped to that repo, "Contents: read
and write") or pick a local copy from disk — under 700px width the
page/line table collapses into tap-to-expand cards for one-handed phone
use. Edits live in browser memory until you hit "Save to GitHub" (💾 in the
toolbar), which commits both `logbook.db` and a freshly regenerated
`logbook.csv` back to `logbook-data` (two commits, since the Contents API
is one file per call). A locally-opened file can be saved to GitHub the
same way the first time; nothing is ever written back to local disk.

### Progressive Web App (installable on Android)

The app is installable — on Android, Chrome's "Install app" (three-dot menu,
or an automatic banner) adds a home-screen icon that launches full-screen,
no browser chrome. This is `web/manifest.webmanifest` + `web/sw.js` (a
hand-written service worker, no Workbox/build step): `sw.js` precaches the
small set of files needed to boot the shell at all (`index.html`,
`style.css`, the manifest, `vendor/sql-wasm.*`, the two largest icons), then
opportunistically caches everything else (every `web/js/*.js` and `lib/*.js`
module) the first time it's actually fetched — so a new dialog/exporter file
just works once fetched online, with no `sw.js` edit required. It never
intercepts cross-origin requests (`api.github.com`) or non-GET requests,
since logbook data load/save always requires a live network call by design.

App icons (`web/icons/*.png`) are generated from the same epaulette emblem
used on the cover/menu button, via `scripts/generate-pwa-icons.ps1` (.NET
`System.Drawing`/GDI+, no npm dependency) — rerun it if the icon design or
brand colors ever change.

`logbook.db` itself is also cached, separately, in IndexedDB
(`web/js/offline-cache.js`) every time it's successfully downloaded from or
saved to GitHub — a single last-known-good copy, replaced on every
successful load/save. If "Open from GitHub" can't reach the network for any
reason, it falls back to that cached copy automatically instead of just
failing, showing a banner with both the original error and how old the
cached copy is. This means the installed app is genuinely usable offline —
browsing and editing the last-synced logbook works with no connectivity;
only syncing back to GitHub still needs it, which stays a visible,
explicit requirement rather than a silent gap.
