import { Icon } from '@/components/icon'
import { Badge, Panel } from '@/components/ui'
import type { MissingBlocker } from '@/lib/transfer/types'

type Item = MissingBlocker | string

function normalize(item: Item): MissingBlocker {
  return typeof item === 'string' ? { label: item, severity: 'medium' } : item
}

const SEVERITY_META: Record<
  MissingBlocker['severity'],
  {
    badge: 'danger' | 'info' | 'warning'
    bg: string
    border: string
    icon: string
    label: string
    text: string
  }
> = {
  high: {
    badge: 'danger',
    bg: 'bg-danger-50',
    border: 'border-danger-100',
    icon: 'alert-triangle',
    label: 'Blocking',
    text: 'text-danger-700',
  },
  low: {
    badge: 'info',
    bg: 'bg-ink-50',
    border: 'border-line',
    icon: 'info',
    label: 'Optional',
    text: 'text-ink-700',
  },
  medium: {
    badge: 'warning',
    bg: 'bg-warning-50',
    border: 'border-warning-100',
    icon: 'alert-triangle',
    label: 'Review',
    text: 'text-warning-700',
  },
}

export function MissingInfoCallout({
  items,
  primaryAction,
  subtitle,
  title = 'What we still need from you',
}: {
  items: Item[]
  primaryAction?: { href: string; label: string }
  subtitle?: string
  title?: string
}) {
  if (!items.length) {
    return (
      <Panel subtitle='Everything we need is on file' title='Nothing outstanding'>
        <div className='flex items-center gap-2 text-[12.5px] text-positive-500'>
          <Icon name='check-circle' size={14} />
          <span>Your transfer has all required information. No action needed from you.</span>
        </div>
      </Panel>
    )
  }

  const blockers = items.map(normalize)
  const blockingCount = blockers.filter(b => b.severity === 'high').length

  const effectiveSubtitle =
    subtitle ??
    (blockingCount > 0
      ? `${blockingCount} blocking item${blockingCount === 1 ? '' : 's'} — your SLA clock is paused until these arrive.`
      : 'Resolve these to let Proxi continue straight-through processing.')

  return (
    <Panel
      actions={
        primaryAction ? (
          <a className='btn btn-brand btn-sm' href={primaryAction.href}>
            <Icon name='arrow-right' size={13} />
            {primaryAction.label}
          </a>
        ) : undefined
      }
      subtitle={effectiveSubtitle}
      title={title}
    >
      <ul className='flex flex-col gap-2'>
        {blockers.map(b => {
          const meta = SEVERITY_META[b.severity]
          return (
            <li className={`rounded-sm border ${meta.border} ${meta.bg} p-3`} key={b.label}>
              <div className='flex items-start gap-2.5'>
                <Icon className={`mt-0.5 ${meta.text}`} name={meta.icon} size={13} />
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <span className='text-[13px] font-semibold text-ink-900'>{b.label}</span>
                    <Badge tone={meta.badge}>{meta.label}</Badge>
                  </div>
                  {b.howToFix && (
                    <div className='mt-1 text-[12px] text-ink-600'>
                      <span className='font-semibold text-ink-700'>How to fix:</span> {b.howToFix}
                    </div>
                  )}
                </div>
                {b.action && (
                  <a className='btn btn-secondary btn-sm shrink-0' href={b.action.href}>
                    {b.action.label}
                    <Icon name='arrow-right' size={12} />
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
