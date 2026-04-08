import type { ReactNode } from 'react'
import AppShell from '@/components/app-shell'
import AuthGuard from '@/components/auth-guard'

const navItems = [
  { href: '/issuer', label: 'Dashboard' },
  { href: '/issuer/reports', label: 'Reports' },
  { href: '/issuer/settings', label: 'Settings' },
  { href: '/issuer/shareholders', label: 'Shareholders' },
  { href: '/issuer/transfers', label: 'Transfers' },
]

export default function IssuerLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard portal='issuer'>
      <AppShell navItems={navItems} subtitle='Issuer Portal' title='Proxi Issuer'>
        {children}
      </AppShell>
    </AuthGuard>
  )
}
