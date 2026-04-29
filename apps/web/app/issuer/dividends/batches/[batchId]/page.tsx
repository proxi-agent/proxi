import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import { ExportButton, PaymentBatchActions, PaymentBatchStatusBadge, PaymentStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, EmptyState, Metric, PageHeader, Panel } from '@/components/ui'
import { exportUrl, fetchBatch } from '@/lib/dividends/api'
import { formatCents, formatDate, formatDateTime, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from '@/lib/dividends/copy'
import type { PaymentStatus } from '@/lib/dividends/types'

export default async function PaymentBatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const batch = await fetchBatch(batchId)

  const failed = batch.payments.filter(p => p.paymentStatus === 'FAILED' || p.paymentStatus === 'RETURNED')

  return (
    <AppShell
      breadcrumbs={[
        { href: '/issuer', label: 'Issuer' },
        { href: '/issuer/dividends', label: 'Dividends' },
        { href: `/issuer/dividends/declarations/${batch.dividendId}?tab=batches`, label: 'Batches' },
        { label: batch.batchNumber },
      ]}
      portal='issuer'
    >
      <PageHeader
        actions={
          <>
            <Link className='btn btn-ghost btn-sm' href={`/issuer/dividends/declarations/${batch.dividendId}?tab=batches`}>
              <Icon name='arrow-left' size={13} />
              Batches
            </Link>
            <ExportButton iconSize={13} label='Export payment file' location={exportUrl('batch-payments', { batchId })} />
            {failed.length > 0 && (
              <ExportButton
                iconSize={13}
                label={`Failed (${failed.length})`}
                location={exportUrl('failed-payments', { batchId })}
                variant='ghost'
              />
            )}
            <PaymentBatchActions batchId={batchId} status={batch.status} />
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{batch.batchNumber}</Badge>
            <PaymentBatchStatusBadge status={batch.status} />
            <span className='text-[12px] text-ink-500'>
              {batch.paymentCount.toLocaleString('en-US')} payments · pay {formatDate(batch.paymentDate)}
            </span>
          </div>
        }
        subtitle='Payment batch detail with totals, status distribution, and per-payment results.'
        title='Payment batch'
      />

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric helper='Sum of gross amounts' label='Gross total' value={formatCents(batch.grossTotalCents, batch.currency)} />
        <Metric helper='Tax withheld' label='Withholding' value={formatCents(batch.withholdingTotalCents, batch.currency)} />
        <Metric helper='Released to holders' label='Net total' trend='up' value={formatCents(batch.netTotalCents, batch.currency)} />
        <Metric helper={failed.length === 0 ? 'All clear' : 'Need attention'} label='Failed / returned' value={String(failed.length)} />
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]'>
        <div className='flex flex-col gap-5'>
          <Panel padded={false} subtitle='Per-payment results' title={`Payments · ${batch.payments.length}`}>
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Shareholder</th>
                    <th>Method</th>
                    <th className='cell-num'>Gross</th>
                    <th className='cell-num'>Withholding</th>
                    <th className='cell-num'>Net</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.payments.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div className='cell-primary'>{p.shareholderName}</div>
                        <div className='mono text-[11px] text-ink-500'>{p.shareholderId}</div>
                      </td>
                      <td>
                        <Badge tone='neutral'>{p.paymentMethod}</Badge>
                      </td>
                      <td className='cell-num num'>{formatCents(p.grossAmountCents, p.currency)}</td>
                      <td className='cell-num num text-warning-700'>{formatCents(p.withholdingAmountCents, p.currency)}</td>
                      <td className='cell-num num cell-primary'>{formatCents(p.netAmountCents, p.currency)}</td>
                      <td>
                        <PaymentStatusBadge status={p.paymentStatus} />
                      </td>
                      <td className='mono text-[11px] text-ink-500'>{p.externalPaymentReference ?? '—'}</td>
                      <td className='cell-muted'>
                        {p.paidAt
                          ? `Paid ${formatDateTime(p.paidAt)}`
                          : p.failureReason
                            ? p.failureReason
                            : p.paymentStatus === 'PENDING'
                              ? 'Awaiting send'
                              : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {failed.length > 0 && (
            <Panel padded={false} subtitle='Open exception items — resolve before reconciliation' title={`Exceptions · ${failed.length}`}>
              <ul className='divide-y divide-line'>
                {failed.map(p => (
                  <li className='flex items-start justify-between gap-3 px-4 py-3' key={p.id}>
                    <div>
                      <div className='cell-primary'>{p.shareholderName}</div>
                      <div className='cell-muted'>{p.failureReason ?? PAYMENT_STATUS_LABEL[p.paymentStatus]}</div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <PaymentStatusBadge status={p.paymentStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className='flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel subtitle='Where the payments stand right now' title='Status distribution'>
            {batch.statusDistribution.length === 0 ? (
              <EmptyState icon='inbox' title='No payments yet' />
            ) : (
              <ul className='flex flex-col gap-2'>
                {batch.statusDistribution
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map(s => (
                    <li className='flex items-center justify-between gap-2 text-[13px]' key={s.status}>
                      <span className='flex items-center gap-2'>
                        <Badge tone={PAYMENT_STATUS_TONE[s.status as PaymentStatus]}>
                          {PAYMENT_STATUS_LABEL[s.status as PaymentStatus]}
                        </Badge>
                      </span>
                      <span className='num font-semibold text-ink-900'>{s.count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>

          <Panel subtitle='Reconciliation cycle' title='Next steps'>
            <ol className='timeline'>
              <li className={`timeline-item ${batch.status === 'DRAFT' ? 'info' : 'ok'}`}>
                <div className='timeline-title'>Approve</div>
                <div className='timeline-body'>Compliance signs off the batch contents.</div>
              </li>
              <li className={`timeline-item ${batch.status === 'SCHEDULED' ? 'info' : ''}`}>
                <div className='timeline-title'>Schedule</div>
                <div className='timeline-body'>Set the date funds will release.</div>
              </li>
              <li className='timeline-item'>
                <div className='timeline-title'>Process</div>
                <div className='timeline-body'>Payment instructions sent to ACH/wire/check.</div>
              </li>
              <li className='timeline-item'>
                <div className='timeline-title'>Reconcile</div>
                <div className='timeline-body'>Match bank file against expected payments.</div>
              </li>
            </ol>
          </Panel>

          <Callout tone='info'>
            Payment file export and reconciliation import are placeholders today. Provider integration plugs in via the payments abstraction
            layer.
          </Callout>
        </aside>
      </div>
    </AppShell>
  )
}
