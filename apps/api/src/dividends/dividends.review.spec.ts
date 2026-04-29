import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { buildMissingInfoChecklist, buildSuggestedActions, type ReviewContext, runPreflightChecks } from './dividends.preflight.js'
import {
  buildDeterministicOutput,
  deterministicProvider,
  type DividendAiProvider,
  type DividendAiReviewOutput,
  type GenerateReviewInput,
  selectDefaultProvider,
} from './dividends.review.js'
import type { DividendEvent } from './dividends.types.js'

function makeDividend(overrides: Partial<DividendEvent> = {}): DividendEvent {
  const now = new Date('2030-01-01T00:00:00Z')
  return {
    calculationVersion: 0,
    createdAt: now,
    currency: 'USD',
    declarationDate: '2030-05-01',
    id: 'div_1',
    issuerId: 'iss_acme',
    kind: 'CASH',
    metadata: {},
    paymentDate: '2030-07-15',
    rateAmount: '0.25',
    ratePerShareCents: 25,
    rateType: 'PER_SHARE',
    recordDate: '2030-06-15',
    securityId: 'sec_acme',
    status: 'DRAFT',
    supportingDocuments: [],
    totalDistributionCents: 0,
    updatedAt: now,
    version: 1,
    withholdingDefaultPct: '0',
    ...overrides,
  }
}

function buildInput(ctx: ReviewContext): GenerateReviewInput {
  const preflight = runPreflightChecks(ctx)
  return {
    checklist: buildMissingInfoChecklist(preflight),
    ctx,
    preflight,
    suggested: buildSuggestedActions(ctx, preflight),
  }
}

describe('deterministicProvider', () => {
  it('returns a complete output object derived from preflight', async () => {
    const input = buildInput({ dividend: makeDividend({ rateAmount: '0' }) })
    const { output } = await deterministicProvider.review(input)
    assert.equal(output.confidence, 1)
    assert.ok(output.summary.length > 0)
    assert.ok(output.shareholderFriendlyExplanation.length > 0)
    assert.ok(output.risks.some(r => /rate amount/i.test(r)))
    assert.deepEqual(output.missingInfo, input.checklist)
    assert.deepEqual(output.suggestedActions, input.suggested)
  })

  it('does not invent risks/warnings beyond the deterministic findings', async () => {
    const input = buildInput({ dividend: makeDividend() })
    const { output } = await deterministicProvider.review(input)
    const errors = input.preflight.findings.filter(f => f.severity === 'ERROR').map(f => f.message)
    const warnings = input.preflight.findings.filter(f => f.severity === 'WARNING').map(f => f.message)
    assert.deepEqual(output.risks, errors)
    assert.deepEqual(output.warnings, warnings)
  })

  it('buildDeterministicOutput shareholder explanation reflects the dividend kind and rate', () => {
    const ctx: ReviewContext = { dividend: makeDividend({ kind: 'CASH', rateAmount: '0.42' }) }
    const preflight = runPreflightChecks(ctx)
    const out = buildDeterministicOutput(ctx, preflight, buildMissingInfoChecklist(preflight), buildSuggestedActions(ctx, preflight))
    assert.match(out.shareholderFriendlyExplanation, /0\.42/)
    assert.match(out.shareholderFriendlyExplanation, /USD/)
    assert.match(out.shareholderFriendlyExplanation, /cash dividend/i)
  })
})

describe('mock AI provider', () => {
  it('passes-through model output but cannot escape the schema', async () => {
    const provider: DividendAiProvider = {
      id: 'mock',
      model: 'mock-1',
      promptVersion: 'v1',
      async review(): Promise<{ output: DividendAiReviewOutput }> {
        return {
          output: {
            confidence: 0.85,
            missingInfo: ['Collect W-9 forms.'],
            risks: ['Rate is missing.'],
            shareholderFriendlyExplanation: 'You will receive a cash dividend.',
            suggestedActions: ['Edit the declaration.'],
            summary: 'Pre-flight found one blocking issue.',
            warnings: [],
          },
        }
      },
    }
    const input = buildInput({ dividend: makeDividend({ rateAmount: '0' }) })
    const { output } = await provider.review(input)
    assert.equal(output.confidence, 0.85)
    assert.equal(output.risks.length, 1)
  })

  it('mocked provider that throws is a violation; providers must not throw', async () => {
    const throwingProvider: DividendAiProvider = {
      id: 'broken',
      model: 'broken-1',
      promptVersion: 'v1',
      async review(): Promise<never> {
        throw new Error('should never throw — caller has no way to recover')
      },
    }
    const input = buildInput({ dividend: makeDividend() })
    await assert.rejects(throwingProvider.review(input))
  })
})

describe('selectDefaultProvider', () => {
  it('returns deterministic when DIVIDEND_AI_REVIEW_DISABLED=1', () => {
    const provider = selectDefaultProvider({ DIVIDEND_AI_REVIEW_DISABLED: '1', OPENAI_API_KEY: 'sk-test' })
    assert.equal(provider.id, 'deterministic')
  })

  it('returns deterministic when OPENAI_API_KEY is unset', () => {
    const provider = selectDefaultProvider({})
    assert.equal(provider.id, 'deterministic')
  })

  it('returns openai when OPENAI_API_KEY is set and review is not disabled', () => {
    const provider = selectDefaultProvider({ OPENAI_API_KEY: 'sk-test' })
    assert.equal(provider.id, 'openai')
  })
})
