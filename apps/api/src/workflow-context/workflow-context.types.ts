import type { AuditTimelineEntry } from '../audit/audit.service.js'
import type { Task } from '../tasks/tasks.types.js'

/**
 * Machine-readable bundle of everything relevant to a single workflow
 * instance. The shape is deliberately stable across domains so that the
 * same template can feed:
 *   • an AI summarizer prompt
 *   • a support/ops "context panel"
 *   • an export for regulators or auditors
 *
 * Fields:
 *   - `kind`     identifies the workflow domain (TRANSFER, DIVIDEND, …).
 *   - `entity`   is the canonical record (normalized, not Prisma-shaped).
 *   - `summary`  is a short, deterministic sentence describing the state.
 *   - `facts`    is an ordered list of key/value pairs used by the UI to
 *                render an at-a-glance panel and by the LLM to avoid
 *                hallucinating fields it wasn't told about.
 *   - `timeline` is the AI-friendly audit log for this entity.
 *   - `tasks`    is every operational task referencing this entity.
 *   - `related`  is a small, domain-specific set of linked records useful
 *                for the summary (e.g. the source/destination accounts,
 *                the security, the share class).
 */
export type WorkflowContextKind = 'DIVIDEND' | 'MEETING' | 'TRANSFER'

export interface WorkflowFact {
  label: string
  value: string | number | boolean | null
  /** Optional hint for rendering — `money`, `date`, `identifier`, `enum`. */
  format?: 'date' | 'enum' | 'identifier' | 'money' | 'percent' | 'shares' | 'text'
}

export interface WorkflowContextBundle<TEntity = Record<string, unknown>> {
  kind: WorkflowContextKind
  id: string
  issuerId?: string
  reference?: string
  summary: string
  status: string
  entity: TEntity
  facts: WorkflowFact[]
  timeline: AuditTimelineEntry[]
  tasks: Task[]
  related?: Record<string, unknown>
}
