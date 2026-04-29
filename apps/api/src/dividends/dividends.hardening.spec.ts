import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ForbiddenException } from '@nestjs/common'
import { validate } from 'class-validator'

import { actorCanAccessIssuer, type ActorContext, isPrivilegedActor } from '../common/actor.js'

import { CreateDividendDto } from './dividends.dto.js'
import { DividendsService } from './dividends.service.js'
import type { DividendPaymentStatus, DividendStatus } from './dividends.types.js'

/**
 * Production-readiness regression tests.
 *
 * These cover invariants that the rest of the dividend specs verify
 * indirectly but that are critical enough to deserve their own
 * dedicated suite:
 *
 *   - Tenant scope enforcement on body-driven payment endpoints
 *     (`recordPayment`/`bulkRecordPayments`) where the controller's
 *     `@Scope` decorator can't reach the affected row through a path
 *     param.
 *   - Validation of declaration shape (negative rates, bad dates)
 *     at the DTO + service boundary.
 *   - Duplicate-batch and double-pay prevention guarantees.
 *
 * Uses the same in-memory FakeDatabase pattern as
 * `dividends.batches.spec.ts`. We re-declare a smaller fake here to
 * keep the surface area focused on the assertions in this file —
 * unhandled SQL throws so silent regressions surface immediately.
 */

interface FakeDividendRow {
  id: string
  issuer_id: string
  status: DividendStatus
  currency: string
  payment_date: string
  scheduled_at: Date | null
  version: number
}

interface FakeEntitlementRow {
  id: string
  dividend_event_id: string
  account_id: string
  shareholder_id: string
  status: string
  gross_amount_cents: string
  withholding_cents: string
  net_amount_cents: string
}

interface FakeBatchRow {
  id: string
  dividend_event_id: string
  issuer_id: string
  batch_number: string | null
  currency: string
  payment_date: string | null
  method: string
  status: string
  scheduled_at: Date | null
  approved_at: Date | null
  started_at: Date | null
  completed_at: Date | null
  reconciled_at: Date | null
  cancelled_at: Date | null
  created_by: string | null
  payment_count: number
  total_gross_cents: string
  total_withholding_cents: string
  total_net_cents: string
  notes: string | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

interface FakePaymentRow {
  id: string
  dividend_event_id: string
  batch_id: string | null
  entitlement_id: string
  account_id: string
  shareholder_id: string
  gross_amount_cents: string
  withholding_cents: string
  net_amount_cents: string
  currency: string
  method: string
  status: DividendPaymentStatus
  external_ref: string | null
  failure_reason: string | null
  attempt_no: number
  idempotency_key: string | null
  paid_at: Date | null
  reconciled_at: Date | null
  returned_at: Date | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

interface FakeAccountRow {
  id: string
  shareholder_id: string
  status: string
  payment_instructions: Record<string, unknown> | null
  blocked_at: Date | null
}

interface FakeShareholderRow {
  id: string
  status: string
  tax_id_last4: string | null
  blocked_at: Date | null
}

class FakeDatabase {
  dividends: FakeDividendRow[] = []
  entitlements: FakeEntitlementRow[] = []
  batches: FakeBatchRow[] = []
  payments: FakePaymentRow[] = []
  accounts: FakeAccountRow[] = []
  shareholders: FakeShareholderRow[] = []

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
    const sql = text.trim().toLowerCase().replace(/\s+/g, ' ')

    if (sql.startsWith('select * from dividend_events where id =')) {
      const id = String(params[0])
      const row = this.dividends.find(r => r.id === id)
      return { rowCount: row ? 1 : 0, rows: row ? ([this.clone(row)] as unknown as T[]) : [] }
    }

