'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { ActionBar } from '@/components/primitives'
import { Badge } from '@/components/ui'

export type Holding = {
  basis: string
  cusip: string
  issuer: string
  lockup?: string
  market: string
  restriction: null | string
  shares: string
  ticker: string
  type: string
  unrealized: string
}

export function HoldingsTable({
  holdings,
}: {
  holdings: Holding[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (cusip: string) => {
    const next = new Set(selected)
    if (next.has(cusip)) next.delete(cusip)
    else next.add(cusip)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === holdings.length) setSelected(new Set())
    else setSelected(new Set(holdings.map((h) => h.cusip)))
  }

  const summary = useMemo(() => {
    if (selected.size === 0) return null
    const rows = holdings.filter((h) => selected.has(h.cusip))
    const sharesSum = rows
      .map((r) => Number(r.shares.replace(/,/g, '')))
      .reduce((a, b) => a + b, 0)
    return `${sharesSum.toLocaleString()} shares · ${rows.length} issuer${
      rows.length > 1 ? 's' : ''
    }`
  }, [holdings, selected])

  return (
    <div className='relative'>
      <div className='table-wrap'>
        <table className='table'>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  aria-label='Select all'
                  checked={
                    selected.size > 0 && selected.size === holdings.length
                  }
                  onChange={toggleAll}
                  type='checkbox'
                />
              </th>
              <th>Issuer</th>
              <th>Type</th>
              <th className='cell-num'>Shares</th>
              <th className='cell-num'>Cost basis</th>
              <th className='cell-num'>Market value</th>
              <th className='cell-num'>Unrealized</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const isSelected = selected.has(h.cusip)
              return (
                <tr
                  className={`table-row-clickable ${
                    isSelected ? 'bg-[color:var(--color-surface-2)]' : ''
                  }`}
                  key={h.cusip}
                  onClick={() => toggle(h.cusip)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      checked={isSelected}
                      onChange={() => toggle(h.cusip)}
                      type='checkbox'
                    />
                  </td>
                  <td>
                    <div className='cell-primary'>{h.issuer}</div>
                    <div className='text-[11.5px] text-[color:var(--color-ink-500)] mono'>
                      {h.ticker} · {h.cusip}
                    </div>
                  </td>
                  <td>
                    <Badge tone='neutral'>{h.type}</Badge>
                  </td>
                  <td className='cell-num num'>{h.shares}</td>
                  <td className='cell-num num cell-muted'>{h.basis}</td>
                  <td className='cell-num num cell-primary'>{h.market}</td>
                  <td
                    className={`cell-num num ${
                      h.unrealized.startsWith('+') ? 'trend-up' : 'trend-down'
                    }`}
                  >
                    {h.unrealized}
                  </td>
                  <td>
                    {h.restriction ? (
                      <Badge icon='lock' tone='warning'>
                        {h.restriction}
                      </Badge>
                    ) : (
                      <Badge tone='positive'>Freely transferable</Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className='sticky bottom-4 z-10 mt-3 px-2'>
          <ActionBar
            actions={
              <>
                <button className='btn btn-secondary btn-sm' type='button'>
                  <Icon name='send' size={13} />
                  Transfer
                </button>
                <button className='btn btn-secondary btn-sm' type='button'>
                  <Icon name='landmark' size={13} />
                  Transfer to broker
                </button>
                <button className='btn btn-secondary btn-sm' type='button'>
                  <Icon name='arrow-down-right' size={13} />
                  Sell
                </button>
                <button className='btn btn-secondary btn-sm' type='button'>
                  <Icon name='sparkles' size={13} />
                  Ask Proxi
                </button>
              </>
            }
            count={selected.size}
            label={summary ?? undefined}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}
    </div>
  )
}
