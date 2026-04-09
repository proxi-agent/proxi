'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import type { CaseRecord } from '@/types/cases'
import ValueBadge from '@/components/value-badge'

type SortField = 'createdAt' | 'id' | 'quantity'

export default function CaseListPanel({ basePath, title }: { basePath: string; title: string }) {
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortField>('createdAt')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const payload = await apiGet<CaseRecord[]>('/cases', controller.signal)
        setCases(payload)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load cases')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => controller.abort()
  }, [])

  const sortedCases = useMemo(() => {
    const data = [...cases]
    if (sortBy === 'createdAt') {
      return data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    if (sortBy === 'quantity') {
      return data.sort((a, b) => b.quantity - a.quantity)
    }
    return data.sort((a, b) => b.id - a.id)
  }, [cases, sortBy])

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-xl font-semibold text-slate-900'>{title}</h2>
        <label className='text-sm text-slate-600'>
          Sort by{' '}
          <select className='rounded-md border border-slate-300 bg-white px-2 py-1' onChange={event => setSortBy(event.target.value as SortField)} value={sortBy}>
            <option value='createdAt'>Most recent</option>
            <option value='id'>Case ID</option>
            <option value='quantity'>Quantity</option>
          </select>
        </label>
      </div>

      {loading ? <p className='text-sm text-slate-500'>Loading transfer cases...</p> : null}
      {error ? <p className='text-sm text-red-600'>Request failed: {error}</p> : null}
      {!loading && !error ? (
        <div className='overflow-x-auto rounded-lg border border-slate-200'>
          <table className='min-w-full text-left text-sm'>
            <thead className='bg-slate-50 text-xs uppercase tracking-wide text-slate-500'>
              <tr>
                <th className='px-3 py-2'>ID</th>
                <th className='px-3 py-2'>Type</th>
                <th className='px-3 py-2'>Security</th>
                <th className='px-3 py-2'>Quantity</th>
                <th className='px-3 py-2'>Status</th>
                <th className='px-3 py-2'>Lifecycle</th>
                <th className='px-3 py-2'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCases.slice(0, 20).map(item => (
                <tr className='border-t border-slate-200' key={item.id}>
                  <td className='px-3 py-2 font-medium text-slate-800'>{item.id}</td>
                  <td className='px-3 py-2'>{item.type}</td>
                  <td className='px-3 py-2'>{item.securityId}</td>
                  <td className='px-3 py-2'>{item.quantity.toLocaleString()}</td>
                  <td className='px-3 py-2'>
                    <ValueBadge value={item.status} />
                  </td>
                  <td className='px-3 py-2'>
                    <ValueBadge value={item.lifecycleStage} />
                  </td>
                  <td className='px-3 py-2'>
                    <Link className='text-blue-700 hover:text-blue-900 hover:underline' href={`${basePath}/${item.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
