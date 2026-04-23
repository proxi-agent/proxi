import { Controller, Get, Param } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'
import { Scope } from '../auth/scope.decorator.js'

import { WorkflowContextService } from './workflow-context.service.js'
import type { WorkflowContextBundle } from './workflow-context.types.js'

/**
 * Cross-domain "case context" endpoints. One route per workflow kind;
 * all return the same `WorkflowContextBundle` shape, which makes it
 * trivial to render the same context panel across Transfer, Dividend,
 * and Meeting admin pages.
 */
@Controller('workflow-context')
export class WorkflowContextController {
  constructor(private readonly service: WorkflowContextService) {}

  @Permissions('transfer.view')
  @Get('transfer/:id')
  @Scope({ entityRule: { entity: 'transfer' } })
  transfer(@Param('id') id: string): Promise<WorkflowContextBundle> {
    return this.service.forTransfer(id)
  }

  @Permissions('report.view')
  @Get('dividend/:id')
  @Scope({ entityRule: { entity: 'dividend' } })
  dividend(@Param('id') id: string): Promise<WorkflowContextBundle> {
    return this.service.forDividend(id)
  }

  @Permissions('report.view')
  @Get('meeting/:id')
  @Scope({ entityRule: { entity: 'meeting' } })
  meeting(@Param('id') id: string): Promise<WorkflowContextBundle> {
    return this.service.forMeeting(id)
  }
}
