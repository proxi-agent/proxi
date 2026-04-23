import { Module } from '@nestjs/common'

import { CasesModule } from '../cases/cases.module.js'

import { TransfersController } from './transfers.controller.js'
import { TransfersService } from './transfers.service.js'

@Module({
  imports: [CasesModule],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
