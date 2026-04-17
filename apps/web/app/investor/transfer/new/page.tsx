import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { GuidedIntake } from '@/components/investor/guided-intake'
import { PageHeader } from '@/components/ui'

export default function GuidedIntakePage() {
  return (
    <AppShell breadcrumbs={[{ href: '/investor', label: 'Investor' }, { label: 'New transfer' }]} portal='investor'>
      <PageHeader
        actions={
          <Link className='btn btn-ghost btn-sm' href='/investor'>
            <Icon name='x' size={13} />
            Exit
          </Link>
        }
        eyebrow='Guided intake · Proxi will only ask what it doesn’t already know'
        subtitle='Answer a few questions — Proxi collects documents, verifies identity, and submits an auditable case for you.'
        title='Start a new transfer'
      />

      <GuidedIntake />
    </AppShell>
  )
}
