import { Body, Controller, Post } from '@nestjs/common'
import { Permissions } from '../auth/permissions.decorator.js'
import type { CaseType } from '../cases/cases.service.ts'
import { RulesService } from './rules.service.js'

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  /**
   * Evaluate rules for a proposed transfer.  In this MVP we return a static checklist; you can plug in your own
   * policy engine here (e.g. to enforce Rule 144, lockups, or restricted legends).
   */
  @Post('evaluate')
  @Permissions('shareholder.transfer.create', 'transfer.review')
  async evaluate(@Body() body: any) {
    const type = body.type as CaseType
    const requirements = [] as string[]
    if (type === 'TRANSFER') {
      requirements.push('Identity verification')
      requirements.push('Medallion signature guarantee')
      requirements.push('Stock power document')
      requirements.push('Transfer instruction letter')
    } else if (type === 'ISSUE') {
      requirements.push('Board resolution approving issuance')
      requirements.push('Issuance instruction notice')
    } else if (type === 'CANCEL') {
      requirements.push('Cancellation authorization')
      requirements.push('Supporting legal/tax release (if applicable)')
    }

    const evaluation = await this.rulesService.evaluate({
      companyApproval: body.companyApproval,
      fromHolderId: body.fromHolderId,
      hasLien: body.hasLien,
      lockupActive: body.lockupActive,
      quantity: body.quantity,
      secRestrictionActive: body.secRestrictionActive,
      securityId: body.securityId,
      toHolderId: body.toHolderId,
      type,
    })

    return {
      evaluation,
      requirements,
    }
  }
}
