# Dividend Module — Implementation & Hardening Summary

This document summarises the production-ready state of the Proxi dividend
module across the API and web apps. It is intended for reviewers, on-call
operators, and future contributors who need to understand what guarantees
the module provides, where the boundaries live, and which surfaces are
safe versus deliberately partial.

The dividend module covers the full operational lifecycle of an issuer
dividend: declaration → board approval → eligibility → calculation →
batches → payments → reconciliation → archive. AI-assisted review sits
alongside the workflow as a strictly read-only assistant — it can never
mutate workflow state.

## Table of contents

- [Architecture overview](#architecture-overview)
- [Domain model](#domain-model)
- [Workflow lifecycle](#workflow-lifecycle)
- [Authorization & tenant isolation](#authorization--tenant-isolation)
- [Decimal-safe money math](#decimal-safe-money-math)
- [Idempotency & double-pay prevention](#idempotency--double-pay-prevention)
- [Audit logging](#audit-logging)
- [AI-assisted review](#ai-assisted-review)
- [Reports & exports](#reports--exports)
- [Performance & scale](#performance--scale)
- [Validation guardrails](#validation-guardrails)
- [UI edge states](#ui-edge-states)
- [Test coverage](#test-coverage)
- [Operational notes](#operational-notes)
- [API endpoints](#api-endpoints)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

## Architecture overview

```
apps/api/src/dividends/
  dividends.controller.ts        ← HTTP surface
  dividends.service.ts           ← orchestration / persistence (single Nest service)
  dividends.dto.ts               ← class-validator request shapes
  dividends.types.ts             ← canonical domain types & enums
  dividends.state.ts             ← declaration state machine
  dividends.payments.state.ts    ← batch + payment state machines
  dividends.math.ts              ← Decimal-safe rounding helpers
  dividends.calculation.ts       ← entitlement calculation
  dividends.eligibility.ts       ← snapshot roster + totals
  dividends.preflight.ts         ← deterministic AI-review checks
  dividends.review.ts            ← AI provider abstraction (deterministic + OpenAI)
  dividends.reports.ts           ← headline metrics
  dividends.csv.ts               ← RFC-4180 CSV generation
  dividends.statement.ts         ← shareholder statement renderer (HTML)
  dividends.fractional.ts        ← fractional-share rounding policies
  dividends.workflow.ts          ← stepper assembly for the UI
  dividends.<feature>.spec.ts    ← unit + integration tests (node:test)

apps/web/
  src/lib/dividends/             ← typed API client + copy
  src/components/dividends/      ← reusable UI (status badges, AI card, exports…)
  app/issuer/dividends/...       ← operator routes
  app/investor/dividends/...     ← shareholder routes
```

The service deliberately avoids ORM coupling — it issues parameterised
SQL through `DatabaseService` (a thin pg pool wrapper). All schema
mutations land in `database.service.ts` migrations.

## Domain model

| Table                                | Purpose                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `dividend_events`                    | Declaration record. Status, version, dates, rate, supporting documents. |
| `dividend_eligibility_snapshots`     | Immutable per-record-date roster.                                       |
| `dividend_entitlements`              | Per-shareholder gross/withholding/net + status.                         |
| `dividend_payment_batches`           | Operator-facing payment batch with lifecycle status.                    |
| `dividend_payments`                  | Per-shareholder payment row, FK to entitlement and batch.               |
| `dividend_tax_withholdings`          | Optional jurisdiction-specific withholding overrides.                   |
| `dividend_statements`                | Generated shareholder statements.                                       |
| `dividend_communications`            | Notice / market announcement records.                                   |
| `dividend_fractional_adjustments`    | Round-down / cash-in-lieu adjustments.                                  |
| `dividend_reinvestment_records`      | DRIP execution rows (sharesIssued, residualCash).                       |
| `dividend_reconciliation_exceptions` | Open exceptions tied to a payment.                                      |
| `dividend_ai_reviews`                | Persisted AI review (`preflight` + `output`).                           |

Hot-path indexes are defined alongside each table in
`database.service.ts`. Notable composite indexes:

- `idx_dividend_events_issuer (issuer_id, payment_date DESC)`
- `idx_entitlements_event_status (dividend_event_id, status)`
- `idx_div_batches_issuer (issuer_id, scheduled_at DESC)`
- `idx_div_payments_event (dividend_event_id, created_at DESC)`
- `idx_div_payments_idempotency (idempotency_key) WHERE NOT NULL` — unique partial index that enforces the dedupe contract on
  `recordPayment`.

## Workflow lifecycle

The declaration state machine lives in `dividends.state.ts` and is
exhaustive over both happy-path and reversible transitions:

```
DRAFT
  → PENDING_APPROVAL → APPROVED | REJECTED | CHANGES_REQUESTED
  CHANGES_REQUESTED → DRAFT (edit) | PENDING_APPROVAL
  APPROVED → ELIGIBILITY_LOCKED → CALCULATED → PAYMENT_SCHEDULED
  PAYMENT_SCHEDULED → PARTIALLY_PAID → PAID → RECONCILED → ARCHIVED
  any non-terminal → CANCELLED (with reason; `force=true` + admin role
  required after PAYMENT_SCHEDULED)
```

Batches use a parallel state machine (`dividends.payments.state.ts`):
`DRAFT → PENDING_APPROVAL → APPROVED → SCHEDULED → PROCESSING →
PROCESSED | PARTIALLY_FAILED → RECONCILED`. Payment rows use
`PENDING → SCHEDULED → SENT → PAID | FAILED | RETURNED → RECONCILED`.

Optimistic concurrency is enforced through `dividend_events.version` +
`expectedVersion` on every workflow DTO that mutates a draft declaration.
A mismatch raises 409.

## Authorization & tenant isolation

Authorization layers from outside in:

1. **`@Permissions(...)`** — coarse permission gate. Every dividend
   endpoint requires either the operator-leaning permissions
   (`dividend.manage`, `agent.admin`) or the read-only permissions
   (`transfer.view`, `report.view`).
2. **`@Scope({ ... })`** — controller-level entity ownership check.
   Resolves the target row's `issuer_id` (via the `permissions.guard`
   `resolveEntityOwnership` map) and rejects when the actor's
   `issuerIds` does not include it. Privileged roles
   (`super_admin`, `transfer_agent_admin`, `agent_admin`) bypass this
   check.
3. **Service-level `actorCanAccessIssuer`** — for body-driven endpoints
   where the controller decorator can't reach the affected row through
   a path param (`recordPayment`, `bulkRecordPayments`,
   `markEntitlementPaid`), the service re-resolves the owning
   `dividend_events.issuer_id` and asserts access against the actor's
   `issuerIds`.

Scope coverage table:

| Endpoint                                                              | Scope source     | Mechanism                                                  |
| --------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `GET /dividends`                                                      | `query.issuerId` | autoFillIssuerPath + issuerPaths                           |
| `GET /dividends/:id/...`                                              | path id          | entityRule `dividend`                                      |
| `POST /dividends`                                                     | `body.issuerId`  | autoFillIssuerPath                                         |
| `GET/POST /batches/:batchId/...`                                      | path id          | entityRule `dividend_batch` (added in this hardening pass) |
| `POST /payments/record`, `/payments/bulk-record`, `/entitlements/pay` | body             | service-level `actorCanAccessIssuer`                       |
| `GET /shareholders/:shareholderId/...`                                | path id          | shareholderPaths + autoFillShareholderPath                 |

Shareholder portal routes always resolve the calling shareholder's id
through `autoFillShareholderPath` and validate any explicit id against
`user.shareholderIds`.

## Decimal-safe money math

All amounts are held as integer cents (`bigint` in Postgres,
`number` in TypeScript) and rate computations use string-Decimal
arithmetic in `dividends.math.ts` /`dividends.decimal.ts`. The
calculation pipeline (`dividends.calculation.ts`) computes:

```
gross_cents = floor( shares_eligible × rate_per_share_cents / 100 )
              [or the rate-typed equivalent, with the same rounding rule]
withholding_cents = round_half_up( gross_cents × withholding_rate )
net_cents = gross_cents − withholding_cents
```

Rounding helpers cover `round_down`, `round_half_up`, `round_half_even`,
and `cash_in_lieu` for fractional shares (`dividends.fractional.ts`).
We never use floating-point arithmetic for any monetary value; the only
`Number()` casts are at the SQL boundary where the column is already a
`bigint` and the value fits in `Number.MAX_SAFE_INTEGER`.

The `assertPositiveCashRate` guard rejects 0/negative rates on
`CASH | SPECIAL | RETURN_OF_CAPITAL` declarations. Stock and scrip
dividends are allowed to use a 0 rate because the value is encoded in
the issued share count.

## Idempotency & double-pay prevention

The single most critical invariant of this module is "no entitlement
gets paid twice." It's enforced in three places:

1. **`createPaymentBatch` claim check** — a single SQL statement joins
   `dividend_payments` to `dividend_payment_batches` and rejects any
   entitlement that already has a payment in (`PAID`, `SETTLED`,
   `RECONCILED`) **or** any payment attached to a non-terminal batch
   (i.e. anything except `CANCELLED` / `FAILED`).
2. **`recordPayment` transitions** — controlled by
   `dividends.payments.state.ts`. Terminal states (`PAID`, `SETTLED`,
   `RECONCILED`, `CANCELLED`) cannot be re-entered.
3. **`idempotency_key` unique partial index** — operator-supplied keys
   collide at the DB level on retries; the service treats a same-key,
   same-status replay as a no-op and rejects same-key cross-payment
   reuse with `409 Conflict`.

`bulkRecordPayments` runs each row in its own transaction so a single
bad row never aborts the batch — failures surface in the response so
the operator can correct + retry only the failures.

## Audit logging

Every workflow action emits a structured audit event through
`AuditService.record`. Events are listed in `audit/audit.events.ts`
and flow into the global audit feed. Notable dividend actions:

`DIVIDEND_CREATED`, `DIVIDEND_UPDATED`, `DIVIDEND_SUBMITTED_FOR_APPROVAL`,
`DIVIDEND_APPROVED`, `DIVIDEND_REJECTED`, `DIVIDEND_CHANGES_REQUESTED`,
`DIVIDEND_CANCELLED`, `DIVIDEND_FORCE_CANCELLED`,
`DIVIDEND_ELIGIBILITY_LOCKED`, `DIVIDEND_ENTITLEMENTS_CALCULATED`,
`DIVIDEND_BATCH_CREATED`, `DIVIDEND_BATCH_SUBMITTED`,
`DIVIDEND_BATCH_APPROVED`, `DIVIDEND_BATCH_REJECTED`,
`DIVIDEND_BATCH_SCHEDULED`, `DIVIDEND_BATCH_SCHEDULE_OVERRIDDEN` (HIGH),
`DIVIDEND_BATCH_PROCESSING_STARTED`, `DIVIDEND_BATCH_PROCESSED`,
`DIVIDEND_BATCH_PARTIALLY_FAILED`, `DIVIDEND_BATCH_RECONCILED`,
`DIVIDEND_BATCH_CANCELLED`, `DIVIDEND_BATCH_EXPORTED`,
`DIVIDEND_PAYMENT_PAID`, `DIVIDEND_PAYMENT_FAILED`,
`DIVIDEND_PAYMENT_RETURNED`, `DIVIDEND_REPORT_EXPORTED`,
`DIVIDEND_REPORT_GENERATED`, `DIVIDEND_STATEMENT_RENDERED`,
`DIVIDEND_AI_REVIEW_GENERATED`, `DIVIDEND_RECONCILIATION_EXCEPTION_OPENED`,
`DIVIDEND_RECONCILIATION_EXCEPTION_RESOLVED`,
`DIVIDEND_FRACTIONAL_ADJUSTMENTS_APPLIED`, `DIVIDEND_DRIP_EXECUTED`,
`DIVIDEND_ARCHIVED`.

Severity defaults to `LOW`; force overrides and any
`FAILED`/`RETURNED` payment land at `HIGH`.

## AI-assisted review

AI is strictly an assistant. The review flow:

1. `runPreflightChecks` produces a deterministic `PreflightReport`
   from the dividend, snapshot, entitlements, batches, payments,
   approvals, prior-dividend history, and missing-tax-info counts.
2. The selected `DividendAiProvider` (default deterministic; OpenAI if
   `OPENAI_API_KEY` is set and `DIVIDEND_AI_REVIEW_DISABLED !== '1'`)
   is asked to produce prose around the deterministic findings using
   a structured JSON schema. AI errors fall back to the deterministic
   provider; the failure message is persisted in `provider_error`.
3. The combined output (`preflight` + `output` + provider metadata)
   is stored in `dividend_ai_reviews` and a single
   `DIVIDEND_AI_REVIEW_GENERATED` audit event is recorded.

Tests verify the AI service **never** writes to dividend workflow
tables (the `forbiddenWriteSeen` flag in the integration spec). The
UI surfaces AI output in a visually distinct card with an
"Assistant-generated" badge, a confidence score, provider/model info,
and a permanent disclaimer that workflow actions still require human
approval.

## Reports & exports

CSV exports (RFC-4180 compliant via `dividends.csv.ts`) are exposed
under `/dividends/...exports/*.csv` for declarations, snapshots,
entitlements, batches, batch payments, failed payments, audit trails,
and shareholder history. Every export:

- Requires `dividend.manage` or `report.view`.
- Carries `@Scope` (issuer or shareholder, as appropriate).
- Logs a `DIVIDEND_REPORT_EXPORTED` audit event with file name,
  row count, and filter parameters.
- Sets `Cache-Control: no-store` and `Content-Disposition: attachment`.

Statements have a JSON projection (`/statements/:entitlementId`) and an
HTML projection (`/render`). The HTML render is self-contained and
intended to be piped through a future PDF generator behind the
`DividendPdfGenerator` interface.

## Performance & scale

- Entitlement calculation streams the eligibility roster row-by-row
  rather than loading the full set into memory; the per-row work is
  bounded by Decimal arithmetic plus a single insert.
- Batch creation issues exactly one bulk SELECT for entitlements and
  one bulk SELECT for the claim check, then per-row inserts for
  payments. The hot-path queries hit
  `idx_entitlements_event_status` and `idx_div_payments_entitlement`.
- Pagination is implemented through `PaginationQueryDto` (`page`,
  `pageSize`, `sort`) and is applied to the dividend list, entitlement
  list, payment list, batch list, statement list, and approval list
  endpoints (`buildPaginated` helper, capped at a sensible page size).
- Bulk audit reads use `since` + `limit` cursors so the timeline never
  pages a full audit_events table for old declarations.

## Validation guardrails

- `CreateDividendDto` / `UpdateDividendDto` enforce ISO-8601 dates and
  the canonical date ordering (`declaration ≤ ex ≤ record ≤ payment`)
  through `isValidRecordDate` / `isValidExDividendDate`.
- `rateAmount` and `withholdingDefaultPct` use a non-negative decimal
  regex; the service additionally rejects zero rates on cash-style
  declarations.
- DTO arrays are bounded (`@ArrayMaxSize(10_000)` for bulk endpoints,
  `@ArrayMaxSize(50)` for supporting documents).
- Reasons are required on every destructive action: `cancel`,
  `reject`, `requestChanges`, `cancelBatch`, `rejectBatch`,
  `scheduleBatch` with `force=true`, `cancel` after
  `PAYMENT_SCHEDULED`, fractional adjustments.
- Cancelled or blocked shareholders surface as warnings during
  eligibility roster construction (`MISSING_PAYMENT_METHOD`,
  `BLOCKED_SHAREHOLDER`, `MISSING_TAX_FORM`); operator can choose to
  exclude or hold the entitlement before payment.

## UI edge states

Every list view uses `EmptyState` for the no-data case and the new
`ErrorState` component for failures. Section-level boundaries are
in place at:

- `apps/web/app/issuer/dividends/error.tsx` + `loading.tsx`
- `apps/web/app/investor/dividends/error.tsx` + `loading.tsx`

The boundaries detect forbidden / unauthorized errors by message and
swap to a softer, non-jargon message (no issuer ids, no row counts,
no stack traces). The "Try again" affordance is suppressed in that
case so a user without access doesn't loop on a 403.

The AI review card surfaces `pending` (button + spinner), `error`
(non-blocking inline notice), and `empty` (zero history) states
explicitly.

## Test coverage

The dividend module ships **183 tests across 56 suites** (all pass on
`node --test`, reproducible from `apps/api/`). Distribution:

| Spec                               | Focus                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `dividends.math.spec.ts`           | Decimal rounding, date validation.                                                               |
| `dividends.decimal.spec.ts`        | Decimal helper edge cases.                                                                       |
| `dividends.state.spec.ts`          | Declaration state machine.                                                                       |
| `dividends.payments.state.spec.ts` | Batch + payment state machines.                                                                  |
| `dividends.lifecycle.spec.ts`      | End-to-end happy path.                                                                           |
| `dividends.workflow.spec.ts`       | Approve / reject / changes-requested loops, optimistic concurrency.                              |
| `dividends.eligibility.spec.ts`    | Snapshot roster construction & exclusions.                                                       |
| `dividends.calculation.spec.ts`    | Entitlement totals, rounding, withholding.                                                       |
| `dividends.engine.spec.ts`         | Service-level integration over a fake DB.                                                        |
| `dividends.batches.spec.ts`        | Batch lifecycle, double-pay, idempotency, partial failure.                                       |
| `dividends.fractional.spec.ts`     | Fractional adjustment policies.                                                                  |
| `dividends.csv.spec.ts`            | CSV escaping + column shape.                                                                     |
| `dividends.statement.spec.ts`      | HTML statement render.                                                                           |
| `dividends.reports.spec.ts`        | Headline metric aggregation.                                                                     |
| `dividends.preflight.spec.ts`      | Deterministic preflight findings.                                                                |
| `dividends.review.spec.ts`         | Provider abstraction + selectDefaultProvider.                                                    |
| `dividends.review.service.spec.ts` | Persistence + audit event for AI review; asserts no workflow mutation.                           |
| `dividends.hardening.spec.ts`      | **(new)** Tenant isolation on body-driven endpoints, DTO rate validation, double-pay regression. |

## Operational notes

- **Reset on stuck batches** — the `cancelBatch` action moves a batch
  to `CANCELLED` and frees its entitlements (their status goes back to
  `CALCULATED`), so a botched run can be redone without manual SQL.
- **Force overrides** — `scheduleBatch({ force: true, reason })` and
  `cancel({ force: true, reason })` both require an admin role plus a
  reason. Both emit a HIGH-severity audit event.
- **AI off-switch** — set `DIVIDEND_AI_REVIEW_DISABLED=1` to force the
  deterministic provider and skip outbound API calls. Useful for CI,
  air-gapped staging, and incident windows.
- **Reconciliation matching** — `reconcileBatch` matches entries by
  `payment_id`, `external_ref`, **or** `idempotency_key` so a bank
  feed that only carries one of those identifiers still reconciles.
- **Statement PDF** — currently rendered as standalone HTML. The
  `DividendPdfGenerator` interface in `dividends.statement.ts` is the
  hook for a future Puppeteer/Playwright pipeline.
- **Migrations** — schema is created idempotently via
  `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` in `database.service.ts`. New columns must be added there
  and made backwards-compatible (NULL or default).

## API endpoints

All endpoints are mounted under `/dividends`. The route surface is
pinned by `dividends.routes.spec.ts` so a refactor that breaks the
wired frontend fails CI.

### Declarations

| Method | Path                    | Description                                                                                                     |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                     | List declarations. Accepts `issuerId`, `status`, `dividendType`, `from`, `to`, `q`, `page`, `pageSize`, `sort`. |
| POST   | `/`                     | Create draft declaration. Body: `CreateDividendDto`.                                                            |
| GET    | `/:id`                  | Detail view (status, version, allowedActions, workflow, summaries).                                             |
| PUT    | `/:id`                  | Edit while `DRAFT` or `CHANGES_REQUESTED`. Requires `expectedVersion`.                                          |
| POST   | `/:id/submit`           | Move `DRAFT`/`CHANGES_REQUESTED` → `PENDING_APPROVAL`.                                                          |
| POST   | `/:id/approve`          | Move `PENDING_APPROVAL` → `APPROVED`.                                                                           |
| POST   | `/:id/reject`           | Move `PENDING_APPROVAL` → `REJECTED`. Requires `reason`.                                                        |
| POST   | `/:id/request-changes`  | Move `PENDING_APPROVAL` → `CHANGES_REQUESTED`. Requires `reason`.                                               |
| POST   | `/:id/cancel`           | Cancel before `PAYMENT_SCHEDULED`. Reason required. `force=true` + admin role allowed afterwards.               |
| POST   | `/:id/lock-eligibility` | Capture immutable snapshot.                                                                                     |
| POST   | `/:id/calculate`        | Compute entitlements from the locked snapshot.                                                                  |
| POST   | `/:id/archive`          | Move `RECONCILED` → `ARCHIVED`.                                                                                 |

### Eligibility & entitlements

| Method | Path                | Description                                                       |
| ------ | ------------------- | ----------------------------------------------------------------- |
| GET    | `/:id/snapshot`     | Read the locked eligibility snapshot.                             |
| POST   | `/:id/snapshot`     | (legacy) Create snapshot — superseded by `/:id/lock-eligibility`. |
| GET    | `/:id/entitlements` | Per-shareholder gross/withholding/net rows.                       |

### Payment batches & payments

| Method | Path                           | Description                                                                    |
| ------ | ------------------------------ | ------------------------------------------------------------------------------ |
| GET    | `/:id/batches`                 | Batches for a dividend.                                                        |
| POST   | `/:id/batches`                 | Create a batch from calculated entitlements.                                   |
| GET    | `/batches/:batchId`            | Batch detail with payment rows.                                                |
| POST   | `/batches/:batchId/submit`     | DRAFT → PENDING_APPROVAL.                                                      |
| POST   | `/batches/:batchId/approve`    | PENDING_APPROVAL → APPROVED.                                                   |
| POST   | `/batches/:batchId/reject`     | PENDING_APPROVAL → DRAFT (with reason).                                        |
| POST   | `/batches/:batchId/schedule`   | APPROVED → SCHEDULED. `force=true` + reason allowed when warnings are present. |
| POST   | `/batches/:batchId/processing` | SCHEDULED → PROCESSING.                                                        |
| POST   | `/batches/:batchId/reconcile`  | Move processed/partially-failed batch to RECONCILED.                           |
| POST   | `/batches/:batchId/cancel`     | Cancel a non-terminal batch. Reason required.                                  |
| POST   | `/payments/record`             | Record one payment result. Idempotency key supported.                          |
| POST   | `/payments/bulk-record`        | Bulk record results. Per-row tx isolation.                                     |
| POST   | `/entitlements/pay`            | Mark a single entitlement paid (legacy fast path).                             |

### Reports, exports & statements

| Method | Path                                               | Description                                                       |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/reports/summary`                                 | Headline metrics (declared, paid, withholding, unpaid, statuses). |
| GET    | `/exports/declarations.csv`                        | Filtered declarations export.                                     |
| GET    | `/:id/exports/snapshot.csv`                        | Locked snapshot export.                                           |
| GET    | `/:id/exports/entitlements.csv`                    | Calculated entitlements export.                                   |
| GET    | `/:id/exports/batches.csv`                         | Batch summary export.                                             |
| GET    | `/:id/exports/audit.csv`                           | Audit trail export.                                               |
| GET    | `/batches/:batchId/exports/payments.csv`           | Per-batch payment file.                                           |
| GET    | `/exports/failed-payments.csv`                     | Failed/returned payments across the tenant.                       |
| GET    | `/shareholders/:shareholderId/exports/history.csv` | Shareholder dividend history.                                     |
| GET    | `/:id/statements/:entitlementId`                   | JSON statement projection.                                        |
| GET    | `/:id/statements/:entitlementId/render`            | Self-contained HTML statement (print-friendly).                   |
| POST   | `/:id/statements/generate`                         | Materialize statements for every entitlement on a dividend.       |

### Audit & AI

| Method | Path              | Description                                                |
| ------ | ----------------- | ---------------------------------------------------------- |
| GET    | `/:id/audit`      | Per-declaration audit feed.                                |
| POST   | `/:id/ai-review`  | Run a fresh AI review (deterministic + LLM if configured). |
| GET    | `/:id/ai-reviews` | Historical AI reviews.                                     |

### Communications, fractional, DRIP, exceptions

| Method | Path                                              | Description                                                        |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| POST   | `/:id/communications`                             | Create a notice / market announcement.                             |
| POST   | `/communications/:communicationId/submit`         | DRAFT → PENDING_REVIEW.                                            |
| POST   | `/communications/:communicationId/approve`        | PENDING_REVIEW → APPROVED.                                         |
| POST   | `/communications/:communicationId/send`           | APPROVED → SENT.                                                   |
| POST   | `/communications/:communicationId/cancel`         | Cancel a non-sent communication.                                   |
| POST   | `/:id/fractional-adjustments`                     | Apply rounding / cash-in-lieu adjustments.                         |
| POST   | `/:id/drip/execute`                               | Execute the DRIP branch (creates `dividend_reinvestment_records`). |
| POST   | `/:id/reconciliation-exceptions`                  | Open an exception against a payment.                               |
| POST   | `/reconciliation-exceptions/:exceptionId/resolve` | Resolve an open exception.                                         |
| POST   | `/drip-instructions`                              | Upsert a shareholder-level DRIP election.                          |

## Known limitations

The dividend module is feature-complete for the workflows described above
but ships with deliberate scope cuts. Each is tracked in code with a
`TODO`/comment and surfaced in the UI where relevant.

- **No `GET /dividends/dashboard` endpoint.** The web app composes
  the issuer dashboard from `/dividends`, `/dividends/reports/summary`,
  and the per-declaration detail endpoints. The mock fixture in
  `apps/web/src/lib/dividends/mock.ts` is the canonical fallback for
  local dev.
- **Shareholder portal lives on mocks today.** `/me`, `/me/dividends`,
  `/me/dividends/overview`, `/me/dividends/:id`, and
  `/me/dividends/:id/statement` are not implemented on the API.
  `apps/web/src/lib/dividends/shareholder.ts` falls through to its
  fixture data when `NEXT_PUBLIC_API_URL` is set but those routes
  return non-2xx. The CSV history export
  (`/dividends/shareholders/:shareholderId/exports/history.csv`) is the
  current canonical source.
- **No payment provider integration.** Batches generate a payment
  file (CSV) and accept reconciliation imports through the operator
  endpoints, but Proxi does not initiate ACH / wire / check
  transmission. The `DividendPdfGenerator` interface and the
  reconciliation import endpoint are the integration points.
- **Stock dividends partial.** Declaration, approval, eligibility,
  and reporting all support `STOCK` as a kind, but entitlement
  calculation for stock-dividend share issuance is a stub — the
  fractional and DRIP modules carry the share-math today.
- **Statement output is HTML.** The HTML renderer is print-ready, but
  there is no Puppeteer/Playwright pipeline yet. Browsers' "save as
  PDF" is the current path; `DividendPdfGenerator` is the future hook.
- **Communication delivery is metadata-only.** `dividend_communications`
  tracks status (`draft → pending_review → approved → sent`) but
  Proxi does not actually send the email or post to a market data
  feed; the `send` action records the transition for audit.
- **No 1099-DIV generation.** Withholding totals are tracked
  per-payment and per-entitlement but the year-end tax form pipeline
  is not built.
- **No escheatment workflow.** Payments that fail or return are
  flagged in reports but there is no automatic dormant-account
  policy.
- **AI provider OpenAI-only when enabled.** The `DividendAiProvider`
  interface accepts any provider but only the deterministic and
  OpenAI implementations are shipped. Anthropic and other providers
  would slot in symmetrically.

## Roadmap

Future enhancements, roughly in priority order. None of these are
blockers for production use of the current workflow.

1. **ACH / wire integration** — wire the `recordPayment` /
   `bulkRecordPayments` endpoints into a real bank gateway through a
   `PaymentProvider` interface; today the API records what an
   operator types/imports. Add per-provider error codes, retry
   policies, and a queue for in-flight transactions.
2. **DRIP price feed** — `dividends.fractional.ts` already supports
   reinvestment math, but the purchase price is operator-supplied. A
   price-feed integration (vendor-agnostic) would let DRIP execute
   without manual intervention.
3. **Stock dividend share issuance** — extend
   `dividends.calculation.ts` to mint new shares into the ledger for
   `STOCK` kinds, including fractional handling per issuer policy
   (round-down + cash-in-lieu, or DRIP-style fractional shares).
4. **1099-DIV generation** — aggregate per-shareholder paid amounts
   and withholding by tax year, generate IRS-compliant 1099-DIV
   PDFs/electronic submissions, and surface them in the shareholder
   portal alongside W-9 / W-8BEN status. Pair with backup-withholding
   tracking.
5. **Escheatment / dormant-account policy** — automatic detection of
   uncashed checks, returned ACH, or stale account contact info;
   configurable per-jurisdiction dormancy windows; integration with
   state escheatment reporting.
6. **Tax reporting expansion** — non-US treaty rates, foreign QI
   reporting, NRA withholding (Chapter 3 / Chapter 4), and
   per-jurisdiction tax form handling beyond W-9 / W-8BEN.
7. **Statement PDF pipeline** — wire the `DividendPdfGenerator`
   interface to a headless-browser renderer, persist generated PDFs
   to object storage, and link them from `dividend_statements`.
8. **Real shareholder portal endpoints** — promote the `/me/dividends*`
   routes from mock to API (`shareholder.ts` already declares the
   contract). Cache strategy + JWT scoping included.
9. **Communication delivery integrations** — wire approved notices
   to email (transactional provider) and market announcements to the
   appropriate distribution feed (NewsWire, EDGAR-adjacent etc.).
10. **In-product reconciliation upload** — today `reconcileBatch`
    accepts a payload; an operator-facing CSV uploader with mapping
    and dry-run preview would make daily reconciliation self-serve.
11. **Live dividend dashboard endpoint** — promote
    `fetchDashboard()` from a frontend composition to a server-side
    aggregation so a single round-trip serves the dashboard cards.
12. **Action audit metadata** — surface the wired UI's user-supplied
    reasons (cancel / reject / request-changes / force overrides) in
    the audit-trail rendering rather than as opaque text.

---

_Last updated alongside the end-to-end QA pass that wired the
declaration / batch / lock-snapshot / new-batch action buttons to the
backend, fixed the `/:id/snapshot` and `/dividends/dashboard` API path
mismatches, removed the hardcoded fake dashboard warnings, and added
the `dividends.routes.spec.ts` route-contract regression test._
