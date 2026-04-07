import { Body, Controller, Get, Param, ParseIntPipe, Post, HttpException, HttpStatus } from '@nestjs/common'
import { CasesService } from './cases.service.js'
import type { Case, CaseType } from './cases.service.js'
import type { RestrictionContext } from '../rules/rules.service.js'

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

  @Get()
  getCases(): Case[] {
    return this.casesService.getCases()
  }

  @Get(':id')
  getCase(@Param('id', ParseIntPipe) id: number): Case {
    return this.casesService.getCaseById(id)
  }

  @Post()
  createCase(@Body() body: CreateCaseDto): Case {
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

  @Post(':id/evidence')
  submitEvidence(@Param('id', ParseIntPipe) id: number, @Body() body: SubmitEvidenceDto): Case {
    if (!body.docType) {
      throw new HttpException('docType is required', HttpStatus.BAD_REQUEST)
    }
    return this.casesService.submitEvidence(id, body.docType)
  }

  @Post(':id/reprocess')
  reprocessCase(@Param('id', ParseIntPipe) id: number, @Body() body: ReprocessCaseDto): Case {
    return this.casesService.reprocessCase(id, body.restrictionContext)
  }
}
