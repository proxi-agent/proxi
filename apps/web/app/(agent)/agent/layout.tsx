import type { ReactNode } from 'react'
import AppShell from '@/components/app-shell'
import AuthGuard from '@/components/auth-guard'
import RolePageDataPanel from '@/components/role-page-data-panel'

const navItems = [
  { href: '/agent', label: 'Dashboard' },
  { href: '/agent/admin', label: 'Admin' },
  { href: '/agent/issuers', label: 'Issuers' },
  { href: '/agent/queue', label: 'Queue' },
  { href: '/agent/reports', label: 'Reports' },
  { href: '/agent/transfers', label: 'Transfers' },
  { href: '/agent/users', label: 'Users' },
]

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard portal='agent'>
      <AppShell navItems={navItems} subtitle='Agent Portal' title='Proxi Agent Console'>
        <RolePageDataPanel />
        {children}
      </AppShell>
    </AuthGuard>
  )
}
