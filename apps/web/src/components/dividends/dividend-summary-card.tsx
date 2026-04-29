import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui'
import { DIVIDEND_TYPE_LABEL, formatCents, formatDate, RATE_TYPE_LABEL } from '@/lib/dividends/copy'
import type { DividendEvent } from '@/lib/dividends/types'

import { DividendStatusBadge } from './dividend-status-badge'

/** Compact summary header for declaration detail / drawer / list rows. */
export function DividendSummaryCard({ dividend }: { dividend: DividendEvent }) {
  return (
    <div className='soft-box'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <span className='page-eyebrow'>{dividend.id}</span>
          <span className='text-[18px] font-semibold tracking-[-0.01em] text-ink-900'>
            {dividend.issuer.name}
            <span className='ml-2 text-ink-500'>· {dividend.security.label}</span>
          </span>
          <span className='text-[12.5px] text-ink-500'>
            {DIVIDEND_TYPE_LABEL[dividend.dividendType]} · {RATE_TYPE_LABEL[dividend.rateType] ?? dividend.rateType} · {dividend.currency}{' '}
            {dividend.rateAmount}
          </span>
        </div>
        <DividendStatusBadge status={dividend.status} />
      </div>

      <div className='mt-3 grid grid-cols-2 gap-3 md:grid-cols-4'>
        <DateBlock icon='calendar-clock' label='Declaration' value={formatDate(dividend.declarationDate)} />
        <DateBlock icon='calendar-clock' label='Record' value={formatDate(dividend.recordDate)} />
        <DateBlock icon='calendar-clock' label='Ex-date' value={formatDate(dividend.exDividendDate)} />
        <DateBlock icon='calendar-clock' label='Payment' value={formatDate(dividend.paymentDate)} />
      </div>

      {dividend.totalPayableCents !== undefined && (
        <div className='mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-600'>
          <Badge icon='coins' tone='brand'>
            Net payable {formatCents(dividend.totalPayableCents, dividend.currency)}
          </Badge>
          {dividend.calculatedSummary && (
            <span>
              {dividend.calculatedSummary.eligibleHolderCount.toLocaleString('en-US')} holders ·{' '}
              {dividend.calculatedSummary.totalEligibleShares} shares
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function DateBlock({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>
        <Icon name={icon} size={11} />
        {label}
      </span>
      <span className='text-[13.5px] font-semibold text-ink-900'>{value}</span>
    </div>
  )
}
