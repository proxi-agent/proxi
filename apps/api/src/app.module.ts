import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { AuditModule } from './audit/audit.module.js'
import { ClerkAuthGuard } from './auth/clerk-auth.guard.js'
import { PermissionsGuard } from './auth/permissions.guard.js'
import { CasesModule } from './cases/cases.module.js'
import { DatabaseModule } from './database/database.module.js'
import { DividendsModule } from './dividends/dividends.module.js'
import { EvidenceModule } from './evidence/evidence.module.js'
import { HoldingsModule } from './holdings/holdings.module.js'
import { InsightsModule } from './insights/insights.module.js'
import { IssuersModule } from './issuers/issuers.module.js'
import { JobsModule } from './jobs/jobs.module.js'
import { LedgerModule } from './ledger/ledger.module.js'
import { NoticesModule } from './notices/notices.module.js'
import { OperationsModule } from './operations/operations.module.js'
import { ReportingModule } from './reporting/reporting.module.js'
import { RulesModule } from './rules/rules.module.js'
import { SecuritiesModule } from './securities/securities.module.js'
import { SeedModule } from './seed/seed.module.js'
import { ShareholdersModule } from './shareholders/shareholders.module.js'
import { TasksModule } from './tasks/tasks.module.js'
import { TransfersModule } from './transfers/transfers.module.js'
import { VotingModule } from './voting/voting.module.js'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'

@Module({
  imports: [
    AuditModule,
    CasesModule,
    DatabaseModule,
    DividendsModule,
    EvidenceModule,
    HoldingsModule,
    InsightsModule,
    IssuersModule,
    JobsModule,
    LedgerModule,
    NoticesModule,
    OperationsModule,
    ReportingModule,
    RulesModule,
    SecuritiesModule,
    SeedModule,
    ShareholdersModule,
    TasksModule,
    TransfersModule,
    VotingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
