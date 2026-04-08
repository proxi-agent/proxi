'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import RoleSwitcher from './role-switcher'

type NavItem = { href: string; label: string }

export default function AppShell({
  children,
  navItems,
  subtitle,
  title,
}: {
  children: ReactNode
  navItems: NavItem[]
  subtitle: string
  title: string
}) {
  const pathname = usePathname()
  const { logout, user } = useAuth()

  return (
    <div className='grid min-h-screen grid-cols-1 bg-[radial-gradient(circle_at_top_right,#dbe9ff_0%,#f2f5fb_45%)] text-slate-900 lg:grid-cols-[260px_1fr]'>
      <aside className='flex flex-col gap-6 bg-[#0d1b37] px-5 py-8 text-slate-200'>
        <div className='border-b border-white/20 pb-4'>
          <p className='text-xs font-bold uppercase tracking-[0.08em] text-blue-200'>{subtitle}</p>
          <h1 className='mt-1 text-xl text-white'>{title}</h1>
        </div>
        <nav aria-label='Portal navigation' className='flex flex-col gap-2'>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                pathname === item.href ? 'bg-blue-50 text-[#102751]' : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className='flex min-w-0 flex-col'>
        <header className='flex flex-col gap-3 border-b border-slate-200 bg-white/75 px-8 py-4 backdrop-blur md:flex-row md:items-center md:justify-between'>
          <div>
            <p className='text-base font-semibold'>{user?.name || 'Signed out'}</p>
            <p className='mt-0.5 text-sm text-slate-500'>{user?.email || 'No active user session'}</p>
          </div>
          <div className='flex items-center gap-3'>
            <RoleSwitcher />
            <button className='rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700' onClick={logout} type='button'>
              Sign out
            </button>
          </div>
        </header>
        <main className='mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:pb-10'>{children}</main>
      </div>
    </div>
  )
}
