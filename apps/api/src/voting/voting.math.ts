import type { ProposalTally, Vote, VoteChoice } from './voting.types.js'

export function tallyVotes(
  input: {
    proposalId: string
    requiredPct: number
    totalEligibleShares: number
    quorumPct: number
    votes: Array<Pick<Vote, 'choice' | 'sharesCast'>>
  },
): ProposalTally {
  const counts: Record<VoteChoice, number> = { ABSTAIN: 0, AGAINST: 0, FOR: 0 }
  for (const vote of input.votes) {
    counts[vote.choice] += vote.sharesCast
  }
  const totalCastShares = counts.FOR + counts.AGAINST + counts.ABSTAIN
  const forAgainstTotal = counts.FOR + counts.AGAINST
  const approvalPct = forAgainstTotal > 0 ? (counts.FOR / forAgainstTotal) * 100 : 0
  const quorumMet =
    input.totalEligibleShares > 0 && (totalCastShares / input.totalEligibleShares) * 100 >= input.quorumPct
  const passed = quorumMet && approvalPct >= input.requiredPct
  return {
    abstain: counts.ABSTAIN,
    against: counts.AGAINST,
    approvalPct: round2(approvalPct),
    for: counts.FOR,
    passed,
    proposalId: input.proposalId,
    quorumMet,
    requiredPct: input.requiredPct,
    totalCastShares,
    totalShares: input.totalEligibleShares,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
