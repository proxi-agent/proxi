import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'

import type { ActorContext } from '../common/actor.js'

import { DividendsService } from './dividends.service.js'
import type { DividendStatus } from './dividends.types.js'

/**
 * Service-level tests for the eligibility snapshot + entitlement
 * calculation engine. We use a tailored in-memory fake of
 * `DatabaseService` (and `LedgerService`) that returns positions for a
 * configurable scenario. This mirrors the pattern in
 * `dividends.workflow.spec.ts` so the engine is exercised end-to-end
 * (`lockEligibility` → `calculateEntitlements` → `getCalculationSummary`)
 * without standing up Postgres.
 */

interface FakeDividendRow {
  id: string
  issuer_id: string
  security_id: string
  share_class_id: string | null
  status: DividendStatus
  kind: 'CASH' | 'STOCK'
  rate_type: 'PER_SHARE'
  rate_amount: string
  rate_per_share_cents: number
  currency: string
  withholding_default_pct: string
  declaration_date: string
  record_date: string
  ex_dividend_date: string | null
  payment_date: string
  total_distribution_cents: string
  description: string | null
  notes: string | null
  supporting_documents: unknown[]
  metadata: Record<string, unknown>
  approved_at: Date | null
  eligibility_locked_at: Date | null
  calculated_at: Date | null
  scheduled_at: Date | null
  paid_at: Date | null
  cancelled_at: Date | null
  rejected_at: Date | null
  changes_requested_at: Date | null
  version: number
  calculation_version: number
  calculations_locked_at: Date | null
  created_at: Date
  updated_at: Date
}

interface FakeAccountRow {
  id: string
  shareholder_id: string
  account_number: string
  status: string
}

interface FakeShareholderRow {
  id: string
  status: string
  kyc_status: string
  tax_id_last4: string | null
}

interface FakeSnapshotRow {
  id: string
  dividend_event_id: string
  issuer_id: string
  security_id: string
  share_class_id: string | null
  record_date: string
  captured_at: Date
  locked_at: Date | null
  holder_count: number
  excluded_holder_count: number
  total_eligible_shares: string
  snapshot_payload: unknown
  metadata: Record<string, unknown>
}

interface FakeEntitlementRow {
  id: string
  dividend_event_id: string
  eligibility_snapshot_id: string | null
  account_id: string
  shareholder_id: string
  shares_held: string
  shares_held_decimal: string
  amount_cents: string
  gross_amount_cents: string
  withholding_cents: string
  net_amount_cents: string
  withholding_pct: string
  status: string
  payment_method: string | null
  currency: string
  tax_status: string
  calculation_version: number
  frozen_at: Date | null
  paid_at: Date | null
  payment_reference: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

class FakeDatabase {
  dividends: FakeDividendRow[] = []
  accounts: FakeAccountRow[] = []
  shareholders: FakeShareholderRow[] = []
  snapshots: FakeSnapshotRow[] = []
  entitlements: FakeEntitlementRow[] = []
  approvals: Array<Record<string, unknown>> = []

  async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    return this.execute<T>(text, params)
  }

  async tx<T>(fn: (client: FakeDatabase) => Promise<T>): Promise<T> {
    return fn(this)
  }

  private clone<T>(row: T): T {
    return row && typeof row === 'object' ? ({ ...(row as Record<string, unknown>) } as T) : row
  }

