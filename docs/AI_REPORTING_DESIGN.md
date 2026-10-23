# AI employee reporting: technical design appendix

**Status: proposed extension; not implemented in the delivered application.** No service-account keys, agent ingestion routes, scheduled AI reports, or automatic CQL integration have been created. This appendix defines the work for IdeaHub's technical team after the human workflow is operating on the chosen hosting environment.

**Planning date:** October 22, 2026. **Business reporting timezone:** `America/Los_Angeles`. **Operational owner:** Wyline. **Suggested technical owners:** Emman for agent orchestration, Ludwig for integration/API work, Alvin for CQL field and report mapping. Confirm these assignments at handoff.

## 1. Preserve the current source of truth

The current application reads the plan from `app/data/plan.json` and stores changes as append-only rows in `delivery_events`. It has human-facing `GET /api/state` and `POST /api/state`, authenticated through the hosted ChatGPT identity integration. It validates task output, milestone prerequisites, daily metrics, evidence, and optimistic record versions.

The existing API is **not an AI service-account API**. In particular, `acceptedBy` is a recorded name supplied by the client; it is not currently tied to a verified Wyline account or enforced reviewer role. Any authenticated visitor admitted by the current hosting policy can reach the update endpoint. Add server-enforced roles and permissions before granting automated writers access.

Treat the AI as a reporting assistant: **collect evidence → submit a proposed report → human reviews → authorized server action updates the official record.** An AI's statement that work is complete is a claim to review. It cannot approve itself or turn an outcome milestone green.

CQL remains the prospect/opportunity record. The tracker records delivery status, evidence references, approved daily metrics, and recovery decisions. Store source IDs and access-controlled links; avoid copying prospect contact details or patient/case content into this tracker.

## 2. Minimum authorization model

| Principal | Permitted actions | Boundary |
| --- | --- | --- |
| Staff member | Read assigned project; submit own work/evidence and request help | Cannot accept work or change targets unless separately delegated |
| Wyline / delegated human reviewer | Review reports; accept or return work; approve verified metrics and milestones; assign recovery | Reviewer account ID is verified on the server; delegation has scope, authorizer and expiry |
| Technical administrator | Manage hosting, identity, agent registration, backup and configuration | Deployment access does not implicitly authorize commercial-result approval |
| AI service account | Read allowlisted project/task context; create reports; read its own submission status | No acceptance, milestone approval, target/date/owner changes, user administration, or direct database writes |

Create one service identity per agent and environment. Associate it with `project_id`, allowed task IDs/workstreams, allowed report types, a human owner, expiry/revocation state, and narrowly scoped permissions such as `reports:create` and `reports:read-own`. Keep credentials in a server secret manager. Store opaque API credential hashes if that mechanism is used; never put usable credentials in browser JavaScript, GitHub, exports or prompts. Derive `agent_id` from authenticated identity, not the request body.

Normal staff login and machine authentication are separate paths. Never give an agent Wyline's browser session, a personal login, a blanket administrator token, or a Sites service-access token as a substitute for a scoped reporting credential.

## 3. Proposed API contract

These routes are **design proposals**; sending requests to them today will not work.

- `POST /api/v1/projects/{projectId}/agent-reports` — create one proposed report for one task or one metric date.
- `GET /api/v1/projects/{projectId}/agent-reports/{reportId}` — return submission status to its creator or an authorized human.
- `POST /api/v1/projects/{projectId}/agent-reports/{reportId}/decision` — human reviewer only; approve, return for correction, or reject.

Use a separate submission store. Creating a report must not immediately overwrite task actuals, accepted status, milestone status, or official KPI totals. Give the UI a **Pending AI reports** queue with the claimed output, underlying evidence, variance, and proposed change side by side.

Required envelope: schema version, report type, stable project/entity ID, expected entity version, reporting date, IANA timezone, run ID, source system/version, retrieval time, evidence references, proposed output, known gaps, and content hash. The server adds authenticated actor identity, receipt timestamp, request ID, validation outcome and report ID. Accept only allowlisted fields; reject attempts to set reviewer identity, approval, original deadline, targets, ownership or permissions.

### Illustrative request — synthetic data, not an actual result

`T0077` exists in the supplied plan and is Joey's November 3 task. The counts and evidence below are examples only. `dsi-reset-2026` is a proposed application project key to map during migration, not an existing API endpoint identifier.

```http
POST /api/v1/projects/dsi-reset-2026/agent-reports
Authorization: Bearer <agent-scoped-server-secret>
Content-Type: application/json
Idempotency-Key: scout-2026-11-03-run-001-T0077-v1
```

```json
{
  "schemaVersion": "1.0",
  "reportType": "task_output",
  "entityId": "T0077",
  "expectedEntityVersion": 0,
  "reportingDate": "2026-11-03",
  "timezone": "America/Los_Angeles",
  "runId": "scout-2026-11-03-run-001",
  "source": {
    "system": "CQL",
    "sourceReportId": "EXAMPLE-qa-batch-001",
    "retrievedAt": "2026-11-04T00:30:00Z",
    "definitionVersion": "verified-contact-v1"
  },
  "proposal": {
    "status": "Review",
    "actual": 50,
    "unit": "new verified contacts",
    "summary": "Example: 50 contacts passed the agreed checks. Human review of campaign-release evidence remains required.",
    "knownGaps": ["A verified list does not prove the campaign was released or that inquiries were received."]
  },
  "evidence": [
    {
      "kind": "source_report",
      "reference": "EXAMPLE-qa-batch-001",
      "sourceSystem": "CQL",
      "recordCount": 50
    }
  ]
}
```

