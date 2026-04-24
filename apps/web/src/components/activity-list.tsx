import type { ReactNode } from 'react'

export type ActivityTone = 'danger' | 'info' | 'neutral' | 'ok' | 'warn'

export type ActivityItem = {
  body?: ReactNode
  id: string
  meta?: ReactNode
  tone?: ActivityTone
  title: ReactNode
}

/** Semantic <ol> timeline. Tone drives the dot color. */
export function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <ol className='timeline' role='list'>
      {items.map(item => (
        <li className={`timeline-item ${item.tone && item.tone !== 'neutral' ? item.tone : ''}`} key={item.id}>
          {item.meta && <div className='timeline-meta'>{item.meta}</div>}
          <div className='timeline-title'>{item.title}</div>
          {item.body && <div className='timeline-body'>{item.body}</div>}
        </li>
      ))}
    </ol>
  )
}
