import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'

export type StatusTone = 'accent' | 'brand' | 'danger' | 'info' | 'neutral' | 'positive' | 'violet' | 'warning'

export function Badge({
  children,
  dot,
  icon,
  outline,
  tone = 'neutral',
}: {
  children: ReactNode
  dot?: boolean
  icon?: string
  outline?: boolean
  tone?: StatusTone
}) {
  return (
    <span className={`badge ${outline ? 'badge-outline' : `badge-${tone}`}`}>
      {dot && <span className='badge-dot' />}
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  )
}

export function StatusPill({
  status,
}: {
  status:
    | 'approved'
    | 'blocked'
    | 'completed'
    | 'draft'
    | 'escalated'
    | 'failed'
    | 'in review'
    | 'pending'
    | 'ready'
    | 'rejected'
    | 'straight-through'
}) {
  const map: Record<string, { icon: string; tone: StatusTone }> = {
    approved: { icon: 'check-circle', tone: 'positive' },
    blocked: { icon: 'lock', tone: 'danger' },
    completed: { icon: 'check-circle', tone: 'positive' },
    draft: { icon: 'pencil', tone: 'neutral' },
    escalated: { icon: 'alert-triangle', tone: 'warning' },
    failed: { icon: 'x', tone: 'danger' },
    'in review': { icon: 'scan-search', tone: 'info' },
    pending: { icon: 'clock', tone: 'warning' },
    ready: { icon: 'circle-dot', tone: 'brand' },
    rejected: { icon: 'x', tone: 'danger' },
    'straight-through': { icon: 'sparkles', tone: 'brand' },
  }
  const meta = map[status] ?? { icon: 'circle-dot', tone: 'neutral' as const }
  return (
    <Badge icon={meta.icon} tone={meta.tone}>
      <span className='capitalize'>{status}</span>
    </Badge>
  )
}

export function Confidence({ value }: { value: number }) {
  const level: 'high' | 'low' | 'med' = value >= 85 ? 'high' : value >= 65 ? 'med' : 'low'
  return (
    <span className='confidence'>
      <span className='confidence-bar'>
        <span
          className={`confidence-fill ${level}`}
          style={{ transition: 'width 300ms ease', width: `${Math.min(100, Math.max(4, value))}%` }}
        />
      </span>
      <span className='num font-semibold text-ink-800'>{value}%</span>
    </span>
  )
}

export function Panel({
  actions,
  children,
  footer,
  padded = true,
  subtitle,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  padded?: boolean
  subtitle?: string
  title?: string
}) {
  return (
    <section className='panel'>
      {(title || actions) && (
        <header className='panel-header'>
          <div>
            {title && <div className='panel-title'>{title}</div>}
            {subtitle && <div className='panel-subtitle'>{subtitle}</div>}
          </div>
          {actions && <div className='flex items-center gap-2'>{actions}</div>}
        </header>
      )}
      {padded ? <div className='panel-body'>{children}</div> : children}
      {footer && <footer className='panel-footer'>{footer}</footer>}
    </section>
  )
}

export function Metric({
  delta,
  helper,
  label,
  trend,
  value,
}: {
  delta?: string
  helper?: string
  label: string
  trend?: 'down' | 'flat' | 'up'
  value: string
}) {
  return (
    <div className='metric'>
      <span className='metric-label'>{label}</span>
      <span className='metric-value'>{value}</span>
      {(delta || helper) && (
        <span className='metric-help'>
          {delta && (
            <span
              className={
                trend === 'up'
                  ? 'trend-up inline-flex items-center gap-1'
                  : trend === 'down'
                    ? 'trend-down inline-flex items-center gap-1'
                    : 'inline-flex items-center gap-1'
              }
            >
              {trend === 'up' && <Icon name='trending-up' size={12} />}
              {trend === 'down' && <Icon name='trending-down' size={12} />}
              {trend === 'flat' && <span aria-hidden className='h-[1.5px] w-2.5 rounded-full bg-ink-300' />}
              <span className='num font-semibold'>{delta}</span>
            </span>
          )}
          {delta && helper && <span className='text-ink-300'>·</span>}
          {helper && <span>{helper}</span>}
        </span>
      )}
    </div>
  )
}

export function PageHeader({
  actions,
  breadcrumb,
  eyebrow,
  subtitle,
  title,
}: {
  actions?: ReactNode
  breadcrumb?: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  title: string
}) {
  return (
    <header className='page-header'>
      <div>
        {breadcrumb}
        {eyebrow && (typeof eyebrow === 'string' ? <div className='page-eyebrow'>{eyebrow}</div> : <div className='mb-1'>{eyebrow}</div>)}
        <h1 className='page-title'>{title}</h1>
        {subtitle && <p className='page-subtitle'>{subtitle}</p>}
      </div>
      {actions && <div className='page-actions'>{actions}</div>}
    </header>
  )
}

export function Tabs({ items, value }: { items: Array<{ count?: number | string; id: string; label: string }>; value: string }) {
  return (
    <div className='tabs'>
      {items.map(tab => (
        <div className={`tab ${tab.id === value ? 'active' : ''}`} key={tab.id}>
          {tab.label}
          {tab.count !== undefined && <span className='tab-count num'>{tab.count}</span>}
        </div>
      ))}
    </div>
  )
}

export function Chip({ active, children, count, icon }: { active?: boolean; children: ReactNode; count?: number; icon?: string }) {
  return (
    <span className={`chip ${active ? 'active' : ''}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
      {count !== undefined && <span className='num'>· {count}</span>}
    </span>
  )
}

export function EmptyState({
  action,
  children,
  icon = 'inbox',
  title,
}: {
  action?: ReactNode
  children?: ReactNode
  icon?: string
  title: string
}) {
  return (
    <div className='empty'>
      <div
        aria-hidden
        className='mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-400 shadow-xs'
      >
        <Icon name={icon} size={18} />
      </div>
      <div className='empty-title'>{title}</div>
      {children && <div className='mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-500'>{children}</div>}
      {action && <div className='mt-4 flex justify-center'>{action}</div>}
    </div>
  )
}

export function ErrorState({
  action,
  children,
  icon = 'alert-triangle',
  title,
}: {
  action?: ReactNode
  children?: ReactNode
  icon?: string
  title: string
}) {
  return (
    <div className='empty' role='alert'>
      <div
        aria-hidden
        className='mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-danger-100 bg-danger-50 text-danger-700 shadow-xs'
      >
        <Icon name={icon} size={18} />
      </div>
      <div className='empty-title'>{title}</div>
      {children && <div className='mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-500'>{children}</div>}
      {action && <div className='mt-4 flex justify-center'>{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className='kbd'>{children}</span>
}

export function Avatar({
  name,
  size = 28,
  tone = 'neutral',
}: {
  name: string
  size?: number
  tone?: 'brand' | 'ink' | 'neutral' | 'violet'
}) {
  const initials = name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const bg: Record<string, string> = {
    brand: 'var(--color-brand-700)',
    ink: 'var(--color-ink-900)',
    neutral: 'var(--color-ink-200)',
    violet: 'var(--color-violet-500)',
  }
  const color = tone === 'neutral' ? 'var(--color-ink-800)' : 'white'
  return (
    <span
      aria-hidden
      className='inline-flex shrink-0 items-center justify-center rounded-full font-semibold'
      style={{
        background: bg[tone],
        color,
        fontSize: Math.max(10, size * 0.4),
        height: size,
        width: size,
      }}
    >
      {initials}
    </span>
  )
}
