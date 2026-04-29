'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/icon'
import { withApiAuthHeaders } from '@/lib/api/auth-headers'
import { apiUrl } from '@/lib/api/base-url'

/**
 * Creates a new payment batch for every still-unbatched calculated entitlement.
 *
 * The richer "select entitlements + override pay date" UI is a follow-up;
 * this lightweight CTA makes the happy path actionable and replaces the
 * earlier no-op button surfaced during QA.
 */
export function NewBatchButton({
  currency,
  dividendId,
  entitlementIds,
  paymentDate,
}: {
  currency: string
  dividendId: string
  entitlementIds: string[]
  paymentDate: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const disabled = entitlementIds.length === 0

  async function create() {
    if (typeof window === 'undefined') return
    if (!window.confirm(`Create a payment batch for ${entitlementIds.length} entitlements?`)) return
    setPending(true)
    setError(null)
    try {
      const url = apiUrl(`/dividends/${encodeURIComponent(dividendId)}/batches`)
      if (!url) {
        window.alert(`Mock mode: would POST /dividends/${dividendId}/batches with ${entitlementIds.length} entitlements`)
        return
      }
      const res = await fetch(url, {
        body: JSON.stringify({ currency, entitlementIds, paymentDate }),
        cache: 'no-store',
        credentials: 'include',
        headers: withApiAuthHeaders({ 'content-type': 'application/json' }),
        method: 'POST',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setError(text.slice(0, 240) || `Batch creation failed (${res.status}).`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className='flex flex-col items-end gap-1'>
      <button
        aria-busy={pending}
        className='btn btn-brand btn-sm'
        disabled={disabled || pending}
        onClick={create}
        title={disabled ? 'Calculate entitlements before creating a batch.' : undefined}
        type='button'
      >
        <Icon className={pending ? 'animate-spin' : undefined} name={pending ? 'refresh-cw' : 'plus'} size={12} />
        New batch
      </button>
      {error && (
        <div className='max-w-xs rounded-md border border-danger-200 bg-danger-50 px-2 py-1 text-[11px] text-danger-700' role='alert'>
          {error}
        </div>
      )}
    </div>
  )
}
