import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import type { RestrictionContext } from '../rules/rules.service.js'

import type { Case, CaseType, IntakeMethod, TransferCanonicalData } from './cases.service.js'
import { CasesService } from './cases.service.js'

class CreateCaseDto {
  intakeMethod?: IntakeMethod
  type!: CaseType
  securityId!: string
  quantity!: number
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  evidenceDocs?: string[]
  canonicalTransferData?: TransferCanonicalData
  restrictionContext?: RestrictionContext
}

class SubmitEvidenceDto {
  docType!: string
}

class ReprocessCaseDto {
  restrictionContext?: RestrictionContext
}

class GuidedIntakeDto {
  canonicalTransferData!: TransferCanonicalData
}

class AssignReviewerDto {
  reviewerId!: string
}

class DecisionDto {
  notes?: string
  reason?: string
}

class OverrideAiDto {
  patch!: TransferCanonicalData
  reason!: string
}

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  private actorFromRequest(request: AuthenticatedRequest): string {
    return request.authUser?.clerkUserId || request.authUser?.email || request.authUser?.name || 'unknown'
  }

  @Permissions('transfer.view')
  @Get()
  async getCases(): Promise<Case[]> {
    return this.casesService.getCases()
  }

  @Permissions('transfer.view')
  @Get(':id')
  async getCase(@Param('id', ParseIntPipe) id: number): Promise<Case> {
    return this.casesService.getCaseById(id)
  }

  @Permissions('shareholder.transfer.create', 'transfer.review')
  @Post()
  async createCase(@Body() body: CreateCaseDto, @CurrentRequest() request: AuthenticatedRequest): Promise<Case> {
    const { type, securityId, quantity, fromHolderId, toHolderId, holderId, evidenceDocs, restrictionContext, canonicalTransferData } = body
    if (!type || !securityId || typeof quantity !== 'number' || quantity <= 0) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.createCase({
      actor: this.actorFromRequest(request),
      canonicalTransferData,
      evidenceDocs,
      fromHolderId,
      holderId,
      intakeMethod: body.intakeMethod || 'GUIDED_ENTRY',
      quantity,
      restrictionContext,
      securityId,
      toHolderId,
      type,
    })
  }

  @Permissions('shareholder.transfer.create', 'transfer.review')
  @Post(':id/evidence')
  async submitEvidence(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SubmitEvidenceDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    if (!body.docType) {
      throw new HttpException('docType is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.submitEvidence(id, body.docType, this.actorFromRequest(request))
  }

  @Permissions('shareholder.transfer.create', 'transfer.review')
  @Post(':id/guided-intake')
  async submitGuidedIntake(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: GuidedIntakeDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    if (!body.canonicalTransferData || typeof body.canonicalTransferData !== 'object') {
      throw new HttpException('canonicalTransferData is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.submitGuidedIntake(id, body.canonicalTransferData, this.actorFromRequest(request))
  }

  @Permissions('transfer.review')
  @Post(':id/reprocess')
  async reprocessCase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReprocessCaseDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    return this.casesService.reprocessCase(id, body.restrictionContext, this.actorFromRequest(request))
  }

  @Permissions('transfer.review')
  @Post(':id/assign-reviewer')
  async assignReviewer(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignReviewerDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    if (!body.reviewerId) {
      throw new HttpException('reviewerId is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.assignReviewer(id, body.reviewerId, this.actorFromRequest(request))
  }

  @Permissions('transfer.review')
  @Post(':id/approve')
  async approveCase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DecisionDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    return this.casesService.approveCase(id, this.actorFromRequest(request), body.reason, body.notes)
  }

  @Permissions('transfer.review')
  @Post(':id/reject')
  async rejectCase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DecisionDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    if (!body.reason) {
      throw new HttpException('reason is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.rejectCase(id, this.actorFromRequest(request), body.reason, body.notes)
  }

  @Permissions('transfer.review')
  @Post(':id/request-fixes')
  async requestFixes(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DecisionDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    if (!body.reason) {
      throw new HttpException('reason is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.requestFixes(id, this.actorFromRequest(request), body.reason, body.notes)
  }

  @Permissions('transfer.review')
  @Post(':id/override-ai')
  async overrideAi(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: OverrideAiDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ): Promise<Case> {
    if (!body.reason || !body.patch || typeof body.patch !== 'object') {
      throw new HttpException('reason and patch are required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.overrideAi(id, this.actorFromRequest(request), body.reason, body.patch)
  }
}