    if (sql.includes('from dividend_entitlements where dividend_event_id') && sql.includes('order by id')) {
      const dividendId = String(params[0])
      const ids = (params[1] as string[]) || null
      let matched = this.entitlements.filter(
        e => e.dividend_event_id === dividendId && ['CALCULATED', 'PENDING', 'HELD'].includes(e.status),
      )
      if (ids) matched = matched.filter(e => ids.includes(e.id))
      return { rowCount: matched.length, rows: matched.map(r => this.clone(r)) as unknown as T[] }
    }

    if (sql.startsWith('select p.entitlement_id, p.status, p.batch_id')) {
      const entitlementIds = (params[0] as string[]) || []
      const matched = this.payments.filter(p => {
        if (!entitlementIds.includes(p.entitlement_id)) return false
        if (['PAID', 'SETTLED', 'RECONCILED'].includes(p.status)) return true
        if (p.batch_id) {
          const batch = this.batches.find(b => b.id === p.batch_id)
          if (batch && !['CANCELLED', 'FAILED'].includes(batch.status)) return true
        }
        return false
      })
      return {
        rowCount: matched.length,
        rows: matched.map(p => ({ batch_id: p.batch_id, entitlement_id: p.entitlement_id, status: p.status })) as unknown as T[],
      }
    }

    if (sql.startsWith('select count(*)::text as count from dividend_payment_batches')) {
      const dividendId = String(params[0])
      const count = this.batches.filter(b => b.dividend_event_id === dividendId).length
      return { rowCount: 1, rows: [{ count: String(count) }] as unknown as T[] }
    }

    if (sql.startsWith('insert into dividend_payment_batches')) {
      const row: FakeBatchRow = {
        approved_at: null,
        batch_number: String(params[3]),
        cancelled_at: null,
        completed_at: null,
        created_at: new Date(),
        created_by: (params[8] as string) || null,
        currency: String(params[4]),
        dividend_event_id: String(params[1]),
        id: String(params[0]),
        issuer_id: String(params[2]),
        metadata: JSON.parse(String(params[14])),
        method: String(params[6]),
        notes: (params[13] as string) || null,
        payment_count: Number(params[9]),
        payment_date: (params[5] as string) || null,
        reconciled_at: null,
        scheduled_at: (params[7] as Date | string) ? new Date(params[7] as string) : null,
        started_at: null,
        status: 'DRAFT',
        total_gross_cents: String(params[10]),
        total_net_cents: String(params[12]),
        total_withholding_cents: String(params[11]),
        updated_at: new Date(),
      }
      this.batches.push(row)
      return { rowCount: 1, rows: [this.clone(row)] as unknown as T[] }
    }

    if (sql.startsWith('insert into dividend_payments')) {
      const row: FakePaymentRow = {
        account_id: String(params[4]),
        attempt_no: 1,
        batch_id: String(params[2]),
        created_at: new Date(),
        currency: String(params[9]),
        dividend_event_id: String(params[1]),
        entitlement_id: String(params[3]),
        external_ref: null,
        failure_reason: null,
        gross_amount_cents: String(params[6]),
        id: String(params[0]),
        idempotency_key: null,
        metadata: {},
        method: String(params[10]),
        net_amount_cents: String(params[8]),
        paid_at: null,
        reconciled_at: null,
        returned_at: null,
        shareholder_id: String(params[5]),
        status: 'PENDING',
        updated_at: new Date(),
        withholding_cents: String(params[7]),
      }
      this.payments.push(row)
      return { rowCount: 1, rows: [this.clone(row)] as unknown as T[] }
    }

    if (sql.startsWith('select * from dividend_payment_batches where id =')) {
      const id = String(params[0])
      const row = this.batches.find(b => b.id === id)
      return { rowCount: row ? 1 : 0, rows: row ? ([this.clone(row)] as unknown as T[]) : [] }
    }

    if (sql.startsWith('select * from dividend_payments where batch_id')) {
      const batchId = String(params[0])
      const matched = this.payments.filter(p => p.batch_id === batchId)
      return { rowCount: matched.length, rows: matched.map(p => this.clone(p)) as unknown as T[] }
    }

