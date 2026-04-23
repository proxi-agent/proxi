export type NoticeKind = 'COMPLIANCE' | 'DIVIDEND' | 'GENERAL' | 'MEETING' | 'SHAREHOLDER' | 'TRANSFER'

export type NoticeAudience = 'ALL' | 'BOARD' | 'HOLDERS' | 'REGULATORS' | 'TRANSFER_AGENTS'
export type NoticeStatus = 'ARCHIVED' | 'DRAFT' | 'PUBLISHED'

export interface Notice {
  id: string
  issuerId: string
  kind: NoticeKind
  subject: string
  body: string
  audience: NoticeAudience
  status: NoticeStatus
  relatedEntityType?: string
  relatedEntityId?: string
  publishedAt?: Date
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
