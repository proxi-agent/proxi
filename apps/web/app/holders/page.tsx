'use client'

import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useMemo, useState } from 'react'

interface HolderProfile {
  activeSecurities: number
  classification: 'FUND' | 'INSTITUTION' | 'RETAIL' | 'TREASURY'
  holderId: string
  jurisdiction: string
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH'
  totalUnits: number
}

export default function HoldersPage() {
  const inputClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 transition focus:border-blue-300 focus:ring-2'

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const [holders, setHolders] = useState<HolderProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadHolders() {
      setLoading(true)
      try {
        const response = await fetch(`${apiUrl}/operations/holders`)
        if (!response.ok) {
          throw new Error('Unable to load holders.')
        }
        const payload = (await response.json()) as HolderProfile[]
        if (!mounted) {
          return
        }
        setHolders(payload)
      } catch {
        if (!mounted) {
          return
        }
        setHolders([])
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadHolders()
    return () => {
      mounted = false
    }
  }, [apiUrl])

  const filteredHolders = useMemo(() => {
    if (!query.trim()) {
      return holders
    }
    const normalizedQuery = query.toLowerCase()
    return holders.filter(
      holder =>
        holder.classification.toLowerCase().includes(normalizedQuery) ||
        holder.holderId.toLowerCase().includes(normalizedQuery) ||
        holder.jurisdiction.toLowerCase().includes(normalizedQuery) ||
        holder.riskTier.toLowerCase().includes(normalizedQuery),
    )
  }, [holders, query])

  const totalUnits = useMemo(() => holders.reduce((sum, holder) => sum + holder.totalUnits, 0), [holders])

  return (
    <>
      <PageHeader eyebrow='Holders' metric={`${holders.length} tracked holders`} title='Inspect holder profiles and concentration' />
      <Card>
        <div className='mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end'>
          <div className='inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Holder directory</h3>
            <InfoTooltip text='Snapshot of holder profile, risk tier, and current aggregate exposure.' />
          </div>
          <label className='flex min-w-[190px] flex-col gap-1 text-xs font-semibold text-slate-700'>
            <span className='inline-flex items-center gap-1.5'>
              Search
              <InfoTooltip placement='bottom' text='Search by holder ID, classification, risk tier, or jurisdiction.' />
            </span>
            <input
              className={inputClass}
              type='text'
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='Search holders'
            />
          </label>
        </div>
        <p className='mb-3 text-sm text-slate-500'>Total units across tracked holders: {totalUnits.toLocaleString()}</p>
        {loading ? (
          <p>Loading holder profiles...</p>
        ) : filteredHolders.length === 0 ? (
          <p>No holders match this filter.</p>
        ) : (
          <div className='overflow-x-auto overflow-y-visible'>
            <table className='min-w-[650px] w-full border-collapse'>
              <thead className='text-xs uppercase tracking-wide text-slate-600'>
                <tr>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Holder ID</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Classification</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Jurisdiction</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Risk Tier</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Active Securities</th>
                  <th className='border-b border-slate-100 px-2 py-2 text-left'>Total Units</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolders.map(holder => (
                  <tr key={holder.holderId}>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{holder.holderId}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{holder.classification}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{holder.jurisdiction}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{holder.riskTier}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{holder.activeSecurities}</td>
                    <td className='border-b border-slate-100 px-2 py-2 text-sm text-slate-700'>{holder.totalUnits.toLocaleString()}</td>
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
