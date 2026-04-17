import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { TransferStatusBadge } from '@/components/transfer'
import { Avatar, Badge, Chip, Confidence, PageHeader, Panel } from '@/components/ui'
import { TRANSFER_TYPE_LABEL } from '@/lib/transfer/copy'
import { listTransfers } from '@/lib/transfer/mock'
import type { SlaState, TransferRequest } from '@/lib/transfer/types'

function fmtSub(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  })
}

function fmtDue(iso: string) {
  const d = new Date(iso)
  const now = Date.now()
  const delta = d.getTime() - now
  const hours = Math.round(delta / (1000 * 60 * 60))
  if (hours <= 0) return `${Math.abs(hours)}h overdue`
  if (hours < 24) return `in ${hours}h`
  const days = Math.round(hours / 24)
  return `in ${days}d`
}

function fmtShares(n: number) {
  return n.toLocaleString('en-US')
}

const AGING_TONE: Record<SlaState, 'danger' | 'positive' | 'warning'> = {
  'at-risk': 'warning',
  'on-track': 'positive',
  overdue: 'danger',
}

function riskIcon(t: TransferRequest) {
  if (t.exceptions.some(e => e.blocking)) return { icon: 'alert-triangle', tone: 'danger' as const, label: 'Blocking' }
  if (t.exceptions.length > 0) return { icon: 'alert-triangle', tone: 'warning' as const, label: 'Flag' }
  if (t.confidence >= 85) return { icon: 'sparkles', tone: 'brand' as const, label: 'Straight-through' }
  return { icon: 'circle-dot', tone: 'info' as const, label: 'Routine' }
}

export default function AgentTransfersQueue() {
  const all = listTransfers()
  const queue = all.filter(t => t.status !== 'posted' && t.status !== 'cancelled')

  const counts = {
    all: all.length,
    blocked: all.filter(t => t.status === 'blocked' || t.exceptions.some(e => e.blocking)).length,
    myQueue: all.filter(t => t.assignedReviewer?.initials === 'DC').length,
    needsInfo: all.filter(t => t.status === 'needs-info').length,
    review: all.filter(t => t.status === 'in-review' || t.status === 'ai-review' || t.status === 'escalated').length,
  }

  return (
    <AppShell breadcrumbs={[{ href: '/agent', label: 'Workbench' }, { label: 'Transfers' }]} portal='agent'>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='sliders-horizontal' size={13} />
              Saved views
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='download' size={13} />
              Export
            </button>
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>Operations</Badge>
            <span className='text-[12px] text-ink-500'>
              {queue.length} active · {counts.blocked} blocking · {counts.needsInfo} need info
            </span>
          </div>
        }
        subtitle='Review, triage, and dispatch stock transfer requests across issuers.'
        title='Transfer queue'
      />

      <div className='flex flex-col gap-4'>
        <Panel padded={false}>
          <div className='flex flex-wrap items-center gap-2 border-b border-line px-4 py-3'>
            <Chip active count={counts.all} icon='inbox'>
              All
            </Chip>
            <Chip count={counts.myQueue} icon='user-round'>
              My queue
            </Chip>
            <Chip count={counts.review} icon='scan-search'>
              In review
            </Chip>
            <Chip count={counts.needsInfo} icon='help-circle'>
              Needs info
            </Chip>
            <Chip count={counts.blocked} icon='alert-triangle'>
              Blocking
            </Chip>
            <div className='ml-auto flex items-center gap-2'>
              <div className='flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12px] text-ink-600'>
                <Icon name='search' size={12} />
                <input className='w-48 bg-transparent outline-none placeholder:text-ink-400' placeholder='Search by ID, holder, CUSIP' />
              </div>
              <button className='btn btn-ghost btn-sm' type='button'>
                <Icon name='plus' size={12} />
                Filter
              </button>
              <button className='btn btn-ghost btn-sm' type='button'>
                <Icon name='columns-3' size={12} />
                Columns
              </button>
            </div>
          </div>

          <div className='overflow-x-auto'>
            <table className='table'>
              <thead>
                <tr>
                  <th></th>
                  <th>Request</th>
                  <th>Holder</th>
                  <th>Issuer · security</th>
                  <th>Type</th>
                  <th>Destination</th>
                  <th className='num'>Shares</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                  <th>Due / SLA</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queue.map(t => {
                  const risk = riskIcon(t)
                  return (
                    <tr key={t.id}>
                      <td>
                        <span title={risk.label}>
                          <Badge icon={risk.icon} tone={risk.tone}>
                            <span className='sr-only'>{risk.label}</span>
                          </Badge>
                        </span>
                      </td>
                      <td>
                        <div className='text-[13px] font-semibold text-ink-900'>{t.id}</div>
                        <div className='text-[11.5px] text-ink-500'>{fmtSub(t.createdAt)}</div>
                      </td>
                      <td>
                        <div className='flex items-center gap-2'>
                          <Avatar name={t.holder.name} size={22} tone='ink' />
                          <div>
                            <div className='text-[12.5px] font-medium text-ink-900'>{t.holder.name}</div>
                            <div className='text-[11.5px] text-ink-500'>{t.holder.registration}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className='text-[12.5px] font-medium text-ink-900'>{t.holding.ticker}</div>
                        <div className='text-[11.5px] text-ink-500'>{t.holding.issuer}</div>
                      </td>
                      <td>
                        <span className='text-[12px]'>{TRANSFER_TYPE_LABEL[t.transferType]}</span>
                      </td>
                      <td>
                        <div className='text-[12px] text-ink-700'>{t.destination.label}</div>
                        <div className='text-[11px] uppercase tracking-[0.06em] text-ink-400'>{t.destination.kind}</div>
                      </td>
                      <td className='num'>
                        {t.partial ? '' : 'Full · '}
                        {fmtShares(t.shareCount)}
                      </td>
                      <td>
                        <Confidence value={t.confidence} />
                      </td>
                      <td>
                        <TransferStatusBadge status={t.status} />
                      </td>
                      <td>
                        {t.assignedReviewer ? (
                          <div className='flex items-center gap-2'>
                            <Avatar name={t.assignedReviewer.name} size={20} tone='ink' />
                            <span className='text-[12px]'>{t.assignedReviewer.name}</span>
                          </div>
                        ) : (
                          <span className='text-[12px] text-ink-400'>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <Badge icon='clock' tone={AGING_TONE[t.sla.agingState]}>
                          Due {fmtDue(t.sla.dueAt)}
                        </Badge>
                      </td>
                      <td className='text-right'>
                        <Link className='btn btn-secondary btn-sm' href={`/agent/transfers/${t.id}`}>
                          Review
                          <Icon name='arrow-right' size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className='flex items-center justify-between border-t border-line px-4 py-2.5 text-[11.5px] text-ink-500'>
            <span>{queue.length} active requests · auto-refreshing every 30s</span>
            <div className='flex items-center gap-2'>
              <button className='btn btn-ghost btn-sm' type='button'>
                <Icon name='arrow-left' size={12} />
              </button>
              <button className='btn btn-ghost btn-sm' type='button'>
                <Icon name='arrow-right' size={12} />
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}
