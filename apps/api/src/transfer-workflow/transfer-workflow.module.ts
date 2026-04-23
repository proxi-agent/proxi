import { Module } from '@nestjs/common'

import { TransferWorkflowController } from './transfer-workflow.controller.js'
import { TransferWorkflowService } from './transfer-workflow.service.js'

@Module({
  controllers: [TransferWorkflowController],
  providers: [TransferWorkflowService],
  exports: [TransferWorkflowService],
})
export class TransferWorkflowModule {}
