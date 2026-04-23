import { Module } from '@nestjs/common'

import { LedgerModule } from '../ledger/ledger.module.js'

import { VotingController } from './voting.controller.js'
import { VotingService } from './voting.service.js'

@Module({
  imports: [LedgerModule],
  controllers: [VotingController],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
