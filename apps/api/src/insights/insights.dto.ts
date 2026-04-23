import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class ActivitySearchDto {
  @IsString()
  q!: string

  @IsOptional()
  @IsString()
  @IsIn([
    'BALLOT',
    'DIVIDEND_ENTITLEMENT',
    'DIVIDEND_EVENT',
    'ISSUER',
    'LEDGER_EVENT',
    'MEETING',
    'NOTICE',
    'PROPOSAL',
    'SECURITY',
    'SHAREHOLDER',
    'SHAREHOLDER_ACCOUNT',
    'TASK',
    'TRANSFER_CASE',
    'USER',
    'VOTE',
  ])
  entityType?: string

  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class TaskFocusDto {
  @IsOptional()
  @IsString()
  issuerId?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number
}

export class CopilotQueryDto {
  @IsOptional()
  @IsString()
  issuerId?: string
}
