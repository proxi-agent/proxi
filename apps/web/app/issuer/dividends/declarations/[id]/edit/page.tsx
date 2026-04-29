import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { DividendStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { PageHeader, Panel } from '@/components/ui'
import { fetchDividend } from '@/lib/dividends/api'

import { EditDividendForm } from './edit-form'

export default async function EditDividendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dividend = await fetchDividend(id)

  return (
    <AppShell
      breadcrumbs={[
        { href: '/issuer', label: 'Issuer' },
        { href: '/issuer/dividends', label: 'Dividends' },
        { href: '/issuer/dividends/declarations', label: 'Declarations' },
        { href: `/issuer/dividends/declarations/${id}`, label: id },
        { label: 'Edit' },
      ]}
      portal='issuer'
    >
      <PageHeader
        actions={
          <Link className='btn btn-ghost btn-sm' href={`/issuer/dividends/declarations/${id}`}>
            <Icon name='arrow-left' size={13} />
            Back to detail
          </Link>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <DividendStatusBadge status={dividend.status} />
            <span className='text-[12px] text-ink-500'>
              {dividend.issuer.name} · {dividend.security.label}
            </span>
          </div>
        }
        subtitle='Editable while DRAFT or CHANGES_REQUESTED. Optimistic concurrency uses the version pinned below.'
        title='Edit declaration'
      />

      <Panel title='Declaration details'>
        <EditDividendForm dividend={dividend} />
      </Panel>
    </AppShell>
  )
}
