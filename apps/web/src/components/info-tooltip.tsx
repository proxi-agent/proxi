import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'

/**
 * Lightweight tooltip that works with hover + keyboard focus.
 * Uses native `:focus-within` + `:hover` CSS so it remains functional without JS.
 * For screen readers, the tooltip content is rendered as aria-describedby text.
 */
export function InfoTooltip({
  children,
  className = '',
  icon = 'info',
  label,
  size = 13,
}: {
  children: ReactNode
  className?: string
  icon?: string
  label?: string
  size?: number
}) {
  const a11yLabel = label ?? (typeof children === 'string' ? children : 'More information')
  return (
    <span className={`info-tip ${className}`.trim()}>
      <button aria-label={a11yLabel} className='info-tip-trigger' tabIndex={0} type='button'>
        <Icon name={icon} size={size} />
      </button>
      <span className='info-tip-content' role='tooltip'>
        {children}
      </span>
    </span>
  )
}
