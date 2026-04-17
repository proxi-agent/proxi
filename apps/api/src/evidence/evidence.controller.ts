import { Body, Controller, Post } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { CasesService } from '../cases/cases.service.js'
import { DocumentsService } from '../documents/documents.service.js'

type UploadBody = {
  caseId: number
  checksumSha256?: string
  contentType: string
  docType: string
  fileName: string
  sizeBytes: number
}

@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly casesService: CasesService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('upload')
  @Permissions('shareholder.transfer.create', 'transfer.review')
  async upload(@Body() body: UploadBody, @CurrentRequest() request: AuthenticatedRequest) {
    const actor = request.authUser?.clerkUserId || request.authUser?.email || request.authUser?.name || 'unknown'
    const uploadIntent = await this.documentsService.createUploadIntent({
      caseId: body.caseId,
      contentType: body.contentType || 'application/octet-stream',
      fileName: body.fileName,
    })

    const document = await this.casesService.recordDocument({
      caseId: body.caseId,
      checksumSha256: body.checksumSha256,
      contentType: body.contentType || 'application/octet-stream',
      docType: body.docType,
      fileName: body.fileName,
      sizeBytes: body.sizeBytes || 0,
      storageBucket: uploadIntent.storageBucket,
      storageKey: uploadIntent.storageKey,
      uploadedBy: actor,
    })

    await this.casesService.submitEvidence(body.caseId, body.docType, actor)
    await this.casesService.markDocumentUploaded(body.caseId, uploadIntent.storageKey, actor)

    return {
      document,
      uploadUrl: uploadIntent.uploadUrl,
    }
  }
}
