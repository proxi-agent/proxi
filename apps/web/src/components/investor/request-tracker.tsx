import Link from 'next/link'

import { Icon } from '@/components/icon'
import { StepProgress, type StepState } from '@/components/primitives'
import { Badge } from '@/components/ui'

export type RequestTrack = {
  currentStep: 'ai-review' | 'human-review' | 'ledger' | 'posted' | 'submitted'
  detail: string
  eta: string
  id: string
  notes?: string
  title: string
  urgency?: 'high' | 'low' | 'med'
}

const ORDER = ['submitted', 'ai-review', 'human-review', 'ledger', 'posted'] as const

const LABELS: Record<(typeof ORDER)[number], string> = {
  'ai-review': 'AI review',
  'human-review': 'Human review',
  ledger: 'Approved',
  posted: 'Posted',
  submitted: 'Submitted',
}

const DETAIL: Record<(typeof ORDER)[number], string> = {
  'ai-review': 'Extracting fields & checks',
  'human-review': 'Reviewer queue',
  ledger: 'Dual approval',
  posted: 'Ledger of record',
  submitted: 'Evidence received',
}

function stateForStep(step: (typeof ORDER)[number], currentIndex: number): StepState {
  const idx = ORDER.indexOf(step)
  if (idx < currentIndex) return 'done'
  if (idx === currentIndex) return 'current'
  return 'upcoming'
}

export function RequestTracker({ request }: { request: RequestTrack }) {
  const currentIdx = ORDER.indexOf(request.currentStep)
  const steps = ORDER.map(s => ({
    label: LABELS[s],
    state: stateForStep(s, currentIdx),
    value: DETAIL[s],
  }))

  return (
    <div className='soft-box'>
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <span className='mono text-[11.5px] text-ink-500'>{request.id}</span>
            {request.urgency === 'high' && (
              <Badge icon='alert-triangle' tone='warning'>
                Time-sensitive
              </Badge>
            )}
          </div>
          <div className='mt-0.5 text-[13.5px] font-semibold text-ink-900'>{request.title}</div>
          <div className='text-[12px] text-ink-500'>{request.detail}</div>
        </div>
        <div className='shrink-0 text-right'>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Est. turnaround</div>
          <div className='num text-[13.5px] font-semibold text-ink-900'>{request.eta}</div>
        </div>
      </div>

      <div className='mt-3'>
        <StepProgress steps={steps} />
      </div>

      {request.notes && (
        <div className='mt-3 flex items-start gap-2 text-[12px] text-ink-600'>
          <Icon className='mt-0.5 text-brand-700' name='sparkles' size={12} />
          <span>{request.notes}</span>
        </div>
      )}

      <div className='mt-3 flex items-center justify-between'>
        <Link className='btn btn-ghost btn-sm' href='/investor/transfer/new'>
          Open case
          <Icon name='arrow-right' size={12} />
        </Link>
        <span className='text-[11.5px] text-ink-500'>Updates every 5 min · notifications on</span>
      </div>
    </div>
  )
}
