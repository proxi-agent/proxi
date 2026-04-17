'use client'

import { useState } from 'react'

import { Icon } from '@/components/icon'
import { Avatar, Badge, type StatusTone } from '@/components/ui'

type Channel = 'draft' | 'email' | 'notice' | 'proxi' | 'system'

type InboxItem = {
  channel: Channel
  from: string
  id: string
  kind: 'communication' | 'draft' | 'notification' | 'update'
  preview: string
  tag: string
  time: string
  tone: StatusTone
  unread: boolean
}

const items: InboxItem[] = [
  {
    channel: 'email',
    from: 'Meridian Optics, Inc.',
    id: 'c1',
    kind: 'update',
    preview: 'Your Q4 2025 cash dividend of $0.18/share will be deposited on Jan 24. DRIP participation is currently on.',
    tag: 'Dividend update',
    time: '2h',
    tone: 'info',
    unread: true,
  },
  {
    channel: 'proxi',
    from: 'Proxi Assistant',
    id: 'c2',
    kind: 'notification',
    preview: 'Action required — upload a W-9 to continue your transfer to Fidelity (case TR-120458).',
    tag: 'Action needed',
    time: '4h',
    tone: 'warning',
    unread: true,
  },
  {
    channel: 'notice',
    from: 'Halcyon Industrial Co.',
    id: 'c3',
    kind: 'communication',
    preview: '2026 annual meeting proxy is open. Cast your vote by Mar 12 · 5 proposals.',
    tag: 'Proxy · ballot open',
    time: '1d',
    tone: 'violet',
    unread: true,
  },
  {
    channel: 'draft',
    from: 'You',
    id: 'c4',
    kind: 'draft',
    preview: 'Re: Cost basis adjustment for Teagan Biosciences ESPP lot #3 — drafted but not sent.',
    tag: 'Draft',
    time: 'Yesterday',
    tone: 'neutral',
    unread: false,
  },
  {
    channel: 'system',
    from: 'Proxi Operations',
    id: 'c5',
    kind: 'notification',
    preview: 'Your address change has been verified and applied to all 4 issuer ledgers.',
    tag: 'Account',
    time: '3d',
    tone: 'neutral',
    unread: false,
  },
  {
    channel: 'email',
    from: 'Ridgefield Energy Holdings',
    id: 'c6',
    kind: 'communication',
    preview: 'Lock-up release schedule updated: 2,500 sh unlock on Mar 19, 2026.',
    tag: 'Corporate action',
    time: '5d',
    tone: 'brand',
    unread: false,
  },
]

const channelIcon: Record<Channel, { icon: string; label: string }> = {
  draft: { icon: 'pencil', label: 'Draft' },
  email: { icon: 'mail', label: 'Email' },
  notice: { icon: 'file-text', label: 'Notice' },
  proxi: { icon: 'sparkles', label: 'Proxi' },
  system: { icon: 'shield-check', label: 'System' },
}

const filters = [
  { id: 'all', label: 'All', match: () => true },
  {
    id: 'communications',
    label: 'Communications',
    match: (i: InboxItem) => i.kind === 'communication' || i.kind === 'update',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    match: (i: InboxItem) => i.kind === 'notification',
  },
  {
    id: 'drafts',
    label: 'Drafts',
    match: (i: InboxItem) => i.kind === 'draft',
  },
] as const

export function InboxTabs() {
  const [active, setActive] = useState<(typeof filters)[number]['id']>('all')
  const activeFilter = filters.find(f => f.id === active)!
  const visible = items.filter(activeFilter.match)

  return (
    <div>
      <div className='px-1'>
        <div
          className='tabs'
          onClick={e => {
            const target = (e.target as HTMLElement).closest('[data-tab]')
            if (target) {
              setActive(target.getAttribute('data-tab') as (typeof filters)[number]['id'])
            }
          }}
          role='tablist'
        >
          {filters.map(f => (
            <div className={`tab ${active === f.id ? 'active' : ''}`} data-tab={f.id} key={f.id} role='tab'>
              {f.label}
              <span className='tab-count num'>{items.filter(f.match).length}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className='mt-2 flex flex-col divide-y divide-line'>
        {visible.map(m => (
          <li
            className={`flex items-start gap-3 px-1 py-3 cursor-pointer rounded-sm hover:bg-surface-2 ${m.unread ? '' : 'opacity-85'}`}
            key={m.id}
          >
            <Avatar name={m.from} size={30} tone={m.channel === 'proxi' ? 'brand' : 'neutral'} />
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-[13px] font-semibold text-ink-900'>{m.from}</span>
                <Badge tone={m.tone}>{m.tag}</Badge>
                <span className='channel-pill'>
                  <Icon name={channelIcon[m.channel].icon} size={11} />
                  {channelIcon[m.channel].label}
                </span>
                {m.unread && <span className='h-1.5 w-1.5 rounded-full bg-brand-500' />}
                <span className='ml-auto shrink-0 text-[11.5px] text-ink-500'>{m.time}</span>
              </div>
              <p className='mt-1 line-clamp-2 text-[12.5px] text-ink-600'>{m.preview}</p>
              {m.kind === 'draft' && (
                <div className='mt-2 flex items-center gap-2'>
                  <button className='btn btn-secondary btn-sm' type='button'>
                    <Icon name='pencil' size={12} />
                    Resume draft
                  </button>
                  <button className='btn btn-ghost btn-sm' type='button'>
                    Discard
                  </button>
                </div>
              )}
              {m.kind === 'notification' && m.tone === 'warning' && (
                <div className='mt-2'>
                  <button className='btn btn-brand btn-sm' type='button'>
                    Take action
                    <Icon name='arrow-right' size={12} />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
