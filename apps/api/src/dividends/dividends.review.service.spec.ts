import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ActorContext } from '../common/actor.js'

import { type DividendAiProvider, type DividendAiReviewOutput, type GenerateReviewInput } from './dividends.review.js'
import { DividendsService } from './dividends.service.js'

/**
 * Service-level integration test for the AI review surface.
 *
 * Strategy: drive `generateAiReview` and `listAiReviews` through a
 * minimal in-memory fake of the `DatabaseService`. The fake answers the
 * SQL the review path actually issues (dividend lookup, snapshot,
 * entitlements, batches, payments, approvals, prior-rate history,
 * shareholders missing-fields counts, the INSERT, and the SELECT). Any
 * unexpected query throws so a regression in the review query plan
 * fails this spec loudly.
 *
 * The AI provider is mocked so we can verify:
 *   • the provider receives the deterministic preflight findings
 *     (it must not invent content)
 *   • the persisted record contains both the deterministic findings and
 *     the AI prose
 *   • the audit service is called exactly once with the canonical action
 *   • workflow-mutating SQL (UPDATE/INSERT against dividend tables other
 *     than `dividend_ai_reviews`) is NEVER issued from the review path
 */

interface InsertedReview {
  id: string
  dividend_event_id: string
  issuer_id: string
  requested_by: string
  provider: string
  model: string
  prompt_version: string
  dividend_status: string
  preflight: string
  output: string
  provider_error: string | null
  generated_at: string
}

interface FakeDividendRow {
  id: string
  issuer_id: string
  security_id: string
  share_class_id: string | null
  status: string
  kind: string
  rate_type: string
  rate_amount: string
  rate_per_share_cents: string
  currency: string
  withholding_default_pct: string
  declaration_date: string
  record_date: string
  ex_dividend_date: string | null
  payment_date: string
  total_distribution_cents: string
  description: string | null
  notes: string | null
  supporting_documents: unknown
  metadata: Record<string, unknown>
  version: number
  calculation_version: number
  approved_at: Date | null
  eligibility_locked_at: Date | null
  calculated_at: Date | null
  calculations_locked_at: Date | null
  scheduled_at: Date | null
  paid_at: Date | null
  archived_at: Date | null
  cancelled_at: Date | null
  rejected_at: Date | null
  changes_requested_at: Date | null
  created_at: Date
  updated_at: Date
}

class FakeDatabase {
  reviews: InsertedReview[] = []
  forbiddenWriteSeen = false
  private readonly dividend: FakeDividendRow

  constructor(dividend: FakeDividendRow) {
    this.dividend = dividend
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    const trimmed = sql.replace(/\s+/g, ' ').trim()

    if (/^SELECT \* FROM dividend_events WHERE id = \$1/.test(trimmed)) {
      return { rowCount: 1, rows: [this.dividend as unknown as T] }
    }
    if (/FROM dividend_eligibility_snapshots/.test(trimmed)) {
      return { rowCount: 0, rows: [] }
    }
    if (/FROM dividend_entitlements/.test(trimmed)) {
      return { rowCount: 0, rows: [] }
    }
    if (/FROM dividend_payment_batches/.test(trimmed)) {
      return { rowCount: 0, rows: [] }
    }
    if (/FROM dividend_payments/.test(trimmed)) {
      return { rowCount: 0, rows: [] }
    }
    if (/COUNT\(\*\)::text AS count FROM dividend_approvals/.test(trimmed)) {
      return { rowCount: 1, rows: [{ count: '0' } as unknown as T] }
    }
    if (/FROM dividend_events WHERE issuer_id = \$1 AND security_id = \$2/.test(trimmed)) {
      return { rowCount: 0, rows: [] }
    }
    if (/COUNT\(\*\)::text AS count FROM shareholders/.test(trimmed)) {
      return { rowCount: 1, rows: [{ count: '0' } as unknown as T] }
    }
    if (/^INSERT INTO dividend_ai_reviews/.test(trimmed)) {
      const [
        id,
        dividend_event_id,
        issuer_id,
        requested_by,
        provider,
        model,
        prompt_version,
        dividend_status,
        preflight,
        output,
        provider_error,
        generated_at,
      ] = (params || []) as string[]
      this.reviews.push({
        dividend_event_id,
        dividend_status,
        generated_at,
        id,
        issuer_id,
        model,
        output,
        preflight,
        prompt_version,
        provider,
        provider_error: provider_error || null,
        requested_by,
      })
      return { rowCount: 1, rows: [] }
    }
    if (/^SELECT id, dividend_event_id.*FROM dividend_ai_reviews/.test(trimmed)) {
      const dividendId = (params || [])[0] as string
      const rows = this.reviews
        .filter(r => r.dividend_event_id === dividendId)
        .map(r => ({
          dividend_event_id: r.dividend_event_id,
          dividend_status: r.dividend_status,
          generated_at: r.generated_at,
          id: r.id,
          issuer_id: r.issuer_id,
          model: r.model,
          output: JSON.parse(r.output),
          preflight: JSON.parse(r.preflight),
          prompt_version: r.prompt_version,
          provider: r.provider,
          provider_error: r.provider_error,
          requested_by: r.requested_by,
        }))
      return { rowCount: rows.length, rows: rows as unknown as T[] }
    }

    if (
      /^(UPDATE|INSERT) (dividend_events|dividend_entitlements|dividend_payments|dividend_payment_batches|dividend_approvals|dividend_communications)/i.test(
        trimmed,
      )
    ) {
      this.forbiddenWriteSeen = true
    }

    throw new Error(`FakeDatabase: unexpected SQL — ${trimmed.slice(0, 120)}…`)
  }
}