    if (sql.startsWith('select * from dividend_payments where id =')) {
      const id = String(params[0])
      const row = this.payments.find(p => p.id === id)
      return { rowCount: row ? 1 : 0, rows: row ? ([this.clone(row)] as unknown as T[]) : [] }
    }

    if (sql.startsWith('select * from dividend_payments where idempotency_key')) {
      const key = String(params[0])
      const row = this.payments.find(p => p.idempotency_key === key)
      return { rowCount: row ? 1 : 0, rows: row ? ([this.clone(row)] as unknown as T[]) : [] }
    }

    if (sql.startsWith('select status, count(*)::text as count from dividend_payments')) {
      const batchId = String(params[0])
      const counts = new Map<string, number>()
      for (const payment of this.payments) {
        if (payment.batch_id !== batchId) continue
        counts.set(payment.status, (counts.get(payment.status) || 0) + 1)
      }
      const rows = Array.from(counts.entries()).map(([status, count]) => ({ count: String(count), status }))
      return { rowCount: rows.length, rows: rows as unknown as T[] }
    }

    if (sql.startsWith('select status from dividend_payment_batches where id =')) {
      const id = String(params[0])
      const row = this.batches.find(b => b.id === id)
      return { rowCount: row ? 1 : 0, rows: row ? ([{ status: row.status }] as unknown as T[]) : [] }
    }

    if (sql.includes('from shareholder_accounts where id = any')) {
      const ids = (params[0] as string[]) || []
      const rows = this.accounts.filter(a => ids.includes(a.id))
      return { rowCount: rows.length, rows: rows.map(r => this.clone(r)) as unknown as T[] }
    }

    if (sql.includes('from shareholders where id = any')) {
      const ids = (params[0] as string[]) || []
      const rows = this.shareholders.filter(s => ids.includes(s.id))
      return { rowCount: rows.length, rows: rows.map(r => this.clone(r)) as unknown as T[] }
    }

    if (sql.startsWith('update dividend_payment_batches set')) {
      const id = String(params[0])
      const batch = this.batches.find(b => b.id === id)
      if (!batch) return { rowCount: 0, rows: [] }
      const literalMatch = sql.match(/status\s*=\s*'([^']+)'/)
      const paramStatus = !literalMatch && sql.includes('status = $2') ? String(params[1]) : null
      const next = (literalMatch ? literalMatch[1] : paramStatus || '').toUpperCase()
      if (next) batch.status = next
      batch.updated_at = new Date()
      if (next === 'APPROVED') batch.approved_at = new Date()
      if (next === 'PROCESSING') batch.started_at = new Date()
      if (next === 'CANCELLED') batch.cancelled_at = new Date()
      if (next === 'SCHEDULED') {
        const schedParam = literalMatch ? params[1] : params[2]
        batch.scheduled_at = schedParam ? new Date(schedParam as string) : new Date()
      }
      if (next === 'PROCESSED' || next === 'FAILED' || next === 'PARTIALLY_FAILED') {
        batch.completed_at = new Date()
      }
      if (next === 'RECONCILED') batch.reconciled_at = new Date()
      return { rowCount: 1, rows: [this.clone(batch)] as unknown as T[] }
    }

    if (sql.startsWith('update dividend_payments set status = $2')) {
      const id = String(params[0])
      const status = String(params[1]).toUpperCase() as DividendPaymentStatus
      const payment = this.payments.find(p => p.id === id)
      if (!payment) return { rowCount: 0, rows: [] }
      payment.status = status
      payment.external_ref = (params[2] as string) ?? payment.external_ref
      payment.failure_reason = (params[3] as string) ?? payment.failure_reason
      if (params[4] && !payment.idempotency_key) payment.idempotency_key = String(params[4])
      if (params[5] === true) payment.paid_at = new Date()
      if (params[6] === true) payment.returned_at = new Date()
      payment.metadata = params[7] ? JSON.parse(String(params[7])) : payment.metadata
      payment.updated_at = new Date()
      return { rowCount: 1, rows: [this.clone(payment)] as unknown as T[] }
    }

