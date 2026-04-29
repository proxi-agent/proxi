import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { Scope } from '../auth/scope.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import {
  ApplyFractionalAdjustmentsDto,
  ApproveBatchDto,
  ApproveCommunicationDto,
  ApproveDividendDto,
  ArchiveDividendDto,
  BatchListQuery,
  BulkRecordPaymentsDto,
  CalculateEntitlementsDto,
  CancelBatchDto,
  CancelCommunicationDto,
  CancelDividendDto,
  CreateCommunicationDto,
  CreateDividendDto,
  CreatePaymentBatchDto,
  DividendListQuery,
  EntitlementListQuery,
  ExecuteDripDto,
  GenerateStatementsDto,
  MarkBatchProcessingDto,
  MarkPaidDto,
  OpenReconciliationExceptionDto,
  PaymentListQuery,
  ReconcileBatchDto,
  RecordPaymentDto,
  RejectBatchDto,
  RejectDividendDto,
  RequestChangesDto,
  ResolveReconciliationExceptionDto,
  ScheduleBatchDto,
  SendCommunicationDto,
  StatementListQuery,
  SubmitBatchDto,
  SubmitCommunicationDto,
  SubmitForApprovalDto,
  UpdateDividendDto,
  UpsertReinvestmentInstructionDto,
} from './dividends.dto.js'
import { DividendsService } from './dividends.service.js'

@Controller('dividends')
export class DividendsController {
  constructor(private readonly dividendsService: DividendsService) {}