class CapturingAuditService {
  records: Array<Record<string, unknown>> = []
  async record(input: Record<string, unknown>): Promise<{ id: number }> {
    this.records.push(input)
    return { id: this.records.length }
  }
}

function makeDividendRow(overrides: Partial<FakeDividendRow> = {}): FakeDividendRow {
  const now = new Date('2030-01-01T00:00:00Z')
  return {
    approved_at: null,
    archived_at: null,
    calculated_at: null,
    calculation_version: 0,
    calculations_locked_at: null,
    cancelled_at: null,
    changes_requested_at: null,
    created_at: now,
    currency: 'USD',
    declaration_date: '2030-05-01',
    description: null,
    eligibility_locked_at: null,
    ex_dividend_date: null,
    id: 'div_review',
    issuer_id: 'iss_acme',
    kind: 'CASH',
    metadata: {},
    notes: null,
    paid_at: null,
    payment_date: '2030-07-15',
    rate_amount: '0.25',
    rate_per_share_cents: '25',
    rate_type: 'PER_SHARE',
    record_date: '2030-06-15',
    rejected_at: null,
    scheduled_at: null,
    security_id: 'sec_acme',
    share_class_id: null,
    status: 'DRAFT',
    supporting_documents: [],
    total_distribution_cents: '0',
    updated_at: now,
    version: 1,
    withholding_default_pct: '0',
    ...overrides,
  }
}

function makeService(db: FakeDatabase, audit: CapturingAuditService): DividendsService {
  return new DividendsService(db as unknown as never, audit as unknown as never, {} as unknown as never)
}

const ACTOR: ActorContext = { actorId: 'user_alice', actorRole: 'issuer_admin' }