  private execute<T>(text: string, params: unknown[]): { rows: T[]; rowCount: number } {
    const sql = text.trim().toLowerCase()

    if (sql.startsWith('select * from dividend_events where id =')) {
      const id = String(params[0])
      const row = this.dividends.find(r => r.id === id)
      const snap = row ? this.clone(row) : undefined
      return { rowCount: snap ? 1 : 0, rows: snap ? ([snap] as unknown as T[]) : [] }
    }

    if (sql.startsWith('select par_value_cents from share_classes')) {
      return { rowCount: 1, rows: [{ par_value_cents: 0 } as unknown as T] }
    }

    if (sql.includes('from shareholder_accounts') && sql.includes('account_number = any')) {
      const numbers = (params[1] as string[]) ?? []
      const rows = this.accounts.filter(a => numbers.includes(a.account_number))
      return { rowCount: rows.length, rows: rows.map(r => this.clone(r)) as unknown as T[] }
    }

    if (sql.includes('from shareholders where id = any')) {
      const ids = (params[0] as string[]) ?? []
      const rows = this.shareholders.filter(s => ids.includes(s.id))
      return { rowCount: rows.length, rows: rows.map(r => this.clone(r)) as unknown as T[] }
    }

    if (sql.includes('select id from dividend_eligibility_snapshots where dividend_event_id =')) {
      const dividendId = String(params[0])
      const existing = this.snapshots.find(s => s.dividend_event_id === dividendId)
      return { rowCount: existing ? 1 : 0, rows: existing ? ([{ id: existing.id }] as unknown as T[]) : [] }
    }

    if (sql.startsWith('insert into dividend_eligibility_snapshots')) {
      const row: FakeSnapshotRow = {
        captured_at: new Date(),
        dividend_event_id: String(params[1]),
        excluded_holder_count: Number(params[7]),
        holder_count: Number(params[6]),
        id: String(params[0]),
        issuer_id: String(params[2]),
        locked_at: new Date(),
        metadata: {},
        record_date: String(params[5]),
        security_id: String(params[3]),
        share_class_id: (params[4] as string) || null,
        snapshot_payload: JSON.parse(String(params[9])),
        total_eligible_shares: String(params[8]),
      }
      const idx = this.snapshots.findIndex(s => s.dividend_event_id === row.dividend_event_id)
      if (idx >= 0) {
        this.snapshots[idx] = { ...this.snapshots[idx], ...row, id: this.snapshots[idx].id }
      } else {
        this.snapshots.push(row)
      }
      return { rowCount: 1, rows: [this.snapshots[idx >= 0 ? idx : this.snapshots.length - 1]] as unknown as T[] }
    }

    if (sql.startsWith('select * from dividend_eligibility_snapshots')) {
      const dividendId = String(params[0])
      const row = this.snapshots.find(s => s.dividend_event_id === dividendId)
      return { rowCount: row ? 1 : 0, rows: row ? ([this.clone(row)] as unknown as T[]) : [] }
    }

    if (sql.startsWith('update dividend_events')) {
      const id = String(params[0])
      const row = this.dividends.find(r => r.id === id)
      if (!row) return { rowCount: 0, rows: [] }
      row.version += 1
      row.updated_at = new Date()
      if (sql.includes("status = 'eligibility_locked'")) {
        row.status = 'ELIGIBILITY_LOCKED'
        row.eligibility_locked_at = new Date()
      } else if (sql.includes("status = 'calculated'")) {
        row.status = 'CALCULATED'
        row.calculated_at = new Date()
        row.total_distribution_cents = String(params[1])
        row.calculation_version = Number(params[2])
      } else if (sql.includes('total_distribution_cents = $2::bigint') && sql.includes('calculation_version = $3')) {
        row.total_distribution_cents = String(params[1])
        row.calculation_version = Number(params[2])
      }
      return { rowCount: 1, rows: [this.clone(row)] as unknown as T[] }
    }

    if (sql.startsWith('delete from dividend_tax_withholdings') || sql.startsWith('delete from dividend_entitlements')) {
      const id = String(params[0])
      this.entitlements = this.entitlements.filter(e => e.dividend_event_id !== id)
      return { rowCount: 0, rows: [] }
    }

    if (sql.startsWith('insert into dividend_entitlements')) {
      const row: FakeEntitlementRow = {
        account_id: String(params[3]),
        amount_cents: String(params[7]),
        calculation_version: Number(params[13]),
        created_at: new Date(),
        currency: String(params[11]),
        dividend_event_id: String(params[1]),
        eligibility_snapshot_id: (params[2] as string) || null,
        frozen_at: new Date(),
        gross_amount_cents: String(params[7]),
        id: String(params[0]),
        metadata: {},
        net_amount_cents: String(params[9]),
        paid_at: null,
        payment_method: null,
        payment_reference: null,
        shareholder_id: String(params[4]),
        shares_held: String(params[5]),
        shares_held_decimal: String(params[6]),
        status: 'CALCULATED',
        tax_status: String(params[12]),
        updated_at: new Date(),
        withholding_cents: String(params[8]),
        withholding_pct: String(params[10]),
      }
      this.entitlements.push(row)
      return { rowCount: 1, rows: [this.clone(row)] as unknown as T[] }
    }

    if (sql.startsWith('insert into dividend_tax_withholdings')) {
      return { rowCount: 1, rows: [] as unknown as T[] }
    }

    if (sql.startsWith('select') && sql.includes('from dividend_entitlements') && sql.includes('sum')) {
      // Used by getCalculationSummary aggregate query.
      const dividendId = String(params[0])
      const matching = this.entitlements.filter(e => e.dividend_event_id === dividendId)
      let gross = 0
      let withholding = 0
      let net = 0
      let shares = 0
      let version = 0
      for (const r of matching) {
        gross += Number(r.gross_amount_cents)
        withholding += Number(r.withholding_cents)
        net += Number(r.net_amount_cents)
        shares += Number(r.shares_held_decimal)
        if (r.calculation_version > version) version = r.calculation_version
      }
      return {
        rowCount: 1,
        rows: [
          {
            count: String(matching.length),
            gross: String(gross),
            net: String(net),
            shares: String(shares),
            version,
            withholding: String(withholding),
          },
        ] as unknown as T[],
      }
    }

    if (sql.startsWith('insert into dividend_approvals')) {
      this.approvals.push({ params })
      return { rowCount: 1, rows: [] }
    }

    // Fallthrough: silently succeed for assorted UPDATEs we don't care about
    // in these scenarios (status refresh after cancel, etc.).
    if (sql.startsWith('update ') || sql.startsWith('delete ')) {
      return { rowCount: 0, rows: [] }
    }

    throw new Error(`FakeDatabase: unhandled SQL → ${text.slice(0, 100)}…`)
  }
}

