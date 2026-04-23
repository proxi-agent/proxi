import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { Roles } from '../auth/roles.decorator.js'
import { Scope } from '../auth/scope.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import { CreateTaskDto, TaskListQuery, TransitionTaskDto, UpdateTaskDto } from './tasks.dto.js'
import { TasksService } from './tasks.service.js'

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Permissions('transfer.view', 'report.view')
  @Roles('agent_admin', 'issuer_admin', 'issuer_operator', 'super_admin', 'transfer_agent_admin')
  @Get()
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  async list(@Query() query: TaskListQuery) {
    return this.tasksService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Roles('agent_admin', 'issuer_admin', 'issuer_operator', 'super_admin', 'transfer_agent_admin')
  @Get('stats')
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  async stats(@Query('issuerId') issuerId?: string) {
    return this.tasksService.stats(issuerId)
  }

  @Permissions('transfer.view', 'report.view')
  @Roles('agent_admin', 'issuer_admin', 'issuer_operator', 'super_admin', 'transfer_agent_admin')
  @Get(':id')
  @Scope({ entityRule: { entity: 'task' } })
  async get(@Param('id') id: string) {
    return this.tasksService.get(id)
  }

  @Permissions('agent.admin', 'transfer.review')
  @Post()
  @Scope({ issuerPaths: ['body.issuerId'], autoFillIssuerPath: 'body.issuerId' })
  async create(@Body() body: CreateTaskDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.tasksService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin', 'transfer.review')
  @Patch(':id')
  @Scope({ entityRule: { entity: 'task' } })
  async update(@Param('id') id: string, @Body() body: UpdateTaskDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.tasksService.update(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin', 'transfer.review')
  @Post(':id/transition')
  @Scope({ entityRule: { entity: 'task' } })
  async transition(@Param('id') id: string, @Body() body: TransitionTaskDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.tasksService.transition(id, body, actorFromRequest(request))
  }
}
