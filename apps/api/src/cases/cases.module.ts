import { Module } from '@nestjs/common'

import { LedgerModule } from '../ledger/ledger.module.js'
import { RulesModule } from '../rules/rules.module.js'

import { CasesController } from './cases.controller.js'
import { CasesService } from './cases.service.js'

@Module({
  imports: [LedgerModule, RulesModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
