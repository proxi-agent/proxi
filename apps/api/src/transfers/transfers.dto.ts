import { IsIn, IsOptional, IsString } from 'class-validator'

import { PaginationQueryDto } from '../common/pagination.js'

import type { TransferState } from './transfers.types.js'
import { TRANSFER_STATES } from './transfers.types.js'

const CASE_TYPES = ['CANCEL', 'ISSUE', 'TRANSFER'] as const

export class TransferListQuery extends PaginationQueryDto {
  @IsOptional()
  @IsIn([...TRANSFER_STATES])
  state?: TransferState

  @IsOptional()
  @IsIn([...CASE_TYPES])
  type?: 'CANCEL' | 'ISSUE' | 'TRANSFER'

  @IsOptional()
  @IsString()
  securityId?: string

  @IsOptional()
  @IsString()
  holderId?: string

  @IsOptional()
  @IsString()
  assignedReviewerId?: string
}
