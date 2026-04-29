import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { ExportButton } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { DividendHistoryTable } from '@/components/investor/dividend-history-table'
import { Badge, Chip, EmptyState, PageHeader, Panel } from '@/components/ui'
import { exportUrl } from '@/lib/dividends/api'
import { DIVIDEND_TYPE_LABEL, DIVIDEND_TYPE_OPTIONS, formatCents } from '@/lib/dividends/copy'
import { fetchMyDividends, fetchMyProfile } from '@/lib/dividends/shareholder'
import type { DividendType, EntitlementPaymentStatus } from '@/lib/dividends/types'

type SearchParams = Promise<{ company?: string; query?: string; status?: string; type?: string; year?: string }>

const STATUS_GROUPS = ['paid', 'pending', 'failed'] as const

export default async function InvestorDividendHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const [all, profile] = await Promise.all([fetchMyDividends(), fetchMyProfile()])

  const companies = Array.from(new Set(all.map(d => d.issuerName))).sort((a, b) => a.localeCompare(b))
  const years = Array.from(new Set(all.map(d => d.paymentDate.slice(0, 4)))).sort((a, b) => b.localeCompare(a))

  const filtered = all.filter(d => {
    if (sp.year && !d.paymentDate.startsWith(sp.year)) return false
    if (sp.type && d.dividendType !== (sp.type as DividendType)) return false
    if (sp.company && d.issuerName !== sp.company) return false
    if (sp.status === 'paid' && d.paymentStatus !== 'PAID' && d.paymentStatus !== 'RECONCILED') return false
    if (sp.status === 'pending' && !['PENDING', 'PROCESSING', 'SCHEDULED'].includes(d.paymentStatus as EntitlementPaymentStatus))
      return false
    if (sp.status === 'failed' && d.paymentStatus !== 'FAILED' && d.paymentStatus !== 'RETURNED') return false
    if (sp.query) {
      const q = sp.query.toLowerCase()
      const hay = `${d.issuerName} ${d.securityLabel} ${d.id} ${d.dividendType}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const totalNet = filtered.filter(d => d.paymentStatus === 'PAID' || d.paymentStatus === 'RECONCILED').reduce((s, d) => s + d.netCents, 0)
  const totalGross = filtered
    .filter(d => d.paymentStatus === 'PAID' || d.paymentStatus === 'RECONCILED')
    .reduce((s, d) => s + d.grossCents, 0)

  return (
    <AppShell
      breadcrumbs={[{ href: '/investor', label: 'Investor' }, { href: '/investor/dividends', label: 'Dividends' }, { label: 'History' }]}
      portal='investor'
    >
      <PageHeader
        actions={
          <ExportButton
            iconSize={13}
            label='Export CSV'
            location={exportUrl('shareholder-history', { shareholderId: profile.shareholderId })}
          />
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>
              {filtered.length} of {all.length}
            </Badge>
            <span className='text-[12px] text-ink-500'>
              Net paid {formatCents(totalNet)} · Gross {formatCents(totalGross)}
            </span>
          </div>
        }
        subtitle='Every dividend across your holdings — filterable by year, company, type, or status.'
        title='Dividend history'
      />

      <Panel padded={false}>
        <div className='flex flex-wrap items-center gap-2 border-b border-line px-4 py-3'>
          <Chip active={!sp.status} icon='inbox'>
            <Link href='/investor/dividends/history'>All</Link>
          </Chip>
          {STATUS_GROUPS.map(g => (
            <Chip active={sp.status === g} icon={g === 'paid' ? 'check-circle' : g === 'pending' ? 'clock' : 'alert-triangle'} key={g}>
              <Link href={`/investor/dividends/history?status=${g}`} className='capitalize'>
                {g}
              </Link>
            </Chip>
          ))}

          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <form action='/investor/dividends/history' className='flex items-center gap-2'>
              <div className='search w-[220px]'>
                <span aria-hidden className='search-icon'>
                  <Icon name='search' size={14} />
                </span>
                <label className='sr-only' htmlFor='div-search'>
                  Search dividends
                </label>
                <input
                  className='input h-[32px]'
                  defaultValue={sp.query ?? ''}
                  id='div-search'
                  name='query'
                  placeholder='Search company, type…'
                  type='search'
                />
              </div>
              <label className='sr-only' htmlFor='filter-year'>
                Year
              </label>
              <select className='input h-[32px]' defaultValue={sp.year ?? ''} id='filter-year' name='year'>
                <option value=''>All years</option>
                {years.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <label className='sr-only' htmlFor='filter-company'>
                Company
              </label>
              <select className='input h-[32px]' defaultValue={sp.company ?? ''} id='filter-company' name='company'>
                <option value=''>All companies</option>
                {companies.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className='sr-only' htmlFor='filter-type'>
                Type
              </label>
              <select className='input h-[32px]' defaultValue={sp.type ?? ''} id='filter-type' name='type'>
                <option value=''>All types</option>
                {DIVIDEND_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {DIVIDEND_TYPE_LABEL[o.value]}
                  </option>
                ))}
              </select>
              <button className='btn btn-secondary btn-sm' type='submit'>
                <Icon name='filter' size={12} />
                Apply
              </button>
            </form>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className='p-10'>
            <EmptyState
              action={
                <Link className='btn btn-secondary btn-sm' href='/investor/dividends/history'>
                  Clear filters
                </Link>
              }
              icon='search'
              title='No dividends match'
            >
              Try a wider date range or clear the filters.
            </EmptyState>
          </div>
        ) : (
          <DividendHistoryTable rows={filtered} />
        )}
      </Panel>
    </AppShell>
  )
}
