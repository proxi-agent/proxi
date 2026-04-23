import { Module } from '@nestjs/common'

import { SecuritiesController } from './securities.controller.js'
import { SecuritiesService } from './securities.service.js'

@Module({
  controllers: [SecuritiesController],
  providers: [SecuritiesService],
  exports: [SecuritiesService],
})
export class SecuritiesModule {}
