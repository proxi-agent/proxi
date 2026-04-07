'use client'

import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useMemo, useState } from 'react'

interface ReconciliationBreak {
  delta: number
  expectedQuantity: number
  holderId: string
  id: number
  ledgerQuantity: number
  securityId: string
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED'
  updatedAt: string
}

export default function ReconciliationPage() {
  const inputClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 transition focus:border-blue-300 focus:ring-2'

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const [breaks, setBreaks] = useState<ReconciliationBreak[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')

  useEffect(() => {
    let mounted = true

    async function loadBreaks() {
      setLoading(true)
      try {
        const response = await fetch(`${apiUrl}/operations/reconciliation`)
        if (!response.ok) {
          throw new Error('Unable to load reconciliation data.')
        }
        const payload = (await response.json()) as ReconciliationBreak[]
        if (!mounted) {
          return
        }
        setBreaks(payload)
      } catch {
        if (!mounted) {
          return
        }
        setBreaks([])
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadBreaks()
    return () => {
      mounted = false
    }
  }, [apiUrl])

  const filteredBreaks = useMemo(() => {
    if (statusFilter === 'ALL') {
      return breaks
    }
    return breaks.filter(entry => entry.status === statusFilter)
  }, [breaks, statusFilter])

  const openBreaks = useMemo(() => breaks.filter(entry => entry.status !== 'RESOLVED').length, [breaks])

  return (
    <>
      <PageHeader
        eyebrow='Reconciliation'
        metric={`${openBreaks} unresolved breaks`}
        title='Compare expected positions against ledger state'
      />
      <Card>
        <div className='mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end'>
          <div className='inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Position breaks</h3>
            <InfoTooltip text='Differences between expected position balances and current ledger balances.' />
          </div>
          <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
            <span className='inline-flex items-center gap-1.5'>
              Status
              <InfoTooltip placement='bottom' text='Filter by break lifecycle stage.' />
            </span>
            <select className={inputClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value='ALL'>All statuses</option>
              <option value='INVESTIGATING'>Investigating</option>
              <option value='OPEN'>Open</option>
              <option value='RESOLVED'>Resolved</option>
            </select>
          </label>
        </div>
        {loading ? (
          <p>Loading reconciliation breaks...</p>
        ) : filteredBreaks.length === 0 ? (
          <p>No breaks match the selected status.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='min-w-[650px] w-full border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>ID</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Security</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Holder</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Expected</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Ledger</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Delta</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Status</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredBreaks.map(entry => (
                  <tr key={entry.id}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.id}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.securityId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.holderId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {entry.expectedQuantity.toLocaleString()}
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.ledgerQuantity.toLocaleString()}</td>
                    <td
                      className={`border-b border-slate-100 px-2 py-2 text-sm font-semibold ${
                        entry.delta === 0 ? 'text-slate-700' : entry.delta > 0 ? 'text-blue-700' : 'text-red-700'
                      }`}
                    >
                      {entry.delta.toLocaleString()}
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.status}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {new Date(entry.updatedAt).toLocaleString()}
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
