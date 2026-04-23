import { Module } from '@nestjs/common'

import { LedgerModule } from '../ledger/ledger.module.js'
import { ShareholdersModule } from '../shareholders/shareholders.module.js'

import { DividendsController } from './dividends.controller.js'
import { DividendsService } from './dividends.service.js'

@Module({
  imports: [LedgerModule, ShareholdersModule],
  controllers: [DividendsController],
  providers: [DividendsService],
  exports: [DividendsService],
})
export class DividendsModule {}
