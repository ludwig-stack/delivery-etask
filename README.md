# Delivery eTask — DSI daily delivery

Next.js/React application backed by **Cloudflare D1 (SQLite)**, matching the October 23 deployment handoff in Google Drive. The original `delivery_events` table, eight columns, version uniqueness and timestamp index are preserved. The current server uses D1; the previous Supabase adapter is retained only as legacy code.

Next.js calls a small authenticated Cloudflare Worker bound to D1 as `DB`. The Worker exposes only read, commit, login-limit and import operations. Database credentials stay on the server. Existing app accounts, roles and signed sessions continue to control user access.

## Local setup

Use Node 22 and the supplied lockfile:

```sh
npm ci
npm run setup:local
npm run db:migrate:local
```

`setup:local` preserves existing accounts and prepares a random local database secret in ignored `.env.local` and `.dev.vars`. Local data persists under `.wrangler/state/`. Run these in separate terminals:

```sh
npm run db:local
npm run dev
```

Open **http://localhost:5173**. Development account details are in ignored `.local-accounts.txt`. With the database Worker running, verify the connection:

```sh
npm run db:check
```

No migration runs during an application request or build. The app does not fall back to another database when D1 is unavailable. Existing files in `.data/` are preserved and are not imported automatically.

## Production database

The configured database is `delivery-etask-production` (`9902180f-386c-4b2f-a043-fc90522d6816`). Its database Worker is [delivery-etask-database](https://delivery-etask-database.rtp-bland-ghl.workers.dev). The original schema was verified, its baseline migrations were recorded, and the additive store migration was applied. Authenticated reads and rejection of unauthenticated access were verified on October 23, 2026.

The Worker secret is stored in Cloudflare and in ignored `.env.d1-worker.production`; matching connection settings are in ignored `.env.local` and `.env.production.local`. Set `D1_WORKER_URL` and `D1_WORKER_SECRET` in the hosting provider's server environment when deploying Next.js. App accounts and session secrets require their own production configuration. Local development currently connects to this configured remote database. To use the local emulator, set `.env.local` back to `http://127.0.0.1:8787` with the local secret from `.dev.vars`, then apply local migrations.

For a separate environment or a new Cloudflare account:

1. Create a company-owned D1 database, with separate databases and Workers for staging and production. For example, run `npx wrangler d1 create delivery-etask` in the intended Cloudflare account.
2. Replace the placeholder database ID in `wrangler.d1.jsonc` with the returned real ID. Set the appropriate Worker and database names. Never deploy using the all-zero placeholder.
3. Apply `npm run db:migrate:remote` to the intended database. A fresh target applies all three migrations. For a database that already has the original handoff schema, inspect its migration ledger first: mark only verified, already-applied baseline migrations as applied, then apply the additive migration. Do not rerun the original CREATE TABLE against an existing table.
4. Set a random secret of at least 32 characters with `npx wrangler secret put D1_WORKER_SECRET --config wrangler.d1.jsonc`.
5. Run `npm run db:deploy` and use the actual Worker URL returned by Cloudflare.
6. Set the following server-only variables on the Next.js host (Vercel Preview/Production or the Node server):

| Variable | Value |
| --- | --- |
| `D1_WORKER_URL` | Deployed database Worker's HTTPS base URL |
| `D1_WORKER_SECRET` | Same secret configured on that Worker |
| `SESSION_SECRET` | Random application signing secret, at least 32 characters |
| `AUTH_USERS_JSON` | Approved application accounts, password hashes, roles and owners |

Never use `NEXT_PUBLIC_` for secrets. Production account configuration is separate from local development accounts. Set the database Worker's secret before routing application traffic to it. Keep different secrets and URLs for staging and production.

Run `npm run db:check` using the target environment before rollout. Verify sign-in, a saved update visible in another session, and a complete event export. Redeploy Next.js after changing its environment variables.

Vercel hosts Next.js while D1 and the database Worker remain in the company Cloudflare account. A standalone Node host uses `npm run build` and `npm start`; Docker Compose reads `.env.production.local`. Configure HTTPS through the hosting platform or reverse proxy. The database Worker uses D1's binding API rather than Cloudflare's account-wide administrative query API.

## Data migration and backups

The Drive folder provides schema and planning files, **not hosted progress or a database backup**. Do not treat those planning files as live results. Stop writers and obtain a full authorized event export before moving live progress.

To import an existing local database or full-history JSON export into an empty D1 target:

```sh
npm run data:migrate -- .data/delivery.sqlite
# Or:
npm run data:restore -- full-history-backup.json
```

SQLite and JSON-store imports retain event IDs, versions, timestamps, metadata and login attempts. A full event export restores all events and starts with fresh login counters. The import is transactional and refuses any existing target events, login activity or nonzero revision. Source files are preserved. Finish imports before allowing sign-ins. The importer supports up to 1.9 MB per serialized collection; larger histories need an offline SQL migration and reconciliation.

The additive `drizzle/0002_d1_store.sql` migration adds metadata and event triggers without replacing the original table. Global revision checks prevent saves based on stale dependencies. Login limits use the database clock and atomic D1 batches. Failed batches roll back.

Reviewers and technical administrators can select **Export → Full event history · JSON**. This includes all versions; the current snapshot includes only the latest 150 audit entries. Configure D1 backups/Time Travel and test recovery before production cutover. Keep one writable master and preserve a rollback copy.

## Included workflows and plan

Daily delivery, work board, timeline, calendar, evidence-backed reports, account-bound review, milestone gates, recovery plans, daily results, cumulative scorecards and full-history exports remain available. Staff submit assigned work; reviewers accept or recover work and cannot accept their own tasks. Viewers and technical administrators cannot modify delivery records.

The current plan covers October 22–December 20, 2026 in `America/Los_Angeles`: 494 stable core tasks, 21 gates, 60 dates, 15 roles and 20 social posts. The 80 support proposals remain inactive. Unknown blank stays distinct from measured zero. Execution ends December 16; December 17–18 are review/recovery; December 19–20 require agreed coverage. No actual results were invented.

`app/data/plan.json` contains planning definitions; live progress stays in D1. `app/data/import-manifest.json` records planning checksums and reconciliation counts. `SOURCE_PROVENANCE.json`, `HANDOFF_MANIFEST.sha256`, `README_PLATFORM_BASELINE.md` and original files under `docs/`, `examples/` and `data/baseline-downloads/` document the imported baseline. Earlier runtime descriptions do not override this Next.js/D1 integration.

Source: [October 23 deployment handoff](https://drive.google.com/file/d/1dZeSQf6BoZOQz-DY4OybavvO0tZGugwU/view) and the [original database files](https://drive.google.com/drive/folders/1jTVJM98-eoV2KfRBzHY0dBIrR7y9T_iZ).

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:api:d1
```

D1 tests run the actual database Worker in Miniflare and check history, concurrent edits, dependency conflicts, atomic login limits, rollback, imports, baseline preservation and authentication. Legacy SQLite/Supabase tests protect the prior adapters; they do not select the production database.

After local account setup and a build, `npm run test:api:d1` starts an isolated temporary D1 database and application server, checks the complete API workflow, then stops both. It never uses the configured live database. The generic `npm run test:api` instead requires an isolated empty test database and loopback application URL. Never point that generic suite at live team data. Production rollout requires a real company D1 database ID, Worker deployment, secrets and approved accounts. AI reporting, automatic CQL synchronization, roster editing and password reset remain separate work.
