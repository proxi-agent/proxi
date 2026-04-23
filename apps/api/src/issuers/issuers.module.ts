import { Module } from '@nestjs/common'

import { IssuersController } from './issuers.controller.js'
import { IssuersService } from './issuers.service.js'

@Module({
  controllers: [IssuersController],
  providers: [IssuersService],
  exports: [IssuersService],
})
export class IssuersModule {}
