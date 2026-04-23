import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'
import type { PaginatedResponse } from '../common/pagination.js'

import { TransferListQuery } from './transfers.dto.js'
import { TransfersService } from './transfers.service.js'
import type { TransferStats, TransferSummary } from './transfers.types.js'

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @Permissions('transfer.view')
  async list(@Query() query: TransferListQuery): Promise<PaginatedResponse<TransferSummary>> {
    return this.transfersService.list(query)
  }

  @Get('stats')
  @Permissions('transfer.view')
  async stats(): Promise<TransferStats> {
    return this.transfersService.stats()
  }

  @Get(':id')
  @Permissions('transfer.view')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.transfersService.getById(id)
  }
}
