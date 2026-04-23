import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { TransferStatusBadge } from '@/components/transfer'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { STATUS_META, TRANSFER_TYPE_LABEL } from '@/lib/transfer/copy'
import { listTransfers } from '@/lib/transfer/mock'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function fmtShares(n: number) {
  return n.toLocaleString('en-US')
}

const HOLDER_ID = 'h-1' // Eleanor Hayes in mock

export default function InvestorTransfersPage() {
  const mine = listTransfers().filter(t => t.holder.id === HOLDER_ID)
  const active = mine.filter(t => t.status !== 'posted' && t.status !== 'cancelled')
  const closed = mine.filter(t => t.status === 'posted' || t.status === 'cancelled')

  return (
    <AppShell breadcrumbs={[{ href: '/investor', label: 'Dashboard' }, { label: 'Transfers' }]} portal='investor'>
      <PageHeader
        actions={
          <Link className='btn btn-brand btn-sm' href='/investor/transfer/new'>
            <Icon name='arrow-left-right' size={13} />
            Start a transfer
          </Link>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>Transfers</Badge>
            <span className='text-[12px] text-ink-500'>
              {mine.length} total · {active.length} in progress
            </span>
          </div>
        }
        subtitle='Track active transfers and review your history. Every request is auditable end-to-end.'
        title='My transfers'
      />

      <div className='flex flex-col gap-5'>
        <Panel subtitle='Transfers that are moving through review or awaiting your action' title='In progress'>
          {active.length === 0 ? (
            <EmptyState
              action={
                <Link className='btn btn-brand btn-sm' href='/investor/transfer/new'>
                  <Icon name='arrow-left-right' size={13} />
                  Start a transfer
                </Link>
              }
              icon='arrow-left-right'
              title='No transfers in progress'
            >
              When you initiate a transfer, it will appear here with a live stage tracker and expected turnaround.
            </EmptyState>
          ) : (
            <table className='table'>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Type</th>
                  <th>Security</th>
                  <th className='num'>Shares</th>
                  <th>Status</th>
                  <th>Next step</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className='text-[13px] font-semibold text-ink-900'>{t.id}</div>
                      <div className='text-[11.5px] text-ink-500'>Submitted {fmtDate(t.createdAt)}</div>
                    </td>
                    <td>
                      <div className='text-[12.5px]'>{TRANSFER_TYPE_LABEL[t.transferType]}</div>
                      <div className='text-[11.5px] text-ink-500'>{t.destination.label}</div>
                    </td>
                    <td>
                      <div className='text-[12.5px] font-medium text-ink-900'>{t.holding.ticker}</div>
                      <div className='text-[11.5px] text-ink-500'>{t.holding.issuer}</div>
                    </td>
                    <td className='num'>{fmtShares(t.shareCount)}</td>
                    <td>
                      <TransferStatusBadge status={t.status} />
                    </td>
                    <td>
                      <span className='text-[12px] text-ink-600'>{t.nextStepForShareholder ?? STATUS_META[t.status].label}</span>
                    </td>
                    <td className='text-right'>
                      <Link className='btn btn-secondary btn-sm' href={`/investor/transfers/${t.id}`}>
                        Open
                        <Icon name='arrow-right' size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {closed.length > 0 && (
          <Panel subtitle='Immutable record of your completed transfers' title='History'>
            <table className='table'>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Type</th>
                  <th>Security</th>
                  <th className='num'>Shares</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closed.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className='text-[13px] font-semibold text-ink-900'>{t.id}</div>
                      <div className='text-[11.5px] text-ink-500'>Completed {fmtDate(t.createdAt)}</div>
                    </td>
                    <td>
                      <span className='text-[12.5px]'>{TRANSFER_TYPE_LABEL[t.transferType]}</span>
                    </td>
                    <td>
                      <span className='text-[12.5px] font-medium text-ink-900'>{t.holding.ticker}</span>
                    </td>
                    <td className='num'>{fmtShares(t.shareCount)}</td>
                    <td>
                      <TransferStatusBadge status={t.status} />
                    </td>
                    <td className='text-right'>
                      <Link className='btn btn-ghost btn-sm' href={`/investor/transfers/${t.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </AppShell>
  )
}
