import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui'
import type { TransferException } from '@/lib/transfer/types'

const SEVERITY_META: Record<
  TransferException['severity'],
  { bg: string; border: string; icon: string; iconBg: string; label: string; text: string }
> = {
  high: {
    bg: 'bg-danger-50',
    border: 'border-danger-100',
    icon: 'alert-triangle',
    iconBg: 'bg-danger-100 text-danger-700',
    label: 'High',
    text: 'text-danger-700',
  },
  low: {
    bg: 'bg-ink-50',
    border: 'border-line',
    icon: 'info',
    iconBg: 'bg-ink-100 text-ink-700',
    label: 'Low',
    text: 'text-ink-700',
  },
  medium: {
    bg: 'bg-warning-50',
    border: 'border-warning-100',
    icon: 'alert-triangle',
    iconBg: 'bg-warning-100 text-warning-700',
    label: 'Medium',
    text: 'text-warning-700',
  },
}

export function ExceptionBanner({ exceptions, title }: { exceptions: TransferException[]; title?: string }) {
  if (!exceptions.length) return null

  const blocking = exceptions.filter(e => e.blocking)
  const top = [...exceptions].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const
    return order[a.severity] - order[b.severity]
  })

  const headline =
    title ??
    (blocking.length
      ? `${blocking.length} blocking issue${blocking.length === 1 ? '' : 's'} — resolve before posting`
      : `${exceptions.length} item${exceptions.length === 1 ? '' : 's'} flagged for review`)

  const tone = blocking.length ? 'danger' : 'warning'

  return (
    <section
      className={`rounded-md border ${tone === 'danger' ? 'border-danger-100 bg-danger-50' : 'border-warning-100 bg-warning-50'} p-4`}
    >
      <header className='mb-3 flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full ${tone === 'danger' ? 'bg-danger-100 text-danger-700' : 'bg-warning-100 text-warning-700'}`}
          >
            <Icon name='alert-triangle' size={14} />
          </div>
          <span className={`text-[13px] font-semibold ${tone === 'danger' ? 'text-danger-700' : 'text-warning-700'}`}>{headline}</span>
        </div>
        <div className='flex items-center gap-1.5'>
          {blocking.length > 0 && <Badge tone='danger'>{blocking.length} blocking</Badge>}
          {exceptions.length - blocking.length > 0 && <Badge tone='warning'>{exceptions.length - blocking.length} review</Badge>}
        </div>
      </header>

      <ul className='grid grid-cols-1 gap-2 md:grid-cols-2'>
        {top.map(e => {
          const meta = SEVERITY_META[e.severity]
          return (
            <li className={`rounded-sm border ${meta.border} bg-white p-3`} key={e.id}>
              <div className='flex items-start gap-2.5'>
                <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${meta.iconBg}`}>
                  <Icon name={meta.icon} size={12} />
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <span className='text-[13px] font-semibold text-ink-900'>{e.title}</span>
                    <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${meta.text}`}>{e.code}</span>
                    {e.blocking && <Badge tone='danger'>Blocking</Badge>}
                  </div>
                  <div className='mt-1 text-[12px] text-ink-600'>{e.description}</div>
                  {e.suggestedAction && (
                    <div className='mt-1.5 flex items-start gap-1.5 text-[11.5px] text-ink-500'>
                      <Icon className='mt-[2px] text-brand-700' name='sparkles' size={11} />
                      <span>
                        <span className='font-semibold text-ink-700'>Proxi suggests:</span> {e.suggestedAction}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
