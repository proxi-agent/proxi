export type CaseLifecycleStage = 'APPROVED' | 'COMPLETED' | 'EVIDENCE_PENDING' | 'FAILED' | 'REJECTED' | 'REQUESTED' | 'RESTRICTIONS_REVIEW'
export type CaseStatus = 'COMPLETED' | 'FAILED' | 'PENDING'
export type CaseType = 'CANCEL' | 'ISSUE' | 'TRANSFER'

export interface CaseRecord {
  createdAt: string
  evidenceRequired: string[]
  evidenceSubmitted: string[]
  failureReason?: string
  fromHolderId?: string
  holderId?: string
  id: number
  lifecycleStage: CaseLifecycleStage
  missingEvidence: string[]
  quantity: number
  restrictionBlockingReasons: string[]
  restrictionChecks: Array<{ detail: string; name: string; passed: boolean }>
  securityId: string
  status: CaseStatus
  toHolderId?: string
  type: CaseType
  updatedAt: string
}
