'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import {
  PORTAL_META,
  PORTAL_ORDER,
  PORTALS,
  type PortalId,
} from '@/lib/nav'

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
      <div className='nav-brand'>
        <div className='nav-brand-mark'>Px</div>
        <div className='flex flex-col leading-tight'>
          <span className='nav-brand-name'>Proxi</span>
          <span className='nav-brand-tag'>Transfer platform</span>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto py-2'>
        {config.sections.map((section) => (
          <div key={section.label}>
            <div className='nav-section'>{section.label}</div>
            <div className='nav-list'>
              {section.items.map((item) => {
                const active = isItemActive(pathname, item.href)
                return (
                  <Link
                    className={`nav-item ${active ? 'active' : ''}`}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon name={item.icon} size={15} />
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className='nav-item-badge'>{item.badge}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className='portal-switch'>
        <span className='portal-switch-label'>Switch portal</span>
        {PORTAL_ORDER.map((p) => {
          const href = p === 'investor' ? '/investor' : `/${p}`
          const active = portal === p
          return (
            <Link
              className={`portal-switch-item ${active ? 'active' : ''}`}
              href={href}
              key={p}
            >
              <span className={`portal-dot ${p}`} />
              <span>{PORTAL_META[p].name}</span>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}

function TopBar({
  breadcrumbs,
  portal,
}: {
  breadcrumbs?: Array<{ label: string; href?: string }>
  portal: PortalId
}) {
  const config = PORTALS[portal]
  return (
    <div className='app-topbar'>
      <div className='flex items-center gap-3 text-[12.5px] text-[color:var(--color-ink-500)]'>
        <span className='font-semibold text-[color:var(--color-ink-700)]'>
          {PORTAL_META[portal].name}
        </span>
        {breadcrumbs?.map((crumb, idx) => (
          <span className='flex items-center gap-3' key={`${crumb.label}-${idx}`}>
            <Icon name='chevron-right' size={13} />
            {crumb.href ? (
              <Link
                className='hover:text-[color:var(--color-ink-800)]'
                href={crumb.href}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className='text-[color:var(--color-ink-800)]'>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className='ml-auto flex items-center gap-3'>
        <div className='search w-[280px]'>
          <span className='search-icon'>
            <Icon name='search' size={14} />
          </span>
          <input
            className='input h-[32px]'
            placeholder='Search accounts, cases, CUSIP…'
          />
        </div>
        <button className='btn btn-secondary btn-sm' type='button'>
          <Icon name='sparkles' size={14} />
          Ask Proxi
          <span className='kbd ml-1'>⌘K</span>
        </button>
        <button className='btn btn-ghost btn-icon btn-sm' type='button'>
          <Icon name='inbox' size={15} />
        </button>
        <button className='btn btn-ghost btn-icon btn-sm' type='button'>
          <Icon name='settings' size={15} />
        </button>
        <div className='flex items-center gap-2 pl-2 border-l border-[color:var(--color-line)]'>
          <div
            aria-hidden
            className='flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-ink-900)] text-[11px] font-semibold text-white'
          >
            {config.user.initials}
          </div>
          <div className='hidden flex-col leading-tight md:flex'>
            <span className='text-[12.5px] font-semibold text-[color:var(--color-ink-900)]'>
              {config.user.name}
            </span>
            <span className='text-[11px] text-[color:var(--color-ink-500)]'>
              {config.role}
              {config.company ? ` · ${config.company}` : ''}
            </span>
          </div>
        </div>
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
