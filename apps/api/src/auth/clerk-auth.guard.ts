import { createClerkClient, verifyToken } from '@clerk/backend'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { DatabaseService } from '../database/database.service.js'
import type { AuthUser } from './auth-user.js'
import type { AuthenticatedRequest } from './authenticated-request.js'
import { IS_PUBLIC_KEY } from './public.decorator.js'
import { isRole, normalizeRole, type Role } from './rbac.js'

type DbUserRow = {
  email: string
  external_id: string
  full_name: string
  id: string
  platform_role: string
}

type DbIssuerRoleRow = {
  issuer_id: string
  role: string
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    request.authUser = await this.resolveAuthUser(request)

    return true
  }

  private async resolveAuthUser(request: AuthenticatedRequest): Promise<AuthUser> {
    const demoUserHeader = firstHeader(request.headers['x-demo-user'])
    const demoMode = process.env.AUTH_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production'
    if (demoMode && demoUserHeader) {
      return this.resolveDemoUser(demoUserHeader)
    }

    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
      throw new UnauthorizedException('Missing CLERK_SECRET_KEY')
    }

    const token = authorization.replace('Bearer ', '').trim()
    const claims = await verifyToken(token, { secretKey }).catch(() => null)
    if (!claims?.sub) {
      throw new UnauthorizedException('Invalid Clerk token')
    }

    const clerkClient = createClerkClient({ secretKey })
    const clerkUser = await clerkClient.users.getUser(claims.sub).catch(() => null)
    if (!clerkUser) {
      throw new UnauthorizedException('Unable to load Clerk user')
    }

    const email =
      clerkUser.emailAddresses.find(entry => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
      `${clerkUser.id}@unknown.local`
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.username || clerkUser.id
    const dbUser = await this.upsertUser({
      email,
      externalId: clerkUser.id,
      fullName: name,
    })
    const issuerRoles = await this.loadIssuerRoles(dbUser.id)

    const metadataRole = normalizeRole(clerkUser.publicMetadata.role ?? clerkUser.unsafeMetadata.role)
    const roles = deriveRoles(dbUser.platform_role, issuerRoles.map(row => row.role), metadataRole)
    const scope = await this.loadScopeByEmail(email)
    const role = roles.includes('super_admin') ? 'super_admin' : roles[0]!
    return {
      accountIds: scope.accountIds,
      clerkUserId: clerkUser.id,
      email: dbUser.email,
      externalId: dbUser.external_id,
      issuerIds: dedupe(issuerRoles.map(row => row.issuer_id)),
      issuerRoles: issuerRoles.map(row => ({ issuerId: row.issuer_id, role: row.role })),
      name: dbUser.full_name,
      platformRole: dbUser.platform_role,
      role,
      roles,
      shareholderIds: scope.shareholderIds,
      userId: dbUser.id,
    }
  }

  private async resolveDemoUser(identifier: string): Promise<AuthUser> {
    const dbUser = await this.findUserByEmailOrExternal(identifier)
    if (!dbUser) {
      throw new UnauthorizedException(
        `Demo user "${identifier}" not found. Seed demo users first or pass a valid x-demo-user value.`,
      )
    }

    const issuerRoles = await this.loadIssuerRoles(dbUser.id)
    const scope = await this.loadScopeByEmail(dbUser.email)
    const roles = deriveRoles(dbUser.platform_role, issuerRoles.map(row => row.role))
    const role = roles.includes('super_admin') ? 'super_admin' : roles[0]!
    return {
      accountIds: scope.accountIds,
      clerkUserId: dbUser.external_id,
      email: dbUser.email,
      externalId: dbUser.external_id,
      isDemo: true,
      issuerIds: dedupe(issuerRoles.map(row => row.issuer_id)),
      issuerRoles: issuerRoles.map(row => ({ issuerId: row.issuer_id, role: row.role })),
      name: dbUser.full_name,
      platformRole: dbUser.platform_role,
      role,
      roles,
      shareholderIds: scope.shareholderIds,
      userId: dbUser.id,
    }
  }

  private async loadScopeByEmail(email: string): Promise<{ accountIds: string[]; shareholderIds: string[] }> {
    const rows = await this.database.query<{ account_id: string; shareholder_id: string }>(
      `SELECT DISTINCT sa.id AS account_id, sa.shareholder_id
       FROM shareholder_accounts sa
       JOIN shareholders sh ON sh.id = sa.shareholder_id
       WHERE LOWER(COALESCE(sa.primary_email, sh.email, '')) = LOWER($1)`,
      [email],
    )
    return {
      accountIds: dedupe(rows.rows.map(row => row.account_id)),
      shareholderIds: dedupe(rows.rows.map(row => row.shareholder_id)),
    }
  }

  private async findUserByEmailOrExternal(identifier: string): Promise<DbUserRow | null> {
    const result = await this.database.query<DbUserRow>(
      `SELECT id, external_id, email, full_name, platform_role
       FROM users
       WHERE LOWER(email) = LOWER($1) OR external_id = $1
       LIMIT 1`,
      [identifier],
    )
    return result.rows[0] ?? null
  }

  private async loadIssuerRoles(userId: string): Promise<DbIssuerRoleRow[]> {
    const result = await this.database.query<DbIssuerRoleRow>(
      `SELECT issuer_id, role
       FROM user_issuer_roles
       WHERE user_id = $1`,
      [userId],
    )
    return result.rows
  }

  private async upsertUser(input: { email: string; externalId: string; fullName: string }): Promise<DbUserRow> {
    const existing = await this.findUserByEmailOrExternal(input.externalId)
    const byEmail = existing || (await this.findUserByEmailOrExternal(input.email))
    if (byEmail) {
      const updated = await this.database.query<DbUserRow>(
        `UPDATE users
         SET email = $2, external_id = $3, full_name = $4, last_seen_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING id, external_id, email, full_name, platform_role`,
        [byEmail.id, input.email, input.externalId, input.fullName],
      )
      return updated.rows[0]!
    }

    const id = `usr_${input.externalId.replace(/[^a-zA-Z0-9]/g, '_')}`
    const created = await this.database.query<DbUserRow>(
      `INSERT INTO users (id, external_id, email, full_name, status, platform_role, last_seen_at)
       VALUES ($1,$2,$3,$4,'ACTIVE','NONE',NOW())
       RETURNING id, external_id, email, full_name, platform_role`,
      [id, input.externalId, input.email, input.fullName],
    )
    return created.rows[0]!
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function deriveRoles(platformRole: string, issuerRoles: string[], metadataRole?: Role | null): Role[] {
  const out = new Set<Role>()
  if (metadataRole && isRole(metadataRole)) {
    out.add(metadataRole)
  }

  if (platformRole === 'ADMIN') out.add('super_admin')
  if (platformRole === 'COMPLIANCE' || platformRole === 'OPERATIONS' || platformRole === 'SUPPORT') {
    out.add('transfer_agent_admin')
  }

  for (const role of issuerRoles) {
    if (role === 'ISSUER_ADMIN') out.add('issuer_admin')
    if (role === 'ISSUER_OPERATOR' || role === 'ISSUER_VIEWER' || role === 'REVIEWER') {
      out.add('issuer_operator')
    }
    if (role === 'INVESTOR') out.add('shareholder')
  }

  if (!out.size) out.add('shareholder')
  return [...out]
}
