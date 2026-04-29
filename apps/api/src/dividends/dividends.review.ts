/**
 * AI review schema + provider abstraction for the dividend module.
 *
 * Design constraints:
 *   1. AI is *additive*: it polishes prose around the deterministic
 *      `PreflightReport`, never replaces or invents findings. The report's
 *      `findings` and the AI prose are persisted side-by-side so reviewers
 *      can verify the model didn't hallucinate.
 *   2. AI is *non-actuating*: this layer cannot approve, schedule, mark
 *      paid, or otherwise change dividend state. Endpoints calling it
 *      must wire only read access.
 *   3. AI is *optional*: when no provider is configured (no
 *      `OPENAI_API_KEY`, or `DIVIDEND_AI_REVIEW_DISABLED=1`), the
 *      deterministic provider produces a usable review on its own.
 *
 * The structured output shape (`DividendAiReviewOutput`) is what gets
 * persisted, returned to the API caller, and displayed in the UI card.
 */

import type { PreflightReport, ReviewContext } from './dividends.preflight.js'
import type { DividendStatus } from './dividends.types.js'

// ---------- Output schema --------------------------------------------------

export interface DividendAiReviewOutput {
  /** 1-3 sentence plain-English summary, suitable for an operator dashboard. */
  summary: string
  /** ERROR-level findings, surfaced as risks. */
  risks: string[]
  /** WARNING-level findings, surfaced as warnings. */
  warnings: string[]
  /** "Still missing" checklist, derived from `buildMissingInfoChecklist`. */
  missingInfo: string[]
  /** Concrete next steps, derived from `buildSuggestedActions`. */
  suggestedActions: string[]
  /** A 2-4 sentence shareholder-friendly explanation. */
  shareholderFriendlyExplanation: string
  /** 0..1, the model's self-reported confidence — 1.0 for deterministic-only output. */
  confidence: number
}

// ---------- Persisted record ----------------------------------------------

export interface DividendAiReviewRecord {
  id: string
  dividendEventId: string
  issuerId: string
  /** When the review was generated (server time, not model time). */
  generatedAt: Date
  /** The user/system that requested the review. */
  requestedBy: string
  /** Provider id: 'openai', 'deterministic', etc. */
  provider: string
  /** Model identifier when the provider used one. Empty for the deterministic provider. */
  model: string
  /** Stable prompt version when applicable (lets us re-evaluate after prompt edits). */
  promptVersion: string
  /** Status of the dividend at review time, captured for context. */
  dividendStatus: DividendStatus
  /** The deterministic report — source of truth; AI prose must agree with it. */
  preflight: PreflightReport
  /** The AI-shaped output. */
  output: DividendAiReviewOutput
  /**
   * Optional transport-level error (e.g. timeout) when AI was attempted
   * but failed; the response still succeeds because the deterministic
   * provider is always able to produce output.
   */
  providerError?: string
}

export interface GenerateReviewInput {
  ctx: ReviewContext
  preflight: PreflightReport
  /**
   * Pre-built checklist + suggestions from the preflight module. We let
   * the caller pass these in so the same arrays are used for AI prompt
   * grounding, persistence, and UI rendering.
   */
  checklist: string[]
  suggested: string[]
}

// ---------- Provider interface --------------------------------------------

export interface DividendAiProvider {
  readonly id: string
  readonly model: string
  readonly promptVersion: string
  /**
   * Returns a structured `DividendAiReviewOutput`. Providers MUST NEVER
   * throw; on transport failures they should fall back to the
   * deterministic output and include an error string in the result so
   * the service can persist it.
   */
  review(input: GenerateReviewInput): Promise<{ output: DividendAiReviewOutput; error?: string }>
}

// ---------- Deterministic provider (default fallback) ---------------------

/**
 * Pure provider that never calls a model. Used when no API key is
 * configured, or as the fallback when an AI provider errors out. All
 * AI providers MUST behave at least this well: reflect the deterministic
 * report faithfully and add no fabricated content.
 */
export const deterministicProvider: DividendAiProvider = {
  id: 'deterministic',
  model: '',
  promptVersion: 'deterministic-v1',
  async review({ ctx, preflight, checklist, suggested }) {
    return { output: buildDeterministicOutput(ctx, preflight, checklist, suggested) }
  },
}

export function buildDeterministicOutput(
  ctx: ReviewContext,
  preflight: PreflightReport,
  checklist: string[],
  suggested: string[],
): DividendAiReviewOutput {
  const { dividend } = ctx
  const risks = preflight.findings.filter(f => f.severity === 'ERROR').map(f => f.message)
  const warnings = preflight.findings.filter(f => f.severity === 'WARNING').map(f => f.message)

  const headline = describeStatus(dividend.status)
  const summary = preflight.blocking
    ? `${headline} Found ${preflight.errorCount} blocking issue(s) and ${preflight.warningCount} warning(s) — operator review required before progressing.`
    : preflight.warningCount > 0
      ? `${headline} No blocking issues, but ${preflight.warningCount} warning(s) deserve a quick review.`
      : `${headline} Deterministic checks pass with no warnings — safe to progress at the operator's discretion.`

  const shareholderFriendlyExplanation = buildShareholderExplanation(ctx)

  return {
    confidence: 1,
    missingInfo: checklist,
    risks,
    shareholderFriendlyExplanation,
    suggestedActions: suggested,
    summary,
    warnings,
  }
}