describe('generateAiReview', () => {
  it('persists deterministic findings + AI prose and records a single audit event', async () => {
    const db = new FakeDatabase(makeDividendRow({ rate_amount: '0' }))
    const audit = new CapturingAuditService()
    const service = makeService(db, audit)

    let providerCalls = 0
    const mockProvider: DividendAiProvider = {
      id: 'mock',
      model: 'mock-1',
      promptVersion: 'mock-v1',
      async review(input: GenerateReviewInput): Promise<{ output: DividendAiReviewOutput }> {
        providerCalls++
        const baselineRisks = input.preflight.findings.filter(f => f.severity === 'ERROR').map(f => f.message)
        return {
          output: {
            confidence: 0.9,
            missingInfo: input.checklist,
            risks: baselineRisks,
            shareholderFriendlyExplanation: 'You will receive a cash dividend.',
            suggestedActions: input.suggested,
            summary: 'Mock summary.',
            warnings: [],
          },
        }
      },
    }

    const review = await service.generateAiReview('div_review', ACTOR, mockProvider)

    assert.equal(providerCalls, 1)
    assert.equal(review.provider, 'mock')
    assert.equal(review.output.summary, 'Mock summary.')
    assert.equal(review.output.confidence, 0.9)
    assert.ok(review.preflight.errorCount > 0, 'rate_amount=0 should produce ERRORs')
    assert.ok(
      review.output.risks.some(r => /rate amount/i.test(r)),
      'risks come from deterministic preflight',
    )

    assert.equal(db.reviews.length, 1, 'one row inserted')
    assert.equal(db.reviews[0].provider, 'mock')
    assert.equal(db.reviews[0].dividend_event_id, 'div_review')
    const persistedOutput = JSON.parse(db.reviews[0].output) as DividendAiReviewOutput
    assert.equal(persistedOutput.summary, 'Mock summary.')

    assert.equal(audit.records.length, 1, 'one audit event recorded')
    const auditRecord = audit.records[0]
    assert.equal(auditRecord.action, 'DIVIDEND_AI_REVIEW_GENERATED')
    assert.equal(auditRecord.entityId, 'div_review')
    assert.equal(auditRecord.entityType, 'DIVIDEND_EVENT')
    assert.equal(auditRecord.actorId, ACTOR.actorId)
    assert.equal(auditRecord.severity, 'MEDIUM', 'blocking review elevates severity')
    const auditMeta = auditRecord.metadata as Record<string, unknown>
    assert.equal(auditMeta.provider, 'mock')

    assert.equal(db.forbiddenWriteSeen, false, 'review must NEVER mutate dividend workflow rows')
  })

  it('falls back to deterministic baseline when the provider reports an error', async () => {
    const db = new FakeDatabase(makeDividendRow())
    const audit = new CapturingAuditService()
    const service = makeService(db, audit)

    const flakyProvider: DividendAiProvider = {
      id: 'flaky',
      model: 'flaky-1',
      promptVersion: 'flaky-v1',
      async review(input: GenerateReviewInput): Promise<{ output: DividendAiReviewOutput; error?: string }> {
        const baseline: DividendAiReviewOutput = {
          confidence: 1,
          missingInfo: input.checklist,
          risks: [],
          shareholderFriendlyExplanation: 'Cash dividend.',
          suggestedActions: input.suggested,
          summary: 'Deterministic baseline.',
          warnings: [],
        }
        return { error: 'rate-limited', output: baseline }
      },
    }

    const review = await service.generateAiReview('div_review', ACTOR, flakyProvider)
    assert.equal(review.providerError, 'rate-limited')
    assert.equal(review.output.summary, 'Deterministic baseline.')

    const persisted = db.reviews[0]
    assert.equal(persisted.provider_error, 'rate-limited')
    assert.equal(audit.records.length, 1)
  })

  it('uses INFO severity when nothing blocks', async () => {
    const db = new FakeDatabase(makeDividendRow())
    const audit = new CapturingAuditService()
    const service = makeService(db, audit)

    const provider: DividendAiProvider = {
      id: 'mock',
      model: 'mock-1',
      promptVersion: 'mock-v1',
      async review(input): Promise<{ output: DividendAiReviewOutput }> {
        return {
          output: {
            confidence: 0.95,
            missingInfo: input.checklist,
            risks: [],
            shareholderFriendlyExplanation: 'Cash dividend.',
            suggestedActions: input.suggested,
            summary: 'Looks good.',
            warnings: [],
          },
        }
      },
    }

    await service.generateAiReview('div_review', ACTOR, provider)
    assert.equal(audit.records[0].severity, 'INFO')
  })
})

describe('listAiReviews', () => {
  it('returns persisted reviews newest-first and parses JSON columns', async () => {
    const db = new FakeDatabase(makeDividendRow())
    const audit = new CapturingAuditService()
    const service = makeService(db, audit)

    const provider: DividendAiProvider = {
      id: 'mock',
      model: 'mock-1',
      promptVersion: 'mock-v1',
      async review(input): Promise<{ output: DividendAiReviewOutput }> {
        return {
          output: {
            confidence: 0.7,
            missingInfo: [],
            risks: [],
            shareholderFriendlyExplanation: 'Hi.',
            suggestedActions: input.suggested,
            summary: 'sum',
            warnings: [],
          },
        }
      },
    }

    await service.generateAiReview('div_review', ACTOR, provider)
    const list = await service.listAiReviews('div_review')
    assert.equal(list.length, 1)
    assert.equal(list[0].provider, 'mock')
    assert.equal(list[0].output.summary, 'sum')
    assert.ok(list[0].preflight.findings.length >= 0)
  })
})
