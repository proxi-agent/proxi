import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Frontend-facing route contract.
 *
 * The Next.js dividend pages were silently 404'ing against several
 * endpoints during QA (e.g. `/dividends/:id/eligibility` instead of
 * `/dividends/:id/snapshot`) because the API client falls through to
 * mock fixtures on any non-OK response. To keep the wired frontend
 * working we pin the canonical route surface here so future refactors
 * either update the controller and the test together, or fail loudly.
 *
 * The test reads the controller source directly rather than booting
 * Nest — that keeps it dependency-free and lets us treat the route
 * shape as a literal contract.
 */

const CONTROLLER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'dividends.controller.ts')

const REQUIRED_ROUTES: ReadonlyArray<{ method: 'Delete' | 'Get' | 'Post' | 'Put'; path: string }> = [
  { method: 'Get', path: 'reports/summary' },
  { method: 'Get', path: ':id' },
  { method: 'Get', path: ':id/audit' },
  { method: 'Get', path: ':id/batches' },
  { method: 'Get', path: ':id/entitlements' },
  { method: 'Get', path: ':id/snapshot' },
  { method: 'Get', path: 'batches/:batchId' },
  { method: 'Post', path: '' },
  { method: 'Post', path: ':id/approve' },
  { method: 'Post', path: ':id/archive' },
  { method: 'Post', path: ':id/batches' },
  { method: 'Post', path: ':id/calculate' },
  { method: 'Post', path: ':id/cancel' },
  { method: 'Post', path: ':id/lock-eligibility' },
  { method: 'Post', path: ':id/reject' },
  { method: 'Post', path: ':id/request-changes' },
  { method: 'Post', path: ':id/submit' },
  { method: 'Post', path: 'batches/:batchId/approve' },
  { method: 'Post', path: 'batches/:batchId/cancel' },
  { method: 'Post', path: 'batches/:batchId/processing' },
  { method: 'Post', path: 'batches/:batchId/reconcile' },
  { method: 'Post', path: 'batches/:batchId/reject' },
  { method: 'Post', path: 'batches/:batchId/schedule' },
  { method: 'Post', path: 'batches/:batchId/submit' },
  { method: 'Post', path: 'payments/bulk-record' },
  { method: 'Post', path: 'payments/record' },
]

describe('dividends controller route contract', () => {
  it('registers every route the wired frontend depends on', async () => {
    const source = await readFile(CONTROLLER_PATH, 'utf8')
    for (const { method, path } of REQUIRED_ROUTES) {
      const arg = path === '' ? '\\(\\s*\\)' : `\\(\\s*['"]${escapeRegExp(path)}['"]\\s*\\)`
      const re = new RegExp(`@${method}${arg}`)
      assert.match(
        source,
        re,
        `Expected controller to expose @${method}(${path === '' ? '' : `'${path}'`}) — frontend depends on this route.`,
      )
    }
  })

  it('keeps the legacy POST :id/snapshot endpoint distinct from GET :id/snapshot', async () => {
    const source = await readFile(CONTROLLER_PATH, 'utf8')
    assert.match(source, /@Get\('\s*:id\/snapshot'\s*\)/)
    assert.match(source, /@Post\('\s*:id\/snapshot'\s*\)/)
  })
})

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