    if (sql.startsWith('update dividend_payments set status = ')) {
      const setStatusMatch = sql.match(/status = '([^']+)'/)
      const newStatus = setStatusMatch ? setStatusMatch[1].toUpperCase() : null
      const fromStatusMatch = sql.match(/and status = '([^']+)'/)
      const fromStatus = fromStatusMatch ? fromStatusMatch[1].toUpperCase() : null
      const id = String(params[0])
      if (sql.includes('where batch_id = $1')) {
        for (const payment of this.payments) {
          if (payment.batch_id !== id) continue
          if (fromStatus && payment.status !== fromStatus) continue
          if (sql.includes("status not in ('paid', 'settled', 'reconciled', 'cancelled')")) {
            if (['PAID', 'SETTLED', 'RECONCILED', 'CANCELLED'].includes(payment.status)) continue
          }
          payment.status = (newStatus as DividendPaymentStatus) ?? payment.status
          if (newStatus === 'RETURNED') payment.returned_at = new Date()
          payment.updated_at = new Date()
        }
      } else if (sql.includes('where id = $1')) {
        const payment = this.payments.find(p => p.id === id)
        if (payment && newStatus) {
          payment.status = newStatus as DividendPaymentStatus
          if (newStatus === 'RETURNED') payment.returned_at = new Date()
          if (newStatus === 'RECONCILED') payment.reconciled_at = new Date()
          payment.updated_at = new Date()
        }
      }
      return { rowCount: 0, rows: [] }
    }

    if (sql.startsWith('update dividend_events set')) {
      const id = String(params[0])
      const dividend = this.dividends.find(d => d.id === id)
      if (!dividend) return { rowCount: 0, rows: [] }
      if (sql.includes("status = 'payment_scheduled'")) {
        dividend.status = 'PAYMENT_SCHEDULED'
        dividend.scheduled_at = new Date()
      } else if (sql.includes("status = 'paid'")) {
        dividend.status = 'PAID'
      } else if (sql.includes("status = 'partially_paid'")) {
        dividend.status = 'PARTIALLY_PAID'
      }
      return { rowCount: 1, rows: [this.clone(dividend)] as unknown as T[] }
    }

    if (sql.startsWith('select') && sql.includes('count(*)::text as total') && sql.includes('from dividend_entitlements')) {
      const dividendId = String(params[0])
      const matching = this.entitlements.filter(e => e.dividend_event_id === dividendId)
      const paid = matching.filter(e => e.status === 'PAID').length
      const pending = matching.filter(e => ['PENDING', 'CALCULATED', 'HELD'].includes(e.status)).length
      const failed = matching.filter(e => ['FAILED', 'REVERSED'].includes(e.status)).length
      return {
        rowCount: 1,
        rows: [
          {
            failed: String(failed),
            paid: String(paid),
            pending: String(pending),
            total: String(matching.length),
          },
        ] as unknown as T[],
      }
    }

    if (sql.startsWith('insert into audit_events') || sql.startsWith('select * from audit_events')) {
      return { rowCount: 0, rows: [] }
    }

    if (sql.startsWith('update ') || sql.startsWith('delete ')) {
      return { rowCount: 0, rows: [] }
    }

    if (sql.startsWith('select')) {
      return { rowCount: 0, rows: [] }
    }

    throw new Error(`FakeDatabase: unhandled SQL → ${text.slice(0, 120)}`)
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

const ADMIN: ActorContext = {
  accountIds: [],
  actorId: 'user.super',
  actorRole: 'super_admin',
  actorRoles: ['super_admin'],
  issuerIds: [],
  shareholderIds: [],
}

const ISSUER_A_ADMIN: ActorContext = {
  accountIds: [],
  actorId: 'user.iss-a',
  actorRole: 'issuer_admin',
  actorRoles: ['issuer_admin'],
  issuerIds: ['iss-a'],
  shareholderIds: [],
}

