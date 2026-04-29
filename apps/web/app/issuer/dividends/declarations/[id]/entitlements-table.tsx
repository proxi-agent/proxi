'use client'

import { useMemo, useState } from 'react'

import { EntitlementStatusBadge, ShareholderDividendDrawer, TaxFormBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui'
import { formatCents, formatShares } from '@/lib/dividends/copy'
import type { Entitlement } from '@/lib/dividends/types'

type SortKey = 'gross' | 'name' | 'net' | 'shares' | 'withholding'

export function EntitlementsTable({ dividendId, entitlements }: { dividendId: string; entitlements: Entitlement[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ dir: 'asc' | 'desc'; key: SortKey }>({ dir: 'desc', key: 'net' })
  const [active, setActive] = useState<Entitlement | null>(null)

  const rows = useMemo(() => {
    let r = entitlements.filter(
      e => e.shareholderName.toLowerCase().includes(query.toLowerCase()) || e.shareholderId.toLowerCase().includes(query.toLowerCase()),
    )
    r = [...r].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      switch (sort.key) {
        case 'gross':
          return (a.grossAmountCents - b.grossAmountCents) * dir
        case 'name':
          return a.shareholderName.localeCompare(b.shareholderName) * dir
        case 'net':
          return (a.netAmountCents - b.netAmountCents) * dir
        case 'shares':
          return (parseFloat(a.sharesEligible) - parseFloat(b.sharesEligible)) * dir
        case 'withholding':
          return (a.withholdingAmountCents - b.withholdingAmountCents) * dir
      }
    })
    return r
  }, [entitlements, query, sort])

  const toggleSort = (key: SortKey) => {
    setSort(s => (s.key === key ? { dir: s.dir === 'asc' ? 'desc' : 'asc', key } : { dir: 'desc', key }))
  }

  return (
    <>
      <div className='flex flex-wrap items-center gap-2 border-b border-line px-4 py-3'>
        <div className='search w-[260px]'>
          <span aria-hidden className='search-icon'>
            <Icon name='search' size={14} />
          </span>
          <label className='sr-only' htmlFor={`ent-search-${dividendId}`}>
            Search shareholders
          </label>
          <input
            className='input h-[32px]'
            id={`ent-search-${dividendId}`}
            onChange={e => setQuery(e.target.value)}
            placeholder='Filter by holder name or ID…'
            type='search'
            value={query}
          />
        </div>
        <span className='text-[12px] text-ink-500'>
          {rows.length} of {entitlements.length} shown
        </span>
      </div>

      <div className='table-wrap'>
        <table className='table'>
          <thead>
            <tr>
              <SortHeader active={sort.key === 'name'} dir={sort.dir} label='Shareholder' onClick={() => toggleSort('name')} />
              <SortHeader
                active={sort.key === 'shares'}
                className='cell-num'
                dir={sort.dir}
                label='Shares'
                onClick={() => toggleSort('shares')}
              />
              <SortHeader
                active={sort.key === 'gross'}
                className='cell-num'
                dir={sort.dir}
                label='Gross'
                onClick={() => toggleSort('gross')}
              />
              <SortHeader
                active={sort.key === 'withholding'}
                className='cell-num'
                dir={sort.dir}
                label='Withholding'
                onClick={() => toggleSort('withholding')}
              />
              <SortHeader active={sort.key === 'net'} className='cell-num' dir={sort.dir} label='Net' onClick={() => toggleSort('net')} />
              <th>Tax form</th>
              <th>Method</th>
              <th>Status</th>
              <th aria-label='Open' />
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr className='table-row-clickable' key={e.id} onClick={() => setActive(e)}>
                <td>
                  <div className='cell-primary'>{e.shareholderName}</div>
                  <div className='mono text-[11px] text-ink-500'>{e.shareholderId}</div>
                </td>
                <td className='cell-num num'>{formatShares(e.sharesEligible)}</td>
                <td className='cell-num num'>{formatCents(e.grossAmountCents, e.currency)}</td>
                <td className='cell-num num text-warning-700'>{formatCents(e.withholdingAmountCents, e.currency)}</td>
                <td className='cell-num num cell-primary'>{formatCents(e.netAmountCents, e.currency)}</td>
                <td>{e.taxFormStatus ? <TaxFormBadge status={e.taxFormStatus} /> : '—'}</td>
                <td>
                  <Badge tone='neutral'>{e.paymentMethod ?? '—'}</Badge>
                </td>
                <td>
                  <EntitlementStatusBadge status={e.paymentStatus} />
                </td>
                <td>
                  <button aria-label={`Open ${e.shareholderId}`} className='btn btn-ghost btn-icon btn-sm' type='button'>
                    <Icon name='arrow-right' size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ShareholderDividendDrawer entitlement={active} onClose={() => setActive(null)} open={Boolean(active)} />
    </>
  )
}

function SortHeader({
  active,
  className = '',
  dir,
  label,
  onClick,
}: {
  active: boolean
  className?: string
  dir: 'asc' | 'desc'
  label: string
  onClick: () => void
}) {
  return (
    <th className={className}>
      <button className='inline-flex items-center gap-1 font-semibold text-inherit' onClick={onClick} type='button'>
        {label}
        {active && <Icon name={dir === 'asc' ? 'arrow-up-right' : 'arrow-down-right'} size={11} />}
      </button>
    </th>
  )
}
