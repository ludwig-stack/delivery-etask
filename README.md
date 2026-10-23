# Delivery eTask — DSI daily delivery

A working DSI execution workspace based on the supplied October 23 deployment handoff and current 60-day schedule. The default runtime is Next.js on Node/Vercel, with persistent D1 access through a server-only adapter. The original Cloudflare Worker build is also available.

## Run locally

Use Node.js 22 (22.13 or newer within that major version). From this directory:

```sh
npm ci
npm run setup:local
npm run build
npm run db:local
npm run dev
```

Open **http://localhost:5173**. Generated development sign-in details are in **`.local-accounts.txt`**. Local accounts include Wyline (reviewer), Joey (staff), Nova (results entry), a delegated reviewer for Wyline-owned work, and a read-only stakeholder. Passwords are randomly generated; `.dev.vars` and the credential file are ignored by Git. Repeating setup preserves existing accounts and data.

`npm run dev` runs Next.js with hot reload. To run its production build locally, stop dev and run `npm start -- --port 5173`. Local accounts are copied into ignored `.env.local` without replacing existing configuration. Local SQLite reuses the existing Wrangler database when exactly one is present; otherwise it creates `.data/delivery.sqlite`. Set `DSI_SQLITE_PATH` when selecting another local database. Existing events are never reset.

For the original Worker runtime, use `npm run dev:worker`, `npm run build:worker`, and `npm run start:worker -- --port 5173`. These retain the native D1 binding and `.dev.vars` configuration.

## Deploy on Vercel

The previous `NEXT_NO_ROUTES_MANIFEST` failure came from running the Vinext Worker build while Vercel expected Next.js output. `npm run build` now runs `next build` and generates `.next/routes-manifest.json`. `vercel.json` declares the Next.js framework, build command, and `.next` output directory. The Node major version is pinned to `22.x` in both package manifests.

In Vercel, deploy this updated source with the **Next.js** preset, **`npm run build`** build command, and **`.next`** output directory. Remove any old `vinext`, `dist`, or Worker-specific dashboard overrides.

Set these **server-only Environment Variables** for the target environment before testing sign-in:

| Variable | Value |
| --- | --- |
| `SESSION_SECRET` | A new random secret of at least 32 characters, managed by the hosting owner |
| `AUTH_USERS_JSON` | Approved account definitions: `id`, `name`, `email`, `owner`, `role`, `salt`, `passwordHash`, and optional reviewer `delegation` |
| `CLOUDFLARE_ACCOUNT_ID` | The company Cloudflare account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | The existing company staging or production D1 database ID |
| `CLOUDFLARE_D1_API_TOKEN` | A server-held API token with D1 edit permission in the intended account |

`.env.example` lists the names without secret values. Do not prefix any with `NEXT_PUBLIC_`, commit credentials, or copy development credentials into production. Account password hashes use PBKDF2 SHA-256, 100,000 iterations, a per-account string salt, and a 32-byte hex output; `scripts/setup-local.mjs` shows the format. Preview and production should use separate databases and secrets.

The D1 database must already contain the reviewed migrations in `drizzle/0000_brief_taskmaster.sql` and `drizzle/0001_auth_attempts.sql`. Apply pending migrations through the database owner's approved process; do not replay a migration against an existing table. This change does not create a cloud resource, run remote migrations, or transfer live progress. Database IDs and credentials are not needed at build time; without them the build and login screen work, but sign-in and data saves remain unavailable. Vercel explicitly refuses local SQLite so records cannot disappear into a temporary serverless filesystem.

