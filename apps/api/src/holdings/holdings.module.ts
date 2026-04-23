import { Module } from '@nestjs/common'

import { HoldingsController } from './holdings.controller.js'
import { HoldingsService } from './holdings.service.js'

@Module({
  controllers: [HoldingsController],
  providers: [HoldingsService],
  exports: [HoldingsService],
})
export class HoldingsModule {}