function describeStatus(status: DividendStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'Declaration is approved and ready to lock eligibility.'
    case 'CALCULATED':
      return 'Entitlements are calculated and the dividend is ready for batching.'
    case 'CANCELLED':
      return 'Dividend was cancelled.'
    case 'CHANGES_REQUESTED':
      return 'Approver requested changes — issuer admin should revise and resubmit.'
    case 'DRAFT':
      return 'Dividend is in draft.'
    case 'ELIGIBILITY_LOCKED':
      return 'Eligibility snapshot is locked — entitlements can be calculated.'
    case 'PAID':
      return 'All payments completed.'
    case 'PARTIALLY_PAID':
      return 'Payment is in progress — some payments completed, some still pending or failed.'
    case 'PAYMENT_SCHEDULED':
      return 'Payment batches are scheduled.'
    case 'PENDING_APPROVAL':
      return 'Awaiting approval decision.'
    case 'RECONCILED':
      return 'Payments reconciled with the bank/processor file.'
    case 'REJECTED':
      return 'Declaration was rejected.'
    case 'ARCHIVED':
      return 'Dividend has been archived.'
    default:
      return `Status: ${status}.`
  }
}

function buildShareholderExplanation(ctx: ReviewContext): string {
  const { dividend } = ctx
  const rate = dividend.rateAmount
  const currency = dividend.currency || 'USD'
  const recordDate = dividend.recordDate ? `held on ${dividend.recordDate}` : 'held on the record date'
  const paymentDate = dividend.paymentDate ? ` Payment is scheduled for ${dividend.paymentDate}.` : ''
  switch (dividend.kind) {
    case 'CASH':
      return `Shareholders ${recordDate} are entitled to a cash dividend of ${rate} ${currency} per share.${paymentDate} Tax may be withheld depending on your residency and on-file forms; your statement will show gross, withholding, and net amounts.`
    case 'STOCK':
      return `Shareholders ${recordDate} will receive additional shares according to the declared rate.${paymentDate} Fractional shares may be settled in cash depending on the issuer's policy.`
    case 'SPECIAL':
      return `This is a special distribution to shareholders ${recordDate}.${paymentDate} Your statement will explain the gross, withholding, and net amounts.`
    default:
      return `This dividend pays out to shareholders ${recordDate}.${paymentDate} See your statement for amounts and any tax withholding.`
  }
}

// ---------- OpenAI provider (optional) ------------------------------------

/**
 * OpenAI-backed provider. Imports the SDK lazily so unit tests don't
 * pull in `openai` and so the deterministic path stays free of the
 * dependency. The provider validates and clamps the model output, then
 * fills any missing fields from the deterministic baseline so the API
 * response is always complete.
 */
export class OpenAiDividendReviewProvider implements DividendAiProvider {
  readonly id = 'openai'
  readonly model: string
  readonly promptVersion = 'dividend-review-v1'
  private readonly timeoutMs: number
  private readonly apiKey: string

  constructor(opts: { apiKey: string; model?: string; timeoutMs?: number }) {
    this.apiKey = opts.apiKey
    this.model = opts.model || 'gpt-4.1-mini'
    this.timeoutMs = opts.timeoutMs ?? 6000
  }

