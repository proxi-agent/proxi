import { Panel } from '@/components/ui'
import { formatCents, formatShares } from '@/lib/dividends/copy'
import type { CalculatedSummary } from '@/lib/dividends/types'

import { DividendWarnings } from './dividend-warnings'

export function CalculationSummaryPanel({ currency = 'USD', summary }: { currency?: string; summary: CalculatedSummary }) {
  return (
    <Panel subtitle='Aggregate result of the entitlement engine. Drives the payment batch totals.' title='Entitlement calculation summary'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3'>
        <Stat label='Eligible holders' value={summary.eligibleHolderCount.toLocaleString('en-US')} />
        <Stat label='Excluded holders' value={summary.excludedHolderCount.toLocaleString('en-US')} />
        <Stat label='Total shares' value={formatShares(summary.totalEligibleShares)} />
        <Stat label='Gross amount' value={formatCents(summary.grossAmountCents, currency)} />
        <Stat label='Withholding' value={formatCents(summary.withholdingAmountCents, currency)} />
        <Stat label='Net payable' tone='brand' value={formatCents(summary.netAmountCents, currency)} />
      </div>
      {summary.warnings.length > 0 && (
        <div className='mt-4'>
          <DividendWarnings warnings={summary.warnings} />
        </div>
      )}
    </Panel>
  )
}

function Stat({ label, tone, value }: { label: string; tone?: 'brand'; value: string }) {
  return (
    <div className='soft-box'>
      <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>{label}</div>
      <div className={`mt-0.5 text-[18px] font-semibold ${tone === 'brand' ? 'text-brand-700' : 'text-ink-900'}`}>{value}</div>
    </div>
  )
}
