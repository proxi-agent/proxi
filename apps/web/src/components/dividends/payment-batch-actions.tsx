'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/icon'
import type { PaymentBatchStatus } from '@/lib/dividends/types'

const API_BASE = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined

type BatchActionKey = 'approve' | 'cancel' | 'processing' | 'reconcile' | 'reject' | 'schedule' | 'submit'

interface BatchActionDescriptor {
  confirm?: string
  label: string
  path: string
  primary?: boolean
  reasonPrompt?: { field: string; question: string }
  showFor: PaymentBatchStatus[]
}

const ACTIONS: Record<BatchActionKey, BatchActionDescriptor> = {
  approve: { label: 'Approve batch', path: 'approve', primary: true, showFor: ['PENDING_APPROVAL'] },
  cancel: {
    confirm: 'Cancel this batch? Pending payments will be marked cancelled.',
    label: 'Cancel batch',
    path: 'cancel',
    reasonPrompt: { field: 'reason', question: 'Cancellation reason (visible in audit trail)' },
    showFor: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'],
  },
  processing: { label: 'Mark processing', path: 'processing', primary: true, showFor: ['SCHEDULED'] },
  reconcile: { label: 'Reconcile', path: 'reconcile', showFor: ['PARTIALLY_PROCESSED', 'PROCESSED', 'PARTIALLY_FAILED'] },
  reject: {
    label: 'Reject',
    path: 'reject',
    reasonPrompt: { field: 'reason', question: 'Rejection reason (visible in audit trail)' },
    showFor: ['PENDING_APPROVAL'],
  },
  schedule: { label: 'Schedule', path: 'schedule', primary: true, showFor: ['APPROVED'] },
  submit: { label: 'Submit for approval', path: 'submit', primary: true, showFor: ['DRAFT'] },
}

/**
 * Renders the right batch-level action buttons based on the current
 * batch status, and POSTs to `/dividends/batches/:id/<action>` with
 * `router.refresh()` on success.
 *
 * Replaces the original detail page buttons that had no click handlers.
 */
export function PaymentBatchActions({ batchId, status }: { batchId: string; status: PaymentBatchStatus }) {
  const router = useRouter()
  const [pending, setPending] = useState<BatchActionKey | null>(null)
  const [error, setError] = useState<null | string>(null)

  const visible = (Object.entries(ACTIONS) as Array<[BatchActionKey, BatchActionDescriptor]>).filter(([, d]) => d.showFor.includes(status))

  if (visible.length === 0) return null

  async function dispatchAction(key: BatchActionKey, descriptor: BatchActionDescriptor) {
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
    setPending(key)
    setError(null)
    try {
      if (!API_BASE) {
        window.alert(`Mock mode: would POST /dividends/batches/${batchId}/${descriptor.path}`)
        return
      }
      const res = await fetch(`${API_BASE}/dividends/batches/${encodeURIComponent(batchId)}/${descriptor.path}`, {
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
    <div className='flex flex-col items-end gap-1'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {visible.map(([key, descriptor]) => {
          const isPrimary = !primaryAssigned && descriptor.primary
          if (isPrimary) primaryAssigned = true
          const isDanger = key === 'cancel' || key === 'reject'
          const cls = isPrimary
            ? 'btn btn-brand btn-sm'
            : isDanger
              ? 'btn btn-secondary btn-sm text-danger-700'
              : 'btn btn-secondary btn-sm'
          const iconName = pending === key ? 'refresh-cw' : isPrimary ? 'play' : isDanger ? 'x' : 'check'
          return (
            <button
              aria-busy={pending === key}
              className={cls}
              disabled={pending !== null}
              key={key}
              onClick={() => dispatchAction(key, descriptor)}
              type='button'
            >
              <Icon className={pending === key ? 'animate-spin' : undefined} name={iconName} size={13} />
              {descriptor.label}
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
