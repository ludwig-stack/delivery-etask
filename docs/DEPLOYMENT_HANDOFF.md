# DSI tracker: company hosting, GitHub and rollout

**As of October 22, 2026.** This is an implementation brief for IdeaHub's technical staff. It documents the delivered source and proposed migration work. Company infrastructure, DNS, GitHub repositories, staff accounts and AI integrations have not been configured by this handoff.

## 1. Objective and ownership

Deploy the DSI daily execution system on company-controlled infrastructure using a company URL. Preserve the October 22-December 16 execution plan and December 17-18 review period. Let staff report their work every day, let Wyline review it, and keep inquiries, appointments, held conversations and received trials visible.

Suggested hostname for the team to confirm: `projects.ideahubsolutions.com`. This is a proposal, not an active deployment. Keep the existing company website intact; use a dedicated subdomain and HTTPS.

| Responsibility | Owner / assignment |
| --- | --- |
| Business process, acceptance, daily adoption | Wyline |
| Delivery and conversion field definitions | Nova, coordinated by Wyline |
| Source, architecture and release | One named technical lead to be assigned |
| Server, DNS, TLS, CI/CD and backups | Hosting/DevOps owner to be assigned |
| CQL data mapping | Alvin, with Nova validating definitions |
| Future AI orchestration | Emman; Ludwig for API/integration work, assignments to confirm |
| Final business go-live decision | Wyline after technical acceptance evidence |

Return within one business day: repository URL, chosen hosting path, target hostname, named technical lead, data-migration plan and a team-estimated staging date. A 30-minute demonstration with Wyline is the proposed acceptance meeting. Hosting and migration effort must be estimated after inspecting the team's existing server and identity provider; this handoff does not assume a capacity or budget commitment.

## 2. Verified baseline

| Item | Source state |
| --- | --- |
| Source commit | `acf4a6c9b6af7d262984ba977bbc78f5e2c453d3` |
| Application runtime | Vinext `1.0.0-beta.5`, Vite `8.0.13`, React `19.2.6`, Cloudflare Worker |
| Next dependency | `16.3.4` for compatible application APIs; current production entrypoint is a Worker |
| Node requirement | `>=22.13.0` in package.json |
| Data store | Cloudflare D1, binding `DB`; schema managed with Drizzle |
| Plan | 494 tasks, 21 gates, 58 dates, 13 people/roles; one DSI project |
| Authentication | Sites platform identity headers and hosted access policy |
| Current permissions | Authenticated admitted users may update records; approval is recorded but not restricted to Wyline's authenticated account |
| Current reporting | Manual daily new counts; no automatic CQL connection or AI ingestion API |
| Refresh | Client polls shared state every 60 seconds; manual refresh is available |

The package is a source export, not a full historical data backup. The source plan contains the baseline assignments and targets. Hosted progress lives in the database and must be transferred separately if staff have entered updates.

### Files to inspect first

| File | Purpose / migration relevance |
| --- | --- |
| `app/data/plan.json` | Base plan, targets, stable task/gate IDs, dates, roles and download links |
| `app/delivery-console.tsx` | Main state/UI controller, saves, polling, exports and sign-in link |
| `app/delivery-views.tsx` | Gantt, calendar, ownership, targets and other views |
| `app/delivery-components.tsx` | Edit forms and reusable presentation components |
| `lib/delivery.ts` | Core validation and independent milestone requirements |
| `app/api/state/route.ts` | Direct D1 queries, identity check, current-state loading and versioned writes |
| `app/chatgpt-auth.ts` | Current platform identity/header reader; must be adapted for self-hosting |
| `db/schema.ts`, `db/index.ts`, `drizzle/` | Schema, database binding and migration inputs |
| `worker/index.ts`, `vite.config.ts` | Worker entrypoint and platform-specific build bindings |
| `package.json`, `package-lock.json` | Pinned baseline dependencies and existing commands |
| `public/downloads/` | Downloadable plan artifacts; standalone copies, not live database exports |

## 3. Put the source in the company GitHub organization

Create a private repository, for example `dsi-project-tracker`. Unzip the supplied source and review it before importing. The archive has no `.git` directory or credentials. Preserve vendor licenses and the provenance record.

Example for a **new empty** company repository, from the extracted source directory:

```bash
git init -b main
git add .
git commit -m "Import DSI tracker baseline and technical handoff"
gh auth login
gh repo create YOUR_ORG/dsi-project-tracker --private --source=. --remote=origin --push
```

