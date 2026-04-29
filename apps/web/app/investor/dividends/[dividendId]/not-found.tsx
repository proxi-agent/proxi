import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { EmptyState, PageHeader } from '@/components/ui'

export default function DividendNotFound() {
  return (
    <AppShell
      breadcrumbs={[{ href: '/investor', label: 'Investor' }, { href: '/investor/dividends', label: 'Dividends' }, { label: 'Not found' }]}
      portal='investor'
    >
      <PageHeader eyebrow='Dividend not available' subtitle='You can only see dividends paid to your account.' title='Dividend not found' />
      <EmptyState
        action={
          <Link className='btn btn-brand btn-sm' href='/investor/dividends'>
            <Icon name='arrow-left' size={13} />
            Back to dividends
          </Link>
        }
        icon='lock'
        title='That dividend isn’t in your account'
      >
        Either the dividend doesn’t exist, hasn’t been declared yet, or it belongs to another shareholder. If you think this is wrong,
        contact support and we’ll take a look.
      </EmptyState>
    </AppShell>
  )
}
