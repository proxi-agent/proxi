import { Controller, Get, Query } from '@nestjs/common'

import type { AuthUser } from '../auth/auth-user.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { Roles } from '../auth/roles.decorator.js'
import { Scope } from '../auth/scope.decorator.js'
import { TaskListQuery } from '../tasks/tasks.dto.js'
import { TasksService } from '../tasks/tasks.service.js'
import { TransferQueueQuery } from '../transfer-workflow/transfer-workflow.dto.js'
import { TransferWorkflowService } from '../transfer-workflow/transfer-workflow.service.js'
import { BallotListQuery } from '../voting/voting.dto.js'
import { VotingService } from '../voting/voting.service.js'

/**
 * Portal-oriented authz facade.
 *
 * Existing domain controllers remain available for internal tooling. These
 * routes provide stable, role-specific entry points for frontend portals:
 * - /portal/admin/*        transfer-agent operations
 * - /portal/issuer/*       issuer tenant operations
 * - /portal/shareholder/*  investor self-service
 */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly transfers: TransferWorkflowService,
    private readonly tasks: TasksService,
    private readonly voting: VotingService,
  ) {}

  @Get('me')
  @Permissions('transfer.view')
  me(@CurrentUser() user?: AuthUser) {
    return {
      accountIds: user?.accountIds ?? [],
      email: user?.email,
      issuerIds: user?.issuerIds ?? [],
      issuerRoles: user?.issuerRoles ?? [],
      name: user?.name,
      platformRole: user?.platformRole,
      role: user?.role,
      roles: user?.roles ?? [],
      userId: user?.userId ?? user?.clerkUserId,
    }
  }

  @Get('admin/transfers')
  @Roles('super_admin', 'transfer_agent_admin', 'agent_admin')
  @Permissions('transfer.view')
  adminTransfers(@Query() query: TransferQueueQuery) {
    return this.transfers.list(query)
  }

  @Get('admin/tasks')
  @Roles('super_admin', 'transfer_agent_admin', 'agent_admin')
  @Permissions('transfer.view', 'report.view')
  adminTasks(@Query() query: TaskListQuery) {
    return this.tasks.list(query)
  }

  @Get('issuer/transfers')
  @Roles('issuer_admin', 'issuer_operator')
  @Permissions('transfer.view')
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  issuerTransfers(@Query() query: TransferQueueQuery) {
    return this.transfers.list(query)
  }

  @Get('issuer/tasks')
  @Roles('issuer_admin', 'issuer_operator')
  @Permissions('transfer.view', 'report.view')
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  issuerTasks(@Query() query: TaskListQuery) {
    return this.tasks.list(query)
  }

  @Get('shareholder/transfers')
  @Roles('shareholder')
  @Permissions('transfer.view', 'shareholder.transfer.create')
  @Scope({ accountPaths: ['query.accountId'], autoFillAccountPath: 'query.accountId' })
  shareholderTransfers(@Query() query: TransferQueueQuery) {
    return this.transfers.list(query)
  }

  @Get('shareholder/ballots')
  @Roles('shareholder')
  @Permissions('transfer.view')
  @Scope({ shareholderPaths: ['query.shareholderId'], autoFillShareholderPath: 'query.shareholderId' })
  shareholderBallots(@Query() query: BallotListQuery) {
    return this.voting.listBallots(query)
  }
}
