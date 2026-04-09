import { ForbiddenException, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthenticatedRequest } from './authenticated-request.js'
import { PERMISSIONS_KEY } from './permissions.decorator.js'
import type { Permission } from './rbac.js'
import { hasPermission } from './rbac.js'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredPermissions?.length) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.authUser
    if (!user) {
      return false
    }

    const allowed = requiredPermissions.some(permission => hasPermission(user.role, permission))
    if (!allowed) {
      throw new ForbiddenException('Missing required permission')
    }
    return true
  }
}
