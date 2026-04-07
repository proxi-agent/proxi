'use client'

import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useMemo, useState } from 'react'

interface AuditTrailEntry {
  action: string
  actor: string
  entityId: string
  entityType: 'CASE' | 'LEDGER_EVENT' | 'POSITION'
  id: number
  timestamp: string
}

export default function AuditTrailPage() {
  const inputClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 transition focus:border-blue-300 focus:ring-2'

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const [entries, setEntries] = useState<AuditTrailEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let mounted = true
    async function loadAuditTrail() {
      setLoading(true)
      try {
        const response = await fetch(`${apiUrl}/operations/audit-trail`)
        if (!response.ok) {
          throw new Error('Failed to load audit trail.')
        }
        const payload = (await response.json()) as AuditTrailEntry[]
        if (!mounted) {
          return
        }
        setEntries(payload)
      } catch {
        if (!mounted) {
          return
        }
        setEntries([])
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadAuditTrail()
    return () => {
      mounted = false
    }
  }, [apiUrl])

  const filteredEntries = useMemo(() => {
    if (!search.trim()) {
      return entries
    }
    const query = search.toLowerCase()
    return entries.filter(
      entry =>
        entry.actor.toLowerCase().includes(query) ||
        entry.action.toLowerCase().includes(query) ||
        entry.entityId.toLowerCase().includes(query) ||
        entry.entityType.toLowerCase().includes(query),
    )
  }, [entries, search])

  return (
    <>
      <PageHeader eyebrow='Audit Trail' metric={`${entries.length} logged actions`} title='Track immutable operational activity' />
      <Card>
        <div className='mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end'>
          <div className='inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Activity log</h3>
            <InfoTooltip text='Chronological operational actions across case and ledger systems.' />
          </div>
          <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
            <span className='inline-flex items-center gap-1.5'>
              Search
              <InfoTooltip placement='bottom' text='Filter by actor, action, entity type, or entity ID.' />
            </span>
            <input
              className={inputClass}
              type='text'
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search activity'
            />
          </label>
        </div>
        {loading ? (
          <p>Loading audit trail...</p>
        ) : filteredEntries.length === 0 ? (
          <p>No activity entries match the current filter.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='min-w-[650px] w-full border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>ID</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Timestamp</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Actor</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Action</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Entity Type</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(entry => (
                  <tr key={entry.id}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.id}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.actor}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.action}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.entityType}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.entityId}</td>
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
