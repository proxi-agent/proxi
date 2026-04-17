import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { OnModuleInit } from '@nestjs/common'
import { Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../database/database.service.js'
import { LedgerService } from '../ledger/ledger.service.js'
import type { RestrictionCheck, RestrictionContext } from '../rules/rules.service.js'
import { RulesService } from '../rules/rules.service.js'

export type CaseLifecycleStage =
  | 'AI_PROCESSING'
  | 'AI_REVIEW_REQUIRED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'DRAFT'
  | 'EVIDENCE_PENDING'
  | 'EXCEPTION'
  | 'INTAKE_SUBMITTED'
  | 'LEDGER_POSTED'
  | 'REJECTED'
  | 'REVIEW_PENDING'
export type CaseStatus = 'APPROVED' | 'COMPLETED' | 'EXCEPTION' | 'IN_REVIEW' | 'PENDING' | 'REJECTED'
export type CaseType = 'CANCEL' | 'ISSUE' | 'TRANSFER'
export type IntakeMethod = 'DOCUMENT_UPLOAD' | 'GUIDED_ENTRY'

export interface TransferCanonicalData {
  attestations?: {
    medallionSignatureProvided?: boolean
    onlineAccessRequested?: boolean
    w9Signed?: boolean
  }
  costBasis?: {
    costPerShareUsd?: number
    dateOfDeath?: string
    dateOfSale?: string
    decedentInterestShares?: number
    fairMarketValuePerShareUsd?: number
    purpose?: 'GIFT' | 'INHERITANCE' | 'PRIVATE_SALE'
  }
  destinationAccount?: {
    address?: string
    line1Name?: string
    line2Name?: string
    line3Name?: string
    line4Name?: string
    registrationType?: string
    taxId?: string
    taxIdType?: 'EIN' | 'SSN'
  }
  sourceAccount?: {
    accountNumber?: string
    companyOfStock?: string
    currentRegistration?: string
  }
  transferInstruction?: {
    certificateShares?: number
    directRegistrationShares?: number
    lostCertificateShares?: number
    planShares?: number
    transferAllShares?: boolean
    uncashedChecksPayee?: 'CURRENT_OWNER' | 'NEW_OWNER'
  }
}

export interface TransferCaseEvent {
  actor: string
  createdAt: Date
  eventType: string
  id: number
  metadata: Record<string, unknown>
}

export interface TransferDocument {
  caseId: number
  checksumSha256?: string
  contentType: string
  createdAt: Date
  docType: string
  fileName: string
  id: number
  sizeBytes: number
  storageBucket?: string
  storageKey: string
  uploadStatus: string
  uploadedBy: string
  updatedAt: Date
}

export interface TransferExtraction {
  caseId: number
  completenessScore: number
  confidence: number
  createdAt: Date
  extractionPayload: Record<string, unknown>
  id: number
  issues: string[]
  model: string
  promptVersion: string
  provider: string
  rawText: string
}

export interface TransferApproval {
  action: 'APPROVE' | 'OVERRIDE_AI' | 'REJECT' | 'REQUEST_FIXES'
  actor: string
  caseId: number
  createdAt: Date
  id: number
  notes?: string
  reason?: string
}

export interface CreateCaseInput {
  actor: string
  canonicalTransferData?: TransferCanonicalData
  evidenceDocs?: string[]
  fromHolderId?: string
  holderId?: string
  intakeMethod: IntakeMethod
  quantity: number
  restrictionContext?: RestrictionContext
  securityId: string
  toHolderId?: string
  type: CaseType
}

export interface RecordDocumentInput {
  caseId: number
  checksumSha256?: string
  contentType: string
  docType: string
  fileName: string
  sizeBytes: number
  storageBucket?: string
  storageKey: string
  uploadedBy: string
}

export interface ExtractionResultInput {
  caseId: number
  completenessScore: number
  confidence: number
  extractionPayload: Record<string, unknown>
  issues: string[]
  model: string
  promptVersion: string
  provider: string
  rawText: string
}

export interface CreateAiJobInput {
  actor: string
  caseId: number
  payload: Record<string, unknown>
}

export interface TransferJob {
  attempts: number
  caseId: number
  createdAt: Date
  id: number
  jobType: 'AI_EXTRACT_TRANSFER'
  lastError?: string
  maxAttempts: number
  payload: Record<string, unknown>
  queueMessageId?: string
  status: 'FAILED' | 'PROCESSING' | 'QUEUED' | 'SUCCEEDED'
  updatedAt: Date
}

export interface Case {
  aiConfidence?: number
  aiSummary?: string
  approvals: TransferApproval[]
  assignedReviewerId?: string
  canonicalTransferData: TransferCanonicalData
  createdAt: Date
  documents: TransferDocument[]
  evidenceRequired: string[]
  evidenceSubmitted: string[]
  events: TransferCaseEvent[]
  extractions: TransferExtraction[]
  failureReason?: string
  fromHolderId?: string
  holderId?: string
  id: number
  intakeMethod: IntakeMethod
  lastAiJobId?: number
  ledgerEventId?: number
  lifecycleStage: CaseLifecycleStage
  missingEvidence: string[]
  quantity: number
  restrictionBlockingReasons: string[]
  restrictionContext: RestrictionContext
  restrictionChecks: Array<{ code: string; detail: string; name: string; passed: boolean }>
  securityId: string
  status: CaseStatus
  toHolderId?: string
  type: CaseType
  updatedAt: Date
}

type CaseRow = {
  ai_confidence: number | null
  ai_summary: string | null
  assigned_reviewer_id: string | null
  canonical_transfer_data: TransferCanonicalData
  created_at: Date
  evidence_required: string[]
  evidence_submitted: string[]
  failure_reason: string | null
  from_holder_id: string | null
  holder_id: string | null
  id: number
  intake_method: IntakeMethod
  last_ai_job_id: number | null
  ledger_event_id: number | null
  lifecycle_stage: CaseLifecycleStage
  missing_evidence: string[]
  quantity: number
  restriction_blocking_reasons: string[]
  restriction_checks: Array<{ code: string; detail: string; name: string; passed: boolean }>
  restriction_context: RestrictionContext
  security_id: string
  status: CaseStatus
  to_holder_id: string | null
  type: CaseType
  updated_at: Date
}

type EventRow = {
  actor: string
  case_id: number
  created_at: Date
  event_type: string
  id: number
  metadata: Record<string, unknown>
}

type DocumentRow = {
  case_id: number
  checksum_sha256: string | null
  content_type: string
  created_at: Date
  doc_type: string
  file_name: string
  id: number
  size_bytes: number
  storage_bucket: string | null
  storage_key: string
  updated_at: Date
  upload_status: string
  uploaded_by: string
}

type ExtractionRow = {
  case_id: number
  completeness_score: number | string
  confidence: number | string
  created_at: Date
  extraction_payload: Record<string, unknown>
  id: number
  issues: string[]
  model: string
  prompt_version: string
  provider: string
  raw_text: string
}

type ApprovalRow = {
  action: 'APPROVE' | 'OVERRIDE_AI' | 'REJECT' | 'REQUEST_FIXES'
  actor: string
  case_id: number
  created_at: Date
  id: number
  notes: string | null
  reason: string | null
}

type JobRow = {
  attempts: number
  case_id: number
  created_at: Date
  id: number
  job_type: 'AI_EXTRACT_TRANSFER'
  last_error: string | null
  max_attempts: number
  payload: Record<string, unknown>
  queue_message_id: string | null
  status: 'FAILED' | 'PROCESSING' | 'QUEUED' | 'SUCCEEDED'
  updated_at: Date
}

const CASE_SELECT = `id, created_at, updated_at, type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage,
                     intake_method, assigned_reviewer_id, ai_confidence, ai_summary, canonical_transfer_data, ledger_event_id, last_ai_job_id,
                     evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons, restriction_checks, restriction_context, failure_reason`

@Injectable()
export class CasesService implements OnModuleInit {
  private readonly queueUrl = process.env.TRANSFER_AI_QUEUE_URL || ''
  private readonly sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' })

  constructor(
    private readonly database: DatabaseService,
    private readonly ledgerService: LedgerService,
    private readonly rulesService: RulesService,
  ) {}

  async onModuleInit() {
    const count = await this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM transfer_cases')
    if (Number(count.rows[0]?.count || '0') === 0) {
      await this.seedDummyCases()
    }
  }

  private getRequiredEvidence(type: CaseType): string[] {
    if (type === 'TRANSFER') {
      return ['Identity verification', 'Medallion signature guarantee', 'Stock power document', 'Transfer instruction letter']
    }
    if (type === 'ISSUE') {
      return ['Board resolution approving issuance', 'Issuance instruction notice']
    }
    return ['Cancellation authorization', 'Supporting legal/tax release (if applicable)']
  }

  private normalizeEvidence(docs: string[] = []): string[] {
    return Array.from(new Set(docs.map(doc => doc.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }

  private async appendEvent(caseId: number, eventType: string, actor: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.database.query(
      `INSERT INTO transfer_case_events (case_id, event_type, actor, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [caseId, eventType, actor, JSON.stringify(metadata)],
    )
  }

  private async appendApproval(
    caseId: number,
    action: 'APPROVE' | 'OVERRIDE_AI' | 'REJECT' | 'REQUEST_FIXES',
    actor: string,
    reason?: string,
    notes?: string,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO transfer_approvals (case_id, action, actor, reason, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [caseId, action, actor, reason || null, notes || null],
    )
  }

  private hydrateEvidenceState(entry: Case): void {
    const submitted = this.normalizeEvidence(entry.evidenceSubmitted)
    entry.evidenceSubmitted = submitted
    entry.missingEvidence = entry.evidenceRequired.filter(requiredDoc => !submitted.includes(requiredDoc))
  }

  private async evaluateRestrictions(entry: Case): Promise<boolean> {
    if (entry.type !== 'TRANSFER') {
      entry.restrictionBlockingReasons = []
      entry.restrictionChecks = []
      return true
    }

    const evaluation = await this.rulesService.evaluateTransferEligibility({
      ...entry.restrictionContext,
      fromHolderId: entry.fromHolderId,
      quantity: entry.quantity,
      securityId: entry.securityId,
      toHolderId: entry.toHolderId,
      type: entry.type,
    })

    entry.restrictionBlockingReasons = evaluation.blockingReasons
    entry.restrictionChecks = evaluation.checks.map((check: RestrictionCheck) => ({
      code: check.code,
      detail: check.detail,
      name: check.name,
      passed: check.passed,
    }))

    if (!evaluation.eligible) {
      entry.lifecycleStage = 'EXCEPTION'
      entry.status = 'EXCEPTION'
      entry.failureReason = `Restriction checks failed: ${evaluation.blockingReasons.join(', ')}`
      return false
    }
    return true
  }

  private async moveCaseToReview(caseData: Case, actor: string): Promise<Case> {
    const eligible = await this.evaluateRestrictions(caseData)
    if (!eligible) {
      await this.appendEvent(caseData.id, 'RESTRICTIONS_FAILED', actor, { blockingReasons: caseData.restrictionBlockingReasons })
      return this.persistCase(caseData)
    }
    caseData.lifecycleStage = 'REVIEW_PENDING'
    caseData.status = 'IN_REVIEW'
    caseData.failureReason = undefined
    await this.appendEvent(caseData.id, 'REVIEW_PENDING', actor)
    return this.persistCase(caseData)
  }

  async getCases(): Promise<Case[]> {
    const result = await this.database.query<CaseRow>(`SELECT ${CASE_SELECT} FROM transfer_cases ORDER BY created_at DESC`)
    return result.rows.map(row => mapCase(row, { approvals: [], documents: [], events: [], extractions: [] }))
  }

  async getCaseById(id: number): Promise<Case> {
    const result = await this.database.query<CaseRow>(`SELECT ${CASE_SELECT} FROM transfer_cases WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException('Case not found')
    }
    const related = await this.loadRelatedData(id)
    return mapCase(result.rows[0], related)
  }

  async createCase(input: CreateCaseInput): Promise<Case> {
    const evidenceRequired = this.getRequiredEvidence(input.type)
    const insert = await this.database.query<CaseRow>(
      `INSERT INTO transfer_cases (
        type, security_id, quantity, from_holder_id, to_holder_id, holder_id, status, lifecycle_stage, intake_method,
        canonical_transfer_data, evidence_required, evidence_submitted, missing_evidence, restriction_blocking_reasons,
        restriction_checks, restriction_context, failure_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING','INTAKE_SUBMITTED',$7,$8::jsonb,$9::text[],$10::text[],$11::text[],$12::text[],$13::jsonb,$14::jsonb,$15)
      RETURNING ${CASE_SELECT}`,
      [
        input.type,
        input.securityId,
        input.quantity,
        input.fromHolderId || null,
        input.toHolderId || null,
        input.holderId || null,
        input.intakeMethod,
        JSON.stringify(input.canonicalTransferData || {}),
        evidenceRequired,
        this.normalizeEvidence(input.evidenceDocs),
        [],
        [],
        JSON.stringify([]),
        JSON.stringify(input.restrictionContext || {}),
        null,
      ],
    )

    const created = mapCase(insert.rows[0], { approvals: [], documents: [], events: [], extractions: [] })
    this.hydrateEvidenceState(created)
    await this.appendEvent(created.id, 'CASE_CREATED', input.actor, { intakeMethod: created.intakeMethod })
    return this.reprocessCase(created.id, created.restrictionContext, input.actor)
  }

  async submitGuidedIntake(caseId: number, canonicalTransferData: TransferCanonicalData, actor: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    found.canonicalTransferData = { ...found.canonicalTransferData, ...canonicalTransferData }
    await this.appendEvent(caseId, 'GUIDED_INTAKE_UPDATED', actor)
    await this.persistCase(found)
    return this.reprocessCase(caseId, found.restrictionContext, actor)
  }

  async submitEvidence(caseId: number, docType: string, actor: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    if (!found.evidenceSubmitted.includes(docType)) {
      found.evidenceSubmitted.push(docType)
    }
    this.hydrateEvidenceState(found)
    await this.appendEvent(caseId, 'EVIDENCE_SUBMITTED', actor, { docType })
    await this.persistCase(found)
    return this.reprocessCase(caseId, found.restrictionContext, actor)
  }

  async reprocessCase(caseId: number, restrictionContext?: RestrictionContext, actor = 'system'): Promise<Case> {
    const found = await this.getCaseById(caseId)
    if (restrictionContext) {
      found.restrictionContext = { ...found.restrictionContext, ...restrictionContext }
    }

    found.lifecycleStage = 'INTAKE_SUBMITTED'
    found.status = 'PENDING'
    this.hydrateEvidenceState(found)

    if (found.missingEvidence.length > 0) {
      found.lifecycleStage = 'EVIDENCE_PENDING'
      found.status = 'PENDING'
      found.failureReason = `Missing evidence: ${found.missingEvidence.join(', ')}`
      await this.appendEvent(caseId, 'EVIDENCE_PENDING', actor, { missingEvidence: found.missingEvidence })
      return this.persistCase(found)
    }

    if (found.intakeMethod === 'DOCUMENT_UPLOAD') {
      const queued = await this.createAiJob({ actor, caseId, payload: { reason: 'evidence-complete' } })
      found.lastAiJobId = queued.id
      found.lifecycleStage = 'AI_PROCESSING'
      found.status = 'PENDING'
      found.failureReason = undefined
      await this.appendEvent(caseId, 'AI_JOB_QUEUED', actor, { jobId: queued.id })
      return this.persistCase(found)
    }

    return this.moveCaseToReview(found, actor)
  }

  async createAiJob(input: CreateAiJobInput): Promise<TransferJob> {
    const result = await this.database.query<JobRow>(
      `INSERT INTO transfer_jobs (case_id, job_type, status, payload)
       VALUES ($1, 'AI_EXTRACT_TRANSFER', 'QUEUED', $2::jsonb)
       RETURNING id, case_id, job_type, status, queue_message_id, payload, attempts, max_attempts, last_error, created_at, updated_at`,
      [input.caseId, JSON.stringify(input.payload || {})],
    )
    const created = mapJob(result.rows[0])
    await this.appendEvent(input.caseId, 'JOB_CREATED', input.actor, { jobId: created.id })

    if (this.queueUrl) {
      try {
        const sqsResult = await this.sqsClient.send(
          new SendMessageCommand({
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify({
              caseId: created.caseId,
              jobId: created.id,
              jobType: created.jobType,
            }),
          }),
        )
        await this.database.query(
          `UPDATE transfer_jobs
           SET queue_message_id = $2, updated_at = NOW()
           WHERE id = $1`,
          [created.id, sqsResult.MessageId || null],
        )
      } catch {
        await this.appendEvent(input.caseId, 'JOB_QUEUE_PUBLISH_FAILED', input.actor, { jobId: created.id })
      }
    }

    return created
  }

  async getQueuedAiJob(): Promise<TransferJob | null> {
    const result = await this.database.query<JobRow>(
      `UPDATE transfer_jobs
       SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
       WHERE id = (
         SELECT id
         FROM transfer_jobs
         WHERE status = 'QUEUED' AND job_type = 'AI_EXTRACT_TRANSFER'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, case_id, job_type, status, queue_message_id, payload, attempts, max_attempts, last_error, created_at, updated_at`,
    )
    return result.rows.length ? mapJob(result.rows[0]) : null
  }

  async markAiJobFailed(jobId: number, actor: string, errorMessage: string): Promise<void> {
    const result = await this.database.query<JobRow>(
      `UPDATE transfer_jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, case_id, job_type, status, queue_message_id, payload, attempts, max_attempts, last_error, created_at, updated_at`,
      [jobId, errorMessage],
    )
    if (result.rows.length) {
      const job = mapJob(result.rows[0])
      await this.appendEvent(job.caseId, 'AI_JOB_FAILED', actor, { errorMessage, jobId, status: job.status })
      if (job.status === 'FAILED') {
        const caseData = await this.getCaseById(job.caseId)
        caseData.lifecycleStage = 'EXCEPTION'
        caseData.status = 'EXCEPTION'
        caseData.failureReason = errorMessage
        await this.persistCase(caseData)
      }
    }
  }

  async recordExtraction(input: ExtractionResultInput, actor = 'ai_worker'): Promise<Case> {
    await this.database.query(
      `INSERT INTO transfer_extractions (
        case_id, provider, model, prompt_version, confidence, completeness_score, extraction_payload, issues, raw_text
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::text[],$9)`,
      [
        input.caseId,
        input.provider,
        input.model,
        input.promptVersion,
        input.confidence,
        input.completenessScore,
        JSON.stringify(input.extractionPayload),
        input.issues,
        input.rawText,
      ],
    )

    const caseData = await this.getCaseById(input.caseId)
    caseData.aiConfidence = input.confidence
    caseData.aiSummary = input.issues.length ? input.issues.join('; ') : 'AI extraction completed without flagged issues.'
    caseData.canonicalTransferData = { ...caseData.canonicalTransferData, ...toCanonicalData(input.extractionPayload) }

    const confidenceThreshold = Number(process.env.TRANSFER_AI_AUTO_REVIEW_CONFIDENCE || '0.92')
    const completenessThreshold = Number(process.env.TRANSFER_AI_COMPLETENESS_THRESHOLD || '0.9')
    const isHighConfidence = input.confidence >= confidenceThreshold && input.completenessScore >= completenessThreshold

    if (isHighConfidence) {
      await this.appendEvent(input.caseId, 'AI_EXTRACTION_READY_FOR_REVIEW', actor, {
        completenessScore: input.completenessScore,
        confidence: input.confidence,
      })
      const moved = await this.moveCaseToReview(caseData, actor)
      await this.completeLatestAiJob(input.caseId, actor)
      return moved
    }

    caseData.lifecycleStage = 'AI_REVIEW_REQUIRED'
    caseData.status = 'IN_REVIEW'
    caseData.failureReason = 'AI extraction confidence below threshold; reviewer confirmation required.'
    await this.appendEvent(input.caseId, 'AI_EXTRACTION_LOW_CONFIDENCE', actor, {
      completenessScore: input.completenessScore,
      confidence: input.confidence,
      issues: input.issues,
    })
    const persisted = await this.persistCase(caseData)
    await this.completeLatestAiJob(input.caseId, actor)
    return persisted
  }

  async markDocumentUploaded(caseId: number, storageKey: string, actor: string): Promise<void> {
    await this.database.query(
      `UPDATE transfer_documents
       SET upload_status = 'UPLOADED', updated_at = NOW()
       WHERE case_id = $1 AND storage_key = $2`,
      [caseId, storageKey],
    )
    await this.appendEvent(caseId, 'DOCUMENT_UPLOADED', actor, { storageKey })
  }

  async recordDocument(input: RecordDocumentInput): Promise<TransferDocument> {
    const result = await this.database.query<DocumentRow>(
      `INSERT INTO transfer_documents (
        case_id, doc_type, file_name, content_type, size_bytes, storage_key, storage_bucket, upload_status, checksum_sha256, uploaded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'REGISTERED',$8,$9)
      RETURNING id, case_id, doc_type, file_name, content_type, size_bytes, storage_key, storage_bucket, upload_status, checksum_sha256, uploaded_by, created_at, updated_at`,
      [
        input.caseId,
        input.docType,
        input.fileName,
        input.contentType,
        input.sizeBytes,
        input.storageKey,
        input.storageBucket || null,
        input.checksumSha256 || null,
        input.uploadedBy,
      ],
    )
    await this.appendEvent(input.caseId, 'DOCUMENT_REGISTERED', input.uploadedBy, {
      docType: input.docType,
      storageKey: input.storageKey,
    })
    return mapDocument(result.rows[0])
  }

  async assignReviewer(caseId: number, reviewerId: string, actor: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    found.assignedReviewerId = reviewerId
    await this.appendEvent(caseId, 'REVIEWER_ASSIGNED', actor, { reviewerId })
    return this.persistCase(found)
  }

  async requestFixes(caseId: number, actor: string, reason: string, notes?: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    found.lifecycleStage = 'AI_REVIEW_REQUIRED'
    found.status = 'IN_REVIEW'
    found.failureReason = reason
    await this.appendApproval(caseId, 'REQUEST_FIXES', actor, reason, notes)
    await this.appendEvent(caseId, 'FIXES_REQUESTED', actor, { notes, reason })
    return this.persistCase(found)
  }

  async overrideAi(caseId: number, actor: string, reason: string, patch: TransferCanonicalData): Promise<Case> {
    const found = await this.getCaseById(caseId)
    found.canonicalTransferData = {
      ...found.canonicalTransferData,
      ...patch,
    }
    await this.appendApproval(caseId, 'OVERRIDE_AI', actor, reason)
    await this.appendEvent(caseId, 'AI_OVERRIDE_APPLIED', actor, { reason })
    return this.moveCaseToReview(found, actor)
  }

  async approveCase(caseId: number, actor: string, reason?: string, notes?: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    const eligible = await this.evaluateRestrictions(found)
    if (!eligible) {
      await this.appendApproval(caseId, 'REJECT', actor, found.failureReason || reason, notes)
      await this.appendEvent(caseId, 'APPROVAL_BLOCKED_BY_RULES', actor, { blockingReasons: found.restrictionBlockingReasons })
      return this.persistCase(found)
    }

    found.lifecycleStage = 'APPROVED'
    found.status = 'APPROVED'
    found.failureReason = undefined
    await this.appendApproval(caseId, 'APPROVE', actor, reason, notes)
    await this.appendEvent(caseId, 'CASE_APPROVED', actor, { reason })
    await this.persistCase(found)

    return this.postLedgerAndComplete(caseId, actor)
  }

  async rejectCase(caseId: number, actor: string, reason: string, notes?: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    found.lifecycleStage = 'REJECTED'
    found.status = 'REJECTED'
    found.failureReason = reason
    await this.appendApproval(caseId, 'REJECT', actor, reason, notes)
    await this.appendEvent(caseId, 'CASE_REJECTED', actor, { notes, reason })
    return this.persistCase(found)
  }

  async postLedgerAndComplete(caseId: number, actor: string): Promise<Case> {
    const found = await this.getCaseById(caseId)
    try {
      let eventId: number | undefined
      if (found.type === 'TRANSFER' && found.fromHolderId && found.toHolderId) {
        const event = await this.ledgerService.transfer(found.securityId, found.fromHolderId, found.toHolderId, found.quantity, found.id)
        eventId = event.id
      } else if (found.type === 'ISSUE' && found.holderId) {
        const event = await this.ledgerService.issue(found.securityId, found.holderId, found.quantity, found.id)
        eventId = event.id
      } else if (found.type === 'CANCEL' && found.holderId) {
        const event = await this.ledgerService.cancel(found.securityId, found.holderId, found.quantity, found.id)
        eventId = event.id
      }

      found.ledgerEventId = eventId
      found.lifecycleStage = 'LEDGER_POSTED'
      found.status = 'APPROVED'
      await this.appendEvent(caseId, 'LEDGER_POSTED', actor, { ledgerEventId: eventId })
      await this.persistCase(found)

      found.lifecycleStage = 'COMPLETED'
      found.status = 'COMPLETED'
      await this.appendEvent(caseId, 'CASE_COMPLETED', actor, { ledgerEventId: eventId })
      return this.persistCase(found)
    } catch {
      found.lifecycleStage = 'EXCEPTION'
      found.status = 'EXCEPTION'
      found.failureReason = 'Ledger execution failed.'
      await this.appendEvent(caseId, 'LEDGER_POST_FAILED', actor)
      return this.persistCase(found)
    }
  }

  private async completeLatestAiJob(caseId: number, actor: string): Promise<void> {
    await this.database.query(
      `UPDATE transfer_jobs
       SET status = 'SUCCEEDED', last_error = NULL, updated_at = NOW()
       WHERE id = (
         SELECT id
         FROM transfer_jobs
         WHERE case_id = $1 AND status = 'PROCESSING'
         ORDER BY updated_at DESC
         LIMIT 1
       )`,
      [caseId],
    )
    await this.appendEvent(caseId, 'AI_JOB_SUCCEEDED', actor)
  }

  private async loadRelatedData(caseId: number): Promise<{
    approvals: TransferApproval[]
    documents: TransferDocument[]
    events: TransferCaseEvent[]
    extractions: TransferExtraction[]
  }> {
    const [events, documents, extractions, approvals] = await Promise.all([
      this.database.query<EventRow>(
        `SELECT id, case_id, event_type, actor, metadata, created_at
         FROM transfer_case_events
         WHERE case_id = $1
         ORDER BY created_at DESC`,
        [caseId],
      ),
      this.database.query<DocumentRow>(
        `SELECT id, case_id, doc_type, file_name, content_type, size_bytes, storage_key, storage_bucket, upload_status,
                checksum_sha256, uploaded_by, created_at, updated_at
         FROM transfer_documents
         WHERE case_id = $1
         ORDER BY created_at DESC`,
        [caseId],
      ),
      this.database.query<ExtractionRow>(
        `SELECT id, case_id, provider, model, prompt_version, confidence, completeness_score, extraction_payload, issues, raw_text, created_at
         FROM transfer_extractions
         WHERE case_id = $1
         ORDER BY created_at DESC`,
        [caseId],
      ),
      this.database.query<ApprovalRow>(
        `SELECT id, case_id, action, actor, reason, notes, created_at
         FROM transfer_approvals
         WHERE case_id = $1
         ORDER BY created_at DESC`,
        [caseId],
      ),
    ])

    return {
      approvals: approvals.rows.map(mapApproval),
      documents: documents.rows.map(mapDocument),
      events: events.rows.map(mapEvent),
      extractions: extractions.rows.map(mapExtraction),
    }
  }

  private async seedDummyCases() {
    const holders = [
      'ALPHA_CAPITAL',
      'AURORA_FUND',
      'BANYAN_TRUST',
      'CEDAR_BANK',
      'DELTA_VENTURES',
      'EVEREST_PARTNERS',
      'GARNET_HOLDINGS',
      'HARBOR_INVEST',
    ]
    const securities = ['PROXI-CLASS-A', 'PROXI-CLASS-B', 'PROXI-GROWTH', 'PROXI-INCOME', 'PROXI-LP-2026']

    for (let index = 0; index < 16; index += 1) {
      const securityId = securities[index % securities.length]
      const quantity = ((index % 8) + 1) * 2500
      const fromHolderId = holders[index % holders.length]
      const toHolderId = holders[(index + 3) % holders.length]
      const created = await this.createCase({
        actor: 'seed',
        canonicalTransferData: {},
        evidenceDocs: ['Identity verification', 'Medallion signature guarantee', 'Stock power document', 'Transfer instruction letter'],
        fromHolderId,
        intakeMethod: index % 3 === 0 ? 'DOCUMENT_UPLOAD' : 'GUIDED_ENTRY',
        quantity,
        restrictionContext: {},
        securityId,
        toHolderId,
        type: 'TRANSFER',
      })

      if (created.intakeMethod === 'GUIDED_ENTRY') {
        await this.approveCase(created.id, 'seed', 'Seed approval')
      }
    }
  }

  private async persistCase(entry: Case): Promise<Case> {
    const result = await this.database.query<CaseRow>(
      `UPDATE transfer_cases
       SET status = $2,
           lifecycle_stage = $3,
           intake_method = $4,
           assigned_reviewer_id = $5,
           ai_confidence = $6,
           ai_summary = $7,
           canonical_transfer_data = $8::jsonb,
           ledger_event_id = $9,
           last_ai_job_id = $10,
           evidence_submitted = $11::text[],
           missing_evidence = $12::text[],
           restriction_blocking_reasons = $13::text[],
           restriction_checks = $14::jsonb,
           restriction_context = $15::jsonb,
           failure_reason = $16,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${CASE_SELECT}`,
      [
        entry.id,
        entry.status,
        entry.lifecycleStage,
        entry.intakeMethod,
        entry.assignedReviewerId || null,
        entry.aiConfidence || null,
        entry.aiSummary || null,
        JSON.stringify(entry.canonicalTransferData || {}),
        entry.ledgerEventId || null,
        entry.lastAiJobId || null,
        entry.evidenceSubmitted,
        entry.missingEvidence,
        entry.restrictionBlockingReasons,
        JSON.stringify(entry.restrictionChecks),
        JSON.stringify(entry.restrictionContext),
        entry.failureReason || null,
      ],
    )
    const related = await this.loadRelatedData(entry.id)
    return mapCase(result.rows[0], related)
  }
}

function mapEvent(row: EventRow): TransferCaseEvent {
  return {
    actor: row.actor,
    createdAt: new Date(row.created_at),
    eventType: row.event_type,
    id: row.id,
    metadata: row.metadata || {},
  }
}

function mapDocument(row: DocumentRow): TransferDocument {
  return {
    caseId: row.case_id,
    checksumSha256: row.checksum_sha256 || undefined,
    contentType: row.content_type,
    createdAt: new Date(row.created_at),
    docType: row.doc_type,
    fileName: row.file_name,
    id: row.id,
    sizeBytes: row.size_bytes,
    storageBucket: row.storage_bucket || undefined,
    storageKey: row.storage_key,
    updatedAt: new Date(row.updated_at),
    uploadStatus: row.upload_status,
    uploadedBy: row.uploaded_by,
  }
}

function mapExtraction(row: ExtractionRow): TransferExtraction {
  return {
    caseId: row.case_id,
    completenessScore: Number(row.completeness_score || 0),
    confidence: Number(row.confidence || 0),
    createdAt: new Date(row.created_at),
    extractionPayload: row.extraction_payload || {},
    id: row.id,
    issues: row.issues || [],
    model: row.model,
    promptVersion: row.prompt_version,
    provider: row.provider,
    rawText: row.raw_text,
  }
}

function mapApproval(row: ApprovalRow): TransferApproval {
  return {
    action: row.action,
    actor: row.actor,
    caseId: row.case_id,
    createdAt: new Date(row.created_at),
    id: row.id,
    notes: row.notes || undefined,
    reason: row.reason || undefined,
  }
}

function mapCase(
  row: CaseRow,
  related: { approvals: TransferApproval[]; documents: TransferDocument[]; events: TransferCaseEvent[]; extractions: TransferExtraction[] },
): Case {
  return {
    aiConfidence: row.ai_confidence === null ? undefined : Number(row.ai_confidence),
    aiSummary: row.ai_summary || undefined,
    approvals: related.approvals,
    assignedReviewerId: row.assigned_reviewer_id || undefined,
    canonicalTransferData: row.canonical_transfer_data || {},
    createdAt: new Date(row.created_at),
    documents: related.documents,
    evidenceRequired: row.evidence_required || [],
    evidenceSubmitted: row.evidence_submitted || [],
    events: related.events,
    extractions: related.extractions,
    failureReason: row.failure_reason || undefined,
    fromHolderId: row.from_holder_id || undefined,
    holderId: row.holder_id || undefined,
    id: row.id,
    intakeMethod: row.intake_method,
    lastAiJobId: row.last_ai_job_id || undefined,
    ledgerEventId: row.ledger_event_id || undefined,
    lifecycleStage: row.lifecycle_stage,
    missingEvidence: row.missing_evidence || [],
    quantity: row.quantity,
    restrictionBlockingReasons: row.restriction_blocking_reasons || [],
    restrictionChecks: (row.restriction_checks as Array<{ code: string; detail: string; name: string; passed: boolean }>) || [],
    restrictionContext: (row.restriction_context as RestrictionContext) || {},
    securityId: row.security_id,
    status: row.status,
    toHolderId: row.to_holder_id || undefined,
    type: row.type,
    updatedAt: new Date(row.updated_at),
  }
}

function mapJob(row: JobRow): TransferJob {
  return {
    attempts: row.attempts,
    caseId: row.case_id,
    createdAt: new Date(row.created_at),
    id: row.id,
    jobType: row.job_type,
    lastError: row.last_error || undefined,
    maxAttempts: row.max_attempts,
    payload: row.payload || {},
    queueMessageId: row.queue_message_id || undefined,
    status: row.status,
    updatedAt: new Date(row.updated_at),
  }
}

function toCanonicalData(payload: Record<string, unknown>): TransferCanonicalData {
  const sourceAccount = (payload.sourceAccount as Record<string, unknown> | undefined) || {}
  const transferInstruction = (payload.transferInstruction as Record<string, unknown> | undefined) || {}
  const costBasis = (payload.costBasis as Record<string, unknown> | undefined) || {}
  const destinationAccount = (payload.destinationAccount as Record<string, unknown> | undefined) || {}
  const attestations = (payload.attestations as Record<string, unknown> | undefined) || {}
  return {
    attestations: {
      medallionSignatureProvided: Boolean(attestations.medallionSignatureProvided),
      onlineAccessRequested: Boolean(attestations.onlineAccessRequested),
      w9Signed: Boolean(attestations.w9Signed),
    },
    costBasis: {
      costPerShareUsd: Number(costBasis.costPerShareUsd || 0) || undefined,
      dateOfDeath: asString(costBasis.dateOfDeath),
      dateOfSale: asString(costBasis.dateOfSale),
      decedentInterestShares: Number(costBasis.decedentInterestShares || 0) || undefined,
      fairMarketValuePerShareUsd: Number(costBasis.fairMarketValuePerShareUsd || 0) || undefined,
      purpose: asPurpose(costBasis.purpose),
    },
    destinationAccount: {
      address: asString(destinationAccount.address),
      line1Name: asString(destinationAccount.line1Name),
      line2Name: asString(destinationAccount.line2Name),
      line3Name: asString(destinationAccount.line3Name),
      line4Name: asString(destinationAccount.line4Name),
      registrationType: asString(destinationAccount.registrationType),
      taxId: asString(destinationAccount.taxId),
      taxIdType: asTaxIdType(destinationAccount.taxIdType),
    },
    sourceAccount: {
      accountNumber: asString(sourceAccount.accountNumber),
      companyOfStock: asString(sourceAccount.companyOfStock),
      currentRegistration: asString(sourceAccount.currentRegistration),
    },
    transferInstruction: {
      certificateShares: Number(transferInstruction.certificateShares || 0) || undefined,
      directRegistrationShares: Number(transferInstruction.directRegistrationShares || 0) || undefined,
      lostCertificateShares: Number(transferInstruction.lostCertificateShares || 0) || undefined,
      planShares: Number(transferInstruction.planShares || 0) || undefined,
      transferAllShares: Boolean(transferInstruction.transferAllShares),
      uncashedChecksPayee: asUncashedChecksPayee(transferInstruction.uncashedChecksPayee),
    },
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asPurpose(value: unknown): 'GIFT' | 'INHERITANCE' | 'PRIVATE_SALE' | undefined {
  if (value === 'GIFT' || value === 'INHERITANCE' || value === 'PRIVATE_SALE') {
    return value
  }
  return undefined
}

function asTaxIdType(value: unknown): 'EIN' | 'SSN' | undefined {
  if (value === 'EIN' || value === 'SSN') {
    return value
  }
  return undefined
}

function asUncashedChecksPayee(value: unknown): 'CURRENT_OWNER' | 'NEW_OWNER' | undefined {
  if (value === 'CURRENT_OWNER' || value === 'NEW_OWNER') {
    return value
  }
  return undefined
}
