import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common'
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

  @Get('events')
  getEvents(): LedgerEvent[] {
    return this.ledgerService.getEvents()
  }

  @Get('positions')
  getPositions(): Position[] {
    return this.ledgerService.getPositions()
  }

  @Post('issue')
  issue(@Body() body: IssueDto): LedgerEvent {
    const { securityId, holderId, quantity } = body
    if (!securityId || !holderId || typeof quantity !== 'number' || quantity <= 0) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST)
    }
    return this.ledgerService.issue(securityId, holderId, quantity)
  }

  @Post('transfer')
  transfer(@Body() body: TransferDto): LedgerEvent {
    const { securityId, fromHolderId, toHolderId, quantity } = body
    if (!securityId || !fromHolderId || !toHolderId || typeof quantity !== 'number' || quantity <= 0) {
      throw new HttpException('Invalid body', HttpStatus.BAD_REQUEST)
    }
    return this.ledgerService.transfer(securityId, fromHolderId, toHolderId, quantity)
  }
}
