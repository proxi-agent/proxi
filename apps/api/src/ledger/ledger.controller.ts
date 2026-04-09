import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common'
import { Permissions } from '../auth/permissions.decorator.js'
import { LedgerService } from './ledger.service.js'
import type { LedgerEvent, Position } from './ledger.service.js'

class IssueDto {
  securityId!: string
  holderId!: string
  quantity!: number
}

class TransferDto {
  securityId!: string
  fromHolderId!: string
  toHolderId!: string
  quantity!: number
}

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Permissions('transfer.view')
  @Get('events')
  async getEvents(): Promise<LedgerEvent[]> {
    return this.ledgerService.getEvents()
  }

  @Permissions('transfer.view')
  @Get('positions')
  async getPositions(): Promise<Position[]> {
    return this.ledgerService.getPositions()
  }

  @Permissions('ledger.post')
  @Post('issue')
  async issue(@Body() body: IssueDto): Promise<LedgerEvent> {
    const { securityId, holderId, quantity } = body
    if (!securityId || !holderId || typeof quantity !== 'number' || quantity <= 0) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST)
    }
    return this.ledgerService.issue(securityId, holderId, quantity)
  }

  @Permissions('ledger.post')
  @Post('transfer')
  async transfer(@Body() body: TransferDto): Promise<LedgerEvent> {
    const { securityId, fromHolderId, toHolderId, quantity } = body
    if (!securityId || !fromHolderId || !toHolderId || typeof quantity !== 'number' || quantity <= 0) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST)
    }
    return this.ledgerService.transfer(securityId, fromHolderId, toHolderId, quantity)
  }
}
