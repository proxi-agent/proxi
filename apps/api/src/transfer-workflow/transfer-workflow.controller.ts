import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { Scope } from '../auth/scope.decorator.js'
import { actorFromRequest } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'

import {
  AdvanceSettlementStepDto,
  ApproveTransferDto,
  CancelTransferDto,
  ClearAdverseClaimDto,
  ClearDeceasedFlagDto,
  ClearRestrictionDto,
  ClearStopOrderDto,
  CreateTransferRequestDto,
  FailTransferDto,
  IntakeTransferDto,
  IssuerReviewResponseDto,
  ProvideLegalOpinionDto,
  RaiseAdverseClaimDto,
  RaiseDeceasedFlagDto,
  RaiseRestrictionDto,
  RaiseStopOrderDto,
  RejectTransferDto,
  RequestInfoDto,
  RequestIssuerReviewDto,
  RequestLegalOpinionDto,
  ResubmitDto,
  RunAutomatedReviewDto,
  SettleTransferDto,
  StartReviewDto,
  SubmitDocumentsDto,
  TransferQueueQuery,
} from './transfer-workflow.dto.js'
import { TransferWorkflowService } from './transfer-workflow.service.js'
import type { LedgerImpactPreview, TransferDetail, TransferRequestSummary } from './transfer-workflow.types.js'

/**
 * All mutation routes read the actor from the request (populated by
 * ClerkAuthGuard) so services stay decoupled from HTTP concerns.
 *
 * RBAC:
 * - `transfer.view`                     — queue + detail + preview
 * - `shareholder.transfer.create`       — create (portal flow)
 * - `transfer.review`                   — submit / start-review / request-info / resubmit / cancel
 * - `transfer.approve`                  — approve / reject / settle
 */
@Controller('transfer-workflow')
export class TransferWorkflowController {
  constructor(private readonly service: TransferWorkflowService) {}

  @Get()
  @Permissions('transfer.view')
  @Scope({
    issuerPaths: ['query.issuerId'],
    accountPaths: ['query.accountId'],
    autoFillIssuerPath: 'query.issuerId',
    autoFillAccountPath: 'query.accountId',
  })
  list(@Query() query: TransferQueueQuery): Promise<PaginatedResponse<TransferRequestSummary>> {
    return this.service.list(query)
  }

  @Get(':id')
  @Permissions('transfer.view')
  @Scope({ entityRule: { entity: 'transfer' } })
  detail(@Param('id') id: string): Promise<TransferDetail> {
    return this.service.getDetail(id)
  }

  @Get(':id/ledger-preview')
  @Permissions('transfer.view')
  @Scope({ entityRule: { entity: 'transfer' } })
  preview(@Param('id') id: string): Promise<LedgerImpactPreview> {
    return this.service.previewLedgerImpact(id)
  }

  @Post()
  @Permissions('shareholder.transfer.create')
  @Scope({
    issuerPaths: ['body.issuerId'],
    accountPaths: ['body.fromAccountId', 'body.toAccountId'],
    autoFillIssuerPath: 'body.issuerId',
  })
  create(@Body() body: CreateTransferRequestDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.create(body, actorFromRequest(req))
  }

  @Post(':id/submit')
  @Permissions('shareholder.transfer.create')
  @Scope({ entityRule: { entity: 'transfer' } })
  submit(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.submit(id, actorFromRequest(req))
  }

  @Post(':id/start-review')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  startReview(@Param('id') id: string, @Body() body: StartReviewDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.startReview(id, body, actorFromRequest(req))
  }

  @Post(':id/request-info')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  requestInfo(@Param('id') id: string, @Body() body: RequestInfoDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.requestInfo(id, body, actorFromRequest(req))
  }

  @Post(':id/resubmit')
  @Permissions('shareholder.transfer.create')
  @Scope({ entityRule: { entity: 'transfer' } })
  resubmit(@Param('id') id: string, @Body() body: ResubmitDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.resubmit(id, body, actorFromRequest(req))
  }

  @Post(':id/approve')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  approve(@Param('id') id: string, @Body() body: ApproveTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.approve(id, body, actorFromRequest(req))
  }