The adapter uses [Cloudflare's D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/), preserves the SQL schema and unique record-version constraint, and keeps tokens out of the browser. HTTP queries are subject to Cloudflare API limits; monitor request volume and use native Workers/D1 or a dedicated data service for higher-volume operation. The original native Worker binding remains available through the optional Worker scripts.

## Included workflows

- Daily commitments, owner/workstream/status search and filters, and a six-stage work board.
- Gantt timeline, all 60 calendar dates, team responsibilities, and proposal-to-delivery mapping.
- Evidence-backed reporting, human review, independent milestone gates, recovery owners and dates.
- Daily new sales results, cumulative scorecards, measured zero versus unknown blank, and mutually exclusive booking attribution.
- Current 20-post social calendar with 10 Engage / 6 Educate / 4 Promote originals and publishing handoffs.
- 80 proposed support rows shown separately with no active owner; excluded from deadlines and overdue counts.
- Persistent shared updates, version conflicts, audit history, CSV exports, protected planning downloads, and reviewer/admin full-history backups.
- Signed, eight-hour account sessions; password hashes, persisted login attempt limits, server-side permissions, and no reliance on client identity headers.

Staff can update their assigned work and submit evidence. Reviewers can review and recover work, but cannot accept their own deliverables. Accepted reviewer identity and timestamp come from the server. Nova and reviewers can enter daily results. Viewers and technical administrators have no delivery write privilege; administrator and reviewer privileges are separate.

## Plan and provenance

The current plan runs **October 22–December 20, 2026**, in `America/Los_Angeles`, including the PDT/PST transition. Execution ends December 16; December 17–18 are review/recovery; December 19–20 require individually agreed coverage. Office starts and proposed handoff times are distinct from confirmed shift ends.

`app/data/plan.json` integrates **494 stable core IDs, 21 gates, 60 dates, 15 roles, and 20 social posts**. The 80 inactive proposals retain their original IDs and proposed owners separately. No live progress was supplied or invented. The default local database starts empty.

`app/data/import-manifest.json` records the current planning JSON checksum and reconciliation counts. `scripts/integrate-plan.mjs` merges planning definitions by stable ID, preserves baseline progress fields and original commitments, and never modifies `delivery_events`. Repeat integration requires the original download files under `.handoff/current-plan` and `.handoff/plan.zip`; after changing downloads, run `node scripts/prepare-downloads.mjs`. The authenticated plan JSON download is the original planning handoff; progress is exported separately.

`SOURCE_PROVENANCE.json`, `HANDOFF_MANIFEST.sha256`, and `README_PLATFORM_BASELINE.md` describe the imported October 22 source baseline. Its checksum manifest does **not** describe this modified application. The original downloads are retained under `data/baseline-downloads` and are not publicly served. Current downloads require a signed-in session.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The unit checks cover schedule reconciliation, inactive proposals, social mix, office starts, DST, evidence and prerequisite validation, recovery dates, and metric counting rules.

For API verification, use a **fresh isolated local database**, never the team's working database. Set `DSI_SQLITE_PATH` to a new path, such as `.data/qa.sqlite`, then start `npm start -- --port 5174`. The local schema initializes automatically. `npm run test:api` checks 25 authentication, authorization, conflict, persistence, metric, download, and backup cases. It refuses a non-loopback target and expects empty event history. `npm test` also checks D1 HTTP parameter binding, provider-error handling, Vercel storage safeguards, SQLite version conflicts, and incoming-host validation. No remote database was contacted by these checks.

## Backup and restore

Reviewers and administrators can choose **Export → Full event history · JSON**. This includes all events, actor IDs, timestamps, payloads, and record versions. The current snapshot export contains only the latest 150 audit entries and is not a complete backup.

```sh
node scripts/restore-backup.mjs backup.json restore.sql
```

The restoration tool verifies event IDs, payloads, timestamps and uninterrupted version sequences and writes SQL without changing a database. Apply it to a separately initialized **empty** D1 database, reconcile every event and latest state, then test restoration before any cutover. It deliberately fails on duplicate rows and never resets an existing database. Store backups outside Git. A local test restored all three test events, including the submission and acceptance versions, into a second isolated database.

## Company deployment work remaining

No external deployment, DNS changes, company account creation, or live progress migration was performed. Before production, configure company-owned staging and production D1 databases, the Vercel server environment above (or native Worker bindings), HTTPS, company identity/account enrollment, reviewer delegations, and operational backups. Replace the development accounts and secret with approved production identities, or connect the session layer to company SSO. The app currently uses configured accounts; it does not include a self-service roster editor, password reset, or an SSO integration. Account definitions must be managed as hosting secrets. The supplied Worker D1 ID remains a local placeholder.

The original source is preserved as the architecture foundation. Next.js/Node deployment now uses the existing SQLite schema through an adapter; this is not a PostgreSQL migration. Existing hosted progress stays in D1 and requires a full authorized event export and reconciliation if moved to another database. Support activation and roster changes need a reviewed planning/account update. AI reporting and automatic CQL synchronization remain proposed phase-two integrations.
