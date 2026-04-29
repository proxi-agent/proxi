import { Icon } from '@/components/icon'
import { formatDateTime } from '@/lib/dividends/copy'
import type { ShareholderPaymentEvent } from '@/lib/dividends/shareholder'

const STATE_TONE: Record<ShareholderPaymentEvent['state'], string> = {
  BLOCKED: 'border-danger-100 bg-danger-50 text-danger-700',
  DONE: 'border-positive-100 bg-positive-50 text-positive-700',
  IN_PROGRESS: 'border-brand-300 bg-brand-50 text-brand-700',
  PENDING: 'border-line bg-surface text-ink-400',
}

const STATE_ICON: Record<ShareholderPaymentEvent['state'], string> = {
  BLOCKED: 'lock',
  DONE: 'check-circle',
  IN_PROGRESS: 'circle-dot',
  PENDING: 'circle-dashed',
}

/** Vertical timeline of the lifecycle for one dividend, written in plain language. */
export function DividendPaymentTimeline({ events }: { events: ShareholderPaymentEvent[] }) {
  return (
    <ol className='flex flex-col'>
      {events.map((event, idx) => {
        const last = idx === events.length - 1
        return (
          <li className='flex gap-3' key={`${event.title}-${idx}`}>
            <div className='flex flex-col items-center'>
              <span
                aria-hidden
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${STATE_TONE[event.state]}`}
              >
                <Icon name={STATE_ICON[event.state]} size={13} />
              </span>
              {!last && <span aria-hidden className='my-1 w-px flex-1 bg-line' />}
            </div>
            <div className='mb-3 flex flex-1 flex-col pt-0.5'>
              <span className='text-[13.5px] font-semibold text-ink-900'>{event.title}</span>
              {event.detail && <span className='mt-0.5 text-[12.5px] text-ink-600'>{event.detail}</span>}
              <span className='mt-0.5 text-[11.5px] text-ink-500'>{event.at ? formatDateTime(event.at) : 'Pending'}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
