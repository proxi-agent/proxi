import { Body, Controller, Post } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'
import type { CaseType } from '../cases/cases.service.js'

import { type RestrictionContext, RulesService } from './rules.service.js'

type EvaluateRulesBody = RestrictionContext & {
  fromHolderId?: string
  quantity?: number
  securityId: string
  toHolderId?: string
  type: CaseType
}

const REQUIREMENTS_BY_TYPE: Record<CaseType, string[]> = {
  CANCEL: ['Cancellation authorization', 'Supporting legal/tax release (if applicable)'],
  ISSUE: ['Board resolution approving issuance', 'Issuance instruction notice'],
  TRANSFER: ['Identity verification', 'Medallion signature guarantee', 'Stock power document', 'Transfer instruction letter'],
}

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  /**
   * Evaluate rules for a proposed transfer.  In this MVP we return a static checklist; you can plug in your own
   * policy engine here (e.g. to enforce Rule 144, lockups, or restricted legends).
   */
  @Post('evaluate')
  @Permissions('shareholder.transfer.create', 'transfer.review')
  async evaluate(@Body() body: EvaluateRulesBody) {
    const requirements = REQUIREMENTS_BY_TYPE[body.type] || []

    const evaluation = await this.rulesService.evaluate({
      companyApproval: body.companyApproval,
      fromHolderId: body.fromHolderId,
      hasLien: body.hasLien,
      lockupActive: body.lockupActive,
      quantity: body.quantity,
      secRestrictionActive: body.secRestrictionActive,
      securityId: body.securityId,
      toHolderId: body.toHolderId,
      type: body.type,
    })

    return {
      evaluation,
      requirements,
    }
  }
}
