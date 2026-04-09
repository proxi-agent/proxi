import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { ClerkAuthGuard } from './auth/clerk-auth.guard.js'
import { PermissionsGuard } from './auth/permissions.guard.js'
import { CasesModule } from './cases/cases.module.js'
import { DatabaseModule } from './database/database.module.js'
import { EvidenceModule } from './evidence/evidence.module.js'
import { LedgerModule } from './ledger/ledger.module.js'
import { OperationsModule } from './operations/operations.module.js'
import { RulesModule } from './rules/rules.module.js'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'

@Module({
  imports: [DatabaseModule, LedgerModule, CasesModule, EvidenceModule, OperationsModule, RulesModule],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ClerkAuthGuard }, { provide: APP_GUARD, useClass: PermissionsGuard }],
})
export class AppModule {}
