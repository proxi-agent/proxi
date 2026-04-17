import { Module } from '@nestjs/common'

import { CasesModule } from '../cases/cases.module.js'
import { DocumentsModule } from '../documents/documents.module.js'

import { EvidenceController } from './evidence.controller.js'

@Module({
  imports: [CasesModule, DocumentsModule],
  controllers: [EvidenceController],
})
export class EvidenceModule {}