class FakeAudit {
  events: Array<{ action: string; metadata: Record<string, unknown> }> = []
  async record(input: { action: string; metadata?: Record<string, unknown> }): Promise<void> {
    this.events.push({ action: input.action, metadata: input.metadata ?? {} })
  }
  async timeline(): Promise<unknown[]> {
    return []
  }
}

interface ScenarioPositions {
  holderId: string
  quantity: number | string
}

function makeService(opts: {
  status: DividendStatus
  positions: ScenarioPositions[]
  accounts: FakeAccountRow[]
  shareholders?: FakeShareholderRow[]
  rateAmount?: string
  withholdingDefaultPct?: string
  kind?: 'CASH' | 'STOCK'
}) {
  const db = new FakeDatabase()
  const audit = new FakeAudit()

  db.dividends.push({
    approved_at: opts.status === 'DRAFT' ? null : new Date(),
    calculated_at: null,
    calculation_version: 0,
    calculations_locked_at: null,
    cancelled_at: null,
    changes_requested_at: null,
    created_at: new Date(),
    currency: 'USD',
    declaration_date: '2030-06-01',
    description: null,
    eligibility_locked_at: null,
    ex_dividend_date: null,
    id: 'div-engine-1',
    issuer_id: 'iss-1',
    kind: opts.kind ?? 'CASH',
    metadata: {},
    notes: null,
    paid_at: null,
    payment_date: '2030-07-01',
    rate_amount: opts.rateAmount ?? '0.25',
    rate_per_share_cents: 25,
    rate_type: 'PER_SHARE',
    record_date: '2030-06-15',
    rejected_at: null,
    scheduled_at: null,
    security_id: 'sec-1',
    share_class_id: 'sc-A',
    status: opts.status,
    supporting_documents: [],
    total_distribution_cents: '0',
    updated_at: new Date(),
    version: 1,
    withholding_default_pct: opts.withholdingDefaultPct ?? '0',
  })
  db.accounts.push(...opts.accounts)
  db.shareholders.push(
    ...(opts.shareholders ??
      opts.accounts.map(a => ({
        id: a.shareholder_id,
        kyc_status: 'APPROVED',
        status: 'ACTIVE',
        tax_id_last4: '1234',
      }))),
  )

  const ledger = { getPositionsAsOf: async () => opts.positions }

  const service = new DividendsService(db as any, audit as any, ledger as any)
  return { audit, db, service }
}

const ACTOR: ActorContext = { actorId: 'user.ops', actorRole: 'agent_admin' }
const ADMIN: ActorContext = { actorId: 'user.super', actorRole: 'super_admin' }

