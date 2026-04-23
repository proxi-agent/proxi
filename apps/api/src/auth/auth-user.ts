import type { Role } from './rbac.js'

export type AuthUser = {
  userId?: string
  clerkUserId: string
  externalId?: string
  email: string
  name: string
  role: Role
  roles: Role[]
  platformRole?: string
  issuerRoles: Array<{ issuerId: string; role: string }>
  issuerIds: string[]
  shareholderIds: string[]
  accountIds: string[]
  isDemo?: boolean
}
