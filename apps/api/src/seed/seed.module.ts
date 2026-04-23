import { Module } from '@nestjs/common'

import { DividendsModule } from '../dividends/dividends.module.js'
import { IssuersModule } from '../issuers/issuers.module.js'
import { LedgerModule } from '../ledger/ledger.module.js'
import { NoticesModule } from '../notices/notices.module.js'
import { SecuritiesModule } from '../securities/securities.module.js'
import { ShareholdersModule } from '../shareholders/shareholders.module.js'
import { VotingModule } from '../voting/voting.module.js'

import { SeedController } from './seed.controller.js'
import { SeedService } from './seed.service.js'

@Module({
  imports: [
    DividendsModule,
    IssuersModule,
    LedgerModule,
    NoticesModule,
    SecuritiesModule,
    ShareholdersModule,
    VotingModule,
  ],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
