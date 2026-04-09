'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import type { CaseRecord } from '@/types/cases'
import ValueBadge from '@/components/value-badge'

type PanelMode = 'documents' | 'review' | 'status' | 'summary'

const modeHeading: Record<PanelMode, string> = {
  documents: 'Documents workspace',
  review: 'Review workspace',
  status: 'Status tracker',
  summary: 'Transfer summary',
}

export default function CaseDetailPanel({ caseId, mode }: { caseId: number; mode: PanelMode }) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null)
  const [docType, setDocType] = useState('Transfer instruction letter')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadCase(signal?: AbortSignal) {
    const payload = await apiGet<CaseRecord>(`/cases/${caseId}`, signal)
    setCaseRecord(payload)
  }

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        await loadCase(controller.signal)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load case')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => controller.abort()
  }, [caseId])

  const sortedChecks = useMemo(
    () => [...(caseRecord?.restrictionChecks || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [caseRecord?.restrictionChecks],
  )

  async function addEvidence() {
    setSaving(true)
    setError('')
    try {
      const updated = await apiPost<{ docType: string }, CaseRecord>(`/cases/${caseId}/evidence`, { docType })
      setCaseRecord(updated)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to submit evidence')
    } finally {
      setSaving(false)
    }
  }

  async function reprocess() {
    setSaving(true)
    setError('')
    try {
      const updated = await apiPost<Record<string, never>, CaseRecord>(`/cases/${caseId}/reprocess`, {})
      setCaseRecord(updated)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to reprocess case')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <h2 className='text-xl font-semibold text-slate-900'>
        Case #{caseId} - {modeHeading[mode]}
      </h2>
      {loading ? <p className='mt-3 text-sm text-slate-500'>Loading case...</p> : null}
      {error ? <p className='mt-3 text-sm text-red-600'>Request failed: {error}</p> : null}
      {!loading && !error && caseRecord ? (
        <div className='mt-4 space-y-4'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4'>
            <Info label='Type' value={caseRecord.type} />
            <Info label='Security' value={caseRecord.securityId} />
            <Info label='Quantity' value={caseRecord.quantity.toLocaleString()} />
            <Info label='Case ID' value={String(caseRecord.id)} />
          </div>

          <div className='flex flex-wrap gap-2'>
            <ValueBadge value={caseRecord.status} />
            <ValueBadge value={caseRecord.lifecycleStage} />
          </div>

          {sortedChecks.length ? (
            <div className='rounded-lg border border-slate-200 p-3'>
              <p className='text-sm font-semibold text-slate-800'>Restriction checks</p>
              <ul className='mt-2 space-y-1 text-sm text-slate-700'>
                {sortedChecks.map(check => (
                  <li className='flex items-start justify-between gap-3' key={check.name}>
                    <span>{check.name}</span>
                    <ValueBadge value={check.passed ? 'passed' : 'failed'} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
            <ListBlock items={caseRecord.evidenceSubmitted} title='Evidence submitted' />
            <ListBlock items={caseRecord.missingEvidence} title='Missing evidence' />
          </div>

          <div className='flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3'>
            <label className='text-sm text-slate-700'>
              Add document
              <input
                className='mt-1 block w-72 rounded-md border border-slate-300 px-3 py-2 text-sm'
                onChange={event => setDocType(event.target.value)}
                value={docType}
              />
            </label>
            <button
              className='rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60'
              disabled={!docType.trim() || saving}
              onClick={addEvidence}
              type='button'
            >
              Submit evidence
            </button>
            <button
              className='rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
              disabled={saving}
              onClick={reprocess}
              type='button'
            >
              Reprocess case
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border border-slate-200 bg-slate-50 p-3'>
      <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500'>{label}</p>
      <p className='mt-1 text-sm font-medium text-slate-800'>{value}</p>
    </div>
  )
}

function ListBlock({ items, title }: { items: string[]; title: string }) {
  const sorted = [...items].sort((a, b) => a.localeCompare(b))
  return (
    <div className='rounded-lg border border-slate-200 p-3'>
      <p className='text-sm font-semibold text-slate-800'>{title}</p>
      {sorted.length ? (
        <ul className='mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700'>
          {sorted.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className='mt-2 text-sm text-slate-500'>None</p>
      )}
    </div>
  )
}
