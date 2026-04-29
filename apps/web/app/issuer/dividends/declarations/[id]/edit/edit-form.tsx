'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Callout } from '@/components/callout'
import { DividendForm, type DividendFormValues } from '@/components/dividends'
import type { DividendEvent } from '@/lib/dividends/types'

const API_BASE = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined

export function EditDividendForm({ dividend }: { dividend: DividendEvent }) {
  const router = useRouter()
  const [error, setError] = useState<null | string>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: DividendFormValues, intent: 'draft' | 'submit') => {
    setError(null)
    setSubmitting(true)
    try {
      if (!API_BASE) {
        if (typeof window !== 'undefined') {
          const verb = intent === 'submit' ? 'Submitted for approval' : 'Saved draft changes'
          window.alert(`Mock mode — ${verb}: v${dividend.version} · ${values.dividendType} · ${values.rateAmount}`)
        }
        router.push(`/issuer/dividends/declarations/${dividend.id}`)
        return
      }

      const updateRes = await fetch(`${API_BASE}/dividends/${encodeURIComponent(dividend.id)}`, {
        body: JSON.stringify({
          currency: values.currency,
          declarationDate: values.declarationDate,
          exDividendDate: values.exDividendDate || undefined,
          expectedVersion: dividend.version,
          kind: values.dividendType,
          notes: values.notes || undefined,
          paymentDate: values.paymentDate,
          rateAmount: values.rateAmount,
          rateType: values.rateType,
          recordDate: values.recordDate,
        }),
        cache: 'no-store',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      })
      if (!updateRes.ok) {
        const text = await updateRes.text().catch(() => '')
        let detail = `Update failed (${updateRes.status})`
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

      if (intent === 'submit') {
        const submitRes = await fetch(`${API_BASE}/dividends/${encodeURIComponent(dividend.id)}/submit`, {
          body: JSON.stringify({}),
          cache: 'no-store',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        if (!submitRes.ok) {
          const text = await submitRes.text().catch(() => '')
          setError(text.slice(0, 240) || 'Update saved, but submission for approval failed.')
          return
        }
      }
      router.push(`/issuer/dividends/declarations/${dividend.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {error && (
        <div className='mb-3'>
          <Callout tone='warning'>{error}</Callout>
        </div>
      )}
      <DividendForm disabled={submitting} dividend={dividend} mode='edit' onCancel={() => router.back()} onSubmit={handleSubmit} />
    </>
  )
}
