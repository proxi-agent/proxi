import type { ReactNode } from 'react'

export function SectionHeader({
  actions,
  as = 'h2',
  subtitle,
  title,
}: {
  actions?: ReactNode
  as?: 'h2' | 'h3' | 'h4'
  subtitle?: ReactNode
  title: ReactNode
}) {
  const Heading = as
  return (
    <div className='section-header'>
      <div>
        <Heading className='section-header-title'>{title}</Heading>
        {subtitle && <div className='section-header-subtitle'>{subtitle}</div>}
      </div>
      {actions && <div className='flex items-center gap-2'>{actions}</div>}
    </div>
  )
}
