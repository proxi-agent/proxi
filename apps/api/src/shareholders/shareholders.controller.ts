import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { Roles } from '../auth/roles.decorator.js'
import { Scope } from '../auth/scope.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import { CreateAccountDto, CreateShareholderDto, ShareholderListQuery, UpdateAccountDto, UpdateShareholderDto } from './shareholders.dto.js'
import { ShareholdersService } from './shareholders.service.js'

@Controller('shareholders')
export class ShareholdersController {
  constructor(private readonly shareholdersService: ShareholdersService) {}

  @Permissions('transfer.view', 'report.view')
  @Roles('agent_admin', 'issuer_admin', 'issuer_operator', 'super_admin', 'transfer_agent_admin')
  @Get()
  @Scope({
    issuerPaths: ['query.issuerId'],
    autoFillIssuerPath: 'query.issuerId',
  })
  async list(@Query() query: ShareholderListQuery) {
    return this.shareholdersService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Roles('agent_admin', 'issuer_admin', 'issuer_operator', 'super_admin', 'transfer_agent_admin')
  @Get(':id')
  @Scope({ entityRule: { entity: 'shareholder' } })
  async getOne(@Param('id') id: string) {
    return this.shareholdersService.getById(id)
  }

  @Permissions('agent.admin', 'user.manage')
  @Post()
  @Scope({ issuerPaths: ['body.issuerId'], autoFillIssuerPath: 'body.issuerId' })
  async create(@Body() body: CreateShareholderDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.shareholdersService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin', 'user.manage')
  @Patch(':id')
  @Scope({ entityRule: { entity: 'shareholder' } })
  async update(@Param('id') id: string, @Body() body: UpdateShareholderDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.shareholdersService.update(id, body, actorFromRequest(request))
  }

  @Permissions('transfer.view', 'report.view')
  @Roles('agent_admin', 'issuer_admin', 'issuer_operator', 'super_admin', 'transfer_agent_admin')
  @Get(':id/accounts')
  @Scope({ entityRule: { entity: 'shareholder' } })
  async accounts(@Param('id') id: string) {
    return this.shareholdersService.listAccounts(id)
  }

  @Permissions('agent.admin', 'user.manage')
  @Post('accounts')
  @Scope({
    issuerPaths: ['body.issuerId'],
    shareholderPaths: ['body.shareholderId'],
    autoFillIssuerPath: 'body.issuerId',
  })
  async createAccount(@Body() body: CreateAccountDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.shareholdersService.addAccount(body, actorFromRequest(request))
  }

  @Permissions('agent.admin', 'user.manage')
  @Patch('accounts/:id')
  @Scope({ entityRule: { entity: 'account' } })
  async updateAccount(@Param('id') id: string, @Body() body: UpdateAccountDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.shareholdersService.updateAccount(id, body, actorFromRequest(request))
  }
}
