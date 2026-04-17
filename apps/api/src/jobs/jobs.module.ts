import { Module } from '@nestjs/common'

import { AiModule } from '../ai/ai.module.js'
import { CasesModule } from '../cases/cases.module.js'
import { OcrModule } from '../ocr/ocr.module.js'

import { JobsService } from './jobs.service.js'

@Module({
  imports: [AiModule, CasesModule, OcrModule],
  providers: [JobsService],
})
export class JobsModule {}
