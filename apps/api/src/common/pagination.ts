import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 25

  @IsOptional()
  @IsString()
  sortBy?: string

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc'

  @IsOptional()
  @IsString()
  q?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  sortBy?: string
  sortDir: 'asc' | 'desc'
}

export function buildPaginated<T>(items: T[], total: number, query: PaginationQueryDto): PaginatedResponse<T> {
  const pageSize = query.pageSize || 25
  return {
    items,
    page: query.page || 1,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    sortBy: query.sortBy,
    sortDir: query.sortDir || 'desc',
  }
}

export function pageOffset(query: PaginationQueryDto): number {
  return ((query.page || 1) - 1) * (query.pageSize || 25)
}

export function resolveSort(
  query: PaginationQueryDto,
  allowed: Record<string, string>,
  fallback: { column: string; dir?: 'asc' | 'desc' },
): { column: string; dir: 'asc' | 'desc' } {
  const column = (query.sortBy && allowed[query.sortBy]) || fallback.column
  const dir: 'asc' | 'desc' = query.sortDir || fallback.dir || 'desc'
  return { column, dir }
}
