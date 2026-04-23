import type { Case } from '../../cases/cases.service.js'
import type { Insight, InsightAction, InsightSignal } from '../insights.types.js'

/**
 * Build a transfer insight from a loaded case. Pure heuristic: every signal
 * and recommendation traces to a concrete field on the case.
 */
export function buildTransferInsight(caseData: Case): Insight {
  const signals: InsightSignal[] = []
  const actions: InsightAction[] = []

  if (caseData.restrictionBlockingReasons.length > 0) {
    signals.push({
      code: 'RESTRICTIONS_BLOCKED',
      detail: caseData.restrictionBlockingReasons.join('; '),
      label: 'Transfer blocked by restriction checks',
      severity: 'CRITICAL',
    })
    actions.push({
      action: 'OPEN_RESTRICTION_CHECKS',
      label: 'Review restriction checks',
      url: `/cases/${caseData.id}#restrictions`,
    })
  }

  if (caseData.missingEvidence.length > 0) {
    signals.push({
      code: 'EVIDENCE_MISSING',
      detail: caseData.missingEvidence.join(', '),
      label: `Missing ${caseData.missingEvidence.length} required document${caseData.missingEvidence.length === 1 ? '' : 's'}`,
      metadata: { missing: caseData.missingEvidence },
      severity: 'WARN',
    })
    actions.push({
      action: 'REQUEST_EVIDENCE',
      label: 'Request missing evidence',
      params: { caseId: caseData.id, docTypes: caseData.missingEvidence },
    })
  }

  if (caseData.lifecycleStage === 'AI_REVIEW_REQUIRED') {
    signals.push({
      code: 'AI_LOW_CONFIDENCE',
      detail:
        caseData.aiConfidence !== undefined
          ? `AI confidence ${(caseData.aiConfidence * 100).toFixed(0)}%; reviewer confirmation required.`
          : 'AI extraction flagged for human review.',
      label: 'AI extraction needs human review',
      severity: 'WARN',
    })
    actions.push({
      action: 'OPEN_AI_REVIEW',
      label: 'Open AI review panel',
      url: `/cases/${caseData.id}/ai-review`,
    })
  }

  if (caseData.lifecycleStage === 'EVIDENCE_PENDING') {
    signals.push({
      code: 'EVIDENCE_PENDING',
      label: 'Waiting on shareholder to supply evidence',
      severity: 'INFO',
    })
  }

  if (caseData.lifecycleStage === 'REVIEW_PENDING' && !caseData.assignedReviewerId) {
    signals.push({
      code: 'UNASSIGNED_REVIEWER',
      label: 'Review pending but no reviewer assigned',
      severity: 'WARN',
    })
    actions.push({ action: 'ASSIGN_REVIEWER', label: 'Assign a reviewer' })
  }

  if (caseData.lifecycleStage === 'LEDGER_POSTED' || caseData.lifecycleStage === 'COMPLETED') {
    signals.push({
      code: 'LEDGER_POSTED',
      detail: caseData.ledgerEventId ? `Ledger event #${caseData.ledgerEventId}` : undefined,
      label: 'Transfer settled on ledger',
      severity: 'SUCCESS',
    })
  }

  if (caseData.lifecycleStage === 'EXCEPTION') {
    signals.push({
      code: 'EXCEPTION',
      detail: caseData.failureReason,
      label: 'Transfer in exception state',
      severity: 'CRITICAL',
    })
  }

  const headline = buildHeadline(caseData, signals)
  const summary = buildSummary(caseData, signals)

  return {
    data: {
      aiConfidence: caseData.aiConfidence,
      assignedReviewerId: caseData.assignedReviewerId,
      intakeMethod: caseData.intakeMethod,
      lifecycleStage: caseData.lifecycleStage,
      missingEvidence: caseData.missingEvidence,
      restrictionBlockingReasons: caseData.restrictionBlockingReasons,
      status: caseData.status,
    },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'TRANSFER_SUMMARY',
    recommendedActions: actions,
    references: [{ id: String(caseData.id), kind: 'CASE', label: `Case #${caseData.id}` }],
    signals,
    subject: { id: String(caseData.id), label: `Transfer #${caseData.id}`, type: 'TRANSFER' },
    summary,
  }
}

function buildHeadline(caseData: Case, signals: InsightSignal[]): string {
  const blocker = signals.find(signal => signal.severity === 'CRITICAL')
  if (blocker) {
    return `Transfer #${caseData.id} is blocked: ${blocker.label}.`
  }
  if (signals.some(signal => signal.severity === 'WARN')) {
    return `Transfer #${caseData.id} needs attention (${caseData.lifecycleStage}).`
  }
  if (caseData.lifecycleStage === 'COMPLETED') {
    return `Transfer #${caseData.id} settled successfully.`
  }
  return `Transfer #${caseData.id} is in ${caseData.lifecycleStage.replaceAll('_', ' ').toLowerCase()}.`
}

function buildSummary(caseData: Case, signals: InsightSignal[]): string {
  const parts: string[] = []
  parts.push(
    `${caseData.type} of ${caseData.quantity.toLocaleString()} shares of ${caseData.securityId}` +
      (caseData.fromHolderId ? ` from ${caseData.fromHolderId}` : '') +
      (caseData.toHolderId ? ` to ${caseData.toHolderId}` : '') +
      `, status ${caseData.status}.`,
  )
  if (caseData.aiConfidence !== undefined) {
    parts.push(`AI extraction confidence ${(caseData.aiConfidence * 100).toFixed(0)}%.`)
  }
  if (signals.length === 0) {
    parts.push('No outstanding signals detected.')
  } else {
    const criticals = signals.filter(signal => signal.severity === 'CRITICAL')
    const warns = signals.filter(signal => signal.severity === 'WARN')
    if (criticals.length > 0) {
      parts.push(`Critical: ${criticals.map(signal => signal.label).join('; ')}.`)
    }
    if (warns.length > 0) {
      parts.push(`Warnings: ${warns.map(signal => signal.label).join('; ')}.`)
    }
  }
  return parts.join(' ')
}
