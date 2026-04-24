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
    <aside aria-label={`${PORTAL_META[portal].name} navigation`} className='app-sidebar'>
      <Link className='nav-brand transition-colors hover:bg-surface-2' href='/'>
        <div aria-hidden className='nav-brand-mark'>
          Px
        </div>
        <div className='flex min-w-0 flex-col leading-tight'>
          <span className='nav-brand-name'>Proxi</span>
          <span className='nav-brand-tag'>Transfer Platform</span>
        </div>
      </Link>

      <nav aria-label='Primary' className='flex-1 overflow-y-auto py-2'>
        {config.sections.map(section => (
          <div key={section.label}>
            <h2 className='nav-section'>{section.label}</h2>
            <div className='nav-list' role='list'>
              {section.items.map(item => {
                const active = isItemActive(pathname, item.href)
                return (
                  <Link
                    aria-current={active ? 'page' : undefined}
                    className={`nav-item ${active ? 'active' : ''}`}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon aria-hidden name={item.icon} size={15} />
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span aria-label={`${item.badge} items`} className='nav-item-badge'>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div aria-label='Portal switcher' className='portal-switch' role='group'>
        <span className='portal-switch-label' id={`portal-switch-${portal}`}>
          Switch portal
        </span>
        {PORTAL_ORDER.map(p => {
          const href = p === 'investor' ? '/investor' : `/${p}`
          const active = portal === p
          return (
            <Link
              aria-current={active ? 'true' : undefined}
              className={`portal-switch-item ${active ? 'active' : ''}`}
              href={href}
              key={p}
            >
              <span aria-hidden className={`portal-dot ${p}`} />
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
  const hasCrumbs = Boolean(breadcrumbs?.length)
  return (
    <div className='app-topbar'>
      <nav aria-label='Breadcrumb' className='flex items-center gap-2.5 text-[12.5px] text-ink-500'>
        <span aria-hidden className={`portal-dot ${portal}`} />
        <span className='font-semibold text-ink-800'>{PORTAL_META[portal].name}</span>
        {hasCrumbs && (
          <ol className='flex items-center gap-2.5' role='list'>
            {breadcrumbs!.map((crumb, idx) => (
              <li className='flex items-center gap-2.5' key={`${crumb.label}-${idx}`}>
                <Icon aria-hidden className='text-ink-300' name='chevron-right' size={12} />
                {crumb.href ? (
                  <Link className='text-ink-500 transition-colors hover:text-ink-800' href={crumb.href}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current='page' className='font-medium text-ink-800'>
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </nav>

      <div className='ml-auto flex items-center gap-2'>
        <div className='search w-[300px]'>
          <span aria-hidden className='search-icon'>
            <Icon name='search' size={14} />
          </span>
          <label className='sr-only' htmlFor='global-search'>
            Search
          </label>
          <input
            autoComplete='off'
            className='input h-[32px]'
            id='global-search'
            placeholder='Search holders, cases, CUSIP, CIK…'
            type='search'
          />
          <span
            aria-hidden
            className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10.5px] uppercase tracking-wider text-ink-400'
            style={{ letterSpacing: '0.04em' }}
          >
            ⌘K
          </span>
        </div>
        <button className='btn btn-secondary btn-sm' type='button'>
          <Icon aria-hidden name='sparkles' size={14} />
          Ask Proxi
        </button>
        <div aria-hidden className='divider-vert mx-1' />
        <button aria-label='Inbox · 1 unread' className='btn btn-ghost btn-icon btn-sm relative' type='button'>
          <Icon aria-hidden name='inbox' size={15} />
          <span aria-hidden className='absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-surface' />
        </button>
        <button aria-label='Settings' className='btn btn-ghost btn-icon btn-sm' type='button'>
          <Icon aria-hidden name='settings' size={15} />
        </button>
        <button
          aria-label={`Account menu for ${config.user.name}`}
          className='ml-1 flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-surface-sunken'
          type='button'
        >
          <span
            aria-hidden
            className='flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/10'
          >
            {config.user.initials}
          </span>
          <span className='hidden flex-col leading-tight md:flex'>
            <span className='text-left text-[12.5px] font-semibold text-ink-900'>{config.user.name}</span>
            <span className='text-left text-[11px] text-ink-500'>
              {config.role}
              {config.company ? ` · ${config.company}` : ''}
            </span>
          </span>
          <Icon aria-hidden className='hidden text-ink-400 md:block' name='chevron-down' size={12} />
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
      <a className='skip-link' href='#main'>
        Skip to main content
      </a>
      <NavSidebar portal={portal} />
      <div className='app-main'>
        <TopBar breadcrumbs={breadcrumbs} portal={portal} />
        <main className='app-content' id='main' tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