Replace `YOUR_ORG` with the actual company organization. If a repository already exists, clone it and use a reviewed import branch/PR instead of creating or force-pushing a new history. Keep secrets in the hosting/CI secret manager. Require review of production changes and give the company, rather than an individual developer, ownership of the repository and hosting account.

Reference: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github

## 4. Reproduce the baseline locally

These commands inspect the supplied Worker application. They are not production deployment instructions for a generic VPS.

```bash
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_brief_taskmaster.sql
npm run dev
```

Apply the migration once to a fresh local database; inspect existing migration state before rerunning it. A clean external checkout selects the portable profile. Its development sign-in is a loopback-only mock described in `README_PLATFORM_BASELINE.md`. Use it only on localhost for UI inspection. The local `.wrangler` database is not the hosted production database.

The existing `npm start` runs Wrangler's built local preview. Do not run it with PM2 or expose it as the intended production server. Do not use a static-only upload or GitHub Pages for the current full application; shared saves require a backend and persistent database.

## 5. Choose the company hosting path

### Path A - existing company Linux/cloud server

Use this path when the requirement is to run on the team's own VPS, VM or server. Suggested target: a maintained Next.js/Node application in a container, PostgreSQL, the company's existing SSO provider, and an HTTPS reverse proxy. This is a proposed target architecture; the delivered source has not been ported to it.

1. Create a migration branch and staging environment.
2. Retain the React interface, base plan and business-rule module. Replace Worker-specific build/start configuration with the chosen server runtime.
3. Replace both `db/index.ts` and the direct D1 calls in `app/api/state/route.ts` with a server-side storage adapter. Convert the SQLite/D1 schema to PostgreSQL migrations; the D1 SQL is not a PostgreSQL migration as-is.
4. Replace `app/chatgpt-auth.ts` and sign-in/sign-out links with verified company sessions or OIDC. Protect pages, APIs and sensitive downloads.
5. Implement the role rules in section 6. Bind review to the authenticated account.
6. Build a production image/process, configure environment secrets, persistent database storage, HTTPS, health checks and restart policy. Preserve the requested hostname only after staging passes.
7. Set up GitHub-based build/review/deploy and documented rollback. Test backup restoration before production cutover.

Next.js supports self-hosted Node and Docker deployment; its official guide recommends a reverse proxy such as nginx. That support applies to the team's ported Next.js application, not automatically to this Worker build.

References: https://nextjs.org/docs/app/guides/self-hosting and https://nextjs.org/docs/app/getting-started/deploying

### Path B - company-owned Cloudflare account and company domain

Use this if company-controlled cloud hosting is acceptable. It is the smaller runtime migration because the current application already uses Workers and D1; this assessment comes from the source audit, not a claim of one-click portability.

1. Provision a Worker and D1 database in the company's own account, with distinct staging and production databases.
2. Configure real company database IDs, binding `DB`, environment secrets and the migration process. The supplied placeholder D1 ID is not a production resource.
3. Replace Sites authentication with verified company SSO/access, and implement the same server-side role rules.
4. Adapt or remove Sites-only build/connector integration. Keep a tested company-owned Wrangler/Vite configuration and deploy pipeline.
5. Apply reviewed migrations, import verified data, test the workflow, and attach the confirmed company custom domain.

Cloudflare documents Worker custom domains and D1 schema migrations. A custom domain requires the appropriate company-controlled Cloudflare zone/account configuration. The existing managed Sites database and account are not transferred by changing DNS.

References: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ and https://developers.cloudflare.com/d1/reference/migrations/

## 6. Staff sign-in and enforceable responsibilities

**Current boundary:** `getChatGPTUser()` reads `oai-authenticated-user-id` and email headers trusted only because the current hosting platform provides them. On a self-hosted public server, do not accept arbitrary client-supplied identity headers. Verify a server session or signed identity claims, and close direct-origin bypasses when using an identity proxy.

**Current approval limit:** `acceptedBy` records a selected name; the current API separately logs the signed-in editor. It does not enforce that only Wyline can accept work. Implement account-bound authorization before the wider company rollout and before enabling agent writes.

| Role | Required company-deployment permission |
| --- | --- |
| Staff | View the assigned project; update assigned tasks, evidence and blockers; submit for review |
| Wyline / delegated reviewer | Accept or return work; verify milestones/results; assign recovery; review delegation explicitly |
| Technical administrator | Manage infrastructure, roster and permissions; approval privilege is separate |
| Read-only stakeholder | View permitted project reports; no mutation |
| AI service account (later) | Submit scoped proposed reports; no human approval or administrative permission |

