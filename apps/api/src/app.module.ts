import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { LedgerModule } from './ledger/ledger.module.js'
import { CasesModule } from './cases/cases.module.js'
import { EvidenceModule } from './evidence/evidence.module.js'
import { OperationsModule } from './operations/operations.module.js'
import { RulesModule } from './rules/rules.module.js'

@Module({
  imports: [LedgerModule, CasesModule, EvidenceModule, OperationsModule, RulesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
