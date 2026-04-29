import { Panel } from '@/components/ui'

/**
 * Skeleton fallback for the issuer dividends section. Rendered by
 * Next.js while a server component fetches its initial data. We
 * intentionally keep the skeleton lightweight so the perceived
 * latency on a fast network stays close to a direct render — but
 * busy networks or large shareholder bases now have a stable shell
 * to look at instead of a layout-shifting blank page.
 */
export default function IssuerDividendsLoading() {
  return (
    <div className='page-body space-y-3'>
      <Panel padded title='Loading dividends'>
        <div className='animate-pulse space-y-3'>
          <div className='h-3 w-1/3 rounded bg-ink-100' />
          <div className='h-3 w-1/2 rounded bg-ink-100' />
          <div className='h-3 w-2/3 rounded bg-ink-100' />
          <div className='h-3 w-1/4 rounded bg-ink-100' />
        </div>
      </Panel>
    </div>
  )
}