  // -------- Reads ------------------------------------------------------

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get()
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  async list(@Query() query: DividendListQuery) {
    return this.dividendsService.list(query)
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id')
  @Scope({ entityRule: { entity: 'dividend' } })
  async getOne(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.getDetail(id, actorFromRequest(request))
  }

  /**
   * Raw dividend event row, without the surrounding detail context.
   * Useful for AI/automation consumers that just want the canonical
   * declaration record.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/raw')
  @Scope({ entityRule: { entity: 'dividend' } })
  async getRaw(@Param('id') id: string) {
    return this.dividendsService.getById(id)
  }

  /**
   * Audit timeline for a single declaration. Combines lifecycle events,
   * approvals, payment status changes, statements, etc., in chronological
   * order.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/audit')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listAudit(@Param('id') id: string, @Query('since') since?: string, @Query('limit') limit?: string) {
    return this.dividendsService.listAuditEvents(id, {
      limit: limit ? Number(limit) : undefined,
      since,
    })
  }

  /**
   * AI-assisted preflight review. Always succeeds; falls back to a
   * deterministic-only review when no AI provider is configured. The
   * response includes the structured deterministic findings alongside
   * the AI-shaped output so the UI can show both.
   *
   * This endpoint is read-only with respect to the dividend itself —
   * it never approves, schedules, or settles anything. Workflow actions
   * still require explicit operator clicks.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Post(':id/ai-review')
  @Scope({ entityRule: { entity: 'dividend' } })
  async generateAiReview(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.generateAiReview(id, actorFromRequest(request))
  }

  /**
   * History of AI reviews for a declaration, newest-first. Each entry
   * carries the deterministic findings, the AI prose, and provider
   * metadata (provider id, model, prompt version) so reviewers can
   * compare runs over time.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/ai-reviews')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listAiReviews(@Param('id') id: string) {
    return this.dividendsService.listAiReviews(id)
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/snapshot')
  @Scope({ entityRule: { entity: 'dividend' } })
  async getSnapshot(@Param('id') id: string) {
    const snapshot = await this.dividendsService.getSnapshot(id)
    if (!snapshot) {
      throw new NotFoundException(`Eligibility snapshot for dividend ${id} not found`)
    }
    return snapshot
  }

  // -------- Lifecycle write paths -------------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post()
  @Scope({ issuerPaths: ['body.issuerId'], autoFillIssuerPath: 'body.issuerId' })
  async create(@Body() body: CreateDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.create(body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Patch(':id')
  @Scope({ entityRule: { entity: 'dividend' } })
  async update(@Param('id') id: string, @Body() body: UpdateDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.update(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/submit')
  @Scope({ entityRule: { entity: 'dividend' } })
  async submitForApproval(@Param('id') id: string, @Body() body: SubmitForApprovalDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.submitForApproval(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/approve')
  @Scope({ entityRule: { entity: 'dividend' } })
  async approve(@Param('id') id: string, @Body() body: ApproveDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.approve(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/reject')
  @Scope({ entityRule: { entity: 'dividend' } })
  async reject(@Param('id') id: string, @Body() body: RejectDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.reject(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/request-changes')
  @Scope({ entityRule: { entity: 'dividend' } })
  async requestChanges(@Param('id') id: string, @Body() body: RequestChangesDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.requestChanges(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/lock-eligibility')
  @Scope({ entityRule: { entity: 'dividend' } })
  async lockEligibility(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.lockEligibility(id, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/calculate')
  @Scope({ entityRule: { entity: 'dividend' } })
  async calculateEntitlements(
    @Param('id') id: string,
    @Body() body: CalculateEntitlementsDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.calculateEntitlements(id, body, actorFromRequest(request))
  }

  /**
   * Read-only summary of the most recent calculation for a dividend.
   * Returns 404 if no entitlements have been calculated yet — the UI
   * should fall back to the dividend detail's status to render the
   * "no calculation yet" state.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/calculation-summary')
  @Scope({ entityRule: { entity: 'dividend' } })
  async getCalculationSummary(@Param('id') id: string) {
    const summary = await this.dividendsService.getCalculationSummary(id)
    if (!summary) {
      return { calculated: false }
    }
    return { calculated: true, summary }
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/cancel')
  @Scope({ entityRule: { entity: 'dividend' } })
  async cancel(@Param('id') id: string, @Body() body: CancelDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.cancel(id, body, actorFromRequest(request))
  }

  // -------- Approvals (read) ------------------------------------------

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/approvals')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listApprovals(@Param('id') id: string) {
    return this.dividendsService.listApprovals(id)
  }

  // -------- Entitlements ----------------------------------------------

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/entitlements')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listEntitlements(@Param('id') id: string, @Query() query: EntitlementListQuery) {
    return this.dividendsService.listEntitlements(id, query)
  }

  // -------- Payment batches & payments -------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/batches')
  @Scope({ entityRule: { entity: 'dividend' } })
  async createBatch(@Param('id') id: string, @Body() body: CreatePaymentBatchDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.createPaymentBatch(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/batches')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listBatches(@Param('id') id: string, @Query() query: BatchListQuery) {
    return this.dividendsService.listBatches(id, query)
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/payments')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listPayments(@Param('id') id: string, @Query() query: PaymentListQuery) {
    return this.dividendsService.listPayments(id, query)
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('payments/record')
  async recordPayment(@Body() body: RecordPaymentDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.recordPayment(body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('payments/bulk-record')
  async bulkRecordPayments(@Body() body: BulkRecordPaymentsDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.bulkRecordPayments(body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get('batches/:batchId')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async getBatch(@Param('batchId') batchId: string) {
    const detail = await this.dividendsService.getBatchDetail(batchId)
    if (!detail) throw new NotFoundException(`Payment batch ${batchId} not found`)
    return detail
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/submit')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async submitBatch(@Param('batchId') batchId: string, @Body() body: SubmitBatchDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.submitBatch(batchId, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/approve')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async approveBatch(@Param('batchId') batchId: string, @Body() body: ApproveBatchDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.approveBatch(batchId, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/reject')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async rejectBatch(@Param('batchId') batchId: string, @Body() body: RejectBatchDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.rejectBatch(batchId, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/schedule')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async scheduleBatch(@Param('batchId') batchId: string, @Body() body: ScheduleBatchDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.scheduleBatch(batchId, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/processing')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async markBatchProcessing(
    @Param('batchId') batchId: string,
    @Body() body: MarkBatchProcessingDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.markBatchProcessing(batchId, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/cancel')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async cancelBatch(@Param('batchId') batchId: string, @Body() body: CancelBatchDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.cancelBatch(batchId, body, actorFromRequest(request))
  }

  /**
   * Apply a reconciliation file (or hand-typed entries) to a batch.
   * No live import format is parsed yet — the controller surfaces a
   * structured DTO that any future SFTP/email connector can fill in.
   */
  @Permissions('dividend.manage', 'agent.admin')
  @Post('batches/:batchId/reconcile')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async reconcileBatch(
    @Param('batchId') batchId: string,
    @Body() body: ReconcileBatchDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.reconcileBatch(batchId, body, actorFromRequest(request))
  }

  /**
   * Export-ready payment file projection. The downstream NACHA/SWIFT
   * formatter consumes this shape — we keep payment-rail specifics
   * outside the dividend module.
   */
  @Permissions('dividend.manage', 'report.view')
  @Get('batches/:batchId/export')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async exportBatch(@Param('batchId') batchId: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.exportBatch(batchId, actorFromRequest(request))
  }

  // -------- Communications -------------------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/communications')
  @Scope({ entityRule: { entity: 'dividend' } })
  async createCommunication(
    @Param('id') id: string,
    @Body() body: CreateCommunicationDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.createCommunication(
      id,
      {
        audience: body.audience,
        body: body.body,
        channel: body.channel,
        documentRefs: body.documentRefs,
        kind: body.kind,
        metadata: body.metadata,
        scheduledAt: body.scheduledAt,
        subject: body.subject,
      },
      actorFromRequest(request),
    )
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/communications')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listCommunications(@Param('id') id: string) {
    return this.dividendsService.listCommunications(id)
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('communications/:communicationId/submit')
  async submitCommunication(
    @Param('communicationId') id: string,
    @Body() _body: SubmitCommunicationDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.submitCommunication(id, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('communications/:communicationId/approve')
  async approveCommunication(
    @Param('communicationId') id: string,
    @Body() _body: ApproveCommunicationDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.approveCommunication(id, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('communications/:communicationId/send')
  async sendCommunication(
    @Param('communicationId') id: string,
    @Body() body: SendCommunicationDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.sendCommunication(id, { reference: body.reference, sentAt: body.sentAt }, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('communications/:communicationId/cancel')
  async cancelCommunication(
    @Param('communicationId') id: string,
    @Body() body: CancelCommunicationDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.cancelCommunication(id, { reason: body.reason }, actorFromRequest(request))
  }

  // -------- Fractional adjustments -----------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/fractional-adjustments')
  @Scope({ entityRule: { entity: 'dividend' } })
  async applyFractionalAdjustments(
    @Param('id') id: string,
    @Body() body: ApplyFractionalAdjustmentsDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.applyFractionalAdjustments(
      id,
      { policy: body.policy, priceCents: body.priceCents, reason: body.reason },
      actorFromRequest(request),
    )
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/fractional-adjustments')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listFractionalAdjustments(@Param('id') id: string) {
    return this.dividendsService.listFractionalAdjustments(id)
  }

  // -------- DRIP execution -------------------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/drip/execute')
  @Scope({ entityRule: { entity: 'dividend' } })
  async executeDrip(@Param('id') id: string, @Body() body: ExecuteDripDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.executeDrip(
      id,
      { fractionalShareHandling: body.fractionalShareHandling, purchasePrice: body.purchasePrice },
      actorFromRequest(request),
    )
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/reinvestment-records')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listReinvestmentRecords(@Param('id') id: string) {
    return this.dividendsService.listReinvestmentRecords(id)
  }

  // -------- Reconciliation exceptions --------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/reconciliation-exceptions')
  @Scope({ entityRule: { entity: 'dividend' } })
  async openReconciliationException(
    @Param('id') id: string,
    @Body() body: OpenReconciliationExceptionDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.openReconciliationException(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/reconciliation-exceptions')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listReconciliationExceptions(@Param('id') id: string) {
    return this.dividendsService.listReconciliationExceptions(id)
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('reconciliation-exceptions/:exceptionId/resolve')
  async resolveReconciliationException(
    @Param('exceptionId') exceptionId: string,
    @Body() body: ResolveReconciliationExceptionDto,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.resolveReconciliationException(exceptionId, body, actorFromRequest(request))
  }

  // -------- Archive & workflow stepper -------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/archive')
  @Scope({ entityRule: { entity: 'dividend' } })
  async archive(@Param('id') id: string, @Body() body: ArchiveDividendDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.archiveDividend(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/workflow')
  @Scope({ entityRule: { entity: 'dividend' } })
  async getWorkflowStepper(@Param('id') id: string) {
    return this.dividendsService.getWorkflowStepper(id)
  }

  // -------- Withholdings & statements ---------------------------------

  @Permissions('dividend.manage', 'report.view')
  @Get(':id/withholdings')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listWithholdings(@Param('id') id: string) {
    return this.dividendsService.listWithholdings(id)
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/statements/generate')
  @Scope({ entityRule: { entity: 'dividend' } })
  async generateStatements(@Param('id') id: string, @Body() body: GenerateStatementsDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.generateStatements(id, body, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/statements')
  @Scope({ entityRule: { entity: 'dividend' } })
  async listStatements(@Param('id') id: string, @Query() query: StatementListQuery) {
    return this.dividendsService.listStatements(id, { status: query.status })
  }

  /**
   * JSON projection of a single shareholder's statement for a dividend.
   * Used by the shareholder portal to render the on-screen statement
   * view, and by the issuer/agent UI when previewing a statement
   * before sending. The renderer is pure — see `dividends.statement.ts`.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/statements/:entitlementId')
  @Scope({ entityRule: { entity: 'dividend' } })
  async getStatementForEntitlement(
    @Param('id') id: string,
    @Param('entitlementId') entitlementId: string,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.getStatementForEntitlement(id, entitlementId, actorFromRequest(request))
  }

  /**
   * HTML rendering of a shareholder statement. Returns a complete
   * standalone document suitable for download or piping into a future
   * PDF generator (`DividendPdfGenerator` boundary in
   * `dividends.statement.ts`).
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get(':id/statements/:entitlementId/render')
  @Scope({ entityRule: { entity: 'dividend' } })
  async renderStatement(
    @Param('id') id: string,
    @Param('entitlementId') entitlementId: string,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.dividendsService.renderStatementHtmlForEntitlement(id, entitlementId, actorFromRequest(request))
    response.setHeader('Content-Type', result.contentType)
    response.setHeader('Content-Disposition', `inline; filename="${result.filename}"`)
    return result.body
  }

  // -------- Reports & CSV exports -------------------------------------
  //
  // Operational reporting and CSV export endpoints. All exports stream a
  // text/csv payload with `Content-Disposition: attachment` so browser
  // download flows pick up the filename automatically. Each export is
  // recorded as a `DIVIDEND_REPORT_EXPORTED` audit event.

  /**
   * Headline report-card metrics for the issuer / agent dashboard:
   * total declared, total paid, total withholding, failed payment count,
   * unpaid amount, and dividends-by-status breakdown. Optionally
   * scoped to a single issuer or date window.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get('reports/summary')
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  async getReportsSummary(
    @Query('issuerId') issuerId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentRequest() request: AuthenticatedRequest,
  ) {
    return this.dividendsService.getReportsSummary({ from, issuerId, to }, actorFromRequest(request))
  }

  /** CSV export of dividend declarations matching the supplied filter. */
  @Permissions('dividend.manage', 'report.view')
  @Get('exports/declarations.csv')
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  async exportDeclarations(
    @Query() query: DividendListQuery,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportDeclarationsCsv(query, actorFromRequest(request))
    return writeCsv(response, download)
  }

  /** CSV export of the eligibility snapshot for a dividend. */
  @Permissions('dividend.manage', 'report.view')
  @Get(':id/exports/snapshot.csv')
  @Scope({ entityRule: { entity: 'dividend' } })
  async exportSnapshot(
    @Param('id') id: string,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportEligibilitySnapshotCsv(id, actorFromRequest(request))
    return writeCsv(response, download)
  }

  /** CSV export of the entitlement calculations for a dividend. */
  @Permissions('dividend.manage', 'report.view')
  @Get(':id/exports/entitlements.csv')
  @Scope({ entityRule: { entity: 'dividend' } })
  async exportEntitlements(
    @Param('id') id: string,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportEntitlementsCsv(id, actorFromRequest(request))
    return writeCsv(response, download)
  }

  /** CSV export of the per-batch summary rows for a dividend. */
  @Permissions('dividend.manage', 'report.view')
  @Get(':id/exports/batches.csv')
  @Scope({ entityRule: { entity: 'dividend' } })
  async exportBatchSummaries(
    @Param('id') id: string,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportBatchSummaryCsv(id, actorFromRequest(request))
    return writeCsv(response, download)
  }

  /** CSV export of the audit trail for a dividend declaration. */
  @Permissions('dividend.manage', 'report.view')
  @Get(':id/exports/audit.csv')
  @Scope({ entityRule: { entity: 'dividend' } })
  async exportAudit(
    @Param('id') id: string,
    @Query('since') since: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportAuditTrailCsv(
      id,
      { limit: limit ? Number(limit) : undefined, since },
      actorFromRequest(request),
    )
    return writeCsv(response, download)
  }

  /** CSV export of the payments inside a single payment batch. */
  @Permissions('dividend.manage', 'report.view')
  @Get('batches/:batchId/exports/payments.csv')
  @Scope({ entityRule: { entity: 'dividend_batch', idParam: 'batchId' } })
  async exportBatchPayments(
    @Param('batchId') batchId: string,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportPaymentBatchCsv(batchId, actorFromRequest(request))
    return writeCsv(response, download)
  }

  /**
   * Failed-payments report. Accepts optional `dividendId`, `batchId`,
   * and `issuerId` filters. The shape is identical to the per-batch
   * payments export so existing reconciliation tooling can ingest it
   * without a new schema.
   */
  @Permissions('dividend.manage', 'report.view')
  @Get('exports/failed-payments.csv')
  @Scope({ issuerPaths: ['query.issuerId'], autoFillIssuerPath: 'query.issuerId' })
  async exportFailedPayments(
    @Query('dividendId') dividendId: string | undefined,
    @Query('batchId') batchId: string | undefined,
    @Query('issuerId') issuerId: string | undefined,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportFailedPaymentsCsv({ batchId, dividendId, issuerId }, actorFromRequest(request))
    return writeCsv(response, download)
  }

  /**
   * Shareholder dividend history CSV. Scoped to the calling shareholder
   * via `@Scope shareholderPaths`; passing a different shareholder id
   * is gated by the entity-ownership rule.
   */
  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get('shareholders/:shareholderId/exports/history.csv')
  @Scope({ autoFillShareholderPath: 'params.shareholderId', shareholderPaths: ['params.shareholderId'] })
  async exportShareholderHistory(
    @Param('shareholderId') shareholderId: string,
    @Query('issuerId') issuerId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentRequest() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.dividendsService.exportShareholderHistoryCsv(
      shareholderId,
      { from, issuerId, to },
      actorFromRequest(request),
    )
    return writeCsv(response, download)
  }

  // -------- Legacy compatibility --------------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/declare')
  @Scope({ entityRule: { entity: 'dividend' } })
  async declare(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.declare(id, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post(':id/snapshot')
  @Scope({ entityRule: { entity: 'dividend' } })
  async snapshot(@Param('id') id: string, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.snapshot(id, actorFromRequest(request))
  }

  @Permissions('dividend.manage', 'agent.admin')
  @Post('entitlements/pay')
  async markPaid(@Body() body: MarkPaidDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.markEntitlementPaid(body, actorFromRequest(request))
  }

  // -------- Shareholder-facing reads ----------------------------------

  @Permissions('dividend.manage', 'transfer.view', 'report.view')
  @Get('shareholders/:shareholderId/entitlements')
  @Scope({ shareholderPaths: ['params.shareholderId'], autoFillShareholderPath: 'params.shareholderId' })
  async listForShareholder(@Param('shareholderId') shareholderId: string, @Query() query: EntitlementListQuery) {
    return this.dividendsService.listEntitlementsForShareholder(shareholderId, query)
  }

  // -------- DRIP (forward-looking) ------------------------------------

  @Permissions('dividend.manage', 'agent.admin')
  @Post('drip-instructions')
  @Scope({ issuerPaths: ['body.issuerId'], shareholderPaths: ['body.shareholderId'] })
  async upsertDrip(@Body() body: UpsertReinvestmentInstructionDto, @CurrentRequest() request: AuthenticatedRequest) {
    return this.dividendsService.upsertReinvestmentInstruction(body, actorFromRequest(request))
  }
}

/**
 * Set the standard CSV download headers on the Express response and
 * return the body. Centralised so every export endpoint emits the same
 * headers (charset, attachment disposition, no-cache).
 */
function writeCsv(response: Response, download: { filename: string; contentType: string; body: string }): string {
  response.setHeader('Content-Type', download.contentType)
  response.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`)
  response.setHeader('Cache-Control', 'no-store')
  return download.body
}
