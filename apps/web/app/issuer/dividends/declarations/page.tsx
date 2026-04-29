import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { DividendStatusBadge, ExportButton } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, Chip, EmptyState, PageHeader, Panel } from '@/components/ui'
import { exportUrl, fetchDividends } from '@/lib/dividends/api'
import {
  DIVIDEND_STATUS_LABEL,
  DIVIDEND_TYPE_LABEL,
  DIVIDEND_TYPE_OPTIONS,
  formatCents,
  formatDate,
  RATE_TYPE_LABEL,
  STATUS_OPTIONS,
} from '@/lib/dividends/copy'
import type { DividendStatus, DividendType } from '@/lib/dividends/types'

type SearchParams = Promise<{
  endDate?: string
  query?: string
  startDate?: string
  status?: string
  type?: string
}>

export default async function IssuerDividendDeclarationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const filter = {
    dividendType: sp.type ? (sp.type as DividendType) : undefined,
    endDate: sp.endDate,
    query: sp.query,
    startDate: sp.startDate,
    status: sp.status ? (sp.status as DividendStatus) : undefined,
  }
  const declarations = await fetchDividends(filter)
  const all = await fetchDividends({})

  const counts: Record<string, number> = {
    all: all.length,
    approved: all.filter(d => d.status === 'APPROVED').length,
    draft: all.filter(d => d.status === 'DRAFT' || d.status === 'CHANGES_REQUESTED').length,
    paid: all.filter(d => d.status === 'PAID' || d.status === 'RECONCILED' || d.status === 'ARCHIVED').length,
    pending: all.filter(d => d.status === 'PENDING_APPROVAL').length,
  }

  return (
    <AppShell
      breadcrumbs={[{ href: '/issuer', label: 'Issuer' }, { href: '/issuer/dividends', label: 'Dividends' }, { label: 'Declarations' }]}
      portal='issuer'
    >
      <PageHeader
        actions={
          <>
            <ExportButton iconSize={13} label='Export' location={exportUrl('declarations', filter.status ? { issuerId: undefined } : {})} />
            <Link className='btn btn-brand btn-sm' href='/issuer/dividends/declarations/new'>
              <Icon name='plus' size={13} />
              New declaration
            </Link>
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <span className='text-[12px] text-ink-500'>
              {declarations.length} match · {all.length} total
            </span>
          </div>
        }
        subtitle='Search, filter, and triage every declaration across issuers and securities.'
        title='Declarations'
      />

      <Panel padded={false}>
        <div className='flex flex-wrap items-center gap-2 border-b border-line px-4 py-3'>
          <Chip active={!filter.status} count={counts.all} icon='inbox'>
            <Link href='/issuer/dividends/declarations'>All</Link>
          </Chip>
          <Chip active={filter.status === 'DRAFT' || filter.status === 'CHANGES_REQUESTED'} count={counts.draft} icon='pencil'>
            <Link href='/issuer/dividends/declarations?status=DRAFT'>Drafts</Link>
          </Chip>
          <Chip active={filter.status === 'PENDING_APPROVAL'} count={counts.pending} icon='clock'>
            <Link href='/issuer/dividends/declarations?status=PENDING_APPROVAL'>Pending approval</Link>
          </Chip>
          <Chip active={filter.status === 'APPROVED'} count={counts.approved} icon='check-circle'>
            <Link href='/issuer/dividends/declarations?status=APPROVED'>Approved</Link>
          </Chip>
          <Chip active={filter.status === 'PAID'} count={counts.paid} icon='badge-check'>
            <Link href='/issuer/dividends/declarations?status=PAID'>Completed</Link>
          </Chip>

          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <form action='/issuer/dividends/declarations' className='flex items-center gap-2'>
              <div className='search w-[260px]'>
                <span aria-hidden className='search-icon'>
                  <Icon name='search' size={14} />
                </span>
                <label className='sr-only' htmlFor='dividends-search'>
                  Search declarations
                </label>
                <input
                  className='input h-[32px]'
                  defaultValue={filter.query}
                  id='dividends-search'
                  name='query'
                  placeholder='Search issuer, security, ID, notes…'
                  type='search'
                />
              </div>
              <label className='sr-only' htmlFor='filter-status'>
                Status
              </label>
              <select className='input h-[32px]' defaultValue={filter.status ?? ''} id='filter-status' name='status'>
                <option value=''>All statuses</option>
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <label className='sr-only' htmlFor='filter-type'>
                Dividend type
              </label>
              <select className='input h-[32px]' defaultValue={filter.dividendType ?? ''} id='filter-type' name='type'>
                <option value=''>All types</option>
                {DIVIDEND_TYPE_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <label className='sr-only' htmlFor='filter-from'>
                Record from
              </label>
              <input
                className='input h-[32px]'
                defaultValue={filter.startDate ?? ''}
                id='filter-from'
                name='startDate'
                placeholder='Record from'
                type='date'
              />
              <label className='sr-only' htmlFor='filter-to'>
                Pay to
              </label>
              <input
                className='input h-[32px]'
                defaultValue={filter.endDate ?? ''}
                id='filter-to'
                name='endDate'
                placeholder='Pay to'
                type='date'
              />
              <button className='btn btn-secondary btn-sm' type='submit'>
                <Icon name='filter' size={12} />
                Apply
              </button>
            </form>
          </div>
        </div>

        {declarations.length === 0 ? (
          <div className='p-10'>
            <EmptyState
              action={
                <Link className='btn btn-secondary btn-sm' href='/issuer/dividends/declarations'>
                  Clear filters
                </Link>
              }
              icon='search'
              title='No declarations match'
            >
              Try a broader date range or different status. You can also create a new declaration.
            </EmptyState>
          </div>
        ) : (
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>Issuer</th>
                  <th>Security</th>
                  <th>Type</th>
                  <th className='cell-num'>Rate</th>
                  <th>Record</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className='cell-num'>Total payable</th>
                  <th aria-label='Actions' />
                </tr>
              </thead>
              <tbody>
                {declarations.map(d => (
                  <tr className='table-row-clickable' key={d.id}>
                    <td>
                      <Link className='cell-primary' href={`/issuer/dividends/declarations/${d.id}`}>
                        {d.issuer.name}
                      </Link>
                      <div className='mono text-[11px] text-ink-500'>{d.id}</div>
                    </td>
                    <td>
                      <div className='cell-primary'>{d.security.label}</div>
                      <div className='cell-muted'>{d.security.classLabel}</div>
                    </td>
                    <td>
                      <Badge tone='neutral'>{DIVIDEND_TYPE_LABEL[d.dividendType]}</Badge>
                    </td>
                    <td className='cell-num num cell-primary'>
                      {d.rateAmount} <span className='text-ink-500'>{RATE_TYPE_LABEL[d.rateType] ?? d.rateType}</span>
                    </td>
                    <td className='cell-muted'>{formatDate(d.recordDate)}</td>
                    <td className='cell-muted'>{formatDate(d.paymentDate)}</td>
                    <td>
                      <DividendStatusBadge status={d.status} />
                    </td>
                    <td className='cell-num num'>
                      {d.totalPayableCents !== undefined ? formatCents(d.totalPayableCents, d.currency) : '—'}
                    </td>
                    <td>
                      <Link aria-label={`Open ${d.id}`} className='btn btn-ghost btn-sm' href={`/issuer/dividends/declarations/${d.id}`}>
                        Open
                        <Icon name='arrow-right' size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {filter.status && (
        <div className='mt-3 text-[12.5px] text-ink-500'>
          Showing <span className='font-semibold text-ink-800'>{DIVIDEND_STATUS_LABEL[filter.status]}</span>.{' '}
          <Link className='underline' href='/issuer/dividends/declarations'>
            Reset filters
          </Link>
          .
        </div>
      )}
    </AppShell>
  )
}
