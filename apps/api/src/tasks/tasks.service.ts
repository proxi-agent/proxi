import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { AuditActions } from '../audit/audit.events.js'
import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import type { Queryable } from '../database/database.service.js'
import { DatabaseService } from '../database/database.service.js'

import type { CreateTaskDto, TaskListQuery, TransitionTaskDto, UpdateTaskDto } from './tasks.dto.js'
import type { Task, TaskPriority, TaskRecommendedAction, TaskSeverity, TaskSource, TaskStatus, TaskType } from './tasks.types.js'
import { canTransition } from './tasks.types.js'

/** Open statuses — used as the default "active" set for dedup and bulk close. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['OPEN', 'IN_REVIEW', 'BLOCKED']

export interface EnsureTaskInput extends CreateTaskDto {
  /**
   * Optional explicit dedup key. When present we treat (issuerId, type, dedupKey)
   * as the uniqueness constraint. When absent we fall back to
   * (relatedEntityType, relatedEntityId, type).
   */
  dedupKey?: string
}

type TaskRow = {
  id: string
  issuer_id: string | null
  type: TaskType
  source: TaskSource
  priority: TaskPriority
  severity: TaskSeverity
  status: TaskStatus
  title: string
  description: string | null
  assignee_id: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  due_at: Date | null
  resolved_at: Date | null
  resolved_by: string | null
  recommended_actions: TaskRecommendedAction[]
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const SORT: Record<string, string> = {
  createdAt: 'created_at',
  dueAt: 'due_at',
  priority: 'priority',
  status: 'status',
  updatedAt: 'updated_at',
}

const TASK_STATUS_TO_AUDIT_ACTION: Record<TaskStatus, string> = {
  BLOCKED: AuditActions.TASK_BLOCKED,
  CANCELLED: AuditActions.TASK_CANCELLED,
  IN_REVIEW: AuditActions.TASK_IN_REVIEW,
  OPEN: AuditActions.TASK_OPEN,
  RESOLVED: AuditActions.TASK_RESOLVED,
}

@Injectable()
export class TasksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: TaskListQuery): Promise<PaginatedResponse<Task>> {
    const where: string[] = []
    const params: unknown[] = []
    if (query.issuerId) {
      params.push(query.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.priority) {
      params.push(query.priority)
      where.push(`priority = $${params.length}`)
    }
    if (query.type) {
      params.push(query.type)
      where.push(`type = $${params.length}`)
    }
    if (query.assigneeId) {
      params.push(query.assigneeId)
      where.push(`assignee_id = $${params.length}`)
    }
    if (query.relatedEntityId) {
      params.push(query.relatedEntityId)
      where.push(`related_entity_id = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`(LOWER(title) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, SORT, { column: 'created_at', dir: 'desc' })

    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM tasks ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<TaskRow>(
      `SELECT * FROM tasks ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()} NULLS LAST
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapTask), total, query)
  }

  async get(id: string): Promise<Task> {
    const result = await this.database.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Task ${id} not found`)
    }
    return mapTask(result.rows[0])
  }

  async create(input: CreateTaskDto, actor: ActorContext, client?: Queryable): Promise<Task> {
    const runner = client ?? this.database
    const id = shortId('task')
    const result = await runner.query<TaskRow>(
      `INSERT INTO tasks (id, issuer_id, type, source, priority, severity, status, title, description,
                          assignee_id, related_entity_type, related_entity_id, due_at, recommended_actions, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,'OPEN',$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb) RETURNING *`,
      [
        id,
        input.issuerId || null,
        input.type,
        input.source || 'SYSTEM',
        input.priority || 'MEDIUM',
        input.severity || 'INFO',
        input.title,
        input.description || null,
        input.assigneeId || null,
        input.relatedEntityType || null,
        input.relatedEntityId || null,
        input.dueAt || null,
        JSON.stringify(input.recommendedActions || []),
        JSON.stringify(input.metadata || {}),
      ],
    )
    await this.auditService.record(
      {
        action: AuditActions.TASK_CREATED,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        entityId: id,
        entityType: 'TASK',
        issuerId: input.issuerId,
        metadata: { priority: input.priority, type: input.type },
      },
      client,
    )
    return mapTask(result.rows[0])
  }

  async update(id: string, input: UpdateTaskDto, actor: ActorContext): Promise<Task> {
    return this.database.tx(async client => {
      const existing = await client.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Task ${id} not found`)
      }
      const row = existing.rows[0]
      const result = await client.query<TaskRow>(
        `UPDATE tasks SET
           title = $2, description = $3, assignee_id = $4, priority = $5, severity = $6,
           due_at = $7, recommended_actions = $8::jsonb, metadata = $9::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.title ?? row.title,
          input.description ?? row.description,
          input.assigneeId ?? row.assignee_id,
          input.priority ?? row.priority,
          input.severity ?? row.severity,
          input.dueAt ?? row.due_at,
          JSON.stringify(input.recommendedActions ?? row.recommended_actions ?? []),
          JSON.stringify({ ...row.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: AuditActions.TASK_UPDATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'TASK',
          issuerId: row.issuer_id || undefined,
          metadata: { assigneeId: input.assigneeId, priority: input.priority },
        },
        client,
      )
      return mapTask(result.rows[0])
    })
  }

  async transition(id: string, input: TransitionTaskDto, actor: ActorContext): Promise<Task> {
    return this.database.tx(async client => {
      const existing = await client.query<TaskRow>(`SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Task ${id} not found`)
      }
      const row = existing.rows[0]
      if (row.status === input.status) {
        return mapTask(row)
      }
      if (!canTransition(row.status, input.status)) {
        throw new BadRequestException(`Cannot transition task from ${row.status} to ${input.status}`)
      }

      const terminal = input.status === 'RESOLVED' || input.status === 'CANCELLED'
      const result = await client.query<TaskRow>(
        `UPDATE tasks SET
           status = $2,
           resolved_at = CASE WHEN $2 IN ('RESOLVED','CANCELLED') THEN NOW() ELSE resolved_at END,
           resolved_by = CASE WHEN $2 IN ('RESOLVED','CANCELLED') THEN $3 ELSE resolved_by END,
           metadata = metadata || $4::jsonb,
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, input.status, actor.actorId, JSON.stringify(input.note ? { lastNote: input.note } : {})],
      )
      await this.auditService.record(
        {
          action: TASK_STATUS_TO_AUDIT_ACTION[input.status],
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'TASK',
          issuerId: row.issuer_id || undefined,
          metadata: { from: row.status, note: input.note, to: input.status },
          severity: terminal ? 'MEDIUM' : 'INFO',
        },
        client,
      )
      return mapTask(result.rows[0])
    })
  }

  /**
   * Idempotent task creation.
   *
   * If an *open* task already exists for the same (relatedEntityType,
   * relatedEntityId, type) — or the same (issuerId, type, dedupKey) — we
   * update its metadata/priority/description instead of creating a duplicate.
   * This is the preferred entry point for automated signal emitters so we
   * don't flood the queue with repeats of the same problem.
   */
  async ensure(input: EnsureTaskInput, actor: ActorContext, client?: Queryable): Promise<Task> {
    const runner = client ?? this.database
    const existing = await this.findOpenMatch(runner, input)

    if (existing) {
      // Merge: keep the task open, but refresh human-facing fields if supplied.
      const mergedMetadata = {
        ...existing.metadata,
        ...(input.metadata || {}),
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}),
        lastSignaledAt: new Date().toISOString(),
      }
      const updated = await runner.query<TaskRow>(
        `UPDATE tasks SET
           title = $2, description = $3,
           priority = $4, severity = $5,
           recommended_actions = $6::jsonb,
           metadata = $7::jsonb,
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          existing.id,
          input.title || existing.title,
          input.description ?? existing.description,
          input.priority ?? existing.priority,
          input.severity ?? existing.severity,
          JSON.stringify(input.recommendedActions ?? existing.recommendedActions ?? []),
          JSON.stringify(mergedMetadata),
        ],
      )
      await this.auditService.record(
        {
          action: AuditActions.TASK_UPDATED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: existing.id,
          entityType: 'TASK',
          issuerId: existing.issuerId,
          metadata: { dedup: true, reason: 'signal re-emitted', type: input.type },
        },
        client,
      )
      return mapTask(updated.rows[0])
    }

    return this.create(
      {
        ...input,
        metadata: {
          ...(input.metadata || {}),
          ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}),
        },
      },
      actor,
      client,
    )
  }

  /**
   * Bulk-resolve all open tasks attached to an entity. Useful when the root
   * cause of a flagged exception is cleared — e.g. a blocked transfer
   * resubmits successfully, so all related `TRANSFER_REVIEW` tasks should
   * close without manual intervention.
   */
  async closeForEntity(
    entityType: string,
    entityId: string,
    actor: ActorContext,
    options: { reason?: string; type?: TaskType } = {},
    client?: Queryable,
  ): Promise<number> {
    const runner = client ?? this.database
    const params: unknown[] = [entityType, entityId, OPEN_TASK_STATUSES]
    let typeClause = ''
    if (options.type) {
      params.push(options.type)
      typeClause = `AND type = $${params.length}`
    }
    const rows = await runner.query<TaskRow>(
      `SELECT * FROM tasks
       WHERE related_entity_type = $1 AND related_entity_id = $2 AND status = ANY($3::text[]) ${typeClause}
       FOR UPDATE`,
      params,
    )
    if (!rows.rows.length) return 0

    const ids = rows.rows.map(row => row.id)
    await runner.query(
      `UPDATE tasks SET
         status = 'RESOLVED', resolved_at = NOW(), resolved_by = $2,
         metadata = metadata || $3::jsonb,
         updated_at = NOW()
       WHERE id = ANY($1::text[])`,
      [ids, actor.actorId, JSON.stringify({ autoClosedReason: options.reason || 'entity resolved' })],
    )

    for (const row of rows.rows) {
      await this.auditService.record(
        {
          action: AuditActions.TASK_RESOLVED,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: row.id,
          entityType: 'TASK',
          issuerId: row.issuer_id || undefined,
          metadata: { auto: true, reason: options.reason, relatedEntityId: entityId, relatedEntityType: entityType },
          severity: 'INFO',
        },
        client,
      )
    }
    return ids.length
  }

  /**
   * All tasks attached to a given entity — used by workflow-context bundles
   * to surface operator-facing exceptions alongside a workflow record.
   */
  async listForEntity(entityType: string, entityId: string): Promise<Task[]> {
    const rows = await this.database.query<TaskRow>(
      `SELECT * FROM tasks
       WHERE related_entity_type = $1 AND related_entity_id = $2
       ORDER BY created_at ASC`,
      [entityType, entityId],
    )
    return rows.rows.map(mapTask)
  }

  private async findOpenMatch(runner: Queryable, input: EnsureTaskInput): Promise<Task | null> {
    if (input.dedupKey && input.issuerId) {
      const match = await runner.query<TaskRow>(
        `SELECT * FROM tasks
         WHERE issuer_id = $1 AND type = $2 AND status = ANY($3::text[])
           AND metadata->>'dedupKey' = $4
         LIMIT 1`,
        [input.issuerId, input.type, OPEN_TASK_STATUSES, input.dedupKey],
      )
      if (match.rows.length) return mapTask(match.rows[0])
    }
    if (input.relatedEntityType && input.relatedEntityId) {
      const match = await runner.query<TaskRow>(
        `SELECT * FROM tasks
         WHERE related_entity_type = $1 AND related_entity_id = $2
           AND type = $3 AND status = ANY($4::text[])
         LIMIT 1`,
        [input.relatedEntityType, input.relatedEntityId, input.type, OPEN_TASK_STATUSES],
      )
      if (match.rows.length) return mapTask(match.rows[0])
    }
    return null
  }

  async stats(issuerId?: string): Promise<{
    byPriority: Record<TaskPriority, number>
    byStatus: Record<TaskStatus, number>
    overdue: number
    total: number
  }> {
    const params: unknown[] = []
    const where: string[] = []
    if (issuerId) {
      params.push(issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const statusRows = await this.database.query<{ status: TaskStatus; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM tasks ${whereSql} GROUP BY status`,
      params,
    )
    const priorityRows = await this.database.query<{ priority: TaskPriority; count: string }>(
      `SELECT priority, COUNT(*)::text AS count FROM tasks ${whereSql} GROUP BY priority`,
      params,
    )
    const overdueRows = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tasks
       ${whereSql ? `${whereSql} AND` : 'WHERE'} status IN ('OPEN','IN_REVIEW','BLOCKED') AND due_at < NOW()`,
      params,
    )
    const totalRows = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM tasks ${whereSql}`, params)

    const byStatus: Record<TaskStatus, number> = {
      BLOCKED: 0,
      CANCELLED: 0,
      IN_REVIEW: 0,
      OPEN: 0,
      RESOLVED: 0,
    }
    for (const row of statusRows.rows) {
      byStatus[row.status] = Number(row.count)
    }
    const byPriority: Record<TaskPriority, number> = { CRITICAL: 0, HIGH: 0, LOW: 0, MEDIUM: 0 }
    for (const row of priorityRows.rows) {
      byPriority[row.priority] = Number(row.count)
    }
    return {
      byPriority,
      byStatus,
      overdue: Number(overdueRows.rows[0]?.count || '0'),
      total: Number(totalRows.rows[0]?.count || '0'),
    }
  }
}

function mapTask(row: TaskRow): Task {
  return {
    assigneeId: row.assignee_id || undefined,
    createdAt: new Date(row.created_at),
    description: row.description || undefined,
    dueAt: row.due_at ? new Date(row.due_at) : undefined,
    id: row.id,
    issuerId: row.issuer_id || undefined,
    metadata: row.metadata || {},
    priority: row.priority,
    recommendedActions: row.recommended_actions || [],
    relatedEntityId: row.related_entity_id || undefined,
    relatedEntityType: row.related_entity_type || undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by || undefined,
    severity: row.severity,
    source: row.source,
    status: row.status,
    title: row.title,
    type: row.type,
    updatedAt: new Date(row.updated_at),
  }
}
