import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { DatabaseService } from '../database/database.service.js'

import type { AuthenticatedRequest } from './authenticated-request.js'
import { PERMISSIONS_KEY } from './permissions.decorator.js'
import type { Permission, Role } from './rbac.js'
import { hasPermission } from './rbac.js'
import { ROLES_KEY } from './roles.decorator.js'
import type { ScopeEntityRule, ScopeRule } from './scope.decorator.js'
import { SCOPE_KEY } from './scope.decorator.js'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()])
    const scopeRule = this.reflector.getAllAndOverride<ScopeRule | undefined>(SCOPE_KEY, [context.getHandler(), context.getClass()])
    if (!requiredPermissions?.length && !requiredRoles?.length && !scopeRule) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.authUser
    if (!user) {
      return false
    }

    if (requiredRoles?.length) {
      const roleAllowed = user.roles.some(role => requiredRoles.includes(role))
      if (!roleAllowed) {
        throw new ForbiddenException('Missing required role')
      }
    }

    if (requiredPermissions?.length) {
      const allowed = requiredPermissions.some(permission => hasPermission(user.roles, permission))
      if (!allowed) {
        throw new ForbiddenException('Missing required permission')
      }
    }

    if (scopeRule) {
      await this.enforceScope(scopeRule, request)
    }
    return true
  }

  private async enforceScope(rule: ScopeRule, request: AuthenticatedRequest): Promise<void> {
    const user = request.authUser
    if (!user) return
    if (user.roles.includes('super_admin') || user.roles.includes('transfer_agent_admin') || user.roles.includes('agent_admin')) {
      return
    }

    const issuerScoped = user.roles.includes('issuer_admin') || user.roles.includes('issuer_operator')
    const shareholderScoped = user.roles.includes('shareholder')

    if (issuerScoped && rule.autoFillIssuerPath) {
      const current = getPath(request, rule.autoFillIssuerPath)
      if (!current) {
        if (user.issuerIds.length !== 1) {
          throw new ForbiddenException('Issuer id is required for this route')
        }
        setPath(request, rule.autoFillIssuerPath, user.issuerIds[0])
      }
    }

    if (shareholderScoped && rule.autoFillAccountPath) {
      const current = getPath(request, rule.autoFillAccountPath)
      if (!current && user.accountIds.length) {
        setPath(request, rule.autoFillAccountPath, user.accountIds[0])
      } else if (!current && !user.accountIds.length) {
        throw new ForbiddenException('No shareholder account scope available')
      }
    }
    if (shareholderScoped && rule.autoFillShareholderPath) {
      const current = getPath(request, rule.autoFillShareholderPath)
      if (!current && user.shareholderIds.length) {
        setPath(request, rule.autoFillShareholderPath, user.shareholderIds[0])
      } else if (!current && !user.shareholderIds.length) {
        throw new ForbiddenException('No shareholder scope available')
      }
    }

    if (issuerScoped && rule.issuerPaths?.length) {
      for (const path of rule.issuerPaths) {
        const value = getPath(request, path)
        if (!value) continue
        if (!user.issuerIds.includes(String(value))) {
          throw new ForbiddenException('Issuer scope denied')
        }
      }
    }

    if (shareholderScoped && rule.accountPaths?.length) {
      for (const path of rule.accountPaths) {
        const value = getPath(request, path)
        if (!value) continue
        if (!user.accountIds.includes(String(value))) {
          throw new ForbiddenException('Account scope denied')
        }
      }
    }

    if (shareholderScoped && rule.shareholderPaths?.length) {
      for (const path of rule.shareholderPaths) {
        const value = getPath(request, path)
        if (!value) continue
        if (!user.shareholderIds.includes(String(value))) {
          throw new ForbiddenException('Shareholder scope denied')
        }
      }
    }

    if (rule.entityRule) {
      const id = String(request.params?.[rule.entityRule.idParam || 'id'] || '')
      if (id) {
        const ownership = await this.resolveEntityOwnership(rule.entityRule.entity, id)
        if (!ownership) {
          throw new ForbiddenException('Entity not accessible')
        }
        if (issuerScoped && ownership.issuerId && !user.issuerIds.includes(ownership.issuerId)) {
          throw new ForbiddenException('Issuer scope denied')
        }
        if (shareholderScoped) {
          if (ownership.accountId && !user.accountIds.includes(ownership.accountId)) {
            throw new ForbiddenException('Account scope denied')
          }
          if (ownership.shareholderId && !user.shareholderIds.includes(ownership.shareholderId)) {
            throw new ForbiddenException('Shareholder scope denied')
          }
        }
      }
    }
  }

  private async resolveEntityOwnership(
    entity: ScopeEntityRule['entity'],
    id: string,
  ): Promise<{ accountId?: string; issuerId?: string; shareholderId?: string } | null> {
    const queries: Record<string, { sql: string; values: unknown[] }> = {
      account: {
        sql: `SELECT issuer_id, id AS account_id, shareholder_id FROM shareholder_accounts WHERE id = $1`,
        values: [id],
      },
      ballot: {
        sql: `SELECT m.issuer_id, b.account_id, b.shareholder_id
              FROM ballots b
              JOIN meetings m ON m.id = b.meeting_id
              WHERE b.id = $1`,
        values: [id],
      },
      dividend: {
        sql: `SELECT issuer_id FROM dividend_events WHERE id = $1`,
        values: [id],
      },
      dividend_batch: {
        sql: `SELECT issuer_id FROM dividend_payment_batches WHERE id = $1`,
        values: [id],
      },
      meeting: {
        sql: `SELECT issuer_id FROM meetings WHERE id = $1`,
        values: [id],
      },
      shareholder: {
        sql: `SELECT issuer_id, id AS shareholder_id FROM shareholders WHERE id = $1`,
        values: [id],
      },
      task: {
        sql: `SELECT issuer_id FROM tasks WHERE id = $1`,
        values: [id],
      },
      transfer: {
        sql: `SELECT issuer_id, from_account_id AS account_id FROM transfer_requests WHERE id = $1`,
        values: [id],
      },
    }

    const target = queries[String(entity)]
    if (!target) return null
    const rows = await this.database.query<{ account_id?: string; issuer_id?: string; shareholder_id?: string }>(target.sql, target.values)
    const row = rows.rows[0]
    if (!row) return null
    return {
      accountId: row.account_id || undefined,
      issuerId: row.issuer_id || undefined,
      shareholderId: row.shareholder_id || undefined,
    }
  }
}

function getPath(request: AuthenticatedRequest, path: string): unknown {
  const [root, key] = path.split('.') as ['body' | 'params' | 'query', string]
  return (request as unknown as Record<string, Record<string, unknown> | undefined>)[root]?.[key]
}

function setPath(request: AuthenticatedRequest, path: string, value: string): void {
  const [root, key] = path.split('.') as ['body' | 'params' | 'query', string]
  const target = (request as unknown as Record<string, Record<string, unknown> | undefined>)[root] || {}
  target[key] = value
  ;(request as unknown as Record<string, Record<string, unknown>>)[root] = target
}
