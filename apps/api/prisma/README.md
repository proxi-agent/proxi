# Prisma schema — Proxi stock transfer agent

This directory holds the Prisma schema that models Proxi's regulated domain
on PostgreSQL. The schema is the source of truth for the relational model;
migrations generated from it are the preferred path for evolving production.

## Setup

```bash
pnpm --filter api install
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev --name init
```

`DATABASE_URL` must be set in the environment (same connection string used by
the existing `pg`-based services in `src/database/`).

## System-of-record vs. derived

**System-of-record (authoritative):**

- `Issuer`, `User`, `UserIssuerRole`
- `Shareholder`, `ShareholderAccount`
- `Security`, `ShareClass`
- `LedgerEntry` — append-only share movements
- `TransferRequest`, `TransferReview`
- `DividendEvent`, `DividendEntitlement`, `DividendPayment`
- `Meeting`, `Proposal`, `Ballot`, `Vote`
- `Notice`, `Document`
- `AuditEvent` — append-only event stream
- `Task`

**Derived / projection-oriented:**

- `Holding` — per-`(account, security, shareClass)` balance, maintained
  transactionally when writing `LedgerEntry` rows. It can be rebuilt at any
  time from the ledger (the existing `v_holdings` SQL view is the same
  derivation, expressed as a Postgres view rather than a table).

## Design highlights

- Multi-issuer isolation is explicit: every issuer-scoped table has
  `issuerId`, so row-level-security policies and query scopes are cheap.
- The share ledger is append-only. Transfers write two rows (debit sender,
  credit receiver) correlated via `correlationId` inside a single DB tx.
- Dividend entitlements store a frozen snapshot (`sharesHeld`, `amountCents`)
  so post-hoc ledger corrections never rewrite prior disbursements.
- `AuditEvent` is never updated or deleted by services — it is the grounding
  layer for the operational copilot and anomaly heuristics.
- JSON columns are used only where the shape is deliberately open (address,
  metadata, recommended actions, restriction checks).
- Indexes target operational paths: reviewer queues, detail-page timelines,
  record-date holdings, and issuer-scoped dashboards.
