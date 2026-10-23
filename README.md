# Delivery eTask — DSI daily delivery

Next.js/React application with a **local JSON file as its database**. It uses Node's filesystem APIs; no database service, database driver, SQLite server, or third-party database connection is needed.

## Run locally

Use Node.js 22 (22.13 or newer within that major version):

```sh
npm ci
npm run setup:local
npm run db:local
npm run dev
```

Open **http://localhost:5173**. Development sign-in details are in ignored `.local-accounts.txt`. Setup preserves existing accounts. The app accepts either an approved email address or username.

Progress, review history, metrics, and login attempt limits are saved in **`.data/delivery.json`**. `DSI_DATA_PATH` can select another private JSON file. Authentication definitions and the session secret remain server-only environment variables. The data file, its lock, temporary writes, and credentials are excluded from Git and container builds.

## Persistent server deployment

The app requires one persistent Node server with a local disk or a mounted persistent volume. Run one app instance against its data directory. Do not place the JSON file on a shared network filesystem or run independent replicas with separate copies.

Vercel cannot retain a writable local database file. The app refuses to use its temporary filesystem as the database. Deploy this version to a persistent server instead; no cloud database credentials are required.

Create private `.env.production.local` on the server using `.env.example` as the field reference:

| Variable | Value |
| --- | --- |
| `DSI_DATA_PATH` | Absolute persistent path, such as `/srv/delivery-etask/data/delivery.json` |
| `SESSION_SECRET` | A unique random secret of at least 32 characters |
| `AUTH_USERS_JSON` | Approved accounts with `id`, `name`, `username` or `email`, `role`, `owner`, `salt`, and `passwordHash`; optional reviewer `delegation` |
| `DSI_BIND_ADDRESS` | `127.0.0.1` behind an HTTPS reverse proxy; `0.0.0.0` inside a container |
| `PORT` | Internal listening port; default `3000` |

Account password hashes use PBKDF2 SHA-256, 100,000 iterations, a unique string salt, and a 32-byte hex output. Do not reuse development accounts or commit credentials. The approved `marco` account has technical administrator access: it can view delivery data and export backups; reviewer permissions remain separate.

```sh
npm ci
npm run build
npm start
```

The production build includes a standalone server with its static assets. The start command initializes or validates the JSON file and passes an absolute data path to the server. Set an HTTPS reverse proxy in front of the internal port. Keep the persistent data directory when replacing a release.

### Container option

```sh
docker compose up --build -d
```

Compose reads `.env.production.local`, uses a named `delivery-data` volume at `/app/data`, and binds the app to `127.0.0.1:3000` on the host. The image runs as an unprivileged user. Container replacements retain the volume; do not remove that volume when updating. Docker's health check verifies the HTTP sign-in page.

## JSON storage and recovery

The file has schema `dsi-json-store/1`, a revision, original event records, and recent login attempts. Every change retains its event ID, actor, timestamp, entity ID, and version. Latest state is reconstructed from the complete event history; no date advancement silently accepts work.

All writes take an exclusive filesystem lock. Business validation, dependency checks, and version checks happen inside that lock. Each save writes and flushes a temporary file in the same directory and atomically replaces the database file. Readers see a complete version. Corrupt data is never silently reset. Conflicting edits return HTTP 409. Login attempt limits are also recorded atomically.

After a process is forcibly stopped, a `.lock` file may remain. Stop every app process, inspect the PID in the lock, and confirm no writer remains before removing the lock file. Never remove a live writer's lock. A busy database fails the update instead of risking an overwrite.

Reviewers and technical administrators can select **Export → Full event history · JSON**. This contains every delivery event. The current snapshot contains only the latest 150 audit entries and is not a full backup. Back up the entire private data file as part of server operations as well.

```sh
npm run data:restore -- full-history-backup.json /srv/delivery-etask/data/restored.json
```

Restoration validates event IDs, payloads, timestamps, and uninterrupted version sequences, then creates a **new** JSON database. It refuses to overwrite an existing file. Login attempt counters start fresh when restoring an event export. Stop the app, inspect and reconcile the restored history, and point `DSI_DATA_PATH` at the verified file before restarting. Older full event exports using `dsi-events-backup/1` remain compatible. Older SQL stores are not read by the application; export their complete history through an authorized migration process if they contain live records.

## Included workflows

- Daily delivery, work board, timeline, day-by-day calendar, and team ownership.
- Evidence-backed reports, account-bound review, independent milestone gates, and recovery plans.
- Daily new results and cumulative scorecards; unknown blank stays distinct from measured zero.
- Current social calendar: 10 Engage / 6 Educate / 4 Promote originals.
- 80 support proposals remain inactive, separate from assigned work and overdue counts.
- CSV exports, authenticated planning downloads, complete event backups, and shared audit history.

Staff submit their assigned work. Reviewers accept or recover work but cannot accept their own tasks. Nova and reviewers record daily results. Viewers and technical administrators cannot modify delivery records. Sessions last eight hours and use signed HTTP-only cookies.

## Plan and provenance

The current plan covers October 22–December 20, 2026, in `America/Los_Angeles`: 494 stable core tasks, 21 gates, 60 dates, 15 roles, and 20 social posts. Execution ends December 16; December 17–18 are review/recovery; December 19–20 require agreed coverage. No actual results were invented.

`app/data/plan.json` holds planning definitions; live results stay in the private JSON database. `app/data/import-manifest.json` records the planning checksum and reconciliation counts. Plan integration never changes live progress.

`SOURCE_PROVENANCE.json`, `HANDOFF_MANIFEST.sha256`, `README_PLATFORM_BASELINE.md`, and the original files in `docs/`, `drizzle/`, `examples/`, and `data/baseline-downloads/` document the imported baseline. They describe earlier architecture and do not override this JSON-based runtime or the current plan. The earlier Cloudflare/D1 connection is no longer used.

## Verify changes

```sh
npm test
npm run typecheck
npm run build
```

Tests cover the current plan, evidence requirements, metrics, data surviving reopening, cross-process concurrent writes, stale edits, atomic login limits, corrupt-file preservation, full-history restore, and private file placement.

For the API suite, start the production app on port 5174 with `DSI_DATA_PATH` set to a **new isolated JSON path**, then run `npm run test:api`. The suite refuses non-loopback URLs and requires empty event history. Never run it against the team's live file.

Production hosting, account enrollment, HTTPS, backups, and rollout acceptance must be verified on the selected persistent server. AI reporting, automatic CQL synchronization, roster editing, and password reset remain separate work.
