import type { AuthenticatedRequest } from '../auth/authenticated-request.js'

export interface ActorContext {
  actorId: string
  actorRole?: string
  ip?: string
  userAgent?: string
}

export function actorFromRequest(request?: AuthenticatedRequest): ActorContext {
  const user = request?.authUser
  return {
    actorId: user?.userId || user?.externalId || user?.clerkUserId || user?.email || user?.name || 'system',
    actorRole: user?.role,
    ip: request?.ip,
    userAgent: request?.headers?.['user-agent'],
  }
}
