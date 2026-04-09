import { Module } from '@nestjs/common'

import { LedgerModule } from '../ledger/ledger.module.js'

import { RulesController } from './rules.controller.js'
import { RulesService } from './rules.service.js'

@Module({
  imports: [LedgerModule],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
