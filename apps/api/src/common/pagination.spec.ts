import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildPaginated, pageOffset, type PaginationQueryDto } from './pagination.js'

describe('pagination helpers', () => {
  it('computes deterministic pagination metadata', () => {
    const query: PaginationQueryDto = {
      page: 2,
      pageSize: 10,
      q: 'abc',
      sortBy: 'createdAt',
      sortDir: 'asc',
    }
    const response = buildPaginated([1, 2], 35, query)
    assert.equal(response.page, 2)
    assert.equal(response.pageSize, 10)
    assert.equal(response.total, 35)
    assert.equal(response.totalPages, 4)
    assert.equal(response.sortDir, 'asc')
  })

  it('computes offset from query', () => {
    assert.equal(pageOffset({ page: 1, pageSize: 25, sortDir: 'desc' }), 0)
    assert.equal(pageOffset({ page: 3, pageSize: 10, sortDir: 'desc' }), 20)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildPaginated, pageOffset, PaginationQueryDto, resolveSort } from './pagination.js'

function query(overrides: Partial<PaginationQueryDto> = {}): PaginationQueryDto {
  const dto = new PaginationQueryDto()
  Object.assign(dto, overrides)
  return dto
}

describe('pagination helpers', () => {
  it('computes totalPages correctly', () => {
    const response = buildPaginated([1, 2], 45, query({ page: 1, pageSize: 20 }))
    assert.equal(response.totalPages, 3)
    assert.equal(response.total, 45)
    assert.equal(response.page, 1)
    assert.equal(response.pageSize, 20)
  })

  it('computes offset for second page', () => {
    assert.equal(pageOffset(query({ page: 3, pageSize: 50 })), 100)
  })

  it('resolves sort column using allowlist', () => {
    const sort = resolveSort(query({ sortBy: 'name', sortDir: 'asc' }), { name: 'legal_name' }, { column: 'created_at' })
    assert.deepEqual(sort, { column: 'legal_name', dir: 'asc' })
  })

  it('falls back when sort column not allowed', () => {
    const sort = resolveSort(query({ sortBy: 'bogus' }), { name: 'legal_name' }, { column: 'created_at', dir: 'desc' })
    assert.deepEqual(sort, { column: 'created_at', dir: 'desc' })
  })
})
