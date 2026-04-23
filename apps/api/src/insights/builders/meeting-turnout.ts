import type { Meeting, ProposalTally } from '../../voting/voting.types.js'
import type { Insight, InsightSignal } from '../insights.types.js'

export interface MeetingTurnoutInputs {
  meeting: Meeting
  ballotsIssued: number
  ballotsSubmitted: number
  totalEligibleShares: number
  totalSharesVoted: number
  tallies: ProposalTally[]
  /** Turnout snapshot at the same hour on the previous business day, if available. */
  previousTurnoutPct?: number
}

export function buildMeetingTurnoutInsight(input: MeetingTurnoutInputs): Insight {
  const signals: InsightSignal[] = []
  const turnoutPct =
    input.totalEligibleShares > 0 ? (input.totalSharesVoted / input.totalEligibleShares) * 100 : 0
  const ballotPct = input.ballotsIssued > 0 ? (input.ballotsSubmitted / input.ballotsIssued) * 100 : 0

  if (input.meeting.status === 'OPEN') {
    if (turnoutPct < input.meeting.quorumPct) {
      signals.push({
        code: 'BELOW_QUORUM',
        detail: `${turnoutPct.toFixed(2)}% of eligible shares voted; ${input.meeting.quorumPct}% required for quorum.`,
        label: 'Below quorum threshold',
        severity: 'WARN',
      })
    } else {
      signals.push({
        code: 'QUORUM_MET',
        detail: `${turnoutPct.toFixed(2)}% of eligible shares have voted.`,
        label: 'Quorum already met',
        severity: 'SUCCESS',
      })
    }
  }

  if (input.previousTurnoutPct !== undefined) {
    const delta = turnoutPct - input.previousTurnoutPct
    signals.push({
      code: 'TURNOUT_DELTA',
      label:
        delta >= 0
          ? `Turnout is ${delta.toFixed(1)}pp higher than previous snapshot.`
          : `Turnout has dropped ${Math.abs(delta).toFixed(1)}pp since previous snapshot.`,
      severity: Math.abs(delta) > 5 ? 'WARN' : 'INFO',
    })
  }

  for (const tally of input.tallies) {
    if (tally.quorumMet && tally.passed) {
      signals.push({
        code: 'PROPOSAL_PASSING',
        detail: `${tally.for.toLocaleString()} FOR vs ${tally.against.toLocaleString()} AGAINST (${tally.approvalPct.toFixed(2)}% approval)`,
        label: `Proposal ${tally.proposalId}: passing`,
        severity: 'SUCCESS',
      })
    }
    if (tally.quorumMet && !tally.passed) {
      signals.push({
        code: 'PROPOSAL_FAILING',
        detail: `${tally.for.toLocaleString()} FOR vs ${tally.against.toLocaleString()} AGAINST (${tally.approvalPct.toFixed(2)}% approval, requires ${tally.requiredPct}%)`,
        label: `Proposal ${tally.proposalId}: failing`,
        severity: 'WARN',
      })
    }
  }

  const summary = [
    `${input.meeting.title} (${input.meeting.status}).`,
    `Ballots submitted ${input.ballotsSubmitted}/${input.ballotsIssued} (${ballotPct.toFixed(1)}%).`,
    `Shares voted ${input.totalSharesVoted.toLocaleString()}/${input.totalEligibleShares.toLocaleString()} (${turnoutPct.toFixed(2)}%).`,
    `Quorum requirement: ${input.meeting.quorumPct}%.`,
  ].join(' ')

  const headline = `${input.meeting.title}: ${turnoutPct.toFixed(1)}% turnout${turnoutPct >= input.meeting.quorumPct ? ' (quorum met)' : ' (below quorum)'}.`

  return {
    data: {
      ballotPct,
      ballotsIssued: input.ballotsIssued,
      ballotsSubmitted: input.ballotsSubmitted,
      quorumPct: input.meeting.quorumPct,
      tallies: input.tallies,
      turnoutPct,
    },
    generatedAt: new Date(),
    generator: 'HEURISTIC',
    headline,
    kind: 'MEETING_TURNOUT',
    recommendedActions: [],
    references: [{ id: input.meeting.id, kind: 'MEETING', label: input.meeting.title }],
    signals,
    subject: { id: input.meeting.id, label: input.meeting.title, type: 'MEETING' },
    summary,
  }
}
