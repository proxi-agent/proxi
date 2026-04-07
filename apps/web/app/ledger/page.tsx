'use client'

import AlertBanner from '../../components/ui/AlertBanner'
import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useState } from 'react'

interface LedgerEvent {
  id: number
  type: string
  securityId: string
  fromHolderId?: string
  toHolderId?: string
  holderId?: string
  quantity: number
  timestamp: string
}

interface Position {
  securityId: string
  holderId: string
  quantity: number
}

export default function LedgerPage() {
  const buttonClass =
    'rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50'
  const formGridClass = 'mb-4 grid grid-cols-1 gap-3 md:grid-cols-2'
  const inputClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 transition focus:border-blue-300 focus:ring-2'
  const labelClass = 'flex flex-col gap-1 text-sm font-semibold text-slate-700'
  const sectionTitleClass = 'mb-3 inline-flex items-center gap-2'

  const [events, setEvents] = useState<LedgerEvent[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [issueForm, setIssueForm] = useState({ securityId: '', holderId: '', quantity: 0 })
  const [transferForm, setTransferForm] = useState({ securityId: '', fromHolderId: '', toHolderId: '', quantity: 0 })
  const [filters, setFilters] = useState({
    holder: '',
    security: '',
  })
  const [feedback, setFeedback] = useState({
    error: '',
    success: '',
  })
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

  const loadData = async () => {
    setLoadingData(true)
    setFeedback(previous => ({ ...previous, error: '' }))
    try {
      const [evRes, posRes] = await Promise.all([fetch(`${apiUrl}/ledger/events`), fetch(`${apiUrl}/ledger/positions`)])
      if (!evRes.ok || !posRes.ok) {
        throw new Error('Unable to load ledger data.')
      }
      const eventsJson = (await evRes.json()) as LedgerEvent[]
      const posJson = (await posRes.json()) as Position[]
      setEvents(eventsJson)
      setPositions(posJson)
    } catch {
      setFeedback(previous => ({
        ...previous,
        error: 'Failed to load ledger data. Verify API connectivity and refresh.',
      }))
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [apiUrl])

  async function handleIssue() {
    setFeedback({ error: '', success: '' })
    if (!issueForm.securityId || !issueForm.holderId || Number(issueForm.quantity) <= 0) {
      setFeedback(previous => ({
        ...previous,
        error: 'Issue requires security ID, holder ID, and quantity above zero.',
      }))
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/ledger/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: issueForm.securityId,
          holderId: issueForm.holderId,
          quantity: Number(issueForm.quantity),
        }),
      })
      if (!res.ok) {
        throw new Error('Issue request failed.')
      }
      setIssueForm({ securityId: '', holderId: '', quantity: 0 })
      setFeedback({ error: '', success: 'Issuance posted successfully.' })
      await loadData()
    } catch {
      setFeedback(previous => ({
        ...previous,
        error: 'Failed to issue shares. Review input values and retry.',
      }))
    } finally {
      setLoading(false)
    }
  }

  async function handleTransfer() {
    setFeedback({ error: '', success: '' })
    if (!transferForm.securityId || !transferForm.fromHolderId || !transferForm.toHolderId || Number(transferForm.quantity) <= 0) {
      setFeedback(previous => ({
        ...previous,
        error: 'Transfer requires security, from holder, to holder, and valid quantity.',
      }))
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/ledger/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: transferForm.securityId,
          fromHolderId: transferForm.fromHolderId,
          toHolderId: transferForm.toHolderId,
          quantity: Number(transferForm.quantity),
        }),
      })
      if (!res.ok) {
        throw new Error('Transfer request failed.')
      }
      setTransferForm({ securityId: '', fromHolderId: '', toHolderId: '', quantity: 0 })
      setFeedback({ error: '', success: 'Transfer posted successfully.' })
      await loadData()
    } catch {
      setFeedback(previous => ({
        ...previous,
        error: 'Failed to transfer shares. Review input values and retry.',
      }))
    } finally {
      setLoading(false)
    }
  }

  const filteredPositions = positions.filter(position => {
    const securityMatch = filters.security ? position.securityId.toLowerCase().includes(filters.security.toLowerCase()) : true
    const holderMatch = filters.holder ? position.holderId.toLowerCase().includes(filters.holder.toLowerCase()) : true
    return securityMatch && holderMatch
  })

  return (
    <>
      <PageHeader eyebrow='Ledger Operations' metric={`${events.length} events recorded`} title='Post and reconcile ledger activity' />

      <AlertBanner message={feedback.error} variant='error' />
      <AlertBanner message={feedback.success} variant='success' />

      <section className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <Card>
          <div className={sectionTitleClass}>
            <h3 className='text-lg font-semibold text-slate-900'>Issue shares</h3>
            <InfoTooltip text='Mint new units to a single holder and post an ISSUE event.' />
          </div>
          <div className={formGridClass}>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                Security ID
                <InfoTooltip text='Instrument code receiving newly issued quantity.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={issueForm.securityId}
                onChange={e => setIssueForm({ ...issueForm, securityId: e.target.value })}
                placeholder='e.g. PROXI-CLASS-A'
              />
            </label>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                Holder ID
                <InfoTooltip text='Account that will receive the issued shares.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={issueForm.holderId}
                onChange={e => setIssueForm({ ...issueForm, holderId: e.target.value })}
                placeholder='destination holder'
              />
            </label>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                Quantity
                <InfoTooltip text='Number of units to issue. Must be above zero.' />
              </span>
              <input
                className={inputClass}
                type='number'
                min={0}
                value={issueForm.quantity}
                onChange={e => setIssueForm({ ...issueForm, quantity: Number(e.target.value) })}
              />
            </label>
          </div>
          <button className={buttonClass} disabled={loading} onClick={handleIssue}>
            {loading ? 'Submitting...' : 'Post issuance'}
          </button>
        </Card>

        <Card>
          <div className={sectionTitleClass}>
            <h3 className='text-lg font-semibold text-slate-900'>Transfer shares</h3>
            <InfoTooltip text='Move existing units between holders and post a TRANSFER event.' />
          </div>
          <div className={formGridClass}>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                Security ID
                <InfoTooltip text='Instrument code being transferred.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={transferForm.securityId}
                onChange={e => setTransferForm({ ...transferForm, securityId: e.target.value })}
                placeholder='e.g. PROXI-CLASS-A'
              />
            </label>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                From holder
                <InfoTooltip text='Current owner sending units out.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={transferForm.fromHolderId}
                onChange={e => setTransferForm({ ...transferForm, fromHolderId: e.target.value })}
                placeholder='source account'
              />
            </label>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                To holder
                <InfoTooltip text='Destination owner receiving units.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={transferForm.toHolderId}
                onChange={e => setTransferForm({ ...transferForm, toHolderId: e.target.value })}
                placeholder='destination account'
              />
            </label>
            <label className={labelClass}>
              <span className='inline-flex items-center gap-1.5'>
                Quantity
                <InfoTooltip text='Units to transfer from source holder to destination holder.' />
              </span>
              <input
                className={inputClass}
                type='number'
                min={0}
                value={transferForm.quantity}
                onChange={e => setTransferForm({ ...transferForm, quantity: Number(e.target.value) })}
              />
            </label>
          </div>
          <button className={buttonClass} disabled={loading} onClick={handleTransfer}>
            {loading ? 'Submitting...' : 'Post transfer'}
          </button>
        </Card>
      </section>

      <Card>
        <div className='mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end'>
          <div className='inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Positions</h3>
            <InfoTooltip text='Current balances by security and holder after all posted events.' />
          </div>
          <div className='flex flex-col gap-2 md:flex-row md:items-end'>
            <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
              <span className='inline-flex items-center gap-1.5'>
                Security filter
                <InfoTooltip placement='bottom' text='Filter positions by security ID substring.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={filters.security}
                onChange={event => setFilters(previous => ({ ...previous, security: event.target.value }))}
                placeholder='Filter by security'
              />
            </label>
            <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
              <span className='inline-flex items-center gap-1.5'>
                Holder filter
                <InfoTooltip placement='bottom' text='Filter positions by holder ID substring.' />
              </span>
              <input
                className={inputClass}
                type='text'
                value={filters.holder}
                onChange={event => setFilters(previous => ({ ...previous, holder: event.target.value }))}
                placeholder='Filter by holder'
              />
            </label>
          </div>
        </div>
        {loadingData ? (
          <p>Loading positions...</p>
        ) : filteredPositions.length === 0 ? (
          <p>No positions match the current filters.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='min-w-[650px] w-full border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Security
                      <InfoTooltip placement='bottom' text='Instrument identifier in the ledger position table.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Holder
                      <InfoTooltip placement='bottom' text='Account currently holding a position in this security.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Quantity
                      <InfoTooltip placement='bottom' text='Current unit balance for this holder-security pair.' />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map(position => (
                  <tr key={`${position.securityId}-${position.holderId}`}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{position.securityId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{position.holderId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{position.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className={sectionTitleClass}>
          <h3 className='text-lg font-semibold text-slate-900'>Ledger events</h3>
          <InfoTooltip text='Event log showing posted issue and transfer operations over time.' />
        </div>
        {loadingData ? (
          <p>Loading events...</p>
        ) : events.length === 0 ? (
          <p>No events have been posted yet.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='min-w-[650px] w-full border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      ID
                      <InfoTooltip placement='bottom' text='Unique event identifier.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Type
                      <InfoTooltip placement='bottom' text='Ledger event type such as ISSUE or TRANSFER.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Security
                      <InfoTooltip placement='bottom' text='Instrument code affected by the event.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Holder(s)
                      <InfoTooltip placement='bottom' text='ISSUE shows holder; TRANSFER shows source -> destination.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Quantity
                      <InfoTooltip placement='bottom' text='Number of units posted in this event.' />
                    </span>
                  </th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>
                    <span className='inline-flex items-center gap-1.5'>
                      Timestamp
                      <InfoTooltip placement='bottom' text='When this ledger event was recorded.' />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{event.id}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{event.type}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{event.securityId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {event.type === 'ISSUE' ? event.holderId : `${event.fromHolderId} -> ${event.toHolderId}`}
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{event.quantity.toLocaleString()}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {new Date(event.timestamp).toLocaleString()}
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
