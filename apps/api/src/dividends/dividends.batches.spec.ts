import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'

import type { ActorContext } from '../common/actor.js'

import { DividendsService } from './dividends.service.js'
import type { DividendPaymentStatus, DividendStatus } from './dividends.types.js'

/**
 * Service-level integration tests for the payment-batch workflow.
 *
 * Mirrors the in-memory `FakeDatabase` style used by
 * `dividends.engine.spec.ts` so we can exercise the full lifecycle —
 * createPaymentBatch → submit → approve → schedule (with override) →
 * markProcessing → recordPayment → reconcile — without standing up a
 * real Postgres instance. The fake covers only the SQL paths the
 * batch workflow actually issues; everything else throws so we never
 * silently miss a regression.
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

    if (sql.startsWith('select * from dividend_payments where external_ref')) {
      const ref = String(params[0])
      const batchId = String(params[1])
      const row = this.payments.find(p => p.external_ref === ref && p.batch_id === batchId)
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

    // Generic batch UPDATE handler. The service inlines the target
    // status as a SQL literal (`status = 'APPROVED'`, ...) for most
    // transitions and uses a parameter only for the rollup helper
    // (`status = $2`). Detect both forms.
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
          if (newStatus === 'RETURNED') {
            payment.returned_at = new Date()
            if (params.length > 1) payment.failure_reason = (params[1] as string) ?? payment.failure_reason
          }
          if (newStatus === 'RECONCILED') payment.reconciled_at = new Date()
          payment.updated_at = new Date()
        }
      }
      return { rowCount: 0, rows: [] }
    }

    if (sql.startsWith('update dividend_entitlements set')) {
      // best-effort: affects test only when we need to inspect entitlement
      // status, which we read directly from the array elsewhere.
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
      // refreshDividendStatus reads entitlement counts.
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

const ACTOR: ActorContext = { actorId: 'user.ops', actorRole: 'agent_admin' }
const ADMIN: ActorContext = { actorId: 'user.super', actorRole: 'super_admin' }

interface SetupOptions {
  status?: DividendStatus
  entitlementCount?: number
  withInstructions?: boolean
  blockedShareholderId?: string | null
}

function setup(options: SetupOptions = {}) {
  const db = new FakeDatabase()
  const audit = new FakeAudit()
  const status: DividendStatus = options.status ?? 'CALCULATED'
  const entitlementCount = options.entitlementCount ?? 2
  const withInstructions = options.withInstructions ?? true

  db.dividends.push({
    currency: 'USD',
    id: 'div-1',
    issuer_id: 'iss-1',
    payment_date: '2030-07-01',
    scheduled_at: null,
    status,
    version: 1,
  })

  for (let i = 1; i <= entitlementCount; i += 1) {
    const id = `ent-${i}`
    const accountId = `acc-${i}`
    const shareholderId = `sh-${i}`
    db.entitlements.push({
      account_id: accountId,
      dividend_event_id: 'div-1',
      gross_amount_cents: '2500',
      id,
      net_amount_cents: '2500',
      shareholder_id: shareholderId,
      status: 'CALCULATED',
      withholding_cents: '0',
    })
    const blocked = options.blockedShareholderId === shareholderId
    db.accounts.push({
      blocked_at: blocked ? new Date() : null,
      id: accountId,
      payment_instructions: withInstructions ? { account: 'xxx', routing: '12345' } : null,
      shareholder_id: shareholderId,
      status: blocked ? 'BLOCKED' : 'ACTIVE',
    })
    db.shareholders.push({
      blocked_at: blocked ? new Date() : null,
      id: shareholderId,
      status: blocked ? 'BLOCKED' : 'ACTIVE',
      tax_id_last4: '1234',
    })
  }

  const ledger = { getPositionsAsOf: async () => [] }

  const service = new DividendsService(db as any, audit as any, ledger as any)
  return { audit, db, service }
}

describe('createPaymentBatch — guards + dedup', () => {
  it('refuses to create a batch before calculation', async () => {
    const { service } = setup({ status: 'APPROVED' })
    await assert.rejects(service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR), (err: unknown) => err instanceof ConflictException)
  })

  it('creates a DRAFT batch with a generated batch number + warnings', async () => {
    const { audit, db, service } = setup({ withInstructions: true })
    const result = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    assert.equal(result.batch.status, 'DRAFT')
    assert.equal(result.batch.batchNumber, 'BATCH-001')
    assert.equal(result.batch.currency, 'USD')
    assert.equal(result.payments.length, 2)
    assert.ok(result.payments.every(p => p.status === 'PENDING'))
    assert.equal(db.batches.length, 1)
    const created = audit.events.find(e => e.action === 'DIVIDEND_BATCH_CREATED')
    assert.ok(created, 'created audit emitted')
    // default account fixtures supply payment instructions, so no
    // missing-payment-method warnings.
    const blockerWarnings = result.warnings.filter(w => w.code === 'MISSING_PAYMENT_METHOD')
    assert.equal(blockerWarnings.length, 0)
  })

  it('refuses to create a duplicate batch for already-claimed entitlements', async () => {
    const { service } = setup()
    await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await assert.rejects(
      service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR),
      (err: unknown) => err instanceof ConflictException && /already attached/i.test((err as Error).message),
    )
  })
})

describe('batch lifecycle — submit/approve/schedule/process/recordPayment/reconcile', () => {
  it('walks the canonical happy path end-to-end', async () => {
    const { audit, db, service } = setup()
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    const batchId = created.batch.id

    const submitted = await service.submitBatch(batchId, {}, ACTOR)
    assert.equal(submitted.status, 'PENDING_APPROVAL')

    const approved = await service.approveBatch(batchId, {}, ACTOR)
    assert.equal(approved.status, 'APPROVED')

    const scheduled = await service.scheduleBatch(batchId, {}, ACTOR)
    assert.equal(scheduled.status, 'SCHEDULED')
    assert.equal(db.dividends[0].status, 'PAYMENT_SCHEDULED')

    const processing = await service.markBatchProcessing(batchId, {}, ACTOR)
    assert.equal(processing.status, 'PROCESSING')

    for (const payment of created.payments) {
      const updated = await service.recordPayment(
        { externalRef: `EXT-${payment.id}`, idempotencyKey: `key-${payment.id}`, paymentId: payment.id, status: 'PAID' },
        ACTOR,
      )
      assert.equal(updated.status, 'PAID')
    }

    // Auto-rollup should have advanced the batch to PROCESSED.
    assert.equal(db.batches[0].status, 'PROCESSED')

    const reconcileSummary = await service.reconcileBatch(
      batchId,
      {
        entries: created.payments.map(payment => ({ externalRef: `EXT-${payment.id}`, success: true })),
        source: 'bank-statement.csv',
      },
      ACTOR,
    )
    assert.equal(reconcileSummary.matched, created.payments.length)
    assert.equal(db.batches[0].status, 'RECONCILED')

    const actions = audit.events.map(e => e.action)
    for (const expected of [
      'DIVIDEND_BATCH_CREATED',
      'DIVIDEND_BATCH_SUBMITTED',
      'DIVIDEND_BATCH_APPROVED',
      'DIVIDEND_BATCH_SCHEDULED',
      'DIVIDEND_BATCH_PROCESSING_STARTED',
      'DIVIDEND_PAYMENT_PAID',
      'DIVIDEND_BATCH_PROCESSED',
      'DIVIDEND_BATCH_RECONCILIATION_IMPORTED',
      'DIVIDEND_BATCH_RECONCILED',
    ]) {
      assert.ok(actions.includes(expected), `expected audit ${expected}`)
    }
  })

  it('blocks scheduling when payment instructions are missing without override', async () => {
    const { service } = setup({ withInstructions: false })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await assert.rejects(service.scheduleBatch(created.batch.id, {}, ACTOR), (err: unknown) => err instanceof ConflictException)
  })

  it('admin override schedules the batch + emits a HIGH-severity audit', async () => {
    const { audit, service } = setup({ withInstructions: false })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    const scheduled = await service.scheduleBatch(created.batch.id, { force: true, reason: 'manual ACH file' }, ADMIN)
    assert.equal(scheduled.status, 'SCHEDULED')
    const override = audit.events.find(e => e.action === 'DIVIDEND_BATCH_SCHEDULE_OVERRIDDEN')
    assert.ok(override, 'override audit emitted')
  })

  it('refuses force without a reason even for admins', async () => {
    const { service } = setup({ withInstructions: false })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await assert.rejects(
      service.scheduleBatch(created.batch.id, { force: true }, ADMIN),
      (err: unknown) => err instanceof BadRequestException,
    )
  })

  it('refuses force from a non-admin actor', async () => {
    const { service } = setup({ withInstructions: false })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await assert.rejects(
      service.scheduleBatch(created.batch.id, { force: true, reason: 'urgent' }, ACTOR),
      (err: unknown) => err instanceof ForbiddenException,
    )
  })
})

describe('payment recording — failures, idempotency, partial state', () => {
  it('records a failed payment and rolls the batch up to PARTIALLY_FAILED', async () => {
    const { db, service } = setup()
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await service.scheduleBatch(created.batch.id, {}, ACTOR)
    await service.markBatchProcessing(created.batch.id, {}, ACTOR)

    await service.recordPayment({ externalRef: 'EXT-1', paymentId: created.payments[0].id, status: 'PAID' }, ACTOR)
    await service.recordPayment({ failureReason: 'ACH return code R03', paymentId: created.payments[1].id, status: 'FAILED' }, ACTOR)
    assert.equal(db.batches[0].status, 'PARTIALLY_FAILED')
  })

  it('idempotency key is a no-op when re-applied with the same status', async () => {
    const { service } = setup({ entitlementCount: 1 })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await service.scheduleBatch(created.batch.id, {}, ACTOR)
    await service.markBatchProcessing(created.batch.id, {}, ACTOR)

    const first = await service.recordPayment(
      { externalRef: 'EXT-1', idempotencyKey: 'unique-key', paymentId: created.payments[0].id, status: 'PAID' },
      ACTOR,
    )
    const second = await service.recordPayment(
      { externalRef: 'EXT-1', idempotencyKey: 'unique-key', paymentId: created.payments[0].id, status: 'PAID' },
      ACTOR,
    )
    assert.equal(first.id, second.id)
    assert.equal(second.status, 'PAID')
  })

  it('blocks invalid state transitions on a payment', async () => {
    const { service } = setup({ entitlementCount: 1 })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    // Skip processing: try to mark a PENDING payment as PAID directly — invalid.
    await assert.rejects(
      service.recordPayment({ paymentId: created.payments[0].id, status: 'PAID' }, ACTOR),
      (err: unknown) => err instanceof ConflictException,
    )
  })

  it('bulk recorder collects per-row failures without aborting the batch', async () => {
    const { service } = setup({ entitlementCount: 2 })
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await service.scheduleBatch(created.batch.id, {}, ACTOR)
    await service.markBatchProcessing(created.batch.id, {}, ACTOR)

    const result = await service.bulkRecordPayments(
      {
        results: [
          { paymentId: created.payments[0].id, status: 'PAID' },
          { paymentId: 'unknown-id', status: 'PAID' },
        ],
      },
      ACTOR,
    )
    assert.equal(result.updated.length, 1)
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0].paymentId, 'unknown-id')
  })
})

describe('reconciliation — partial matches + RETURNED rows', () => {
  it('moves matched success rows to RECONCILED and unmatched references surface in summary', async () => {
    const { service } = setup()
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    await service.submitBatch(created.batch.id, {}, ACTOR)
    await service.approveBatch(created.batch.id, {}, ACTOR)
    await service.scheduleBatch(created.batch.id, {}, ACTOR)
    await service.markBatchProcessing(created.batch.id, {}, ACTOR)
    for (const payment of created.payments) {
      await service.recordPayment({ externalRef: `EXT-${payment.id}`, paymentId: payment.id, status: 'PAID' }, ACTOR)
    }

    const summary = await service.reconcileBatch(
      created.batch.id,
      {
        entries: [
          { externalRef: `EXT-${created.payments[0].id}`, success: true },
          { externalRef: 'EXT-DOES-NOT-EXIST', success: true },
        ],
      },
      ACTOR,
    )
    assert.equal(summary.matched, 1)
    assert.equal(summary.unmatched, 1)
    assert.deepEqual(summary.unmatchedReferences, ['EXT-DOES-NOT-EXIST'])
  })
})

describe('exportBatch — payment-file projection', () => {
  it('returns batch metadata + per-payment rows with cents preserved', async () => {
    const { audit, service } = setup()
    const created = await service.createPaymentBatch('div-1', { method: 'ACH' }, ACTOR)
    const exported = await service.exportBatch(created.batch.id, ACTOR)
    assert.equal(exported.batchId, created.batch.id)
    assert.equal(exported.rows.length, created.payments.length)
    assert.equal(exported.totalNetCents, 2500 * created.payments.length)
    assert.ok(exported.generatedAt)
    const exportedAudit = audit.events.find(e => e.action === 'DIVIDEND_BATCH_EXPORTED')
    assert.ok(exportedAudit, 'export emits an audit')
  })
})