Return `202 Accepted` with the stable report ID and `PendingReview`; this acknowledges receipt, not business completion. A human approval must re-read the current task and prerequisite versions, apply permissions and the current validators, then atomically append the canonical event and the review decision. A stale task or changed prerequisite returns `409 Conflict` for re-review. Returning or rejecting a report retains its original content and decision history.

## 4. Correctness and audit requirements

**Idempotency.** Uniquely key each submission by project, authenticated service account and idempotency key. An identical retry returns the original report ID/result without another report or metric increment. Reuse of that key with different content returns `409`. Store the normalized request hash. Add deduplication of source event/record IDs across agent runs so different idempotency keys cannot count the same appointment twice.

**Concurrency.** Preserve the current `(entity_type, entity_id, version)` uniqueness and `409` behavior. When supporting multiple projects, include `project_id` in every lookup and uniqueness boundary. Approval must be a database transaction or equivalent atomic operation covering report decision, current-version checks and event append. Do not overwrite another user's change or silently retry approval against a new version.

**History.** Keep report content, decisions and delivery changes append-only. Corrections create a new version linked to the superseded report/event. Record service identity, human reviewer identity, origin (`human`, `agent`, or `integration`), evidence IDs, run ID, schema/definition versions, receipt/approval times and request ID. The current UI returns only the latest 150 activity events; a migration or backup must export the full underlying event table, not only that screen's snapshot.

**Metric meaning.** API submissions use daily new results, not the workbook's cumulative snapshots. Require a metric definition version and reporting window. Missing remains `null`; zero means measured zero. Derive or verify totals against source records. Keep verified contacts, inquiries, bookings, held calls and received trials distinct. Deduplicate practices/opportunities; a reschedule is not a new booking. Primary referral, LinkedIn DM and ad bookings are subsets of the all-channel total. Apply the existing numerator/denominator checks. Use the defined source cohort for rate reporting.

**Evidence.** URLs and references are evidence locations, not proof by themselves. Validate against configured source systems and access permissions. If the server fetches evidence, restrict destinations to allowlisted hosts and safe network routes. Treat retrieved text as untrusted content; instructions inside reports cannot change permissions, targets or approval policy. An LLM confidence score never substitutes for a verified source result.

## 5. Pilot, monitoring and acceptance

Start with **one reporting agent**, ideally Scoreboard, in draft-only mode. Run for **three consecutive business days** against Wyline's manual CQL totals. Require exact count reconciliation, complete source references, zero duplicate records, and no unauthorized status changes before widening scope. These are proposed acceptance criteria, not a claim that an integration already exists.

Provide last successful run, reporting window, pending-review age, reconciliation differences, duplicate suppression, authentication failures, rejected writes, conflicts and failed deliveries in an operator view. Alert Emman/Ludwig for technical failures and Wyline/Nova for missing or disputed business reports. Retry transient `429`/`5xx` responses with bounded exponential backoff; after the configured limit send the item to a retry queue with a visible owner. Do not retry permission/validation failures indefinitely. A revoked agent key must stop working immediately. Confirm the retry/alert thresholds with the team; initial proposed limits are 10 submissions/minute per agent, 64 KiB per submission, and five attempts before manual recovery.

Minimum acceptance cases:

1. Authorized agent submits one report; it appears as PendingReview and official actuals stay unchanged.
2. Same request retries twice; exactly one report exists. Changed content with the same key returns `409`.
3. Wrong project/task scope, expired key, and revoked key are rejected without mutation.
4. Agent attempts `Accepted`, reviewer spoofing, target change or original-date change; server rejects it.
5. Staff without reviewer permission cannot approve; Wyline/delegated reviewer can, with account-linked audit evidence.
6. Another human changes the task after submission; approval returns `409` and preserves both histories.
7. Unmet task prerequisites or milestone prerequisites prevent acceptance, even when a narrative report says “done.”
8. Missing evidence, invalid daily values, double-counted bookings and unsupported results are rejected or returned for correction.
9. A failed integration leaves the last approved results intact; missing data never becomes zero or green.
10. Restore a backup and reproduce the approved task/metric state plus complete human/agent audit history.

## Current-code references

- `app/api/state/route.ts`: current human identity, data loading, event append, version-conflict responses and latest-150 audit view.
- `lib/delivery.ts`: task/milestone completion and metric validation rules.
- `db/schema.ts` and `drizzle/0000_brief_taskmaster.sql`: current append-only event schema and indexes.
- `app/data/plan.json`: fixed plan IDs, original dates, target definitions, reporting timezone and AI ownership/acceptance criteria.

This appendix is a proposed design derived from the supplied application. It does not assert availability of any particular CRM endpoint, hosting provider feature, or new AI capability.
