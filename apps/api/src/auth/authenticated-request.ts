import type { Request } from 'express'
import type { AuthUser } from './auth-user.js'

export type AuthenticatedRequest = Request & { authUser?: AuthUser }
