import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsObject, IsOptional, IsString, MinLength, NotEquals } from 'class-validator'

import type { AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CurrentRequest } from '../auth/current-request.decorator.js'
import { Permissions } from '../auth/permissions.decorator.js'
import { actorFromRequest } from '../common/actor.js'

import type { LedgerEvent, Position } from './ledger.service.js'
import { LedgerService } from './ledger.service.js'

class IssueDto {
  @IsString()
  securityId!: string

  @IsString()
  holderId!: string

  @IsInt()
  @NotEquals(0)
  quantity!: number

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

class TransferDto {
  @IsString()
  securityId!: string

  @IsString()
  fromHolderId!: string

  @IsString()
  toHolderId!: string

  @IsInt()
  quantity!: number

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

class CancelDto {
  @IsString()
  securityId!: string

  @IsString()
  holderId!: string

  @IsInt()
  quantity!: number

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

class AdjustmentDto {
  @IsString()
  securityId!: string

  @IsString()
  holderId!: string

  @IsInt()
  delta!: number

  @IsString()
  @MinLength(4)
  reason!: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

class PositionsAsOfQuery {
  @IsString()
  securityId!: string

  @IsDateString()
  recordDate!: string
}

class EventsListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number
}

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Permissions('transfer.view')
  @Get('events')
  async getEvents(@Query() query: EventsListQuery): Promise<LedgerEvent[]> {
    return this.ledgerService.getEvents(query.limit)
  }

  @Permissions('transfer.view')
  @Get('positions')
  async getPositions(): Promise<Position[]> {
    return this.ledgerService.getPositions()
  }

  @Permissions('transfer.view')
  @Get('positions/as-of')
  async getPositionsAsOf(@Query() query: PositionsAsOfQuery): Promise<Position[]> {
    return this.ledgerService.getPositionsAsOf(query.securityId, query.recordDate)
  }

  @Permissions('ledger.post')
  @Post('issue')
  async issue(@Body() body: IssueDto, @CurrentRequest() request: AuthenticatedRequest): Promise<LedgerEvent> {
    return this.ledgerService.issue(body, actorFromRequest(request))
  }

  @Permissions('ledger.post')
  @Post('transfer')
  async transfer(@Body() body: TransferDto, @CurrentRequest() request: AuthenticatedRequest): Promise<LedgerEvent> {
    return this.ledgerService.transfer(body, actorFromRequest(request))
  }

  @Permissions('ledger.post')
  @Post('cancel')
  async cancel(@Body() body: CancelDto, @CurrentRequest() request: AuthenticatedRequest): Promise<LedgerEvent> {
    return this.ledgerService.cancel(body, actorFromRequest(request))
  }

  @Permissions('ledger.post')
  @Post('adjust')
  async adjust(@Body() body: AdjustmentDto, @CurrentRequest() request: AuthenticatedRequest): Promise<LedgerEvent> {
    return this.ledgerService.adjust(body, actorFromRequest(request))
  }
}
