import '../styles/globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  description: 'Modern, AI-native stock transfer agency. Auditable, immutable shareholder infrastructure.',
  title: {
    default: 'Proxi · Transfer Agency Platform',
    template: '%s · Proxi',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  )
}
