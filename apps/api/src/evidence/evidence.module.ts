import { Module } from '@nestjs/common'
import { EvidenceController } from './evidence.controller.js'

@Module({
  controllers: [EvidenceController],
})
export class EvidenceModule {}
