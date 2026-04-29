import { Module } from '@nestjs/common'

import { LedgerModule } from '../ledger/ledger.module.js'

import { DividendsController } from './dividends.controller.js'
import { DividendsService } from './dividends.service.js'

@Module({
  imports: [LedgerModule],
  controllers: [DividendsController],
  providers: [DividendsService],
  exports: [DividendsService],
})
export class DividendsModule {}
