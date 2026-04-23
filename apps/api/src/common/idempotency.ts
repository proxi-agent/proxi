import { createHash } from 'node:crypto'

export function idempotencyKey(input: string | Record<string, unknown>): string {
  const normalized = typeof input === 'string' ? input : JSON.stringify(input, Object.keys(input).sort())
  return createHash('sha256').update(normalized).digest('hex')
}
