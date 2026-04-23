'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { PORTAL_META, PORTAL_ORDER, type PortalId, PORTALS } from '@/lib/nav'

function isItemActive(pathname: string, href: string): boolean {
  if (href === pathname) return true
  if (href === '/' || href.split('/').length <= 2) {
    return pathname === href
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavSidebar({ portal }: { portal: PortalId }) {
  const pathname = usePathname() ?? ''
  const config = PORTALS[portal]

  return (
    <aside className='app-sidebar'>
      <Link className='nav-brand transition-colors hover:bg-surface-2' href='/'>
        <div className='nav-brand-mark'>Px</div>
        <div className='flex min-w-0 flex-col leading-tight'>
          <span className='nav-brand-name'>Proxi</span>
          <span className='nav-brand-tag'>Transfer Platform</span>
        </div>
      </Link>

      <div className='flex-1 overflow-y-auto py-2'>
        {config.sections.map(section => (
          <div key={section.label}>
            <div className='nav-section'>{section.label}</div>
            <div className='nav-list'>
              {section.items.map(item => {
                const active = isItemActive(pathname, item.href)
                return (
                  <Link className={`nav-item ${active ? 'active' : ''}`} href={item.href} key={item.href}>
                    <Icon name={item.icon} size={15} />
                    <span>{item.label}</span>
                    {item.badge !== undefined && <span className='nav-item-badge'>{item.badge}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className='portal-switch'>
        <span className='portal-switch-label'>Switch portal</span>
        {PORTAL_ORDER.map(p => {
          const href = p === 'investor' ? '/investor' : `/${p}`
          const active = portal === p
          return (
            <Link className={`portal-switch-item ${active ? 'active' : ''}`} href={href} key={p}>
              <span className={`portal-dot ${p}`} />
              <span>{PORTAL_META[p].name}</span>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}

function TopBar({ breadcrumbs, portal }: { breadcrumbs?: Array<{ label: string; href?: string }>; portal: PortalId }) {
  const config = PORTALS[portal]
  return (
    <div className='app-topbar'>
      <div className='flex items-center gap-2.5 text-[12.5px] text-ink-500'>
        <span className={`portal-dot ${portal}`} />
        <span className='font-semibold text-ink-800'>{PORTAL_META[portal].name}</span>
        {breadcrumbs?.map((crumb, idx) => (
          <span className='flex items-center gap-2.5' key={`${crumb.label}-${idx}`}>
            <Icon className='text-ink-300' name='chevron-right' size={12} />
            {crumb.href ? (
              <Link className='text-ink-500 transition-colors hover:text-ink-800' href={crumb.href}>
                {crumb.label}
              </Link>
            ) : (
              <span className='font-medium text-ink-800'>{crumb.label}</span>
            )}
          </span>
        ))}
      </div>

      <div className='ml-auto flex items-center gap-2'>
        <div className='search w-[300px]'>
          <span className='search-icon'>
            <Icon name='search' size={14} />
          </span>
          <input className='input h-[32px]' placeholder='Search holders, cases, CUSIP, CIK…' />
          <span
            className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-mono uppercase tracking-wider text-ink-400'
            style={{ letterSpacing: '0.04em' }}
          >
            ⌘K
          </span>
        </div>
        <button className='btn btn-secondary btn-sm' type='button'>
          <Icon name='sparkles' size={14} />
          Ask Proxi
        </button>
        <div className='divider-vert mx-1' />
        <button aria-label='Inbox' className='btn btn-ghost btn-icon btn-sm relative' type='button'>
          <Icon name='inbox' size={15} />
          <span aria-hidden className='absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-surface' />
        </button>
        <button aria-label='Settings' className='btn btn-ghost btn-icon btn-sm' type='button'>
          <Icon name='settings' size={15} />
        </button>
        <button
          className='ml-1 flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-surface-sunken'
          type='button'
        >
          <div
            aria-hidden
            className='flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/10'
          >
            {config.user.initials}
          </div>
          <div className='hidden flex-col leading-tight md:flex'>
            <span className='text-left text-[12.5px] font-semibold text-ink-900'>{config.user.name}</span>
            <span className='text-left text-[11px] text-ink-500'>
              {config.role}
              {config.company ? ` · ${config.company}` : ''}
            </span>
          </div>
          <Icon className='hidden text-ink-400 md:block' name='chevron-right' size={12} />
        </button>
      </div>
    </div>
  )
}

export function AppShell({
  breadcrumbs,
  children,
  portal,
}: {
  breadcrumbs?: Array<{ label: string; href?: string }>
  children: ReactNode
  portal: PortalId
}) {
  return (
    <div className='app-shell'>
      <NavSidebar portal={portal} />
      <div className='app-main'>
        <TopBar breadcrumbs={breadcrumbs} portal={portal} />
        <div className='app-content'>{children}</div>
      </div>
    </div>
  )
}
