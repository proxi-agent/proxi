import { describe, expect, it } from 'vitest'

import { diff, diffToMetadata } from './audit.diff.js'

describe('audit.diff', () => {
  it('returns no changes when objects are structurally equal', () => {
    const result = diff({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })
    expect(result.hasChanges).toBe(false)
    expect(result.changedFields).toEqual([])
    expect(result.addedKeys).toEqual([])
    expect(result.removedKeys).toEqual([])
  })

  it('detects primitive changes by path', () => {
    const result = diff({ status: 'OPEN' }, { status: 'RESOLVED' })
    expect(result.hasChanges).toBe(true)
    expect(result.changedFields).toHaveLength(1)
    expect(result.changedFields[0]).toMatchObject({ path: 'status', before: 'OPEN', after: 'RESOLVED' })
  })

  it('walks nested objects', () => {
    const result = diff(
      { policy: { risk: 'LOW', reviewer: 'alice' } },
      { policy: { risk: 'HIGH', reviewer: 'alice' } },
    )
    expect(result.changedFields).toEqual([
      { after: 'HIGH', before: 'LOW', path: 'policy.risk' },
    ])
  })

  it('tracks added and removed keys', () => {
    const result = diff({ a: 1 }, { a: 1, b: 2 })
    expect(result.addedKeys).toEqual(['b'])
    expect(result.removedKeys).toEqual([])
    expect(result.changedFields).toEqual([{ after: 2, before: undefined, path: 'b' }])
  })

  it('respects ignore paths', () => {
    const result = diff(
      { updatedAt: new Date('2020-01-01'), value: 1 },
      { updatedAt: new Date('2020-02-02'), value: 2 },
      { ignore: ['updatedAt'] },
    )
    expect(result.changedFields.map(c => c.path)).toEqual(['value'])
  })

  it('compares arrays structurally', () => {
    const result = diff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })
    expect(result.hasChanges).toBe(false)
  })

  it('redacts sensitive fields in metadata output', () => {
    const result = diff({ password: 'old' }, { password: 'new' })
    const meta = diffToMetadata(result)
    const first = (meta.changedFields as Array<Record<string, unknown>>)[0]!
    expect(first.before).toBe('[REDACTED]')
    expect(first.after).toBe('[REDACTED]')
  })
})
