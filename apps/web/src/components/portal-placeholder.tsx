import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { EmptyState, PageHeader, Panel } from '@/components/ui'
import { type PortalId, PORTALS } from '@/lib/nav'

function titleizeSegment(seg: string): string {
  return seg
    .split('-')
    .map(s => s[0]?.toUpperCase() + s.slice(1))
    .join(' ')
}

function findNavMatch(portal: PortalId, href: string) {
  for (const section of PORTALS[portal].sections) {
    for (const item of section.items) {
      if (item.href === href) return { item, section }
    }
  }
  return null
}

export function PortalPlaceholder({ portal, slug }: { portal: PortalId; slug: string[] }) {
  const href = `/${portal === 'investor' ? 'investor' : portal}/${slug.join('/')}`
  const match = findNavMatch(portal, href)
  const label = match ? match.item.label : slug.map(titleizeSegment).join(' · ')
  const section = match?.section.label

  return (
    <AppShell breadcrumbs={[{ label: section ?? 'Module' }, { label }]} portal={portal}>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='filter' size={14} />
              Filter
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='plus' size={14} />
              New
            </button>
          </>
        }
        eyebrow={section}
        subtitle='Module scaffold · flagship content lives in the dashboards linked from the sidebar.'
        title={label}
      />

      <Panel
        subtitle='This module is wired up in the navigation. Use the flagship dashboards to explore the core product patterns.'
        title='Preview'
      >
        <EmptyState
          action={
            <div className='flex gap-2'>
              <a className='btn btn-secondary btn-sm' href={`/${portal === 'investor' ? 'investor' : portal}`}>
                Back to dashboard
              </a>
              <a className='btn btn-primary btn-sm' href='/'>
                View all portals
              </a>
            </div>
          }
          icon='kanban-square'
          title={`${label} workspace`}
        >
          The production build of this module includes its own tables, filters, detail views, and audit trail — all following the same
          design system shown in the flagship screens.
        </EmptyState>
      </Panel>
    </AppShell>
  )
}
