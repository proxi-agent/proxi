'use client'

import AlertBanner from '../../components/ui/AlertBanner'
import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useState } from 'react'

interface CaseItem {
  id: number
  createdAt: string
  failureReason?: string
  type: string
  lifecycleStage?: string
  missingEvidence?: string[]
  restrictionBlockingReasons?: string[]
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  quantity: number
  status: string
}

export default function CasesPage() {
  const buttonClass =
    'rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50'
  const inputClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 transition focus:border-blue-300 focus:ring-2'
  const labelClass = 'flex flex-col gap-1 text-sm font-semibold text-slate-700'

  const [cases, setCases] = useState<CaseItem[]>([])
  const [form, setForm] = useState({
    fromHolderId: '',
    holderId: '',
    quantity: 0,
    securityId: '',
    toHolderId: '',
    type: 'TRANSFER',
  })
  const [filters, setFilters] = useState({
    search: '',
    status: 'ALL',
  })
  const [feedback, setFeedback] = useState({
    error: '',
    success: '',
  })
  const [loading, setLoading] = useState(false)
  const [loadingCases, setLoadingCases] = useState(true)
  const [actionCaseId, setActionCaseId] = useState<number | null>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

  const filteredCases = cases
    .filter(entry => (filters.status === 'ALL' ? true : entry.status === filters.status))
    .filter(entry => {
      if (!filters.search.trim()) {
        return true
      }
      const query = filters.search.toLowerCase()
      return String(entry.id).includes(query) || entry.securityId.toLowerCase().includes(query) || entry.type.toLowerCase().includes(query)
    })

  const loadCases = async () => {
    setLoadingCases(true)
    setFeedback(previous => ({ ...previous, error: '' }))
    try {
      const res = await fetch(`${apiUrl}/cases`)
      if (!res.ok) {
        throw new Error('Unable to load cases.')
      }
      const data = (await res.json()) as CaseItem[]
      setCases(data)
    } catch {
      setFeedback(previous => ({
        ...previous,
        error: 'Failed to load cases. Verify API connectivity and try again.',
      }))
    } finally {
      setLoadingCases(false)
    }
  }

  useEffect(() => {
    loadCases()
  }, [apiUrl])

  function updateFormValue(name: string, value: number | string) {
    setForm(previous => ({
      ...previous,
      [name]: value,
    }))
  }

  function clearMessages() {
    setFeedback({ error: '', success: '' })
  }

  async function handleCreateCase() {
    clearMessages()
    if (!form.securityId || Number(form.quantity) <= 0) {
      setFeedback(previous => ({
        ...previous,
        error: 'Security ID and quantity are required.',
      }))
      return
    }
    if (form.type === 'TRANSFER' && (!form.fromHolderId || !form.toHolderId)) {
      setFeedback(previous => ({
        ...previous,
        error: 'From and To holder IDs are required for transfer cases.',
      }))
      return
    }
    if ((form.type === 'CANCEL' || form.type === 'ISSUE') && !form.holderId) {
      setFeedback(previous => ({
        ...previous,
        error: 'Holder ID is required for issue and cancel cases.',
      }))
      return
    }

    setLoading(true)
    const body: Record<string, number | string> = {
      quantity: Number(form.quantity),
      securityId: form.securityId,
      type: form.type,
    }
    if (form.type === 'TRANSFER') {
      body.fromHolderId = form.fromHolderId
      body.toHolderId = form.toHolderId
    }
    if (form.type === 'ISSUE' || form.type === 'CANCEL') {
      body.holderId = form.holderId
    }

    try {
      const res = await fetch(`${apiUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error('Unable to create case.')
      }
      setForm({
        fromHolderId: '',
        holderId: '',
        quantity: 0,
        securityId: '',
        toHolderId: '',
        type: 'TRANSFER',
      })
      setFeedback({ error: '', success: 'Case created successfully.' })
      await loadCases()
    } catch {
      setFeedback(previous => ({
        ...previous,
        error: 'Failed to create case. Verify inputs and try again.',
      }))
    } finally {
      setLoading(false)
    }
  }

  async function handleAutoAdvanceCase(entry: CaseItem) {
    if (actionCaseId !== null) {
      return
    }
    setActionCaseId(entry.id)
    setFeedback({ error: '', success: '' })
    try {
      const missingEvidence = entry.missingEvidence || []
      for (const docType of missingEvidence) {
        const evidenceResponse = await fetch(`${apiUrl}/cases/${entry.id}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType }),
        })
        if (!evidenceResponse.ok) {
          throw new Error('Failed to submit evidence.')
        }
      }
      const reprocessResponse = await fetch(`${apiUrl}/cases/${entry.id}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restrictionContext: {
            companyApproval: true,
            hasLien: false,
            lockupActive: false,
            secRestrictionActive: false,
          },
        }),
      })
      if (!reprocessResponse.ok) {
        throw new Error('Failed to reprocess case.')
      }
      setFeedback(previous => ({
        ...previous,
        success: `Case ${entry.id} advanced through evidence and restrictions review.`,
      }))
      await loadCases()
    } catch {
      setFeedback(previous => ({
        ...previous,
        error: `Unable to auto-advance case ${entry.id}.`,
      }))
    } finally {
      setActionCaseId(null)
    }
  }

  const knownStatuses = Array.from(new Set(cases.map(entry => entry.status))).sort()

  function getCaseParties(entry: CaseItem) {
    if (entry.type === 'TRANSFER') {
      return `${entry.fromHolderId || 'N/A'} -> ${entry.toHolderId || 'N/A'}`
    }
    return entry.holderId || 'N/A'
  }

  function getLifecycleSummary(entry: CaseItem) {
    if (entry.failureReason) {
      return entry.failureReason
    }
    if (entry.missingEvidence && entry.missingEvidence.length > 0) {
      return `Missing: ${entry.missingEvidence.join(', ')}`
    }
    if (entry.restrictionBlockingReasons && entry.restrictionBlockingReasons.length > 0) {
      return `Blocked by: ${entry.restrictionBlockingReasons.join(', ')}`
    }
    return 'No blockers'
  }

  return (
    <>
      <PageHeader eyebrow='Case Management' metric={`${cases.length} total cases`} title='Create and track transfer cases' />

      <AlertBanner message={feedback.error} variant='error' />
      <AlertBanner message={feedback.success} variant='success' />

      <Card>
        <div className='mb-3 inline-flex items-center gap-2'>
          <h3 className='text-lg font-semibold text-slate-900'>Create a new case</h3>
          <InfoTooltip text='Create transfer, issue, or cancel instructions. Cases execute immediately and update status based on ledger validation.' />
        </div>
        <div className='mb-4 grid grid-cols-1 gap-3 md:grid-cols-3'>
          <label className={labelClass}>
            <span className='inline-flex items-center gap-1.5'>
              Type
              <InfoTooltip text='Case action: transfer moves units, issue mints units, cancel burns units.' />
            </span>
            <select className={inputClass} value={form.type} onChange={event => updateFormValue('type', event.target.value)}>
              <option value='CANCEL'>Cancel</option>
              <option value='ISSUE'>Issue</option>
              <option value='TRANSFER'>Transfer</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className='inline-flex items-center gap-1.5'>
              Security ID
              <InfoTooltip text='Unique identifier of the instrument being changed, such as PROXI-CLASS-A.' />
            </span>
            <input
              className={inputClass}
              type='text'
              value={form.securityId}
              onChange={event => updateFormValue('securityId', event.target.value)}
              placeholder='e.g. PROXI-CLASS-A'
            />
          </label>
          <label className={labelClass}>
            <span className='inline-flex items-center gap-1.5'>
              Quantity
              <InfoTooltip text='Number of units to transfer, issue, or cancel. Must be greater than zero.' />
            </span>
            <input
              className={inputClass}
              type='number'
              min={0}
              value={form.quantity}
              onChange={event => updateFormValue('quantity', Number(event.target.value))}
            />
          </label>
          {form.type === 'TRANSFER' ? (
            <>
              <label className={labelClass}>
                <span className='inline-flex items-center gap-1.5'>
                  From holder
                  <InfoTooltip text='Account that currently owns the units and sends them out.' />
                </span>
                <input
                  className={inputClass}
                  type='text'
                  value={form.fromHolderId}
                  onChange={event => updateFormValue('fromHolderId', event.target.value)}
                  placeholder='origin account'
                />
              </label>
              <label className={labelClass}>
                <span className='inline-flex items-center gap-1.5'>
                  To holder
                  <InfoTooltip text='Destination account that receives the units.' />
                </span>
                <input
                  className={inputClass}
                  type='text'
                  value={form.toHolderId}
                  onChange={event => updateFormValue('toHolderId', event.target.value)}
                  placeholder='destination account'
                />
              </label>
            </>
          ) : (
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                Holder ID
                <InfoTooltip text='Single account affected by issue or cancel actions.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={form.holderId}
                onChange={event => updateFormValue('holderId', event.target.value)}
                placeholder='target account'
              />
            </label>
          )}
        </div>
        <button className={buttonClass} disabled={loading} onClick={handleCreateCase}>
          {loading ? 'Saving...' : 'Create case'}
        </button>
      </Card>

      <Card>
        <div className='mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end'>
          <div className='inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Existing cases</h3>
            <InfoTooltip text='Live case feed with search and status filters to inspect operational activity.' />
          </div>
          <div className='flex flex-col gap-2 md:flex-row md:items-end'>
            <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
              <span className='inline-flex items-center gap-1.5'>
                Search
                <InfoTooltip placement='bottom' text='Matches case ID, case type, and security ID.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={filters.search}
                onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))}
                placeholder='Search case ID, type, security'
              />
            </label>
            <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
              <span className='inline-flex items-center gap-1.5'>
                Status
                <InfoTooltip placement='bottom' text='Filter by case processing state: pending, completed, or failed.' />
              </span>
              <select
                className={inputClass}
                value={filters.status}
                onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))}
              >
                <option value='ALL'>All statuses</option>
                {knownStatuses.map(status => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {loadingCases ? (
          <p>Loading cases...</p>
        ) : filteredCases.length === 0 ? (
          <p>No cases match this filter.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='w-full min-w-[900px] border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      ID
                      <InfoTooltip placement='bottom' text='Unique case identifier.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Type
                      <InfoTooltip placement='bottom' text='Requested operation kind.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Security
                      <InfoTooltip placement='bottom' text='Instrument code the case applies to.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Parties
                      <InfoTooltip placement='bottom' text='Transfer shows from -> to holders; issue/cancel shows the affected holder.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Quantity
                      <InfoTooltip placement='bottom' text='Units processed by this case.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Lifecycle
                      <InfoTooltip placement='bottom' text='Current stage in intake -> evidence -> restrictions -> execution workflow.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Status
                      <InfoTooltip placement='bottom' text='Execution outcome from the backend workflow.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Notes
                      <InfoTooltip placement='bottom' text='Evidence and restriction details when a case is blocked or failed.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Created
                      <InfoTooltip placement='bottom' text='Timestamp when the case was created.' />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map(entry => (
                  <tr key={entry.id}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.id}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.type}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.securityId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{getCaseParties(entry)}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.quantity.toLocaleString()}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.lifecycleStage || 'N/A'}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm'>
                      <span className='inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700'>
                        {entry.status}
                      </span>
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      <div className='grid gap-1.5'>
                        <span>{getLifecycleSummary(entry)}</span>
                        {entry.status !== 'COMPLETED' ? (
                          <button
                            className='w-fit rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50'
                            disabled={actionCaseId === entry.id}
                            onClick={() => handleAutoAdvanceCase(entry)}
                          >
                            {actionCaseId === entry.id ? 'Working...' : 'Auto-advance'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
