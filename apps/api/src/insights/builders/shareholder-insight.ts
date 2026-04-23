import type { AuditEvent } from '../../audit/audit.types.js'
import type { Shareholder, ShareholderAccount } from '../../shareholders/shareholders.types.js'
import type { Insight, InsightSignal } from '../insights.types.js'

export interface ShareholderInsightInputs {
  shareholder: Shareholder
  accounts: ShareholderAccount[]
  holdings: Array<{ accountNumber: string; quantity: number; securityId: string }>
  recentEvents: AuditEvent[]
  pendingTransferCount: number
  openTaskCount: number
  pendingEntitlementCount: number
  pendingEntitlementAmountCents: number
}

export function buildShareholderInsight(input: ShareholderInsightInputs): Insight {
  const signals: InsightSignal[] = []

  if (input.shareholder.kycStatus !== 'APPROVED') {
    signals.push({
      code: 'KYC_OUTSTANDING',
      label: `KYC status: ${input.shareholder.kycStatus}`,
      severity: input.shareholder.kycStatus === 'REJECTED' ? 'CRITICAL' : 'WARN',
    })
  }

  if (input.shareholder.riskTier === 'HIGH') {
    signals.push({
      code: 'HIGH_RISK_TIER',
      label: 'Risk tier: HIGH – enhanced review required',
      severity: 'WARN',
    })
  }

  if (input.shareholder.status !== 'ACTIVE') {
    signals.push({
      code: 'SHAREHOLDER_STATUS',
      label: `Shareholder status: ${input.shareholder.status}`,
      severity: 'WARN',
    })
  }

  if (input.pendingTransferCount > 0) {
    signals.push({
      code: 'PENDING_TRANSFERS',
      label: `${input.pendingTransferCount} pending transfer${input.pendingTransferCount === 1 ? '' : 's'}`,
      severity: 'INFO',
    })
  }

  if (input.pendingEntitlementCount > 0) {
    signals.push({
      code: 'PENDING_ENTITLEMENTS',
      detail: `$${(input.pendingEntitlementAmountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} pending across ${input.pendingEntitlementCount} entitlement${input.pendingEntitlementCount === 1 ? '' : 's'}.`,
      label: `${input.pendingEntitlementCount} unpaid entitlement${input.pendingEntitlementCount === 1 ? '' : 's'}`,
      severity: 'INFO',
    })
  }

  const totalShares = input.holdings.reduce((acc, h) => acc + h.quantity, 0)
  const positionSummary = input.holdings
    .filter(h => h.quantity > 0)
    .slice(0, 5)
    .map(h => `${h.quantity.toLocaleString()} ${h.securityId}${h.accountNumber ? ` (${h.accountNumber})` : ''}`)
    .join(', ')

  const summary = [
    `${input.shareholder.legalName} (${input.shareholder.classification}/${input.shareholder.holderKind}).`,
    `${input.accounts.length} account${input.accounts.length === 1 ? '' : 's'}; ${totalShares.toLocaleString()} total shares across ${input.holdings.filter(h => h.quantity > 0).length} position${input.holdings.filter(h => h.quantity > 0).length === 1 ? '' : 's'}${positionSummary ? `: ${positionSummary}` : ''}.`,
    `${input.recentEvents.length} recent event${input.recentEvents.length === 1 ? '' : 's'} in audit log.`,
    input.openTaskCount > 0 ? `${input.openTaskCount} open task${input.openTaskCount === 1 ? '' : 's'} referencing this shareholder.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const headline =
    signals.find(signal => signal.severity === 'CRITICAL')?.label ||
    `${input.shareholder.legalName}: ${totalShares.toLocaleString()} shares across ${input.accounts.length} account${input.accounts.length === 1 ? '' : 's'}.`

  return {
    data: {
      accountCount: input.accounts.length,
      kycStatus: input.shareholder.kycStatus,
      openTasks: input.openTaskCount,
      pendingEntitlements: input.pendingEntitlementCount,
      pendingTransfers: input.pendingTransferCount,
      riskTier: input.shareholder.riskTier,
      totalShares,
    },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'SHAREHOLDER_SUMMARY',
    recommendedActions: [],
    references: [{ id: input.shareholder.id, kind: 'SHAREHOLDER', label: input.shareholder.legalName }],
    signals,
    subject: { id: input.shareholder.id, label: input.shareholder.legalName, type: 'SHAREHOLDER' },
    summary,
  }
}
