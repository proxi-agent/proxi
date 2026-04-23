import { randomUUID } from 'node:crypto'

export function uid(): string {
  return randomUUID()
}

export function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().split('-')[0]}`
}
