import { Icon } from '@/components/icon'
import { Badge, Panel } from '@/components/ui'
import type { Sla, TransferRequest } from '@/lib/transfer/types'

import { SlaCountdown } from './sla-countdown'

function fmtDue(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZoneName: 'short',
  })
}

function fmtSubmitted(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  })
}

const AGING_TONE: Record<Sla['agingState'], 'danger' | 'positive' | 'warning'> = {
  'at-risk': 'warning',
  'on-track': 'positive',
  overdue: 'danger',
}

const AGING_LABEL: Record<Sla['agingState'], string> = {
  'at-risk': 'At risk',
  'on-track': 'On track',
  overdue: 'Overdue',
}

// Same-day ledger post cutoff (3pm ET)
function sameDayCutoff(): string {
  const d = new Date()
  d.setHours(15, 0, 0, 0)
  return d.toISOString()
}

// DTC / DWAC instruction cutoff (4pm ET)
function dwacCutoff(): string {
  const d = new Date()
  d.setHours(16, 0, 0, 0)
  return d.toISOString()
}

export function TurnaroundEstimateCard({ transfer }: { transfer: TransferRequest }) {
  const { sla } = transfer
  const paused = Boolean(sla.pausedReason)
  const posted = transfer.status === 'posted'
  const draft = transfer.status === 'draft'
  const hasExceptions = transfer.exceptions.length > 0

  // Breakdown (stage-weighted hours — illustrative)
  const breakdown = [
    { label: 'AI extraction & KYC', value: 'complete' as const },
    {
      label: 'Reviewer assessment',
      value: transfer.stage === 'reviewer' ? 'in progress' : ('complete' as const),
    },
    {
      label: 'Ledger posting',
      value: transfer.stage === 'posting' ? 'in progress' : transfer.stage === 'complete' ? 'complete' : ('pending' as const),
    },
  ]

  return (
    <Panel subtitle='Commitment to shareholder · based on current path' title='Turnaround'>
      {draft ? (
        <div className='flex items-center gap-2 text-[13px] text-ink-600'>
          <Icon className='text-ink-500' name='circle-dashed' size={14} />
          <span>SLA clock starts when you submit this request.</span>
        </div>
      ) : posted ? (
        <div className='flex items-center gap-2 text-[13px] text-positive-500'>
          <Icon name='check-circle' size={14} />
          <span>Posted to ledger · transfer is final.</span>
        </div>
      ) : (
        <>
          <div className='flex items-start gap-3'>
            <div className='flex h-11 w-11 items-center justify-center rounded-md bg-surface-sunken text-ink-700'>
              <Icon name='clock' size={16} />
            </div>
            <div className='min-w-0 flex-1'>
              <SlaCountdown dueAt={sla.dueAt} paused={paused} />
              <div className='mt-0.5 text-[11.5px] text-ink-500'>Committed by {fmtDue(sla.dueAt)}</div>
              <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                <Badge icon='circle-dot' tone={AGING_TONE[sla.agingState]}>
                  {AGING_LABEL[sla.agingState]}
                </Badge>
                {paused && (
                  <Badge icon='pause' tone='info'>
                    Paused · {sla.pausedReason}
                  </Badge>
                )}
                {hasExceptions && !paused && (
                  <Badge icon='alert-triangle' tone='warning'>
                    {transfer.exceptions.filter(e => e.blocking).length} blocker
                    {transfer.exceptions.filter(e => e.blocking).length === 1 ? '' : 's'} · extends ETA
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className='mt-4 flex flex-col gap-1.5 border-t border-line pt-3'>
            {breakdown.map(b => (
              <div className='flex items-center justify-between text-[12px]' key={b.label}>
                <span className='flex items-center gap-1.5 text-ink-600'>
                  <Icon
                    className={b.value === 'complete' ? 'text-positive-500' : b.value === 'in progress' ? 'text-brand-700' : 'text-ink-400'}
                    name={b.value === 'complete' ? 'check-circle' : b.value === 'in progress' ? 'circle-dot' : 'circle-dashed'}
                    size={11}
                  />
                  {b.label}
                </span>
                <span className='text-[11.5px] capitalize text-ink-500'>{b.value}</span>
              </div>
            ))}
          </div>

          <div className='mt-3 rounded-sm border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-ink-600'>
            <div className='mb-1 flex items-center gap-1.5 text-ink-500'>
              <Icon name='calendar-clock' size={11} />
              <span className='font-semibold uppercase tracking-[0.06em]'>Operating cutoffs</span>
            </div>
            <div className='flex items-center justify-between'>
              <span>Same-day ledger post</span>
              <span className='num text-ink-800'>
                <SlaCountdown compact dueAt={sameDayCutoff()} />
              </span>
            </div>
            {transfer.transferType === 'drs-to-broker' && (
              <div className='mt-0.5 flex items-center justify-between'>
                <span>DTC / DWAC instruction</span>
                <span className='num text-ink-800'>
                  <SlaCountdown compact dueAt={dwacCutoff()} />
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className='mt-3 grid grid-cols-2 gap-2 text-[11.5px] text-ink-500'>
        <div className='soft-box'>
          <div className='text-[11px] uppercase tracking-[0.08em]'>Submitted</div>
          <div className='num text-[12.5px] text-ink-800'>{fmtSubmitted(sla.submittedAt)}</div>
        </div>
        <div className='soft-box'>
          <div className='text-[11px] uppercase tracking-[0.08em]'>Committed SLA</div>
          <div className='num text-[12.5px] text-ink-800'>{sla.expectedTurnaroundHours}h business</div>
        </div>
      </div>
    </Panel>
  )
}
