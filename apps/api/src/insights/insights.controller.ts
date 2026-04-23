import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'

import { ActivitySearchDto, CopilotQueryDto, TaskFocusDto } from './insights.dto.js'
import { InsightsService } from './insights.service.js'
import type { Insight } from './insights.types.js'

/**
 * Insight endpoints – grounded, AI-ready, safe to call without an LLM key.
 * All endpoints return the same `Insight` shape and can be rendered directly.
 */
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('meta')
  meta(): { llmEnabled: boolean } {
    return { llmEnabled: this.insightsService.llmEnabled() }
  }

  @Get('copilot')
  @Permissions('report.view')
  copilot(@Query() _query: CopilotQueryDto): Promise<Insight> {
    return this.insightsService.operationalCopilotInsight()
  }

  @Get('tasks/focus')
  @Permissions('task.manage')
  taskFocus(@Query() query: TaskFocusDto): Promise<Insight> {
    return this.insightsService.taskFocusInsight({
      assigneeId: query.assigneeId,
      issuerId: query.issuerId,
      limit: query.limit,
    })
  }

  @Get('anomalies')
  @Permissions('report.view')
  anomalies(): Promise<Insight> {
    return this.insightsService.anomalyInsight()
  }

  @Get('transfers/:id')
  @Permissions('transfer.view')
  transfer(@Param('id', ParseIntPipe) id: number): Promise<Insight> {
    return this.insightsService.transferInsight(id)
  }

  @Get('dividends/:id')
  @Permissions('dividend.manage')
  dividend(@Param('id') id: string): Promise<Insight> {
    return this.insightsService.dividendReadinessInsight(id)
  }

  @Get('issuers/:id')
  @Permissions('report.view')
  issuer(@Param('id') id: string): Promise<Insight> {
    return this.insightsService.issuerInsight(id)
  }

  @Get('shareholders/:id')
  @Permissions('shareholder.manage')
  shareholder(@Param('id') id: string): Promise<Insight> {
    return this.insightsService.shareholderInsight(id)
  }

  @Get('meetings/:id/turnout')
  @Permissions('meeting.manage')
  meeting(@Param('id') id: string): Promise<Insight> {
    return this.insightsService.meetingTurnoutInsight(id)
  }

  @Get('activity/search')
  @Permissions('report.view')
  activitySearch(@Query() query: ActivitySearchDto): Promise<Insight> {
    return this.insightsService.activitySearchInsight({
      entityType: query.entityType,
      issuerId: query.issuerId,
      limit: query.limit,
      q: query.q,
    })
  }
}
