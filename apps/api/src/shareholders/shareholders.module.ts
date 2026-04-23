import { Module } from '@nestjs/common'

import { ShareholdersController } from './shareholders.controller.js'
import { ShareholdersService } from './shareholders.service.js'

@Module({
  controllers: [ShareholdersController],
  providers: [ShareholdersService],
  exports: [ShareholdersService],
})
export class ShareholdersModule {}
