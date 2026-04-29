import { formatDateTime } from '@/lib/dividends/copy'
import type { DividendAuditEvent } from '@/lib/dividends/types'

const ACTION_TONE: Record<string, 'danger' | 'info' | 'ok' | 'warn'> = {
  DIVIDEND_APPROVED: 'ok',
  DIVIDEND_ARCHIVED: 'ok',
  DIVIDEND_CALCULATED: 'info',
  DIVIDEND_CANCELLED: 'danger',
  DIVIDEND_CHANGES_REQUESTED: 'warn',
  DIVIDEND_COMMUNICATION_APPROVED: 'ok',
  DIVIDEND_DRAFTED: 'info',
  DIVIDEND_ELIGIBILITY_LOCKED: 'info',
  DIVIDEND_PAYMENT_FAILED: 'danger',
  DIVIDEND_RECONCILED: 'ok',
  DIVIDEND_REJECTED: 'danger',
  DIVIDEND_SUBMITTED: 'info',
}

export function DividendAuditTimeline({ events }: { events: DividendAuditEvent[] }) {
  if (events.length === 0) {
    return <div className='empty-title text-center'>No audit events yet</div>
  }
  return (
    <ol className='timeline'>
      {events.map(ev => {
        const tone = ACTION_TONE[ev.action] ?? 'info'
        return (
          <li className={`timeline-item ${tone}`} key={ev.id}>
            <div className='timeline-meta'>{formatDateTime(ev.at)}</div>
            <div className='timeline-title'>{humanize(ev.action)}</div>
            <div className='timeline-body'>
              <span className='font-medium text-ink-800'>{ev.actor}</span>
              {ev.actorRole ? <span className='text-ink-500'> · {ev.actorRole}</span> : null}
              {ev.detail ? ` — ${ev.detail}` : ''}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function humanize(action: string): string {
  return action
    .replace(/^DIVIDEND_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
