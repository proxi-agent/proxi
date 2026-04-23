import type { AuditEvent } from '../../audit/audit.types.js'
import type { Insight, InsightSignal } from '../insights.types.js'

export interface ActivitySearchInputs {
  query: string
  matches: AuditEvent[]
  totalMatches: number
}

export function buildActivitySearchInsight(input: ActivitySearchInputs): Insight {
  const signals: InsightSignal[] = input.matches.slice(0, 10).map(event => ({
    code: `EVENT_${event.id}`,
    detail: `${event.entityType} ${event.entityId}${event.metadata && Object.keys(event.metadata).length > 0 ? ` – ${safeMetaSnippet(event.metadata)}` : ''}`,
    label: `${event.action} · ${formatTime(event.occurredAt)}`,
    metadata: {
      action: event.action,
      actorId: event.actorId,
      entityId: event.entityId,
      entityType: event.entityType,
      eventId: event.id,
      issuerId: event.issuerId,
      occurredAt: event.occurredAt.toISOString(),
      severity: event.severity,
    },
    severity: mapAuditSeverity(event.severity),
  }))

  const summary =
    input.matches.length === 0
      ? `No audit events matched "${input.query}".`
      : `${input.totalMatches} event${input.totalMatches === 1 ? '' : 's'} match${input.totalMatches === 1 ? 'es' : ''} "${input.query}" (showing ${input.matches.length}).`

  return {
    data: { matches: input.matches.length, totalMatches: input.totalMatches },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline: summary,
    kind: 'ACTIVITY_SEARCH',
    recommendedActions: [],
    references: input.matches.slice(0, 10).map(event => ({
      id: event.entityId,
      kind: event.entityType,
      label: event.action,
    })),
    signals,
    subject: { id: 'search', label: input.query, type: 'ACTIVITY_SEARCH' },
    summary,
  }
}

function formatTime(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

function safeMetaSnippet(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata).slice(0, 3)
  return entries.map(([key, value]) => `${key}=${stringifyShort(value)}`).join(', ')
}

function stringifyShort(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }
  const asString = typeof value === 'string' ? value : JSON.stringify(value)
  return asString.length > 40 ? `${asString.slice(0, 37)}...` : asString
}

function mapAuditSeverity(severity: AuditEvent['severity']): InsightSignal['severity'] {
  if (severity === 'HIGH' || severity === 'CRITICAL') {
    return 'CRITICAL'
  }
  if (severity === 'MEDIUM') {
    return 'WARN'
  }
  return 'INFO'
}
