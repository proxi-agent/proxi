import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { TransferStatusBadge } from '@/components/transfer'
import { Avatar, Badge, Confidence, EmptyState, PageHeader, Panel } from '@/components/ui'
import { TRANSFER_TYPE_LABEL } from '@/lib/transfer/copy'
import { listTransfers } from '@/lib/transfer/mock'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  })
}

export default function AdminTransfersPage() {
  const all = listTransfers()
  const flagged = all.filter(t => t.status === 'escalated' || t.exceptions.some(e => e.severity === 'high'))
  const needsPolicy = all.filter(t => t.medallion.status === 'waived-affidavit' || t.medallion.status === 'waived-under-threshold')

  return (
    <AppShell breadcrumbs={[{ href: '/admin', label: 'Admin' }, { label: 'Transfers' }]} portal='admin'>
      <PageHeader
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>Compliance</Badge>
            <span className='text-[12px] text-ink-500'>
              {flagged.length} flagged · {needsPolicy.length} policy exceptions
            </span>
          </div>
        }
        subtitle='Oversight for high-risk transfers, policy exceptions, and the full audit stream.'
        title='Transfer oversight'
      />

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]'>
        <div className='flex flex-col gap-5'>
          <Panel subtitle='Escalated cases and high-severity exceptions across all issuers' title='High-risk transfers'>
            {flagged.length === 0 ? (
              <EmptyState icon='shield-check' title='No high-risk transfers'>
                Every request in the last 30 days cleared risk checks without escalation.
              </EmptyState>
            ) : (
              <table className='table'>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Holder</th>
                    <th>Issuer</th>
                    <th>Type</th>
                    <th>Trigger</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Reviewer</th>
                    <th>Opened</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map(t => {
                    const primary = t.exceptions.find(e => e.severity === 'high') ?? t.exceptions[0]
                    return (
                      <tr key={t.id}>
                        <td>
                          <div className='text-[13px] font-semibold text-ink-900'>{t.id}</div>
                        </td>
                        <td>
                          <div className='flex items-center gap-2'>
                            <Avatar name={t.holder.name} size={20} tone='ink' />
                            <span className='text-[12.5px]'>{t.holder.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className='text-[12.5px]'>{t.issuerName}</span>
                        </td>
                        <td>
                          <span className='text-[12px]'>{TRANSFER_TYPE_LABEL[t.transferType]}</span>
                        </td>
                        <td>
                          {primary ? (
                            <div>
                              <Badge icon='alert-triangle' tone='danger'>
                                {primary.code}
                              </Badge>
                              <div className='mt-0.5 text-[11.5px] text-ink-500'>{primary.title}</div>
                            </div>
                          ) : (
                            <span className='text-[12px] text-ink-400'>—</span>
                          )}
                        </td>
                        <td>
                          <Confidence value={t.confidence} />
                        </td>
                        <td>
                          <TransferStatusBadge status={t.status} />
                        </td>
                        <td>
                          {t.assignedReviewer ? (
                            <span className='text-[12px]'>{t.assignedReviewer.name}</span>
                          ) : (
                            <span className='text-[12px] text-ink-400'>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <span className='text-[11.5px] text-ink-500'>{fmtTime(t.createdAt)}</span>
                        </td>
                        <td className='text-right'>
                          <Link className='btn btn-secondary btn-sm' href={`/agent/transfers/${t.id}`}>
                            Inspect
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel subtitle='Transfers that deviate from standard policy and must be documented' title='Policy exceptions'>
            <ul className='flex flex-col gap-2'>
              {needsPolicy.map(t => (
                <li className='soft-box flex items-center justify-between' key={t.id}>
                  <div>
                    <div className='flex items-center gap-2'>
                      <span className='text-[13px] font-semibold text-ink-900'>{t.id}</span>
                      <Badge icon='scroll' tone='info'>
                        {t.medallion.status === 'waived-affidavit' ? 'Medallion waived · affidavit' : 'Medallion waived · below threshold'}
                      </Badge>
                    </div>
                    <div className='mt-0.5 text-[11.5px] text-ink-500'>
                      {t.holder.name} · {t.issuerName} · {t.shareCount.toLocaleString('en-US')} {t.holding.ticker}
                    </div>
                  </div>
                  <Link className='btn btn-ghost btn-sm' href={`/agent/transfers/${t.id}`}>
                    View
                    <Icon name='arrow-right' size={12} />
                  </Link>
                </li>
              ))}
              {needsPolicy.length === 0 && (
                <EmptyState icon='scroll' title='Clean policy posture'>
                  No documented exceptions to standing policy in the last 30 days.
                </EmptyState>
              )}
            </ul>
          </Panel>

          <Panel subtitle='Immutable stream of every transfer-related event across the platform' title='Audit stream'>
            <div className='timeline'>
              {all
                .flatMap(t => t.auditEvents.map(e => ({ ...e, txId: t.id })))
                .sort((a, b) => (a.at < b.at ? 1 : -1))
                .slice(0, 10)
                .map(e => (
                  <div className={`timeline-item ${e.tone ?? 'info'}`} key={`${e.txId}-${e.id}`}>
                    <div className='timeline-meta'>
                      {fmtTime(e.at)} · {e.actorName}{' '}
                      <Link className='text-brand-700 hover:underline' href={`/agent/transfers/${e.txId}`}>
                        {e.txId}
                      </Link>
                    </div>
                    <div className='timeline-title'>{e.title}</div>
                    {e.detail && <div className='timeline-body'>{e.detail}</div>}
                  </div>
                ))}
            </div>
          </Panel>
        </div>

        <aside className='flex flex-col gap-5'>
          <Panel subtitle='Rules currently in effect for transfers' title='Policy controls'>
            <dl className='dl'>
              <dt>Medallion threshold</dt>
              <dd className='num'>$25,000 USD</dd>
              <dt>Dual-approval above</dt>
              <dd className='num'>$50,000 USD</dd>
              <dt>AI straight-through</dt>
              <dd>Confidence ≥ 85% and no exceptions</dd>
              <dt>KYC expiry</dt>
              <dd>24 months</dd>
              <dt>W-9 refresh</dt>
              <dd>After any address change</dd>
            </dl>
          </Panel>

          <Panel subtitle='Last 30 days' title='Oversight metrics'>
            <ul className='flex flex-col gap-2 text-[12.5px]'>
              <li className='flex items-center justify-between'>
                <span className='text-ink-500'>Requests processed</span>
                <span className='num font-semibold text-ink-900'>1,248</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-500'>Straight-through rate</span>
                <span className='num font-semibold text-positive-500'>71%</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-500'>Reversed post-approval</span>
                <span className='num font-semibold text-ink-900'>0</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-500'>Median turnaround</span>
                <span className='num font-semibold text-ink-900'>4h 12m</span>
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
