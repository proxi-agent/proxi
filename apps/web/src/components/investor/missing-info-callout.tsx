import Link from 'next/link'

import { Callout } from '@/components/callout'
import { Icon } from '@/components/icon'
import type { ShareholderMissingInfo } from '@/lib/dividends/shareholder'

const TONE: Record<ShareholderMissingInfo['severity'], 'danger' | 'info' | 'warning'> = {
  high: 'danger',
  low: 'info',
  medium: 'warning',
}

/** Reassuring "what's missing and how to fix it" callout for shareholders. */
export function MissingInfoList({ items }: { items: ShareholderMissingInfo[] }) {
  if (items.length === 0) return null
  return (
    <div className='flex flex-col gap-2'>
      {items.map(item => (
        <Callout
          actions={
            item.cta ? (
              <Link className='btn btn-secondary btn-sm' href={item.cta.href}>
                {item.cta.label}
                <Icon name='arrow-right' size={12} />
              </Link>
            ) : undefined
          }
          key={item.id}
          title={item.title}
          tone={TONE[item.severity]}
        >
          {item.detail}
          {item.fixHowTo && <span className='ml-1 text-ink-500'>· {item.fixHowTo}</span>}
        </Callout>
      ))}
    </div>
  )
}
