import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { DividendStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, EmptyState, Metric, PageHeader, Panel } from '@/components/ui'
import { fetchDashboard, fetchDividends } from '@/lib/dividends/api'
import { DIVIDEND_TYPE_LABEL, formatCents, formatCentsCompact, formatDate, formatRelative } from '@/lib/dividends/copy'

export default async function AgentDividendsPage() {
  const [data, all] = await Promise.all([fetchDashboard(), fetchDividends({})])
  const reviewQueue = all.filter(d => d.status === 'PENDING_APPROVAL' || d.status === 'CHANGES_REQUESTED' || d.status === 'CALCULATED')

  return (
    <AppShell breadcrumbs={[{ href: '/agent', label: 'Workbench' }, { label: 'Dividends' }]} portal='agent'>
      <PageHeader
        actions={
          <Link className='btn btn-secondary btn-sm' href='/issuer/dividends/declarations'>
            <Icon name='external-link' size={13} />
            Issuer view
          </Link>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>Operations</Badge>
            <span className='text-[12px] text-ink-500'>
              {data.pendingApprovals} pending approval · {data.failedReturnedCount} failed/returned payments
            </span>
          </div>
        }
        subtitle='Review queue, payment batches, and exception items across issuers.'
        title='Dividends · Workbench'
      />

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric helper='Open + scheduled' label='Active dividends' value={String(reviewQueue.length)} />
        <Metric helper='Awaiting payout' label='Total payable' value={formatCentsCompact(data.totalPayableCents)} />
        <Metric helper='Sign-off needed' label='Pending approval' value={String(data.pendingApprovals)} />
        <Metric helper='Across all open batches' label='Failed / returned' value={String(data.failedReturnedCount)} />
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]'>
        <Panel
          padded={false}
          subtitle='Dividends needing reviewer attention — approval, calculation lock, or batch action'
          title={`Review queue · ${reviewQueue.length}`}
        >
          {reviewQueue.length === 0 ? (
            <div className='p-10'>
              <EmptyState icon='check-circle' title='Queue is clear'>
                Dividends needing reviewer action will appear here.
              </EmptyState>
            </div>
          ) : (
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Dividend</th>
                    <th>Type</th>
                    <th>Record</th>
                    <th>Pay</th>
                    <th className='cell-num'>Net</th>
                    <th>Status</th>
                    <th aria-label='Open' />
                  </tr>
                </thead>
                <tbody>
                  {reviewQueue.map(d => (
                    <tr className='table-row-clickable' key={d.id}>
                      <td>
                        <Link className='cell-primary' href={`/issuer/dividends/declarations/${d.id}`}>
                          {d.issuer.name}
                        </Link>
                        <div className='cell-muted'>{d.security.label}</div>
                      </td>
                      <td className='cell-muted'>{DIVIDEND_TYPE_LABEL[d.dividendType]}</td>
                      <td className='cell-muted'>{formatDate(d.recordDate)}</td>
                      <td>
                        <div className='cell-primary'>{formatDate(d.paymentDate)}</div>
                        <div className='cell-muted'>{formatRelative(d.paymentDate)}</div>
                      </td>
                      <td className='cell-num num'>
                        {d.totalPayableCents !== undefined ? formatCents(d.totalPayableCents, d.currency) : '—'}
                      </td>
                      <td>
                        <DividendStatusBadge status={d.status} />
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

        <aside className='flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel subtitle='Distribution across the operator queue' title='By status'>
            <ul className='flex flex-col gap-2 text-[13px]'>
              {data.byStatus.map(s => (
                <li className='flex items-center justify-between gap-2' key={s.status}>
                  <DividendStatusBadge status={s.status} />
                  <span className='num font-semibold text-ink-900'>{s.count}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel subtitle='Open exception items needing operator action' title='Exceptions'>
            <ul className='flex flex-col gap-2 text-[13px]'>
              <li className='flex items-center justify-between gap-2'>
                <span>Failed payments</span>
                <Badge tone='danger'>{data.failedReturnedCount}</Badge>
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span>Tax form missing</span>
                <Badge tone='warning'>12</Badge>
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span>Address RTS</span>
                <Badge tone='warning'>3</Badge>
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
