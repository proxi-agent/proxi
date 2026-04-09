import '../styles/globals.css'

import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { AuthProvider } from '@/lib/auth/auth-context'

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
        <ClerkProvider>
          <AuthProvider>{children}</AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
