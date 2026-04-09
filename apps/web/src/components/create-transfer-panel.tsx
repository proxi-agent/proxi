'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { apiPost } from '@/lib/api-client'
import type { CaseRecord } from '@/types/cases'

type RulesResponse = {
  evaluation: {
    blockingReasons: string[]
    checks: Array<{ detail: string; name: string; passed: boolean }>
    eligible: boolean
  }
  requirements: string[]
}

const DEFAULT_FORM = {
  fromHolderId: 'ALPHA_CAPITAL',
  quantity: 2500,
  secRestrictionActive: false,
  securityId: 'PROXI-CLASS-A',
  toHolderId: 'AURORA_FUND',
}

export default function CreateTransferPanel() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [createdCase, setCreatedCase] = useState<CaseRecord | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [rules, setRules] = useState<RulesResponse | null>(null)

  async function evaluateRules() {
    setPending(true)
    setError('')
    try {
      const result = await apiPost<Record<string, unknown>, RulesResponse>('/rules/evaluate', {
        ...form,
        quantity: Number(form.quantity),
        type: 'TRANSFER',
      })
      setRules(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to evaluate rules')
    } finally {
      setPending(false)
    }
  }

  async function createTransfer() {
    setPending(true)
    setError('')
    try {
      const result = await apiPost<Record<string, unknown>, CaseRecord>('/cases', {
        ...form,
        evidenceDocs: ['Identity verification', 'Transfer instruction letter'],
        quantity: Number(form.quantity),
        type: 'TRANSFER',
      })
      setCreatedCase(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create transfer')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <h2 className='text-xl font-semibold text-slate-900'>Create transfer request</h2>
      <p className='mt-2 text-sm text-slate-600'>Evaluate transfer rules, then create a live case in the API.</p>

      <div className='mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2'>
        <Field label='Security ID'>
          <input
            className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'
            onChange={event => setForm(prev => ({ ...prev, securityId: event.target.value }))}
            value={form.securityId}
          />
        </Field>
        <Field label='Quantity'>
          <input
            className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'
            min={1}
            onChange={event => setForm(prev => ({ ...prev, quantity: Number(event.target.value) || 0 }))}
            type='number'
            value={form.quantity}
          />
        </Field>
        <Field label='From holder'>
          <input
            className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'
            onChange={event => setForm(prev => ({ ...prev, fromHolderId: event.target.value }))}
            value={form.fromHolderId}
          />
        </Field>
        <Field label='To holder'>
          <input
            className='w-full rounded-md border border-slate-300 px-3 py-2 text-sm'
            onChange={event => setForm(prev => ({ ...prev, toHolderId: event.target.value }))}
            value={form.toHolderId}
          />
        </Field>
      </div>

      <label className='mt-3 inline-flex items-center gap-2 text-sm text-slate-700'>
        <input
          checked={form.secRestrictionActive}
          onChange={event => setForm(prev => ({ ...prev, secRestrictionActive: event.target.checked }))}
          type='checkbox'
        />
        SEC restriction active
      </label>

      <div className='mt-4 flex flex-wrap gap-3'>
        <button
          className='rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60'
          disabled={pending}
          onClick={evaluateRules}
          type='button'
        >
          Evaluate rules
        </button>
        <button
          className='rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60'
          disabled={pending}
          onClick={createTransfer}
          type='button'
        >
          Create transfer case
        </button>
      </div>

      {error ? <p className='mt-3 text-sm text-red-600'>Request failed: {error}</p> : null}
      {rules ? (
        <div className='mt-4 rounded-lg border border-slate-200 p-3'>
          <p className='text-sm font-semibold text-slate-800'>Rule evaluation</p>
          <p className='mt-1 text-sm text-slate-700'>Eligible: {String(rules.evaluation.eligible)}</p>
          {rules.requirements.length ? (
            <ul className='mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700'>
              {[...rules.requirements]
                .sort((a, b) => a.localeCompare(b))
                .map(req => (
                  <li key={req}>{req}</li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {createdCase ? (
        <div className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
          Case #{createdCase.id} created with status {createdCase.status}.{' '}
          <Link className='font-semibold underline' href={`/shareholder/transfers/${createdCase.id}`}>
            Open transfer
          </Link>
        </div>
      ) : null}
    </section>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className='text-sm text-slate-700'>
      {label}
      <div className='mt-1'>{children}</div>
    </label>
  )
}