describe('eligibility snapshot — captures roster as of record date', () => {
  it('captures eligible holders and excludes zero-balance / blocked / unknown rows', async () => {
    const { audit, db, service } = makeService({
      accounts: [
        { account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' },
        { account_number: 'h2', id: 'a2', shareholder_id: 'sh2', status: 'BLOCKED' },
      ],
      positions: [
        { holderId: 'h1', quantity: '125' },
        { holderId: 'h2', quantity: '50' },
        { holderId: 'unknown', quantity: '10' },
      ],
      status: 'APPROVED',
    })
    const result = await service.lockEligibility('div-engine-1', ACTOR)
    assert.equal(result.event.status, 'ELIGIBILITY_LOCKED')
    assert.equal(result.snapshot.holderCount, 1)
    assert.equal(result.snapshot.excludedHolderCount, 2)
    assert.equal(result.snapshot.totalEligibleShares, '125')

    const statuses = result.snapshot.snapshotPayload.map(p => p.eligibilityStatus).sort()
    assert.deepEqual(statuses, ['ELIGIBLE', 'EXCLUDED_BLOCKED_ACCOUNT', 'EXCLUDED_UNKNOWN_ACCOUNT'])

    const created = audit.events.find(e => e.action === 'DIVIDEND_ELIGIBILITY_SNAPSHOT_CREATED')
    const locked = audit.events.find(e => e.action === 'DIVIDEND_ELIGIBILITY_SNAPSHOT_LOCKED')
    assert.ok(created, 'snapshot_created emitted')
    assert.ok(locked, 'snapshot_locked emitted')

    // Idempotent re-lock: status stays the same and no duplicate snapshot row.
    const again = await service.lockEligibility('div-engine-1', ACTOR)
    assert.equal(again.snapshot.id, result.snapshot.id, 'snapshot id is stable across re-lock')
    assert.equal(db.snapshots.length, 1)
  })
})

describe('entitlement calculation — cash dividend over locked snapshot', () => {
  it('produces deterministic per-holder entitlements with totals + summary', async () => {
    const { service } = makeService({
      accounts: [
        { account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' },
        { account_number: 'h2', id: 'a2', shareholder_id: 'sh2', status: 'ACTIVE' },
        { account_number: 'h3', id: 'a3', shareholder_id: 'sh3', status: 'ACTIVE' },
      ],
      positions: [
        { holderId: 'h1', quantity: '100' },
        { holderId: 'h2', quantity: '50' },
        { holderId: 'h3', quantity: '0' },
      ],
      rateAmount: '0.25',
      status: 'APPROVED',
      withholdingDefaultPct: '0',
    })
    await service.lockEligibility('div-engine-1', ACTOR)
    const result = await service.calculateEntitlements('div-engine-1', {}, ACTOR)
    assert.equal(result.event.status, 'CALCULATED')
    assert.equal(result.entitlements.length, 2)
    // Eligible = h1 + h2; h3 is captured on the roster as EXCLUDED_ZERO_BALANCE.
    assert.equal(result.summary.eligibleHolderCount, 2)
    assert.equal(result.summary.excludedHolderCount, 1)
    assert.equal(result.summary.totalGrossCents, 100 * 25 + 50 * 25)
    assert.equal(result.summary.calculationVersion, 1)
    // Entitlement rows carry the version stamp.
    assert.ok(result.entitlements.every(e => e.calculationVersion === 1))
    assert.equal(result.entitlements[0].currency, 'USD')
  })

  it('preserves fractional holdings and rounds to integer cents', async () => {
    const { service } = makeService({
      accounts: [{ account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' }],
      positions: [{ holderId: 'h1', quantity: '12.5' }],
      rateAmount: '0.30',
      status: 'APPROVED',
    })
    await service.lockEligibility('div-engine-1', ACTOR)
    const result = await service.calculateEntitlements('div-engine-1', {}, ACTOR)
    assert.equal(result.entitlements[0].sharesHeld, '12.5')
    assert.equal(result.entitlements[0].grossAmountCents, Math.round(12.5 * 30))
  })

  it('is idempotent before payment scheduling: rerun bumps calculationVersion safely', async () => {
    const { audit, service } = makeService({
      accounts: [{ account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' }],
      positions: [{ holderId: 'h1', quantity: '100' }],
      status: 'APPROVED',
    })
    await service.lockEligibility('div-engine-1', ACTOR)
    const first = await service.calculateEntitlements('div-engine-1', {}, ACTOR)
    const second = await service.calculateEntitlements('div-engine-1', {}, ACTOR)
    assert.equal(first.summary.calculationVersion, 1)
    assert.equal(second.summary.calculationVersion, 2)
    assert.equal(second.entitlements.length, first.entitlements.length, 'no duplication on rerun')

    const recalcAudits = audit.events.filter(e => e.action === 'DIVIDEND_ENTITLEMENTS_RECALCULATED')
    assert.equal(recalcAudits.length, 1, 'recalc emits a recalculated audit (not duplicate calculated)')
  })

  it('refuses calculation on cancelled / rejected dividends', async () => {
    const { service } = makeService({
      accounts: [{ account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' }],
      positions: [{ holderId: 'h1', quantity: '100' }],
      status: 'CANCELLED',
    })
    await assert.rejects(service.calculateEntitlements('div-engine-1', {}, ACTOR), (err: unknown) => err instanceof ConflictException)
  })

  it('refuses calculation when eligibility has not been locked yet', async () => {
    const { service } = makeService({
      accounts: [{ account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' }],
      positions: [{ holderId: 'h1', quantity: '100' }],
      status: 'APPROVED',
    })
    await assert.rejects(service.calculateEntitlements('div-engine-1', {}, ACTOR), (err: unknown) => err instanceof ConflictException)
  })
})

describe('entitlement recalculation — payment-scheduled lock + override', () => {
  function setup() {
    return makeService({
      accounts: [{ account_number: 'h1', id: 'a1', shareholder_id: 'sh1', status: 'ACTIVE' }],
      positions: [{ holderId: 'h1', quantity: '100' }],
      status: 'PAYMENT_SCHEDULED',
    })
  }

  it('refuses recalc without `force`', async () => {
    const { db, service } = setup()
    // Pre-seed a locked snapshot so requireSnapshot finds something.
    db.snapshots.push({
      captured_at: new Date(),
      dividend_event_id: 'div-engine-1',
      excluded_holder_count: 0,
      holder_count: 1,
      id: 'snap-1',
      issuer_id: 'iss-1',
      locked_at: new Date(),
      metadata: {},
      record_date: '2030-06-15',
      security_id: 'sec-1',
      share_class_id: 'sc-A',
      snapshot_payload: [
        {
          accountId: 'a1',
          eligibilityStatus: 'ELIGIBLE',
          ownershipReference: 'h1',
          ownershipSource: 'LEDGER_AS_OF_RECORD_DATE',
          recordDate: '2030-06-15',
          securityId: 'sec-1',
          shareholderId: 'sh1',
          sharesHeld: '100',
        },
      ],
      total_eligible_shares: '100',
    })
    await assert.rejects(
      service.calculateEntitlements('div-engine-1', {}, ACTOR),
      (err: unknown) => err instanceof ConflictException && /locked/i.test((err as Error).message),
    )
  })

  it('refuses force without internal-admin role', async () => {
    const { db, service } = setup()
    db.snapshots.push(makeLockedSnapshotForTest())
    await assert.rejects(
      service.calculateEntitlements('div-engine-1', { force: true, reason: 'urgent' }, ACTOR),
      (err: unknown) => err instanceof ForbiddenException,
    )
  })

  it('refuses force without a reason even for admins', async () => {
    const { db, service } = setup()
    db.snapshots.push(makeLockedSnapshotForTest())
    await assert.rejects(
      service.calculateEntitlements('div-engine-1', { force: true }, ADMIN),
      (err: unknown) => err instanceof BadRequestException,
    )
  })

  it('admin force-recalc emits CALCULATION_LOCKED + RECALCULATED audits and bumps version', async () => {
    const { audit, db, service } = setup()
    db.snapshots.push(makeLockedSnapshotForTest())
    db.dividends[0].calculation_version = 1
    const out = await service.calculateEntitlements('div-engine-1', { force: true, reason: 'corrected withholding rate' }, ADMIN)
    assert.equal(out.summary.calculationVersion, 2)
    assert.equal(out.summary.lockedForPayment, true)
    const actions = audit.events.map(e => e.action)
    assert.ok(actions.includes('DIVIDEND_ENTITLEMENTS_RECALCULATED'))
    assert.ok(actions.includes('DIVIDEND_CALCULATION_LOCKED'))
  })
})

function makeLockedSnapshotForTest(): FakeSnapshotRow {
  return {
    captured_at: new Date(),
    dividend_event_id: 'div-engine-1',
    excluded_holder_count: 0,
    holder_count: 1,
    id: 'snap-1',
    issuer_id: 'iss-1',
    locked_at: new Date(),
    metadata: {},
    record_date: '2030-06-15',
    security_id: 'sec-1',
    share_class_id: 'sc-A',
    snapshot_payload: [
      {
        accountId: 'a1',
        eligibilityStatus: 'ELIGIBLE',
        ownershipReference: 'h1',
        ownershipSource: 'LEDGER_AS_OF_RECORD_DATE',
        recordDate: '2030-06-15',
        securityId: 'sec-1',
        shareholderId: 'sh1',
        sharesHeld: '100',
      },
    ],
    total_eligible_shares: '100',
  }
}
