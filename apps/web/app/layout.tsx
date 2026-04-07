import type { Metadata } from 'next'
import Layout from '../components/Layout'
import '../styles/globals.css'

export const metadata: Metadata = {
  description:
    'Stock transfer agent workspace for case intake, ledger operations, reconciliation, and reporting.',
  title: {
    default: 'Proxi Transfer Console',
    template: '%s | Proxi Transfer Console',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
