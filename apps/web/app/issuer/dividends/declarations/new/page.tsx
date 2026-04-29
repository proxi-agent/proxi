'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import { DividendForm, type DividendFormValues } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, PageHeader, Panel } from '@/components/ui'
import { withApiAuthHeaders } from '@/lib/api/auth-headers'
import { apiUrl } from '@/lib/api/base-url'

export default function NewDividendDeclarationPage() {
  const router = useRouter()
  const [error, setError] = useState<null | string>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: DividendFormValues, intent: 'draft' | 'submit') => {
    setError(null)
    setSubmitting(true)
    try {
      const createUrl = apiUrl('/dividends')
      if (!createUrl) {
        const verb = intent === 'submit' ? 'Submitted for approval' : 'Saved as draft'
        if (typeof window !== 'undefined') {
          window.alert(
            `Mock mode — ${verb}: ${values.issuerId} · ${values.dividendType} · ${values.currency} ${values.rateAmount}\n\nSet NEXT_PUBLIC_API_URL to wire this to a live backend.`,
          )
        }
        router.push('/issuer/dividends/declarations')
        return
      }

      const createRes = await fetch(createUrl, {
        body: JSON.stringify({
          currency: values.currency,
          declarationDate: values.declarationDate,
          exDividendDate: values.exDividendDate || undefined,
          issuerId: values.issuerId,
          kind: values.dividendType,
          notes: values.notes || undefined,
          paymentDate: values.paymentDate,
          rateAmount: values.rateAmount,
          rateType: values.rateType,
          recordDate: values.recordDate,
          securityId: values.securityId,
        }),
        cache: 'no-store',
        credentials: 'include',
        headers: withApiAuthHeaders({ 'content-type': 'application/json' }),
        method: 'POST',
      })
      if (!createRes.ok) {
        const text = await createRes.text().catch(() => '')
        let detail = `Create failed (${createRes.status})`
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
      const created = (await createRes.json()) as { id: string }

      if (intent === 'submit') {
        const submitUrl = apiUrl(`/dividends/${encodeURIComponent(created.id)}/submit`)
        if (!submitUrl) {
          setError(`Created ${created.id} but submission for approval failed.`)
          router.push(`/issuer/dividends/declarations/${created.id}`)
          return
        }
        const submitRes = await fetch(submitUrl, {
          body: JSON.stringify({}),
          cache: 'no-store',
          credentials: 'include',
          headers: withApiAuthHeaders({ 'content-type': 'application/json' }),
          method: 'POST',
        })
        if (!submitRes.ok) {
          const text = await submitRes.text().catch(() => '')
          setError(text.slice(0, 240) || `Created ${created.id} but submission for approval failed.`)
          router.push(`/issuer/dividends/declarations/${created.id}`)
          return
        }
      }
      router.push(`/issuer/dividends/declarations/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell
      breadcrumbs={[
        { href: '/issuer', label: 'Issuer' },
        { href: '/issuer/dividends', label: 'Dividends' },
        { href: '/issuer/dividends/declarations', label: 'Declarations' },
        { label: 'New' },
      ]}
      portal='issuer'
    >
      <PageHeader
        actions={
          <button className='btn btn-ghost btn-sm' onClick={() => router.back()} type='button'>
            <Icon name='arrow-left' size={13} />
            Back
          </button>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>Draft</Badge>
            <span className='text-[12px] text-ink-500'>Step 1 of the canonical 11-step workflow · Board review</span>
          </div>
        }
        subtitle='Fill out the financial terms and key dates. Validation will catch ordering issues before review.'
        title='New dividend declaration'
      />

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]'>
        <Panel padded title='Declaration details'>
          {error && (
            <div className='mb-3'>
              <Callout tone='warning'>{error}</Callout>
            </div>
          )}
          <DividendForm disabled={submitting} mode='create' onCancel={() => router.back()} onSubmit={handleSubmit} />
        </Panel>

        <aside className='flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel subtitle='What happens after you submit' title='Workflow ahead'>
            <ol className='timeline'>
              <li className='timeline-item info'>
                <div className='timeline-title'>Submit for approval</div>
                <div className='timeline-body'>The board / CFO / corporate secretary review and approve.</div>
              </li>
              <li className='timeline-item'>
                <div className='timeline-title'>Lock eligibility</div>
                <div className='timeline-body'>Capture the ledger as of the record date. Immutable snapshot.</div>
              </li>
              <li className='timeline-item'>
                <div className='timeline-title'>Calculate entitlements</div>
                <div className='timeline-body'>Per-shareholder gross / withholding / net amounts.</div>
              </li>
              <li className='timeline-item'>
                <div className='timeline-title'>Payment batches</div>
                <div className='timeline-body'>Approve, schedule, execute, and reconcile bank distribution.</div>
              </li>
            </ol>
          </Panel>
          <Callout tone='info'>
            Drafts can be edited freely. Once submitted, only the reviewer can move the declaration forward — or send it back with change
            requests.
          </Callout>
        </aside>
      </div>
    </AppShell>
  )
}