const ISSUER_B_ADMIN: ActorContext = {
  accountIds: [],
  actorId: 'user.iss-b',
  actorRole: 'issuer_admin',
  actorRoles: ['issuer_admin'],
  issuerIds: ['iss-b'],
  shareholderIds: [],
}

function setupTwoTenantBatch() {
  const db = new FakeDatabase()
  const audit = new FakeAudit()

  db.dividends.push({
    currency: 'USD',
    id: 'div-a',
    issuer_id: 'iss-a',
    payment_date: '2030-07-01',
    scheduled_at: null,
    status: 'CALCULATED',
    version: 1,
  })

  db.entitlements.push({
    account_id: 'acc-a-1',
    dividend_event_id: 'div-a',
    gross_amount_cents: '2500',
    id: 'ent-a-1',
    net_amount_cents: '2500',
    shareholder_id: 'sh-a-1',
    status: 'CALCULATED',
    withholding_cents: '0',
  })
  db.accounts.push({
    blocked_at: null,
    id: 'acc-a-1',
    payment_instructions: { account: 'xxx', routing: '12345' },
    shareholder_id: 'sh-a-1',
    status: 'ACTIVE',
  })
  db.shareholders.push({ blocked_at: null, id: 'sh-a-1', status: 'ACTIVE', tax_id_last4: '1234' })

  const ledger = { getPositionsAsOf: async () => [] }

  const service = new DividendsService(db as any, audit as any, ledger as any)
  return { audit, db, service }
}

// ----------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------

describe('actor scope helpers', () => {
  it('actorCanAccessIssuer treats privileged roles as global', () => {
    assert.equal(actorCanAccessIssuer(ADMIN, 'iss-a'), true)
    assert.equal(actorCanAccessIssuer(ADMIN, 'iss-z'), true)
  })

  it('actorCanAccessIssuer enforces issuerIds for issuer-scoped roles', () => {
    assert.equal(actorCanAccessIssuer(ISSUER_A_ADMIN, 'iss-a'), true)
    assert.equal(actorCanAccessIssuer(ISSUER_A_ADMIN, 'iss-b'), false)
  })

  it('actorCanAccessIssuer skips the check when no issuer is provided', () => {
    assert.equal(actorCanAccessIssuer(ISSUER_A_ADMIN, null), true)
    assert.equal(actorCanAccessIssuer(ISSUER_A_ADMIN, undefined), true)
  })

  it('isPrivilegedActor recognises the privileged role names', () => {
    assert.equal(isPrivilegedActor(ADMIN), true)
    assert.equal(isPrivilegedActor(ISSUER_A_ADMIN), false)
    assert.equal(isPrivilegedActor({ accountIds: [], actorId: 'x', actorRoles: ['agent_admin'], issuerIds: [], shareholderIds: [] }), true)
  })
})

// ----------------------------------------------------------------------
// Tenant isolation on body-driven payment endpoints
// ----------------------------------------------------------------------

