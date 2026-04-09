export type CaseType = 'TRANSFER' | 'ISSUE' | 'CANCEL'
export type CaseStatus = 'PENDING' | 'COMPLETED' | 'FAILED'
export type CaseLifecycleStage = 'REQUESTED' | 'EVIDENCE_PENDING' | 'RESTRICTIONS_REVIEW' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'FAILED'

export interface CaseRecord {
  createdAt: string
  evidenceRequired: string[]
  evidenceSubmitted: string[]
  failureReason?: string
  id: number
  lifecycleStage: CaseLifecycleStage
  missingEvidence: string[]
  restrictionBlockingReasons: string[]
  restrictionChecks: Array<{ detail: string; name: string; passed: boolean }>
  status: CaseStatus
  updatedAt: string
  type: CaseType
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  quantity: number
}
