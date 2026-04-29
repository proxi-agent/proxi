import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import { DividendStatusBadge, ExportButton } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, EmptyState, Metric, PageHeader, Panel } from '@/components/ui'
import { exportUrl, fetchDashboard, fetchReportsSummary } from '@/lib/dividends/api'
import {
  DIVIDEND_STATUS_LABEL,
  DIVIDEND_TYPE_LABEL,
  formatCents,
  formatCentsCompact,
  formatDate,
  formatRelative,
} from '@/lib/dividends/copy'

export default async function IssuerDividendsDashboardPage() {
  const [data, summary] = await Promise.all([fetchDashboard(), fetchReportsSummary()])
  return (
    <AppShell breadcrumbs={[{ href: '/issuer', label: 'Issuer' }, { label: 'Dividends' }]} portal='issuer'>
      <PageHeader
        actions={
          <>
            <ExportButton iconSize={13} label='Export declarations' location={exportUrl('declarations', {})} />
            <Link className='btn btn-secondary btn-sm' href='/issuer/dividends/declarations'>
              <Icon name='inbox' size={13} />
              All declarations
            </Link>
            <Link className='btn btn-brand btn-sm' href='/issuer/dividends/declarations/new'>
              <Icon name='plus' size={13} />
              New declaration
            </Link>
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <span className='text-[12px] text-ink-500'>
              {data.pendingApprovals} awaiting approval · {data.failedReturnedCount} failed/returned payments
            </span>
          </div>
        }
        subtitle='Declare, approve, and disburse dividends with a guided 11-step workflow.'
        title='Dividends'
      />

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric
          helper={`${data.byStatus.length} statuses tracked`}
          label='Total declared'
          value={formatCentsCompact(summary.totalDeclaredCents || data.totalDeclaredCents)}
        />
        <Metric helper='Net cash distributed' label='Total paid' trend='up' value={formatCentsCompact(summary.totalPaidCents)} />
        <Metric helper='Tax withheld at source' label='Total withholding' value={formatCentsCompact(summary.totalWithholdingCents)} />
        <Metric
          helper='Awaiting payout'
          label='Unpaid amount'
          value={formatCentsCompact(summary.unpaidAmountCents || data.totalPayableCents)}
        />
      </div>

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric
          helper={`${data.requiringAttention.length} need attention`}
          label='Pending approvals'
          value={String(data.pendingApprovals)}
        />
        <Metric
          helper='Across all open batches'
          label='Failed / returned'
          value={String(summary.failedPaymentCount || data.failedReturnedCount)}
        />
        <Metric
          helper='Tracked declarations'
          label='Declarations'
          value={String(summary.declarationCount || data.byStatus.reduce((s, x) => s + x.count, 0))}
        />
        <Metric
          helper={summary.currency === 'MIXED' ? 'Multiple currencies in window' : `Reporting in ${summary.currency || 'USD'}`}
          label='Currency'
          value={summary.currency || 'USD'}
        />
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]'>
        <div className='flex flex-col gap-5'>
          <Panel
            actions={
              <Link className='btn btn-ghost btn-sm' href='/issuer/dividends/declarations?status=PAYMENT_SCHEDULED'>
                Payment schedule
                <Icon name='arrow-right' size={12} />
              </Link>
            }
            padded={false}
            subtitle='Dividends with payment dates in the next 30 days'
            title='Upcoming payment dates'
          >
            {data.upcomingPayments.length === 0 ? (
              <div className='p-8'>
                <EmptyState icon='calendar-clock' title='No upcoming payments'>
                  Approved declarations with future payment dates will surface here.
                </EmptyState>
              </div>
            ) : (
              <div className='table-wrap'>
                <table className='table'>
                  <thead>
                    <tr>
                      <th>Issuer / Security</th>
                      <th>Type</th>
                      <th>Record</th>
                      <th>Payment</th>
                      <th className='cell-num'>Net payable</th>
                      <th>Status</th>
                      <th aria-label='Open' />
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcomingPayments.map(d => (
                      <tr className='table-row-clickable' key={d.id}>
                        <td>
                          <Link className='block' href={`/issuer/dividends/declarations/${d.id}`}>
                            <div className='cell-primary'>{d.issuer.name}</div>
                            <div className='cell-muted'>{d.security.label}</div>
                          </Link>
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
                          <Link
                            aria-label={`Open ${d.id}`}
                            className='btn btn-ghost btn-icon btn-sm'
                            href={`/issuer/dividends/declarations/${d.id}`}
                          >
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

          <Panel
            padded={false}
            subtitle='Open dividends with warnings, missing instructions, or workflow blockers'
            title={`Requiring attention · ${data.requiringAttention.length}`}
          >
            {data.requiringAttention.length === 0 ? (
              <div className='p-8'>
                <EmptyState icon='check-circle' title='Nothing needs attention'>
                  Open dividends with warnings will surface here.
                </EmptyState>
              </div>
            ) : (
              <ul className='divide-y divide-line'>
                {data.requiringAttention.map(d => (
                  <li className='flex items-center justify-between gap-3 px-4 py-3' key={d.id}>
                    <div className='min-w-0'>
                      <Link className='cell-primary' href={`/issuer/dividends/declarations/${d.id}`}>
                        {d.issuer.name} · {d.security.label}
                      </Link>
                      <div className='cell-muted'>
                        {DIVIDEND_TYPE_LABEL[d.dividendType]} · {d.currency} {d.rateAmount} · pay {formatDate(d.paymentDate)}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      {d.calculatedSummary && d.calculatedSummary.warnings.length > 0 && (
                        <Badge icon='alert-triangle' tone='warning'>
                          {d.calculatedSummary.warnings.length} warnings
                        </Badge>
                      )}
                      <DividendStatusBadge status={d.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel padded={false} subtitle='Last few dividends that have been paid, reconciled, or archived' title='Recently completed'>
            {data.recentlyCompleted.length === 0 ? (
              <div className='p-8'>
                <EmptyState icon='inbox' title='No completed dividends yet'>
                  Once dividends settle they will appear here.
                </EmptyState>
              </div>
            ) : (
              <div className='table-wrap'>
                <table className='table'>
                  <thead>
                    <tr>
                      <th>Dividend</th>
                      <th>Pay date</th>
                      <th className='cell-num'>Net</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentlyCompleted.map(d => (
                      <tr key={d.id}>
                        <td>
                          <Link className='cell-primary' href={`/issuer/dividends/declarations/${d.id}`}>
                            {d.issuer.name}
                          </Link>
                          <div className='cell-muted'>{d.security.label}</div>
                        </td>
                        <td className='cell-muted'>{formatDate(d.paymentDate)}</td>
                        <td className='cell-num num'>
                          {d.totalPayableCents !== undefined ? formatCents(d.totalPayableCents, d.currency) : '—'}
                        </td>
                        <td>
                          <DividendStatusBadge status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className='flex flex-col gap-5 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel subtitle='Distribution of declarations by lifecycle stage' title='Declarations by status'>
            <ul className='flex flex-col gap-2 text-[13px]'>
              {data.byStatus.map(s => (
                <li className='flex items-center justify-between gap-2' key={s.status}>
                  <span className='flex items-center gap-2'>
                    <DividendStatusBadge status={s.status} />
                    <span className='text-ink-500'>{DIVIDEND_STATUS_LABEL[s.status]}</span>
                  </span>
                  <span className='num font-semibold text-ink-900'>{s.count}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel subtitle='Required before any dividend can move forward' title='Pending approvals'>
            {data.pendingApprovals === 0 ? (
              <Callout tone='positive'>No declarations are awaiting approval.</Callout>
            ) : (
              <Callout
                actions={
                  <Link className='btn btn-secondary btn-sm' href='/issuer/dividends/declarations?status=PENDING_APPROVAL'>
                    Review queue
                  </Link>
                }
                tone='warning'
              >
                {data.pendingApprovals} declarations need a sign-off from the board or corporate secretary before they can lock eligibility.
              </Callout>
            )}
          </Panel>

          <Panel subtitle='Common blockers surfaced by the AI pre-flight review' title='Workflow guidance'>
            <ul className='flex flex-col gap-2 text-[13px] text-ink-700'>
              <li className='flex items-start gap-2'>
                <Icon className='mt-0.5 text-ink-500' name='alert-triangle' size={12} />
                <span>
                  <span className='font-semibold text-ink-800'>Missing payment instructions</span>
                  <span className='ml-1 text-ink-500'>— flagged per declaration when holders have no ACH/check on file.</span>
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <Icon className='mt-0.5 text-ink-500' name='alert-triangle' size={12} />
                <span>
                  <span className='font-semibold text-ink-800'>Missing tax forms</span>
                  <span className='ml-1 text-ink-500'>— W-9 / W-8BEN gaps trigger backup withholding warnings.</span>
                </span>
              </li>
              <li className='flex items-start gap-2'>
                <Icon className='mt-0.5 text-ink-500' name='alert-triangle' size={12} />
                <span>
                  <span className='font-semibold text-ink-800'>Calculation drift</span>
                  <span className='ml-1 text-ink-500'>— recalculation re-versions entitlements only before payment scheduling.</span>
                </span>
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
