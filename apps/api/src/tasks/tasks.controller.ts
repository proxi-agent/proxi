import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import { CreateTaskDto, TaskListQuery, TransitionTaskDto, UpdateTaskDto } from './tasks.dto.js'
import { TasksService } from './tasks.service.js'

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Permissions('transfer.view', 'report.view')
  @Get()
  async list(@Query() query: TaskListQuery) {
    return this.tasksService.list(query)
  }

  @Permissions('transfer.view', 'report.view')
  @Get('stats')
  async stats(@Query('issuerId') issuerId?: string) {
    return this.tasksService.stats(issuerId)
  }

  @Permissions('transfer.view', 'report.view')
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.tasksService.get(id)
  }

  @Permissions('agent.admin', 'transfer.review')
  @Post()
  async create(@Body() body: CreateTaskDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.tasksService.create(body, actorFromRequest(request))
  }

  @Permissions('agent.admin', 'transfer.review')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.tasksService.update(id, body, actorFromRequest(request))
  }

  @Permissions('agent.admin', 'transfer.review')
  @Post(':id/transition')
  async transition(
    @Param('id') id: string,
    @Body() body: TransitionTaskDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.tasksService.transition(id, body, actorFromRequest(request))
  }
}
