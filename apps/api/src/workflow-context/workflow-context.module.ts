import { Module } from '@nestjs/common'

import { WorkflowContextController } from './workflow-context.controller.js'
import { WorkflowContextService } from './workflow-context.service.js'

@Module({
  controllers: [WorkflowContextController],
  providers: [WorkflowContextService],
  exports: [WorkflowContextService],
})
export class WorkflowContextModule {}
