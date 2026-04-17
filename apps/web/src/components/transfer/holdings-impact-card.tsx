import { Icon } from '@/components/icon'
import { Panel } from '@/components/ui'
import type { TransferRequest } from '@/lib/transfer/types'

function fmtShares(n: number) {
  return n.toLocaleString('en-US')
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  })
}

export function HoldingsImpactCard({ transfer }: { transfer: TransferRequest }) {
  const { holding, shareCount } = transfer
  const before = holding.availableShares
  const after = Math.max(0, before - shareCount)
  const price = holding.marketValuePerShare ?? 0
  const deltaValue = shareCount * price

  return (
    <Panel subtitle='Post-transfer ledger impact' title='Holdings impact'>
      <div className='grid grid-cols-3 gap-3'>
        <div className='soft-box'>
          <div className='text-[11px] uppercase tracking-[0.08em] text-ink-500'>Before</div>
          <div className='mt-1 text-[16px] font-semibold text-ink-900 num'>{fmtShares(before)}</div>
          <div className='text-[11.5px] text-ink-500'>
            {holding.ticker} · {holding.type}
          </div>
        </div>
        <div className='soft-box flex flex-col items-center justify-center text-center'>
          <div className='flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-danger-700'>
            <Icon name='arrow-down' size={10} />
            <span>Transferring</span>
          </div>
          <div className='mt-1 text-[16px] font-semibold text-danger-700 num'>−{fmtShares(shareCount)}</div>
          <div className='text-[11.5px] text-ink-500 num'>≈ {fmtMoney(deltaValue)}</div>
        </div>
        <div className='soft-box'>
          <div className='text-[11px] uppercase tracking-[0.08em] text-ink-500'>After</div>
          <div className='mt-1 text-[16px] font-semibold text-ink-900 num'>{fmtShares(after)}</div>
          <div className='text-[11.5px] text-ink-500'>
            {holding.ticker} · {holding.type}
          </div>
        </div>
      </div>

      {holding.restrictedShares ? (
        <div className='mt-3 text-[11.5px] text-ink-500'>
          {fmtShares(holding.restrictedShares)} restricted shares remain unaffected by this transfer.
        </div>
      ) : null}

      {after === 0 && (
        <div className='mt-3 flex items-start gap-2 rounded-sm border border-warning-100 bg-warning-50 p-2 text-[12px] text-warning-700'>
          <Icon name='alert-triangle' size={12} />
          <span>This transfer closes the holder&apos;s position in {holding.ticker}.</span>
        </div>
      )}
    </Panel>
  )
}
