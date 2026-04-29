import { Module } from '@nestjs/common'

import { TransferWorkflowModule } from '../transfer-workflow/transfer-workflow.module.js'
import { VotingModule } from '../voting/voting.module.js'

import { PortalController } from './portal.controller.js'

@Module({
  imports: [TransferWorkflowModule, VotingModule],
  controllers: [PortalController],
})
export class PortalModule {}
