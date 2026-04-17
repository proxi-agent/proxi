import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { AuthenticatedRequest } from './authenticated-request.js'

export const CurrentRequest = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedRequest => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
  return request
})
