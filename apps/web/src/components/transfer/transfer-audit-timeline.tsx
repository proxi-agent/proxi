import { Icon } from '@/components/icon'
import { Panel } from '@/components/ui'
import type { AuditActor, AuditEvent } from '@/lib/transfer/types'

const ACTOR_META: Record<AuditActor, { color: string; icon: string; label: string }> = {
  compliance: { color: 'text-violet-500', icon: 'shield', label: 'Compliance' },
  issuer: { color: 'text-ink-700', icon: 'building', label: 'Issuer' },
  'proxi-ai': { color: 'text-brand-700', icon: 'sparkles', label: 'Proxi AI' },
  reviewer: { color: 'text-ink-900', icon: 'user-round', label: 'Reviewer' },
  shareholder: { color: 'text-ink-700', icon: 'users', label: 'Shareholder' },
  system: { color: 'text-ink-500', icon: 'settings', label: 'System' },
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function fmtDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function TransferAuditTimeline({
  events,
  subtitle = 'Immutable, timestamped record of every action on this case',
  title = 'Audit trail',
}: {
  events: AuditEvent[]
  subtitle?: string
  title?: string
}) {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? 1 : -1))

  const groups = new Map<string, { label: string; events: AuditEvent[] }>()
  for (const e of sorted) {
    const key = dayKey(e.at)
    const existing = groups.get(key)
    if (existing) {
      existing.events.push(e)
    } else {
      groups.set(key, { events: [e], label: fmtDay(e.at) })
    }
  }

  return (
    <Panel padded={false} subtitle={subtitle} title={title}>
      <div className='flex flex-col'>
        {[...groups.entries()].map(([key, group]) => (
          <div key={key}>
            <div className='sticky top-0 z-10 border-t border-b border-line bg-surface-2 px-4 py-1.5'>
              <span className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>{group.label}</span>
              <span className='ml-1 text-[11px] text-ink-400'>
                · {group.events.length} event{group.events.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className='divide-y divide-line'>
              {group.events.map(e => {
                const actor = ACTOR_META[e.actor]
                const toneLine =
                  e.tone === 'danger'
                    ? 'bg-danger-500'
                    : e.tone === 'warn'
                      ? 'bg-warning-500'
                      : e.tone === 'ok'
                        ? 'bg-positive-500'
                        : 'bg-ink-300'
                return (
                  <li className='flex items-start gap-3 px-4 py-3' key={e.id}>
                    <div className='relative flex flex-col items-center'>
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-surface-sunken ${actor.color}`}>
                        <Icon name={actor.icon} size={11} />
                      </div>
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full ${toneLine}`} />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center justify-between gap-2'>
                        <div className='text-[13px] font-semibold text-ink-900'>{e.title}</div>
                        <div className='num text-[11px] text-ink-500'>{fmtTime(e.at)}</div>
                      </div>
                      <div className='text-[11.5px] text-ink-500'>
                        <span className={actor.color}>{actor.label}</span>
                        <span> · {e.actorName}</span>
                      </div>
                      {e.detail && <div className='mt-1 text-[12.5px] text-ink-600'>{e.detail}</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  )
}
