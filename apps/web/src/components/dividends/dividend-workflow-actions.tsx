'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/icon'
import { ACTION_ICON, ACTION_LABEL } from '@/lib/dividends/copy'
import type { DividendAction } from '@/lib/dividends/types'

const API_BASE = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined

const PRIMARY_ACTIONS: DividendAction[] = ['approve', 'submit', 'lockEligibility', 'calculate', 'archive']

interface ActionDescriptor {
  /** Endpoint suffix, appended after `/dividends/:id`. */
  path: string
  /** Optional confirmation copy shown via `window.confirm` (used for destructive actions). */
  confirm?: string
  /** Optional reason prompt; when set, the value is sent in the request body. */
  reasonPrompt?: { field: string; question: string }
}

const ENDPOINTS: Record<DividendAction, ActionDescriptor | null> = {
  approve: { path: 'approve' },
  archive: { path: 'archive', confirm: 'Archive this dividend? Final state — locks all records.' },
  calculate: { path: 'calculate' },
  cancel: {
    confirm: 'Cancel this dividend? This is irreversible.',
    path: 'cancel',
    reasonPrompt: { field: 'reason', question: 'Cancellation reason (visible in the audit trail)' },
  },
  edit: null,
  lockEligibility: {
    path: 'lock-eligibility',
    confirm: 'Lock the eligibility snapshot? Once locked, ledger changes will not affect this dividend.',
  },
  reject: {
    confirm: 'Reject this declaration?',
    path: 'reject',
    reasonPrompt: { field: 'reason', question: 'Rejection reason (visible in the audit trail)' },
  },
  requestChanges: {
    path: 'request-changes',
    reasonPrompt: { field: 'reason', question: 'What changes are needed? (visible to the requester)' },
  },
  submit: { path: 'submit' },
}

/**
 * Wires the API-driven `allowedActions` into real backend POST calls.
 *
 * - Server-rendered detail page passes `actions={dividend.allowedActions}` and `dividendId`.
 * - Each button POSTs to `/dividends/:id/<action>` and refreshes the route on success.
 * - Destructive actions use `window.confirm`; reason-bearing actions use `window.prompt`.
 *
 * Edit (`edit`) is intentionally a hyperlink elsewhere — we don't render it here
 * because navigating in a server component is simpler than a client redirect.
 */
export function DividendWorkflowActions({
  actions,
  compact = false,
  dividendId,
}: {
  actions: DividendAction[]
  compact?: boolean
  dividendId: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState<DividendAction | null>(null)
  const [error, setError] = useState<null | string>(null)

  if (actions.length === 0) {
    return <span className='text-[12px] text-ink-400'>No actions available</span>
  }

  const sorted = [...actions]
    .filter(a => ENDPOINTS[a] !== null)
    .sort((a, b) => {
      const ai = PRIMARY_ACTIONS.indexOf(a)
      const bi = PRIMARY_ACTIONS.indexOf(b)
      if (ai === -1 && bi === -1) return ACTION_LABEL[a].localeCompare(ACTION_LABEL[b])
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })

  async function dispatchAction(action: DividendAction) {
    const descriptor = ENDPOINTS[action]
    if (!descriptor) return
    if (typeof window === 'undefined') return
    if (descriptor.confirm && !window.confirm(descriptor.confirm)) return

    let body: Record<string, unknown> = {}
    if (descriptor.reasonPrompt) {
      const reason = window.prompt(descriptor.reasonPrompt.question)
      if (reason === null) return
      const trimmed = reason.trim()
      if (!trimmed) {
        setError('A reason is required.')
        return
      }
      body = { [descriptor.reasonPrompt.field]: trimmed }
    }

    setPending(action)
    setError(null)
    try {
      if (!API_BASE) {
        // Local mock-only mode: surface a friendly message instead of silently no-op'ing.
        window.alert(
          `Mock mode: would POST /dividends/${dividendId}/${descriptor.path}\n\nSet NEXT_PUBLIC_API_URL to wire this to a live backend.`,
        )
        setPending(null)
        return
      }
      const res = await fetch(`${API_BASE}/dividends/${encodeURIComponent(dividendId)}/${descriptor.path}`, {
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let detail = `Request failed (${res.status})`
        try {
          const parsed = JSON.parse(text) as { message?: string | string[] }
          if (Array.isArray(parsed.message)) detail = parsed.message.join('; ')
          else if (typeof parsed.message === 'string') detail = parsed.message
        } catch {
          if (text) detail = text.slice(0, 240)
        }
        setError(detail)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setPending(null)
    }
  }

  let primaryAssigned = false
  return (
    <div className='flex flex-col items-end gap-1.5'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {sorted.map(action => {
          const isPrimary = !primaryAssigned && PRIMARY_ACTIONS.includes(action)
          if (isPrimary) primaryAssigned = true
          const isDanger = action === 'reject' || action === 'cancel'
          const cls = isPrimary
            ? 'btn btn-brand btn-sm'
            : isDanger
              ? 'btn btn-secondary btn-sm text-danger-700'
              : 'btn btn-secondary btn-sm'
          return (
            <button
              aria-busy={pending === action}
              className={cls}
              disabled={pending !== null}
              key={action}
              onClick={() => dispatchAction(action)}
              type='button'
            >
              <Icon
                className={pending === action ? 'animate-spin' : undefined}
                name={pending === action ? 'refresh-cw' : ACTION_ICON[action]}
                size={compact ? 12 : 13}
              />
              {ACTION_LABEL[action]}
            </button>
          )
        })}
      </div>
      {error && (
        <div className='max-w-md rounded-md border border-danger-200 bg-danger-50 px-2 py-1 text-[11px] text-danger-700' role='alert'>
          {error}
        </div>
      )}
    </div>
  )
}
