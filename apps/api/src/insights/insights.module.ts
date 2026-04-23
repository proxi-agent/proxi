import { Module } from '@nestjs/common'

import { AuditModule } from '../audit/audit.module.js'
import { CasesModule } from '../cases/cases.module.js'
import { DividendsModule } from '../dividends/dividends.module.js'
import { IssuersModule } from '../issuers/issuers.module.js'
import { LedgerModule } from '../ledger/ledger.module.js'
import { ReportingModule } from '../reporting/reporting.module.js'
import { ShareholdersModule } from '../shareholders/shareholders.module.js'
import { TasksModule } from '../tasks/tasks.module.js'
import { VotingModule } from '../voting/voting.module.js'

import { InsightsController } from './insights.controller.js'
import { InsightsService } from './insights.service.js'
import { InsightsLlmService } from './llm.service.js'

@Module({
  imports: [
    AuditModule,
    CasesModule,
    DividendsModule,
    IssuersModule,
    LedgerModule,
    ReportingModule,
    ShareholdersModule,
    TasksModule,
    VotingModule,
  ],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsLlmService],
  exports: [InsightsService],
})
export class InsightsModule {}
