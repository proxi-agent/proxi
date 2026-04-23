import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'
import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { actorFromRequest } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'

import {
  ApproveTransferDto,
  CancelTransferDto,
  CreateTransferRequestDto,
  RejectTransferDto,
  RequestInfoDto,
  ResubmitDto,
  SettleTransferDto,
  StartReviewDto,
  TransferQueueQuery,
} from './transfer-workflow.dto.js'
import { TransferWorkflowService } from './transfer-workflow.service.js'
import type {
  LedgerImpactPreview,
  TransferDetail,
  TransferRequestSummary,
} from './transfer-workflow.types.js'

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
  list(@Query() query: TransferQueueQuery): Promise<PaginatedResponse<TransferRequestSummary>> {
    return this.service.list(query)
  }

  @Get(':id')
  @Permissions('transfer.view')
  detail(@Param('id') id: string): Promise<TransferDetail> {
    return this.service.getDetail(id)
  }

  @Get(':id/ledger-preview')
  @Permissions('transfer.view')
  preview(@Param('id') id: string): Promise<LedgerImpactPreview> {
    return this.service.previewLedgerImpact(id)
  }

  @Post()
  @Permissions('shareholder.transfer.create')
  create(
    @Body() body: CreateTransferRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.create(body, actorFromRequest(req))
  }

  @Post(':id/submit')
  @Permissions('shareholder.transfer.create')
  submit(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.submit(id, actorFromRequest(req))
  }

  @Post(':id/start-review')
  @Permissions('transfer.review')
  startReview(
    @Param('id') id: string,
    @Body() body: StartReviewDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.startReview(id, body, actorFromRequest(req))
  }

  @Post(':id/request-info')
  @Permissions('transfer.review')
  requestInfo(
    @Param('id') id: string,
    @Body() body: RequestInfoDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.requestInfo(id, body, actorFromRequest(req))
  }

  @Post(':id/resubmit')
  @Permissions('shareholder.transfer.create')
  resubmit(
    @Param('id') id: string,
    @Body() body: ResubmitDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.resubmit(id, body, actorFromRequest(req))
  }

  @Post(':id/approve')
  @Permissions('transfer.approve')
  approve(
    @Param('id') id: string,
    @Body() body: ApproveTransferDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.approve(id, body, actorFromRequest(req))
  }

  @Post(':id/reject')
  @Permissions('transfer.approve')
  reject(
    @Param('id') id: string,
    @Body() body: RejectTransferDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.reject(id, body, actorFromRequest(req))
  }

  @Post(':id/settle')
  @Permissions('transfer.approve')
  settle(
    @Param('id') id: string,
    @Body() body: SettleTransferDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.settle(id, body, actorFromRequest(req))
  }

  @Post(':id/cancel')
  @Permissions('transfer.review')
  cancel(
    @Param('id') id: string,
    @Body() body: CancelTransferDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransferRequestSummary> {
    return this.service.cancel(id, body, actorFromRequest(req))
  }
}
