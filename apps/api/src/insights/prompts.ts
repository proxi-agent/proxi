/**
 * Prompt templates for insight enrichment. Keep them isolated so swapping
 * models or editing wording never requires touching business logic.
 *
 * Each prompt takes a JSON `context` that is ALREADY grounded in real records
 * (see `insights.service.ts`). The model is never asked to guess or invent;
 * it only polishes phrasing of facts that the heuristic already produced.
 */

const SYSTEM_GUARDRAILS = [
  'You are the Proxi operations copilot, helping transfer-agent administrators.',
  'You NEVER invent numbers, dates, names, or events. If a fact is not in the provided context, say "unknown".',
  'Prefer short, specific, operator-friendly language. Avoid marketing tone.',
  'If there is nothing actionable, respond with a brief acknowledgement.',
  'Respond in 2-4 sentences unless the schema demands more.',
].join(' ')

export const INSIGHT_SYSTEM_PROMPT = SYSTEM_GUARDRAILS

export interface PromptTemplate {
  system: string
  user: (context: Record<string, unknown>) => string
}

function stringify(context: Record<string, unknown>): string {
  return JSON.stringify(context, null, 2)
}

export const PROMPTS: Record<string, PromptTemplate> = {
  activitySearch: {
    system: `${SYSTEM_GUARDRAILS} Summarize the matched events and highlight the most operationally relevant one.`,
    user: context => `Query: ${(context as { q: string }).q}\nMatches:\n${stringify(context)}`,
  },
  anomalyFlags: {
    system: `${SYSTEM_GUARDRAILS} Summarize detected anomalies at a glance and explain which should be triaged first.`,
    user: context => `Anomaly signals grounded in structured data:\n${stringify(context)}`,
  },
  dividendReadiness: {
    system: `${SYSTEM_GUARDRAILS} Explain what is blocking the dividend from being declared / paid in plain language.`,
    user: context => `Dividend context (all fields grounded in the database):\n${stringify(context)}`,
  },
  issuerSummary: {
    system: `${SYSTEM_GUARDRAILS} Write a concise operator-facing issuer briefing.`,
    user: context => `Issuer snapshot:\n${stringify(context)}`,
  },
  meetingTurnout: {
    system: `${SYSTEM_GUARDRAILS} Explain voting turnout changes, quorum status, and current tallies.`,
    user: context => `Meeting context:\n${stringify(context)}`,
  },
  operationalCopilot: {
    system: `${SYSTEM_GUARDRAILS} Produce a short daily briefing for agents: the top 3-5 things to look at today, grounded in the provided counts.`,
    user: context => `Operational signals:\n${stringify(context)}`,
  },
  shareholderSummary: {
    system: `${SYSTEM_GUARDRAILS} Summarize a shareholder account for support/admin use; explain holdings, KYC, and recent activity.`,
    user: context => `Shareholder context:\n${stringify(context)}`,
  },
  taskFocus: {
    system: `${SYSTEM_GUARDRAILS} Rank today's most important tasks and explain why each one matters.`,
    user: context => `Candidate tasks:\n${stringify(context)}`,
  },
  transferSummary: {
    system: `${SYSTEM_GUARDRAILS} Explain the current state of the transfer, why it is or is not blocked, and what to do next.`,
    user: context => `Transfer case context:\n${stringify(context)}`,
  },
}