  @Post(':id/reject')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  reject(@Param('id') id: string, @Body() body: RejectTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.reject(id, body, actorFromRequest(req))
  }

  @Post(':id/settle')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  settle(@Param('id') id: string, @Body() body: SettleTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.settle(id, body, actorFromRequest(req))
  }

  @Post(':id/cancel')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  cancel(@Param('id') id: string, @Body() body: CancelTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.cancel(id, body, actorFromRequest(req))
  }

  // ------------------------------------------------------------------
  // Case-level workflow endpoints
  // ------------------------------------------------------------------

  @Post(':id/intake')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  intake(@Param('id') id: string, @Body() body: IntakeTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.runIntake(id, body, actorFromRequest(req))
  }

  @Post(':id/documents')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  submitDocuments(
    @Param('id') id: string,
    @Body() body: SubmitDocumentsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.submitDocuments(id, body, actorFromRequest(req))
  }

  @Post(':id/automated-review')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  runAutomatedReview(
    @Param('id') id: string,
    @Body() body: RunAutomatedReviewDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.runAutomatedReview(id, body, actorFromRequest(req))
  }

  // ---- Exception branches ----

  @Post(':id/flags/stop-order')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  raiseStopOrder(
    @Param('id') id: string,
    @Body() body: RaiseStopOrderDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.raiseStopOrder(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/stop-order/clear')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  clearStopOrder(
    @Param('id') id: string,
    @Body() body: ClearStopOrderDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.clearStopOrder(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/adverse-claim')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  raiseAdverseClaim(
    @Param('id') id: string,
    @Body() body: RaiseAdverseClaimDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.raiseAdverseClaim(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/adverse-claim/clear')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  clearAdverseClaim(
    @Param('id') id: string,
    @Body() body: ClearAdverseClaimDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.clearAdverseClaim(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/deceased')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  raiseDeceased(
    @Param('id') id: string,
    @Body() body: RaiseDeceasedFlagDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.raiseDeceasedFlag(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/deceased/clear')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  clearDeceased(
    @Param('id') id: string,
    @Body() body: ClearDeceasedFlagDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.clearDeceasedFlag(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/restriction')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  raiseRestriction(
    @Param('id') id: string,
    @Body() body: RaiseRestrictionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.raiseRestriction(id, body, actorFromRequest(req))
  }

  @Post(':id/flags/restriction/clear')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  clearRestriction(
    @Param('id') id: string,
    @Body() body: ClearRestrictionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.clearRestriction(id, body, actorFromRequest(req))
  }

  @Post(':id/legal-opinion/request')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  requestLegalOpinion(
    @Param('id') id: string,
    @Body() body: RequestLegalOpinionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.requestLegalOpinion(id, body, actorFromRequest(req))
  }

  @Post(':id/legal-opinion/provide')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  provideLegalOpinion(
    @Param('id') id: string,
    @Body() body: ProvideLegalOpinionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.provideLegalOpinion(id, body, actorFromRequest(req))
  }

  @Post(':id/issuer-review/request')
  @Permissions('transfer.review')
  @Scope({ entityRule: { entity: 'transfer' } })
  requestIssuerReview(
    @Param('id') id: string,
    @Body() body: RequestIssuerReviewDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.requestIssuerReview(id, body, actorFromRequest(req))
  }

  @Post(':id/issuer-review/respond')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  respondIssuerReview(
    @Param('id') id: string,
    @Body() body: IssuerReviewResponseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.respondIssuerReview(id, body, actorFromRequest(req))
  }

  // ---- Settlement ----

  @Post(':id/settlement/schedule')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  scheduleSettlement(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.scheduleSettlement(id, actorFromRequest(req))
  }

  @Post(':id/settlement/step')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  advanceSettlementStep(
    @Param('id') id: string,
    @Body() body: AdvanceSettlementStepDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.advanceSettlementStep(id, body, actorFromRequest(req))
  }

  @Post(':id/fail')
  @Permissions('transfer.approve')
  @Scope({ entityRule: { entity: 'transfer' } })
  fail(@Param('id') id: string, @Body() body: FailTransferDto, @Req() req: AuthenticatedRequest): Promise<TransferRequestSummary> {
    return this.service.failCase(id, body, actorFromRequest(req))
  }
}
