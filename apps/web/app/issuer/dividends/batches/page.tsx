import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { ExportButton, PaymentBatchStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { exportUrl, fetchAllBatches, fetchDividends } from '@/lib/dividends/api'
import { formatCents, formatDate } from '@/lib/dividends/copy'

export default async function PaymentBatchesPage() {
  const [batches, dividends] = await Promise.all([fetchAllBatches(), fetchDividends({})])
  const dividendsById = new Map(dividends.map(d => [d.id, d]))

  return (
    <AppShell
      breadcrumbs={[{ href: '/issuer', label: 'Issuer' }, { href: '/issuer/dividends', label: 'Dividends' }, { label: 'Payment batches' }]}
      portal='issuer'
    >
      <PageHeader
        actions={<ExportButton iconSize={13} label='Export failed payments' location={exportUrl('failed-payments', {})} />}
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{batches.length} batches</Badge>
            <span className='text-[12px] text-ink-500'>Across all open and recently completed dividends</span>
          </div>
        }
        subtitle='Approve, schedule, process, and reconcile bank distributions across dividends.'
        title='Payment batches'
      />

      <Panel padded={false} title='All batches'>
        {batches.length === 0 ? (
          <div className='p-10'>
            <EmptyState icon='inbox' title='No payment batches'>
              Batches are created from a dividend after entitlements are calculated.
            </EmptyState>
          </div>
        ) : (
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Dividend</th>
                  <th>Pay date</th>
                  <th className='cell-num'># Payments</th>
                  <th className='cell-num'>Net total</th>
                  <th>Status</th>
                  <th aria-label='Open' />
                </tr>
              </thead>
              <tbody>
                {batches.map(b => {
                  const d = dividendsById.get(b.dividendId)
                  return (
                    <tr className='table-row-clickable' key={b.id}>
                      <td>
                        <Link className='cell-primary' href={`/issuer/dividends/batches/${b.id}`}>
                          {b.batchNumber}
                        </Link>
                        <div className='mono text-[11px] text-ink-500'>{b.id}</div>
                      </td>
                      <td>
                        {d ? (
                          <Link className='cell-primary' href={`/issuer/dividends/declarations/${b.dividendId}?tab=batches`}>
                            {d.issuer.name}
                          </Link>
                        ) : (
                          <span className='cell-primary'>{b.dividendId}</span>
                        )}
                        <div className='cell-muted'>{d?.security.label ?? ''}</div>
                      </td>
                      <td className='cell-muted'>{formatDate(b.paymentDate)}</td>
                      <td className='cell-num num'>{b.paymentCount.toLocaleString('en-US')}</td>
                      <td className='cell-num num'>{formatCents(b.netTotalCents, b.currency)}</td>
                      <td>
                        <PaymentBatchStatusBadge status={b.status} />
                      </td>
                      <td>
                        <Link
                          aria-label={`Open ${b.batchNumber}`}
                          className='btn btn-ghost btn-sm'
                          href={`/issuer/dividends/batches/${b.id}`}
                        >
                          Open
                          <Icon name='arrow-right' size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  )
}
