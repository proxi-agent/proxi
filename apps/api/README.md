# Proxi API Backend

NestJS + Prisma + Postgres backend for the stock transfer agent MVP.

## Module Layout

- `auth/` authentication, RBAC (`Permissions`, `Roles`), scope enforcement (`Scope`).
- `prisma/` Prisma client integration and lifecycle wiring.
- `transfer-workflow/` transfer state machine + transactional settlement flow.
- `audit/` append-only audit event write/read/timeline infrastructure.
- `tasks/` operational tasks + signal-driven task generation.
- `workflow-context/` machine-friendly context bundles for transfer/dividend/meeting cases.
- `dividends/`, `voting/`, `shareholders/`, `holdings/`, `securities/`, `issuers/` domain modules.
- `seed/` deterministic demo fixtures, including demo users and role grants.

## Running Migrations

From `apps/api`:

- Generate Prisma client: `npm run prisma:generate`
- Create/apply dev migration: `npm run prisma:migrate:dev`
- Apply migrations in deploy env: `npm run prisma:migrate:deploy`

Ensure `DATABASE_URL` points to Postgres before running migration commands.

## Seeding

Seed endpoints are protected by admin permissions.

- `POST /seed/ensure` - idempotent seed
- `POST /seed/run` - force seed run
- `POST /seed/reset` - wipe seeded/demo records

Seed creates:

- 1 issuer, security/share classes
- shareholder/accounts + initial ledger activity
- dividend + meeting/vote sample data
- operations tasks
- demo users with issuer/platform role grants
- transfer cases covering every workflow branch:
  - normal successful transfer (settles end-to-end via step plan)
  - missing-documents / awaiting-documents
  - low-confidence → manual review
  - stop transfer order
  - adverse claim
  - deceased-owner estate
  - restricted shares → legal opinion
  - failed transfer (documents timeout)

## Domain Assumptions

- Ledger is append-only. Balance changes are represented through ledger events, never direct balance edits.
- Transfer settlement is the only path that writes ledger transfer impacts.
- Holdings are derived/projected and can be rebuilt from ledger history.
- Audit events are append-only and used as the authoritative timeline for sensitive actions.
- Issuer-scope and shareholder-scope access are enforced in guards, not ad hoc in service methods.

## Workflow Notes

### Coarse lifecycle (Prisma `TransferState`)

`DRAFT -> SUBMITTED -> UNDER_REVIEW -> (NEEDS_INFO <-> UNDER_REVIEW) -> APPROVED -> SETTLED`,
with `REJECTED`/`CANCELLED` terminals.

### Fine-grained workflow engine (`transfer-workflow/case/*`)

Every `TransferRequest` carries a structured `WorkflowCaseEnvelope` in
`canonicalData` (JSON), with schema versioning. The envelope stores:

- `caseType` — `standard_individual | gift | estate | fiduciary | restricted_shares | special_situation | issuance | cancellation | adjustment`
- `branch` — the active exception track
  (`standard | stop_transfer_order | adverse_claim | deceased_owner | estate_succession | restriction_review | issuer_legal_opinion | fiduciary_review`)
- `phase` — derived every read via `derivePhase(state, envelope)` for
  fine-grained queue routing (e.g. `intake_in_progress`, `awaiting_documents`,
  `manual_review_required`, `pending_stop_order_resolution`,
  `ready_for_settlement`, `settled`, `failed`)
- `requirements` — dynamic doc checklist built by `buildRequirements`
- `rules` — deterministic `RuleResult[]` produced by `runRules`
- `settlementPlan` — ordered `SettlementStep[]` built by `buildSettlementPlan`
- `flags` — stop-order / adverse-claim / deceased / restriction / legal-opinion / issuer-review records
- `extracted` — structured fields captured at intake (for auto-verification + AI)
- `narratives` — short human-readable summary, next action, failure reason

The envelope is updated through workflow actions only; controllers stay thin.

### Workflow actions (all emit audit events + signal tasks)

Intake & automation

- `POST /transfer-workflow/:id/intake` — classify case type, capture source
  channel, generate checklist, mark missing items
- `POST /transfer-workflow/:id/documents` — reconcile submitted/accepted/rejected docs
- `POST /transfer-workflow/:id/automated-review` — run the rules engine,
  compute completeness + confidence, auto-route to `ready_for_review` or to
  `manual_review_required`

Branch raise/clear (each creates a task automatically)

- `POST /transfer-workflow/:id/flags/stop-order` (raise / clear)
- `POST /transfer-workflow/:id/flags/adverse-claim` (raise / clear)
- `POST /transfer-workflow/:id/flags/deceased` (raise / clear)
- `POST /transfer-workflow/:id/flags/restriction` (raise / clear)
- `POST /transfer-workflow/:id/legal-opinion` (request / provide)
- `POST /transfer-workflow/:id/issuer-review` (request / respond)

Decision

- `POST /transfer-workflow/:id/start-review | request-info | resubmit`
- `POST /transfer-workflow/:id/approve | reject | cancel`

Settlement (transactional)

- `POST /transfer-workflow/:id/settlement/schedule` — build step plan
  (validate registration, validate tax docs, cancel old position, issue new,
  update FAST, generate DRS, confirm prior cancellation, tax withholding)
- `POST /transfer-workflow/:id/settlement/step` — advance individual steps
- `POST /transfer-workflow/:id/settle` — commit ledger + holdings in one tx
- `POST /transfer-workflow/:id/fail` — structured failure with reason code

### Rules engine

`runRules()` is pure and deterministic. Current rules include holder-identity
match, account ownership match, completeness score, confidence threshold,
sufficient-holdings check, stop-transfer-order present, adverse-claim present,
deceased-owner suspicion, restriction present, tax-withholding needed,
FAST-reconciliation needed. The verdict exposes overall `confidence`,
`completeness`, `autoPassEligible`, blocking failures, warnings, and a
`suggestedBranch` used to auto-route cases.

### Tasks & audit

- Blocked/attention-needed conditions emit operational tasks via
  `TasksSignalsService` (all idempotent via `ensure`).
- Every workflow action writes an audit event from a centralized
  `AuditActions` dictionary, so the activity feed is the system-of-record
  timeline and an AI-ready event stream.

## Auth in Demo vs Real IdP

- Real mode: Clerk bearer token is validated and mapped to local user + issuer grants.
- Demo mode: set `AUTH_DEMO_MODE=true` (or non-production default) and pass `x-demo-user` header with seeded demo email/external id.
- Actor identity is propagated into audit events from request context.
