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

## Domain Assumptions

- Ledger is append-only. Balance changes are represented through ledger events, never direct balance edits.
- Transfer settlement is the only path that writes ledger transfer impacts.
- Holdings are derived/projected and can be rebuilt from ledger history.
- Audit events are append-only and used as the authoritative timeline for sensitive actions.
- Issuer-scope and shareholder-scope access are enforced in guards, not ad hoc in service methods.

## Workflow Notes

- Transfer lifecycle: `DRAFT -> SUBMITTED -> UNDER_REVIEW -> (NEEDS_INFO <-> UNDER_REVIEW) -> APPROVED -> SETTLED`, with `REJECTED`/`CANCELLED` terminals.
- Settlement is transactional and includes:
  - transition validation
  - blocker re-check
  - paired ledger writes
  - holdings projection updates
  - audit emission
- Blocked/attention-needed workflow conditions emit operational tasks via `TasksSignalsService`.

## Auth in Demo vs Real IdP

- Real mode: Clerk bearer token is validated and mapped to local user + issuer grants.
- Demo mode: set `AUTH_DEMO_MODE=true` (or non-production default) and pass `x-demo-user` header with seeded demo email/external id.
- Actor identity is propagated into audit events from request context.

