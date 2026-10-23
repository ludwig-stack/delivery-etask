# Delivery eTask — DSI daily delivery

A working DSI execution workspace based on the supplied October 23 deployment handoff and current 60-day schedule. Built with React, Vinext/Vite, a Cloudflare Worker, and D1/SQLite.

## Run locally

Use Node.js 22.13 or newer. From this directory:

```sh
npm ci
npm run setup:local
npm run build
npm run db:local
npm run dev
```

Open **http://localhost:5173**. Generated development sign-in details are in **`.local-accounts.txt`**. Local accounts include Wyline (reviewer), Joey (staff), Nova (results entry), a delegated reviewer for Wyline-owned work, and a read-only stakeholder. Passwords are randomly generated; `.dev.vars` and the credential file are ignored by Git. Repeating setup preserves existing accounts and data.

`npm run dev` provides hot reload. To preview the built Worker, stop dev and run `npm start -- --port 5173`. The start wrapper loads local secrets beside Wrangler's generated configuration. It is a local preview, not a generic Node production server.

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

For API verification, use a **fresh isolated local database**, never the team's working database. Initialize it using the same local schema with a different `--persist-to` path, then start `npm start -- --persist-to .wrangler/qa-state --port 5174`. `npm run test:api` checks 25 authentication, authorization, conflict, persistence, metric, download, and backup cases. It refuses a non-loopback target and expects empty event history. The bundled Vinext/Wrangler preview sometimes returns 503 for a foreign Origin before the application runs; the test confirms rejection, and the application independently requires a matching Origin for writes.

## Backup and restore

Reviewers and administrators can choose **Export → Full event history · JSON**. This includes all events, actor IDs, timestamps, payloads, and record versions. The current snapshot export contains only the latest 150 audit entries and is not a complete backup.

```sh
node scripts/restore-backup.mjs backup.json restore.sql
```

The restoration tool verifies event IDs, payloads, timestamps and uninterrupted version sequences and writes SQL without changing a database. Apply it to a separately initialized **empty** D1 database, reconcile every event and latest state, then test restoration before any cutover. It deliberately fails on duplicate rows and never resets an existing database. Store backups outside Git. A local test restored all three test events, including the submission and acceptance versions, into a second isolated database.

## Company deployment work remaining

No external deployment, DNS changes, company account creation, or live progress migration was performed. Before production, configure company-owned staging and production D1 databases, real Worker bindings, HTTPS, company identity/account enrollment, reviewer delegations, and operational backups. Replace the development accounts and secret with approved production identities, or connect the session layer to company SSO. The app currently uses configured accounts; it does not include a self-service roster editor, password reset, or an SSO integration. Account definitions must be managed as hosting secrets. The supplied D1 ID is a local placeholder.

The original source is preserved as the architecture foundation; this is not a PostgreSQL/Node server port. Existing hosted progress requires a full authorized event export and reconciliation. Support activation and roster changes need a reviewed planning/account update. AI reporting and automatic CQL synchronization remain proposed phase-two integrations.
