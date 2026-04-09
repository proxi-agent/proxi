import { createClerkClient, verifyToken } from '@clerk/backend'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthenticatedRequest } from './authenticated-request.js'
import { IS_PUBLIC_KEY } from './public.decorator.js'
import { isRole } from './rbac.js'

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
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

    const metadataRole = clerkUser.publicMetadata.role ?? clerkUser.unsafeMetadata.role
    const role = isRole(metadataRole) ? metadataRole : 'shareholder'

    request.authUser = {
      clerkUserId: clerkUser.id,
      email: clerkUser.emailAddresses.find(entry => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress || `${clerkUser.id}@unknown.local`,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.username || clerkUser.id,
      role,
    }

    return true
  }
}
