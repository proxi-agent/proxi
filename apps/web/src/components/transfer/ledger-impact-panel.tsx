import { Icon } from '@/components/icon'
import { Panel } from '@/components/ui'

export type LedgerSide = {
  /** Shares held after the transfer posts. */
  after: number
  /** Shares held before the transfer posts. */
  before: number
  /** Optional registration description ("DRS", "Brokerage account", etc.). */
  registration?: string
  /** Display label for this side — "Source" or "Destination". */
  title: string
  /** Holder display name. */
  who: string
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

/**
 * Shows a clear before → after view of both ledger sides affected by a transfer.
 * Use in the review step so a human can eyeball the net ledger impact before
 * an irreversible action.
 */
export function LedgerImpactPanel({
  shares,
  source,
  destination,
  subtitle = 'Before and after this transfer posts to the shareholder ledger.',
  title = 'Ledger impact',
}: {
  destination: LedgerSide
  shares: number
  source: LedgerSide
  subtitle?: string
  title?: string
}) {
  return (
    <Panel subtitle={subtitle} title={title}>
      <div className='ledger-impact'>
        <LedgerImpactSide delta={-shares} side={source} />
        <div aria-hidden className='ledger-impact-arrow'>
          <Icon name='arrow-right' size={16} />
          <span className='num'>{fmt(shares)} sh</span>
        </div>
        <LedgerImpactSide delta={shares} side={destination} />
      </div>

      {source.after === 0 && (
        <div
          className='mt-3 flex items-start gap-2 rounded-sm border border-warning-100 bg-warning-50 p-2 text-[12px] text-warning-700'
          role='status'
        >
          <Icon aria-hidden name='alert-triangle' size={12} />
          <span>This transfer closes the source position in full.</span>
        </div>
      )}
    </Panel>
  )
}

function LedgerImpactSide({ delta, side }: { delta: number; side: LedgerSide }) {
  const tone = delta < 0 ? 'danger' : 'positive'
  return (
    <div className='ledger-impact-side'>
      <div className='ledger-impact-label'>{side.title}</div>
      <div className='ledger-impact-who'>{side.who}</div>
      {side.registration && <div className='ledger-impact-reg'>{side.registration}</div>}
      <div className='ledger-impact-row'>
        <span className='ledger-impact-meta'>Before</span>
        <span className='num text-ink-900'>{fmt(side.before)}</span>
      </div>
      <div className='ledger-impact-row'>
        <span className='ledger-impact-meta'>Change</span>
        <span className={`num ledger-impact-delta ledger-impact-delta-${tone}`}>
          {delta > 0 ? '+' : ''}
          {fmt(delta)}
        </span>
      </div>
      <div className='ledger-impact-row ledger-impact-row-total'>
        <span className='ledger-impact-meta'>After</span>
        <span className='num text-ink-900'>{fmt(side.after)}</span>
      </div>
    </div>
  )
}
