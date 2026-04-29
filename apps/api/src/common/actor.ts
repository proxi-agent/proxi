import type { AuthenticatedRequest } from '../auth/authenticated-request.js'

export interface ActorContext {
  /** Stable user id used in audit events. */
  actorId: string
  /** Primary role on the user record (e.g. 'issuer_admin'). */
  actorRole?: string
  /** Full role list, used for body-driven endpoints that need to assert tenant scope at the service layer. */
  actorRoles?: string[]
  /** Issuer ids the user can access. Empty for unscoped/super-admin actors. */
  issuerIds?: string[]
  /** Shareholder ids the actor can access. */
  shareholderIds?: string[]
  /** Account ids the actor can access. */
  accountIds?: string[]
  ip?: string
  userAgent?: string
}

export function actorFromRequest(request?: AuthenticatedRequest): ActorContext {
  const user = request?.authUser
  return {
    accountIds: user?.accountIds ?? [],
    actorId: user?.userId || user?.externalId || user?.clerkUserId || user?.email || user?.name || 'system',
    actorRole: user?.role,
    actorRoles: user?.roles ?? [],
    ip: request?.ip,
    issuerIds: user?.issuerIds ?? [],
    shareholderIds: user?.shareholderIds ?? [],
    userAgent: request?.headers?.['user-agent'],
  }
}

/**
 * Privileged roles that bypass per-issuer scope checks. Mirrors the
 * `enforceScope` carve-out in `permissions.guard.ts` so service-level
 * tenant checks stay consistent with controller-level ones.
 */
const PRIVILEGED_ROLES = new Set(['agent_admin', 'super_admin', 'transfer_agent_admin'])

export function isPrivilegedActor(actor: ActorContext): boolean {
  if (actor.actorRole && PRIVILEGED_ROLES.has(actor.actorRole)) return true
  return (actor.actorRoles ?? []).some(role => PRIVILEGED_ROLES.has(role))
}

/**
 * Throw if `actor` is issuer-scoped and the target issuer is outside
 * their accessible set. Used by service-level methods on body-driven
 * endpoints (e.g. `recordPayment`) where the controller's `@Scope`
 * decorator can't reach the path id.
 */
export function actorCanAccessIssuer(actor: ActorContext, issuerId: string | null | undefined): boolean {
  if (!issuerId) return true
  if (isPrivilegedActor(actor)) return true
  return (actor.issuerIds ?? []).includes(issuerId)
}
