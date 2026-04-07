import { Module } from '@nestjs/common'
import { CasesService } from './cases.service.js'
import { CasesController } from './cases.controller.js'
import { LedgerModule } from '../ledger/ledger.module.js'
import { RulesModule } from '../rules/rules.module.js'

@Module({
  imports: [LedgerModule, RulesModule],
  controllers: [CasesController],
  providers: [CasesService],
})
export class CasesModule {}
