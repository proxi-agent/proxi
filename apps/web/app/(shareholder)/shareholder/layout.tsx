import type { ReactNode } from 'react'
import AppShell from '@/components/app-shell'
import AuthGuard from '@/components/auth-guard'
import RolePageDataPanel from '@/components/role-page-data-panel'

const navItems = [
  { href: '/shareholder', label: 'Dashboard' },
  { href: '/shareholder/holdings', label: 'Holdings' },
  { href: '/shareholder/profile', label: 'Profile' },
  { href: '/shareholder/transfers/new', label: 'New Transfer' },
]

export default function ShareholderLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard portal='shareholder'>
      <AppShell navItems={navItems} subtitle='Shareholder Portal' title='Proxi Shareholder'>
        <RolePageDataPanel />
        {children}
      </AppShell>
    </AuthGuard>
  )
}