  async review(input: GenerateReviewInput): Promise<{ output: DividendAiReviewOutput; error?: string }> {
    const baseline = buildDeterministicOutput(input.ctx, input.preflight, input.checklist, input.suggested)
    type ChatClient = {
      chat: {
        completions: { create: (params: unknown, opts?: unknown) => Promise<{ choices: Array<{ message: { content?: string | null } }> }> }
      }
    }
    type OpenAiCtor = new (config: { apiKey: string }) => ChatClient
    let OpenAI: OpenAiCtor
    try {
      const mod = (await import('openai')) as unknown as { default?: OpenAiCtor } & OpenAiCtor
      OpenAI = (mod.default ?? mod) as OpenAiCtor
    } catch {
      return { error: 'OpenAI SDK not available', output: baseline }
    }
    const client = new OpenAI({ apiKey: this.apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    const prompt = buildPrompt(input, baseline)
    try {
      const response = await client.chat.completions.create(
        {
          messages: [
            { content: SYSTEM_PROMPT, role: 'system' },
            { content: prompt, role: 'user' },
          ],
          model: this.model,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
        { signal: controller.signal },
      )
      const raw = response.choices[0]?.message?.content || '{}'
      const parsed = safeParse(raw)
      const output = mergeWithBaseline(parsed, baseline)
      return { output }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI provider failed'
      return { error: message, output: baseline }
    } finally {
      clearTimeout(timeout)
    }
  }
}

const SYSTEM_PROMPT =
  `You are an assistant that reviews stock dividend declarations on behalf of issuer admins and transfer agents. ` +
  `You may ONLY rephrase or summarize information already present in the supplied DETERMINISTIC_FINDINGS, ` +
  `CHECKLIST, and SUGGESTED_ACTIONS. You MUST NOT invent risks, warnings, dates, amounts, or actions ` +
  `that are not represented in those inputs. You will respond with strict JSON matching the schema described in the user message. ` +
  `Confidence must be a number between 0 and 1. ` +
  `You are not authorized to approve, schedule, or otherwise execute workflow actions; the human operator does that.`

function buildPrompt(input: GenerateReviewInput, baseline: DividendAiReviewOutput): string {
  const compact = {
    DETERMINISTIC_FINDINGS: input.preflight.findings.map(f => ({
      category: f.category,
      code: f.code,
      message: f.message,
      severity: f.severity,
    })),
    CHECKLIST: input.checklist,
    SUGGESTED_ACTIONS: input.suggested,
    DIVIDEND: {
      currency: input.ctx.dividend.currency,
      issuerId: input.ctx.dividend.issuerId,
      kind: input.ctx.dividend.kind,
      paymentDate: input.ctx.dividend.paymentDate,
      rateAmount: input.ctx.dividend.rateAmount,
      rateType: input.ctx.dividend.rateType,
      recordDate: input.ctx.dividend.recordDate,
      securityId: input.ctx.dividend.securityId,
      status: input.ctx.dividend.status,
    },
    BASELINE_TONE: {
      summary: baseline.summary,
      shareholderFriendlyExplanation: baseline.shareholderFriendlyExplanation,
    },
  }
  return [
    'Produce a JSON object with this exact shape:',
    '{ "summary": string,',
    '  "risks": string[],',
    '  "warnings": string[],',
    '  "missingInfo": string[],',
    '  "suggestedActions": string[],',
    '  "shareholderFriendlyExplanation": string,',
    '  "confidence": number }',
    '',
    'Rules:',
    '  • `risks` MUST be drawn from DETERMINISTIC_FINDINGS where severity == "ERROR".',
    '  • `warnings` MUST be drawn from DETERMINISTIC_FINDINGS where severity == "WARNING".',
    '  • `missingInfo` MUST be the same items as CHECKLIST (rephrased OK).',
    '  • `suggestedActions` MUST be the same items as SUGGESTED_ACTIONS (rephrased OK).',
    '  • `summary` is 1–3 sentences in operator-facing tone.',
    '  • `shareholderFriendlyExplanation` is 2–4 sentences, no jargon, no tax advice.',
    '',
    'Context:',
    JSON.stringify(compact, null, 2),
  ].join('\n')
}

function safeParse(raw: string): Partial<DividendAiReviewOutput> {
  try {
    const parsed = JSON.parse(raw) as Partial<DividendAiReviewOutput>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function mergeWithBaseline(parsed: Partial<DividendAiReviewOutput>, baseline: DividendAiReviewOutput): DividendAiReviewOutput {
  const stringArray = (arr: unknown, fallback: string[]): string[] =>
    Array.isArray(arr) && arr.every(x => typeof x === 'string') ? (arr as string[]) : fallback
  const stringOr = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() ? v : fallback)
  const conf = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7

  return {
    confidence: conf,
    missingInfo: stringArray(parsed.missingInfo, baseline.missingInfo),
    risks: stringArray(parsed.risks, baseline.risks),
    shareholderFriendlyExplanation: stringOr(parsed.shareholderFriendlyExplanation, baseline.shareholderFriendlyExplanation),
    suggestedActions: stringArray(parsed.suggestedActions, baseline.suggestedActions),
    summary: stringOr(parsed.summary, baseline.summary),
    warnings: stringArray(parsed.warnings, baseline.warnings),
  }
}

// ---------- Factory --------------------------------------------------------

export function selectDefaultProvider(env: NodeJS.ProcessEnv = process.env): DividendAiProvider {
  if (env.DIVIDEND_AI_REVIEW_DISABLED === '1') return deterministicProvider
  if (!env.OPENAI_API_KEY) return deterministicProvider
  return new OpenAiDividendReviewProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_DIVIDEND_REVIEW_MODEL,
    timeoutMs: env.DIVIDEND_AI_REVIEW_TIMEOUT_MS ? Number(env.DIVIDEND_AI_REVIEW_TIMEOUT_MS) : undefined,
  })
}
