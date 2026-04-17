import { Module } from '@nestjs/common'

import { TransferAiService } from './transfer-ai.service.js'

@Module({
  providers: [TransferAiService],
  exports: [TransferAiService],
})
export class AiModule {}
