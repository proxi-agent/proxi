import { Icon } from '@/components/icon'
import { Badge, Confidence } from '@/components/ui'
import type { TransferRequest } from '@/lib/transfer/types'

import { SlaCountdown } from './sla-countdown'

function formatShares(n: number) {
  return n.toLocaleString('en-US')
}

function formatCurrency(n: number | undefined) {
  if (typeof n !== 'number') return ''
  return n.toLocaleString('en-US', { currency: 'USD', style: 'currency' })
}

export function ReviewAtGlance({ transfer }: { transfer: TransferRequest }) {
  const topBlocker = [...transfer.exceptions].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const
    return order[a.severity] - order[b.severity]
  })[0]

  const kycTone =
    transfer.kyc.status === 'passed'
      ? 'positive'
      : transfer.kyc.status === 'attention' || transfer.kyc.status === 'pending'
        ? 'warning'
        : 'danger'

  const medallionTone =
    transfer.medallion.status === 'ok' ||
    transfer.medallion.status === 'waived-under-threshold' ||
    transfer.medallion.status === 'waived-affidavit'
      ? 'positive'
      : transfer.medallion.status === 'missing' || transfer.medallion.status === 'expired'
        ? 'danger'
        : 'warning'

  return (
    <section className='overflow-hidden rounded-md border border-line bg-white'>
      <div className='grid grid-cols-1 divide-y divide-line md:grid-cols-[1.3fr_0.8fr_1fr_0.9fr_1fr] md:divide-y-0 md:divide-x'>
        {/* Case */}
        <div className='px-4 py-3'>
          <div className='text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400'>Case</div>
          <div className='num mt-1 text-[15px] font-semibold text-ink-900'>{transfer.id}</div>
          <div className='mt-0.5 truncate text-[12px] text-ink-600'>
            {transfer.holder.name} · {transfer.holder.accountNumber}
          </div>
        </div>

        {/* Shares / security */}
        <div className='px-4 py-3'>
          <div className='text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400'>Transfer</div>
          <div className='num mt-1 text-[15px] font-semibold text-ink-900'>
            {formatShares(transfer.shareCount)} <span className='text-[12px] font-medium text-ink-500'>{transfer.holding.ticker}</span>
          </div>
          <div className='mt-0.5 text-[12px] text-ink-600'>{formatCurrency(transfer.shareValue)}</div>
        </div>

        {/* Destination */}
        <div className='px-4 py-3'>
          <div className='text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400'>Destination</div>
          <div className='mt-1 truncate text-[13px] font-semibold text-ink-900'>{transfer.destination.label}</div>
          <div className='mt-0.5 truncate text-[12px] text-ink-600'>
            {transfer.destination.dtcParticipant
              ? `DTC ${transfer.destination.dtcParticipant}`
              : (transfer.destination.registrationType ?? transfer.destination.kind)}
          </div>
        </div>

        {/* Confidence + verification */}
        <div className='px-4 py-3'>
          <div className='text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400'>AI confidence</div>
          <div className='mt-1'>
            <Confidence value={transfer.confidence} />
          </div>
          <div className='mt-1 flex flex-wrap items-center gap-1'>
            <Badge tone={kycTone}>KYC · {transfer.kyc.status}</Badge>
            <Badge tone={medallionTone}>Medallion · {transfer.medallion.status}</Badge>
          </div>
        </div>

        {/* SLA + top blocker */}
        <div className='px-4 py-3'>
          <div className='text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400'>SLA</div>
          <div className='mt-1'>
            <SlaCountdown dueAt={transfer.sla.dueAt} paused={Boolean(transfer.sla.pausedReason)} />
          </div>
          {topBlocker ? (
            <div className='mt-1 flex items-start gap-1 text-[11.5px] text-danger-700'>
              <Icon className='mt-0.5' name='alert-triangle' size={10} />
              <span className='truncate' title={topBlocker.title}>
                {topBlocker.title}
              </span>
            </div>
          ) : (
            <div className='mt-1 flex items-center gap-1 text-[11.5px] text-positive-500'>
              <Icon name='check-circle' size={10} />
              <span>No blockers</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
