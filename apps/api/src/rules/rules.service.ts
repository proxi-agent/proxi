import { Injectable } from '@nestjs/common'

import type { CaseType } from '../cases/cases.service.js'
import { LedgerService, type Position } from '../ledger/ledger.service.js'

export interface RestrictionContext {
  companyApproval?: boolean
  hasLien?: boolean
  lockupActive?: boolean
  secRestrictionActive?: boolean
}

export interface RestrictionCheck {
  blocking: boolean
  detail: string
  name: string
  passed: boolean
}

export interface RestrictionEvaluation {
  blockingReasons: string[]
  checks: RestrictionCheck[]
  eligible: boolean
}

export interface EvaluateRulesInput extends RestrictionContext {
  fromHolderId?: string
  quantity?: number
  securityId: string
  toHolderId?: string
  type: CaseType
}

@Injectable()
export class RulesService {
  constructor(private readonly ledgerService: LedgerService) {}

  async evaluateTransferEligibility(input: EvaluateRulesInput): Promise<RestrictionEvaluation> {
    const checks: RestrictionCheck[] = []
    const quantity = Number(input.quantity || 0)
    const fromHolderId = input.fromHolderId || ''
    const toHolderId = input.toHolderId || ''

    const positions = await this.ledgerService.getPositions()
    const currentPosition = positions.find(
      (position: Position) => position.securityId === input.securityId && position.holderId === fromHolderId,
    )
    const availableUnits = currentPosition?.quantity || 0

    checks.push({
      blocking: true,
      detail: `Available units: ${availableUnits}. Requested: ${quantity}.`,
      name: 'Ownership balance check',
      passed: availableUnits >= quantity,
    })

    checks.push({
      blocking: true,
      detail: 'From and To holder accounts must be different.',
      name: 'Distinct holder check',
      passed: Boolean(fromHolderId && toHolderId && fromHolderId !== toHolderId),
    })

    checks.push({
      blocking: true,
      detail: 'Transfer blocked while lock-up period is active.',
      name: 'Lock-up restriction check',
      passed: !input.lockupActive,
    })

    checks.push({
      blocking: true,
      detail: 'Transfer blocked while SEC restriction is active.',
      name: 'SEC restriction check',
      passed: !input.secRestrictionActive,
    })

    checks.push({
      blocking: true,
      detail: 'Transfer blocked because a lien/hold exists.',
      name: 'Lien/hold check',
      passed: !input.hasLien,
    })

    checks.push({
      blocking: true,
      detail: 'Company approval required when restrictions are flagged.',
      name: 'Company approval check',
      passed: !input.secRestrictionActive || Boolean(input.companyApproval),
    })

    const blockingReasons = checks.filter(check => check.blocking && !check.passed).map(check => check.name)
    return {
      blockingReasons,
      checks,
      eligible: blockingReasons.length === 0,
    }
  }

  async evaluate(input: EvaluateRulesInput): Promise<RestrictionEvaluation> {
    if (input.type === 'TRANSFER') {
      return this.evaluateTransferEligibility(input)
    }
    return {
      blockingReasons: [],
      checks: [],
      eligible: true,
    }
  }
}
