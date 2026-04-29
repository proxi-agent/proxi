'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/icon'
import { withApiAuthHeaders } from '@/lib/api/auth-headers'
import { apiUrl } from '@/lib/api/base-url'

/**
 * Locks the eligibility snapshot for a dividend.
 *
 * Wired against the backend `POST /dividends/:id/lock-eligibility` endpoint.
 * In mock-only mode (no `NEXT_PUBLIC_API_URL`) we surface a clear notice
 * instead of silently no-op'ing — that ambiguity was the original QA bug.
 */
export function LockSnapshotButton({ dividendId }: { dividendId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<null | string>(null)

  async function lock() {
    if (typeof window === 'undefined') return
    if (!window.confirm('Lock the eligibility snapshot? Once locked, ledger changes will not affect this dividend.')) return
    setPending(true)
    setError(null)
    try {
      const url = apiUrl(`/dividends/${encodeURIComponent(dividendId)}/lock-eligibility`)
      if (!url) {
        window.alert(`Mock mode: would POST /dividends/${dividendId}/lock-eligibility`)
        return
      }
      const res = await fetch(url, {
        cache: 'no-store',
        credentials: 'include',
        headers: withApiAuthHeaders(),
        method: 'POST',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setError(text.slice(0, 240) || `Lock failed (${res.status}).`)
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
      <button aria-busy={pending} className='btn btn-brand btn-sm' disabled={pending} onClick={lock} type='button'>
        <Icon className={pending ? 'animate-spin' : undefined} name={pending ? 'refresh-cw' : 'shield-check'} size={12} />
        Lock snapshot
      </button>
      {error && (
        <div className='rounded-md border border-danger-200 bg-danger-50 px-2 py-1 text-[11px] text-danger-700' role='alert'>
          {error}
        </div>
      )}
    </div>
  )
}
