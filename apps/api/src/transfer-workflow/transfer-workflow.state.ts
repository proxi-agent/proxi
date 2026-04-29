import { TransferLifecycleStage, TransferState } from '../generated/prisma/client.js'

/**
 * Stock-transfer state machine.
 *
 * Product-visible lifecycle:
 *
 *   DRAFT ─────────► SUBMITTED ─────► UNDER_REVIEW ──► APPROVED ──► SETTLED
 *                        │               ▲    │            │
 *                        │               │    ▼            ▼
 *                        │          NEEDS_INFO        (terminal)
 *                        │               │
 *                        ▼               ▼
 *                    CANCELLED       REJECTED  (terminal)
 *
 * `NEEDS_INFO` lets reviewers bounce a request back to the submitter without
 * killing the case. `CANCELLED` is reachable from any non-terminal state so
 * operations can close requests that were mistakenly filed.
 *
 * Terminal states: SETTLED, REJECTED, CANCELLED.
 *
 * This file is the single source of truth for state transitions. The service
 * calls `assertTransferTransition` on every state change; callers should not
 * mutate `state` directly.
 */

const TERMINAL_STATES = new Set<TransferState>([TransferState.CANCELLED, TransferState.REJECTED, TransferState.SETTLED])

const ALLOWED_TRANSITIONS: Record<TransferState, readonly TransferState[]> = {
  [TransferState.DRAFT]: [TransferState.SUBMITTED, TransferState.CANCELLED],
  [TransferState.SUBMITTED]: [TransferState.UNDER_REVIEW, TransferState.CANCELLED],
  [TransferState.UNDER_REVIEW]: [TransferState.NEEDS_INFO, TransferState.APPROVED, TransferState.REJECTED, TransferState.CANCELLED],
  [TransferState.NEEDS_INFO]: [TransferState.UNDER_REVIEW, TransferState.CANCELLED],
  [TransferState.APPROVED]: [TransferState.SETTLED, TransferState.CANCELLED],
  [TransferState.REJECTED]: [],
  [TransferState.SETTLED]: [],
  [TransferState.CANCELLED]: [],
}

/**
 * Coarse reviewer-queue bucket, derived from the fine-grained state.
 *
 * This keeps reviewer dashboards stable even if we add new lifecycle nuances
 * later (e.g. `PENDING_COMPLIANCE`), and lets the UI render lanes without
 * knowing every enum value.
 */
const LIFECYCLE_BY_STATE: Record<TransferState, TransferLifecycleStage> = {
  [TransferState.DRAFT]: TransferLifecycleStage.INTAKE,
  [TransferState.SUBMITTED]: TransferLifecycleStage.INTAKE,
  [TransferState.UNDER_REVIEW]: TransferLifecycleStage.REVIEW,
  [TransferState.NEEDS_INFO]: TransferLifecycleStage.REVIEW,
  [TransferState.APPROVED]: TransferLifecycleStage.APPROVAL,
  [TransferState.SETTLED]: TransferLifecycleStage.SETTLEMENT,
  [TransferState.REJECTED]: TransferLifecycleStage.CLOSED,
  [TransferState.CANCELLED]: TransferLifecycleStage.CLOSED,
}

export function isTerminalTransferState(state: TransferState): boolean {
  return TERMINAL_STATES.has(state)
}

export function canTransitionTransferState(from: TransferState, to: TransferState): boolean {
  if (from === to) {
    return false
  }
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function assertTransferTransition(from: TransferState, to: TransferState): void {
  if (!canTransitionTransferState(from, to)) {
    const allowed = ALLOWED_TRANSITIONS[from].join(', ') || '(none — terminal)'
    throw new Error(`Invalid transfer state transition: ${from} → ${to}. Allowed from ${from}: ${allowed}`)
  }
}

export function lifecycleStageFor(state: TransferState): TransferLifecycleStage {
  return LIFECYCLE_BY_STATE[state]
}

export { ALLOWED_TRANSITIONS, TERMINAL_STATES }
