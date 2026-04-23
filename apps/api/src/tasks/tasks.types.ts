export type TaskStatus = 'BLOCKED' | 'CANCELLED' | 'IN_REVIEW' | 'OPEN' | 'RESOLVED'
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'LOW' | 'MEDIUM'
export type TaskSeverity = 'CRITICAL' | 'ERROR' | 'INFO' | 'WARN'
export type TaskSource = 'AI' | 'LEDGER' | 'RECONCILIATION' | 'SYSTEM' | 'USER'

export type TaskType =
  | 'BALLOT_REVIEW'
  | 'DIVIDEND_RECONCILIATION'
  | 'KYC_FOLLOWUP'
  | 'LEDGER_EXCEPTION'
  | 'MEETING_CERTIFICATION'
  | 'TRANSFER_REVIEW'

export interface TaskRecommendedAction {
  label: string
  action: string
  url?: string
  metadata?: Record<string, unknown>
}

export interface Task {
  id: string
  issuerId?: string
  type: TaskType
  source: TaskSource
  priority: TaskPriority
  severity: TaskSeverity
  status: TaskStatus
  title: string
  description?: string
  assigneeId?: string
  relatedEntityType?: string
  relatedEntityId?: string
  dueAt?: Date
  resolvedAt?: Date
  resolvedBy?: string
  recommendedActions: TaskRecommendedAction[]
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BLOCKED: ['CANCELLED', 'IN_REVIEW', 'OPEN'],
  CANCELLED: [],
  IN_REVIEW: ['BLOCKED', 'CANCELLED', 'RESOLVED'],
  OPEN: ['BLOCKED', 'CANCELLED', 'IN_REVIEW', 'RESOLVED'],
  RESOLVED: [],
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to)
}
