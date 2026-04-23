import type { Task } from '../../tasks/tasks.types.js'
import type { Insight, InsightAction, InsightSignal } from '../insights.types.js'

const PRIORITY_WEIGHT: Record<Task['priority'], number> = {
  CRITICAL: 400,
  HIGH: 250,
  LOW: 50,
  MEDIUM: 120,
}

const SEVERITY_WEIGHT: Record<Task['severity'], number> = {
  CRITICAL: 80,
  ERROR: 60,
  INFO: 0,
  WARN: 30,
}

const STATUS_WEIGHT: Record<Task['status'], number> = {
  BLOCKED: 60,
  CANCELLED: 0,
  IN_REVIEW: 40,
  OPEN: 30,
  RESOLVED: 0,
}

const DAY_MS = 86_400_000

export interface RankedTask {
  task: Task
  score: number
  reasons: string[]
}

/**
 * Deterministic task scoring. Surfaces the tasks that most obviously need
 * attention today based on priority, severity, overdue-ness, and status.
 */
export function rankTasks(tasks: Task[], now = new Date()): RankedTask[] {
  const nowMs = now.getTime()
  return tasks
    .map(task => {
      const reasons: string[] = []
      let score = PRIORITY_WEIGHT[task.priority] + SEVERITY_WEIGHT[task.severity] + STATUS_WEIGHT[task.status]

      if (task.priority === 'CRITICAL' || task.priority === 'HIGH') {
        reasons.push(`${task.priority.toLowerCase()} priority`)
      }
      if (task.severity === 'CRITICAL' || task.severity === 'ERROR') {
        reasons.push(`${task.severity.toLowerCase()} severity`)
      }

      if (task.dueAt) {
        const diffDays = Math.round((task.dueAt.getTime() - nowMs) / DAY_MS)
        if (diffDays < 0) {
          const overdue = Math.abs(diffDays)
          score += 60 + Math.min(overdue, 14) * 10
          reasons.push(`${overdue} day${overdue === 1 ? '' : 's'} overdue`)
        } else if (diffDays === 0) {
          score += 80
          reasons.push('due today')
        } else if (diffDays <= 2) {
          score += 40
          reasons.push(`due in ${diffDays} day${diffDays === 1 ? '' : 's'}`)
        }
      }

      if (task.status === 'BLOCKED') {
        reasons.push('blocked')
      }
      if (!task.assigneeId && (task.priority === 'CRITICAL' || task.priority === 'HIGH')) {
        score += 25
        reasons.push('unassigned high-priority task')
      }

      return { reasons, score, task }
    })
    .sort((a, b) => b.score - a.score)
}

export function buildTaskFocusInsight(tasks: Task[], limit = 5, now = new Date()): Insight {
  const ranked = rankTasks(tasks, now).slice(0, limit)
  const signals: InsightSignal[] = ranked.map((item, index) => ({
    code: `FOCUS_${index + 1}`,
    detail: item.reasons.join(' · '),
    label: item.task.title,
    metadata: {
      dueAt: item.task.dueAt?.toISOString(),
      priority: item.task.priority,
      relatedEntityId: item.task.relatedEntityId,
      relatedEntityType: item.task.relatedEntityType,
      score: item.score,
      taskId: item.task.id,
    },
    severity:
      item.task.priority === 'CRITICAL' || item.task.severity === 'CRITICAL'
        ? 'CRITICAL'
        : item.task.priority === 'HIGH' || item.task.severity === 'ERROR'
          ? 'WARN'
          : 'INFO',
  }))
  const actions: InsightAction[] = ranked.map(item => ({
    action: 'OPEN_TASK',
    label: `Open ${item.task.type} task`,
    params: { taskId: item.task.id },
    url: `/tasks/${item.task.id}`,
  }))

  const headline =
    ranked.length === 0
      ? 'No high-priority tasks require attention.'
      : ranked.length === 1
        ? `Focus on: ${ranked[0].task.title}.`
        : `Top ${ranked.length} tasks need attention today.`

  const summary =
    ranked.length === 0
      ? 'Queue is clear – no critical or overdue tasks detected.'
      : ranked
          .map((item, index) => `${index + 1}. ${item.task.title} (${item.reasons.join(', ') || 'ranked by priority'})`)
          .join('\n')

  return {
    data: { ranked: ranked.map(item => ({ reasons: item.reasons, score: item.score, taskId: item.task.id })) },
    generatedAt: now,
    generator: 'HEURISTIC',
    headline,
    kind: 'TASK_FOCUS',
    recommendedActions: actions,
    references: ranked.map(item => ({ id: item.task.id, kind: 'TASK', label: item.task.title })),
    signals,
    subject: { id: 'global', label: 'Task queue', type: 'TASK_QUEUE' },
    summary,
  }
}