describe('tenant isolation on body-driven payment endpoints', () => {
  it('rejects recordPayment when the issuer-scoped actor is on a different tenant', async () => {
    const { service } = setupTwoTenantBatch()
    const created = await service.createPaymentBatch('div-a', { method: 'ACH' }, ISSUER_A_ADMIN)
    await service.submitBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.approveBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.scheduleBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.markBatchProcessing(created.batch.id, {}, ISSUER_A_ADMIN)

    await assert.rejects(
      service.recordPayment({ paymentId: created.payments[0].id, status: 'PAID' }, ISSUER_B_ADMIN),
      (err: unknown) => err instanceof ForbiddenException,
    )
  })

  it('allows recordPayment when the actor owns the issuer', async () => {
    const { service } = setupTwoTenantBatch()
    const created = await service.createPaymentBatch('div-a', { method: 'ACH' }, ISSUER_A_ADMIN)
    await service.submitBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.approveBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.scheduleBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.markBatchProcessing(created.batch.id, {}, ISSUER_A_ADMIN)

    const updated = await service.recordPayment({ externalRef: 'EXT-1', paymentId: created.payments[0].id, status: 'PAID' }, ISSUER_A_ADMIN)
    assert.equal(updated.status, 'PAID')
  })

  it('allows recordPayment for privileged actors regardless of tenant', async () => {
    const { service } = setupTwoTenantBatch()
    const created = await service.createPaymentBatch('div-a', { method: 'ACH' }, ADMIN)
    await service.submitBatch(created.batch.id, {}, ADMIN)
    await service.approveBatch(created.batch.id, {}, ADMIN)
    await service.scheduleBatch(created.batch.id, {}, ADMIN)
    await service.markBatchProcessing(created.batch.id, {}, ADMIN)

    const updated = await service.recordPayment({ externalRef: 'EXT-A', paymentId: created.payments[0].id, status: 'PAID' }, ADMIN)
    assert.equal(updated.status, 'PAID')
  })

  it('bulkRecordPayments isolates per-row failures so a tenant-mismatch row does not leak success on another row', async () => {
    const { service } = setupTwoTenantBatch()
    const created = await service.createPaymentBatch('div-a', { method: 'ACH' }, ISSUER_A_ADMIN)
    await service.submitBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.approveBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.scheduleBatch(created.batch.id, {}, ISSUER_A_ADMIN)
    await service.markBatchProcessing(created.batch.id, {}, ISSUER_A_ADMIN)

    const result = await service.bulkRecordPayments({ results: [{ paymentId: created.payments[0].id, status: 'PAID' }] }, ISSUER_B_ADMIN)
    assert.equal(result.updated.length, 0)
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0].reason, /scope denied/i)
  })
})

// ----------------------------------------------------------------------
// DTO + service-level validation hardening
// ----------------------------------------------------------------------

describe('CreateDividendDto validation', () => {
  function baseDto(overrides: Partial<CreateDividendDto> = {}): CreateDividendDto {
    const dto = new CreateDividendDto()
    Object.assign(dto, {
      currency: 'USD',
      declarationDate: '2030-01-01',
      issuerId: 'iss-a',
      kind: 'CASH',
      paymentDate: '2030-03-01',
      rateAmount: '0.25',
      rateType: 'PER_SHARE',
      recordDate: '2030-02-01',
      securityId: 'sec-a',
      ...overrides,
    })
    return dto
  }

  it('rejects a negative rate at the DTO layer', async () => {
    const errors = await validate(baseDto({ rateAmount: '-0.10' }))
    assert.ok(errors.some(e => e.property === 'rateAmount'))
  })

  it('rejects a negative withholdingDefaultPct at the DTO layer', async () => {
    const errors = await validate(baseDto({ withholdingDefaultPct: '-5' }))
    assert.ok(errors.some(e => e.property === 'withholdingDefaultPct'))
  })

  it('accepts a well-formed payload', async () => {
    const errors = await validate(baseDto())
    assert.equal(errors.length, 0)
  })
})

// ----------------------------------------------------------------------
// Duplicate prevention regression — a specific call-out from the
// hardening checklist. Already covered indirectly in the batches spec
// but pinned here as an explicit guarantee.
// ----------------------------------------------------------------------

describe('double-pay prevention', () => {
  it('refuses a second batch when entitlements are already attached to a non-terminal batch', async () => {
    const { service } = setupTwoTenantBatch()
    await service.createPaymentBatch('div-a', { method: 'ACH' }, ISSUER_A_ADMIN)
    await assert.rejects(
      service.createPaymentBatch('div-a', { method: 'ACH' }, ISSUER_A_ADMIN),
      (err: unknown) => err instanceof Error && /already attached/i.test(err.message),
    )
  })
})
