import { Body, Controller, Get, HttpException, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'
import type { RestrictionContext } from '../rules/rules.service.js'

import type { Case, CaseType } from './cases.service.js'
import { CasesService } from './cases.service.js'

class CreateCaseDto {
  type!: CaseType
  securityId!: string
  quantity!: number
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  evidenceDocs?: string[]
  restrictionContext?: RestrictionContext
}

class SubmitEvidenceDto {
  docType!: string
}

class ReprocessCaseDto {
  restrictionContext?: RestrictionContext
}

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

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
  async createCase(@Body() body: CreateCaseDto): Promise<Case> {
    const { type, securityId, quantity, fromHolderId, toHolderId, holderId, evidenceDocs, restrictionContext } = body
    if (!type || !securityId || typeof quantity !== 'number' || quantity <= 0) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.createCase({
      evidenceDocs,
      fromHolderId,
      holderId,
      quantity,
      restrictionContext,
      securityId,
      toHolderId,
      type,
    })
  }

  @Permissions('shareholder.transfer.create', 'transfer.review')
  @Post(':id/evidence')
  async submitEvidence(@Param('id', ParseIntPipe) id: number, @Body() body: SubmitEvidenceDto): Promise<Case> {
    if (!body.docType) {
      throw new HttpException('docType is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.submitEvidence(id, body.docType)
  }

  @Permissions('transfer.review')
  @Post(':id/reprocess')
  async reprocessCase(@Param('id', ParseIntPipe) id: number, @Body() body: ReprocessCaseDto): Promise<Case> {
    return this.casesService.reprocessCase(id, body.restrictionContext)
  }
}
