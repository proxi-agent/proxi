export type InsightKind =
  | 'ACTIVITY_SEARCH'
  | 'ANOMALY_FLAGS'
  | 'DIVIDEND_READINESS'
  | 'ISSUER_SUMMARY'
  | 'MEETING_TURNOUT'
  | 'OPERATIONAL_COPILOT'
  | 'SHAREHOLDER_SUMMARY'
  | 'TASK_FOCUS'
  | 'TRANSFER_SUMMARY'

export type InsightSeverity = 'CRITICAL' | 'INFO' | 'SUCCESS' | 'WARN'

export type InsightGenerator = 'HEURISTIC' | 'LLM' | 'MIXED'

export interface InsightSignal {
  code: string
  label: string
  detail?: string
  severity: InsightSeverity
  metadata?: Record<string, unknown>
}

export interface InsightAction {
  label: string
  action: string
  url?: string
  /** Optional params the UI can pass back when the action is invoked. */
  params?: Record<string, unknown>
}

export interface InsightReference {
  kind: string
  id: string
  label?: string
}

/**
 * A grounded insight produced by a deterministic heuristic and optionally
 * enriched by an LLM. Consumers can render `headline` + `summary` + `signals`
 * without ever calling a model.
 */
export interface Insight {
  kind: InsightKind
  subject: { type: string; id: string; label?: string }
  generatedAt: Date
  generator: InsightGenerator
  headline: string
  summary: string
  signals: InsightSignal[]
  recommendedActions: InsightAction[]
  references: InsightReference[]
  /** Structured data the UI can render for visual copilots. */
  data?: Record<string, unknown>
  /** Truthy when the heuristic engine produced a result but the LLM call failed. */
  llmError?: string
}
