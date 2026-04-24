import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'

export type CalloutTone = 'brand' | 'danger' | 'info' | 'neutral' | 'positive' | 'warning'

const DEFAULT_ICON: Record<CalloutTone, string> = {
  brand: 'sparkles',
  danger: 'alert-triangle',
  info: 'info',
  neutral: 'info',
  positive: 'check-circle',
  warning: 'alert-triangle',
}

export function Callout({
  actions,
  children,
  icon,
  role,
  title,
  tone = 'neutral',
}: {
  actions?: ReactNode
  children?: ReactNode
  icon?: false | string
  /** Override ARIA role. Defaults to "status" for informational tones, "alert" for danger/warning. */
  role?: 'alert' | 'none' | 'status'
  title?: ReactNode
  tone?: CalloutTone
}) {
  const iconName = icon === false ? null : (icon ?? DEFAULT_ICON[tone])
  const className = `callout ${tone === 'neutral' ? '' : `callout-${tone}`}`.trim()
  const resolvedRole = role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'status')
  return (
    <div className={className} role={resolvedRole === 'none' ? undefined : resolvedRole}>
      {iconName && (
        <span aria-hidden className='callout-icon'>
          <Icon name={iconName} size={14} />
        </span>
      )}
      <div className='callout-body'>
        {title && <div className='callout-title'>{title}</div>}
        {children && <div className='callout-text'>{children}</div>}
      </div>
      {actions && <div className='callout-actions'>{actions}</div>}
    </div>
  )
}