Map each staff account to the plan's person ID. Display-name selection is not authorization. Add roster administration; the current application does not have a roster editor. Name Setter 1 and Setter 2 with Nova/Wyline. Use the existing company identity provider where practical so staff can sign in with company-approved accounts without depending on membership in this ChatGPT workspace.

## 7. Preserve state, definitions and audit history

The current table is `delivery_events`: `id`, `entity_type`, `entity_id`, `version`, `payload`, `actor_id`, `actor_name`, `at`. Preserve the unique `(entity_type, entity_id, version)` constraint and the timestamp index. Current writes append events and stale edits return HTTP 409. This is application-level append-only history, not cryptographic tamper-proofing.

Preserve all events, stable IDs, original deadlines, timestamps, version sequences, legacy actor mapping, nullable values and the base-plan checksum. Keep task acceptance and milestone verification independent. Re-run both validators after migration. Database transactions must protect record-version checks and related approvals against concurrent edits.

The current UI's **Current snapshot** includes latest task/gate/metric state and at most **150** audit events. It is not a full-history export. The application has no importer today. If live updates exist, obtain an authorized full export of `delivery_events` from the managed hosting environment or an owner-approved full export feature before cutover. Do not assume this source archive or the local preview database contains those updates.

### Cutover sequence

1. Verify staging with the baseline plan and test users.
2. Confirm whether live records exist; agree a short write-freeze window with Wyline.
3. Back up all source events and metadata using an authorized export path. Store the transfer securely outside Git.
4. Import through a reviewed migration tool. Compare row count, entity count, max version per entity and payload checksums; reconstruct latest state and compare it with the old app.
5. Test restore, staff submission, review, blockers, milestone gates and conflicts.
6. Switch the confirmed company URL and enroll the team. Archive or make the old app read-only only through an authorized change, so two writable masters do not diverge.
7. Keep a rollback copy and reconcile any post-cutover writes before reverting. A DNS rollback alone does not reconcile new records.

Store timestamps in UTC and derive business reporting dates using `America/Los_Angeles`, including the daylight-saving transition. The live app uses **daily new results**. The Excel workbook uses **cumulative snapshots** and does not synchronize with the app. Missing data stays unknown; zero means a measured zero. Referral/LinkedIn bookings remain subsets of the total.

The current schema is a single DSI project. If expanding into a general project platform, add `project_id` to records, scopes, queries and unique keys; enforce project isolation before adding another client's data.

## 8. First release acceptance

Capture evidence for these tests and have Wyline sign off:

1. Company URL uses HTTPS; unauthorized accounts cannot view private project content or downloads.
2. Wyline and one staff member sign in from separate browsers with distinct accounts.
3. The staff member submits evidence for an assigned task; another person sees the persisted update after refresh.
4. Ordinary staff cannot accept work, impersonate Wyline, or edit another owner's work without delegation.
5. Wyline accepts the task; account ID and review timestamp are recorded by the server.
6. Blocked/deferred work requires its reason, recovery owner and recovery date; original due date remains intact.
7. A completed report does not automatically pass an outcome milestone; independent proof and prerequisites are required.
8. Two concurrent edits produce a conflict instead of silently losing one update.
9. All due tasks and gates must be accepted for the day to complete. Null/zero and daily/cumulative metrics remain correct.
10. Backup restoration reproduces the full event history and current results; the rollback procedure is demonstrated.

## 9. AI reporting is phase two

Read `AI_REPORTING_DESIGN.md`. Implement a separate versioned reporting interface, one scoped service identity per agent, idempotency/source-record deduplication, a pending-review queue and human approval. Keep agent credentials out of browser code, Git and prompts. AI-generated activity must not become a verified appointment or trial without source evidence.

Start with one Scoreboard agent in draft-only mode and reconcile against Wyline's manual report for three consecutive business days. Human adoption of the tracker should proceed before this extension is complete.

## 10. Risks and practical controls

| Risk | Control / release condition |
| --- | --- |
| Exposing trusted identity headers on a new server | Verified authentication plus protected origin; spoofed-header test fails |
| Report completion mistaken for business success | Independent gate evidence and account-bound human review |
| Losing existing progress during migration | Full event export, write freeze, reconciliation and restore test |
| Duplicate metrics from agent retries | Idempotency plus source-record deduplication before posting official results |
| Two systems receiving updates | One designated writable master after agreed cutover |
| Scope expands into a generic platform or AI rebuild | Ship DSI human workflow first; scope AI and multi-project work separately |

**Completion report to CEO:** final URL, repository URL, named technical owner, named hosting owner, sign-in instructions, Wyline's acceptance evidence, backup/rollback location, support route and the separate AI phase estimate.
