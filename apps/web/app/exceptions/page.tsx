'use client'

import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useMemo, useState } from 'react'

interface ExceptionItem {
  createdAt: string
  id: number
  message: string
  owner: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  source: 'CASE_ENGINE' | 'LEDGER' | 'RECONCILIATION'
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED'
}

export default function ExceptionsPage() {
  const inputClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 transition focus:border-blue-300 focus:ring-2'

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')

  useEffect(() => {
    let mounted = true
    async function loadExceptions() {
      setLoading(true)
      try {
        const response = await fetch(`${apiUrl}/operations/exceptions`)
        if (!response.ok) {
          throw new Error('Unable to load exceptions.')
        }
        const payload = (await response.json()) as ExceptionItem[]
        if (!mounted) {
          return
        }
        setExceptions(payload)
      } catch {
        if (!mounted) {
          return
        }
        setExceptions([])
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadExceptions()
    return () => {
      mounted = false
    }
  }, [apiUrl])

  const counts = useMemo(() => {
    return {
      critical: exceptions.filter(entry => entry.severity === 'CRITICAL').length,
      open: exceptions.filter(entry => entry.status === 'OPEN').length,
      total: exceptions.length,
    }
  }, [exceptions])

  const filteredExceptions = useMemo(() => {
    if (statusFilter === 'ALL') {
      return exceptions
    }
    return exceptions.filter(entry => entry.status === statusFilter)
  }, [exceptions, statusFilter])

  return (
    <>
      <PageHeader eyebrow='Exceptions' metric={`${counts.open} open exceptions`} title='Review failed operations and validation breaks' />
      <section className='mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <Card>
          <p className='text-sm text-slate-500'>Total exceptions</p>
          <p className='mt-1 text-2xl font-bold text-slate-900'>{counts.total}</p>
        </Card>
        <Card>
          <p className='text-sm text-slate-500'>Critical exceptions</p>
          <p className='mt-1 text-2xl font-bold text-slate-900'>{counts.critical}</p>
        </Card>
        <Card>
          <p className='text-sm text-slate-500'>Open exceptions</p>
          <p className='mt-1 text-2xl font-bold text-slate-900'>{counts.open}</p>
        </Card>
      </section>
      <Card>
        <div className='mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end'>
          <div className='inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Exception queue</h3>
            <InfoTooltip text='Operational exceptions from case engine, ledger posting, and reconciliation checks.' />
          </div>
          <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
            <span className='inline-flex items-center gap-1.5'>
              Status
              <InfoTooltip placement='bottom' text='Filter exceptions by queue state.' />
            </span>
            <select className={inputClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value='ALL'>All statuses</option>
              <option value='IN_REVIEW'>In review</option>
              <option value='OPEN'>Open</option>
              <option value='RESOLVED'>Resolved</option>
            </select>
          </label>
        </div>
        {loading ? (
          <p>Loading exceptions...</p>
        ) : filteredExceptions.length === 0 ? (
          <p>No exceptions match the selected status.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='min-w-[650px] w-full border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>ID</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Created</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Severity</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Source</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Owner</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Status</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredExceptions.map(entry => (
                  <tr key={entry.id}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.id}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm'>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          entry.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700'
                            : entry.severity === 'HIGH'
                              ? 'bg-orange-100 text-orange-700'
                              : entry.severity === 'MEDIUM'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {entry.severity}
                      </span>
                    </td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.source}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.owner}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.status}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{entry.message}</td>
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
