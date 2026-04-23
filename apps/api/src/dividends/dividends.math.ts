/**
 * Pure dividend math. Keep free of framework imports so it can be unit-tested easily.
 */

export interface HolderSnapshot {
  holderId: string
  quantity: number
}

export interface EntitlementDraft {
  holderId: string
  sharesHeld: number
  amountCents: number
}

export function computeEntitlements(positions: HolderSnapshot[], ratePerShareCents: number): EntitlementDraft[] {
  if (!Number.isFinite(ratePerShareCents) || ratePerShareCents < 0) {
    throw new Error('ratePerShareCents must be a non-negative finite number')
  }
  return positions
    .filter(position => position.quantity > 0)
    .map(position => ({
      amountCents: Math.round(position.quantity * ratePerShareCents),
      holderId: position.holderId,
      sharesHeld: position.quantity,
    }))
    .sort((a, b) => a.holderId.localeCompare(b.holderId))
}

export function totalDistributionCents(entitlements: Array<{ amountCents: number }>): number {
  return entitlements.reduce((sum, entitlement) => sum + entitlement.amountCents, 0)
}

export function isValidRecordDate(recordDate: string, paymentDate: string, declarationDate: string): boolean {
  const rec = Date.parse(recordDate)
  const pay = Date.parse(paymentDate)
  const dec = Date.parse(declarationDate)
  if (Number.isNaN(rec) || Number.isNaN(pay) || Number.isNaN(dec)) {
    return false
  }
  return dec <= rec && rec <= pay
}
