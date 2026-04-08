import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth/auth-context'
import '../styles/globals.css'

export const metadata: Metadata = {
  description: 'Role-based issuer, agent, and shareholder portals.',
  title: {
    default: 'Proxi Portals',
    template: '%s | Proxi Portals',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
