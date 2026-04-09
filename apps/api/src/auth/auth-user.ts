import type { Role } from './rbac.js'

export type AuthUser = {
  clerkUserId: string
  email: string
  name: string
  role: Role
}
