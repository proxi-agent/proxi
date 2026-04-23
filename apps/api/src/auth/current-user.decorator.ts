import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { AuthUser } from './auth-user.js'
import type { AuthenticatedRequest } from './authenticated-request.js'

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
  return request.authUser
})

