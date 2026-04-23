import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Task } from '../../tasks/tasks.types.js'

import { buildTaskFocusInsight, rankTasks } from './task-focus.js'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    createdAt: new Date('2026-04-20T00:00:00Z'),
    id: overrides.id ?? 't-1',
    issuerId: undefined,
    metadata: {},
    priority: 'MEDIUM',
    recommendedActions: [],
    severity: 'INFO',
    source: 'SYSTEM',
    status: 'OPEN',
    title: overrides.title ?? 'Task',
    type: 'TRANSFER_REVIEW',
    updatedAt: new Date('2026-04-20T00:00:00Z'),
    ...overrides,
  }
}

describe('task focus ranking', () => {
  const now = new Date('2026-04-23T12:00:00Z')

  it('ranks critical overdue tasks above low-priority fresh tasks', () => {
    const tasks = [
      makeTask({ id: 'low', priority: 'LOW', title: 'low' }),
      makeTask({ dueAt: new Date('2026-04-20T00:00:00Z'), id: 'critical', priority: 'CRITICAL', title: 'critical overdue' }),
    ]
    const ranked = rankTasks(tasks, now)
    assert.equal(ranked[0].task.id, 'critical')
    assert.ok(ranked[0].score > ranked[1].score)
    assert.ok(ranked[0].reasons.some(reason => reason.includes('overdue')))
  })

  it('prioritises due-today tasks over distant future tasks', () => {
    const tasks = [
      makeTask({ dueAt: new Date('2026-04-30T00:00:00Z'), id: 'later', priority: 'MEDIUM' }),
      makeTask({ dueAt: new Date('2026-04-23T20:00:00Z'), id: 'today', priority: 'MEDIUM' }),
    ]
    const ranked = rankTasks(tasks, now)
    assert.equal(ranked[0].task.id, 'today')
  })

  it('penalises high-priority unassigned tasks less than critical overdue tasks', () => {
    const tasks = [
      makeTask({ id: 'high', priority: 'HIGH' }),
      makeTask({ dueAt: new Date('2026-04-22T12:00:00Z'), id: 'crit', priority: 'CRITICAL', severity: 'CRITICAL' }),
    ]
    const ranked = rankTasks(tasks, now)
    assert.equal(ranked[0].task.id, 'crit')
  })

  it('builds an insight that reports zero-state cleanly', () => {
    const insight = buildTaskFocusInsight([], 5, now)
    assert.equal(insight.kind, 'TASK_FOCUS')
    assert.equal(insight.signals.length, 0)
    assert.match(insight.headline.toLowerCase(), /no high-priority tasks/)
  })

  it('limits returned signals to the requested size', () => {
    const tasks = Array.from({ length: 10 }, (_, idx) => makeTask({ id: `t-${idx}`, priority: idx < 3 ? 'HIGH' : 'LOW' }))
    const insight = buildTaskFocusInsight(tasks, 3, now)
    assert.equal(insight.signals.length, 3)
    assert.equal(insight.references.length, 3)
  })
})
