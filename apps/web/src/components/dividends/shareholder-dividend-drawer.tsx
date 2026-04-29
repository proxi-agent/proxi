'use client'

import { DetailDrawer } from '@/components/detail-drawer'
import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui'
import { formatCents, WITHHOLDING_REASON_LABEL } from '@/lib/dividends/copy'
import type { Entitlement } from '@/lib/dividends/types'

import { EntitlementStatusBadge, TaxFormBadge } from './dividend-status-badge'

/** Drawer with a per-shareholder dividend breakdown.
 * Used by entitlement and payment tables. Closing is handled by the parent. */
export function ShareholderDividendDrawer({
  entitlement,
  onClose,
  open,
}: {
  entitlement: Entitlement | null
  onClose: () => void
  open: boolean
}) {
  if (!entitlement) {
    return <DetailDrawer onClose={onClose} open={open} title='Shareholder dividend' />
  }
  return (
    <DetailDrawer
      eyebrow={entitlement.shareholderId}
      footer={
        <div className='flex items-center justify-between'>
          <span className='text-[12px] text-ink-500'>Calculation v{entitlement.calculationVersion}</span>
          <div className='flex gap-1.5'>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='message-square' size={12} />
              Message holder
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='external-link' size={12} />
              Open profile
            </button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      subtitle={
        <span className='flex items-center gap-2'>
          <EntitlementStatusBadge status={entitlement.paymentStatus} />
          <span>{entitlement.sharesEligible} shares eligible</span>
        </span>
      }
      title={entitlement.shareholderName}
    >
      <div className='flex flex-col gap-4'>
        <section className='soft-box'>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Amounts</div>
          <div className='mt-2 flex flex-col gap-1.5 text-[13px]'>
            <Row label='Gross' value={formatCents(entitlement.grossAmountCents, entitlement.currency)} />
            <Row label='Withholding' value={`− ${formatCents(entitlement.withholdingAmountCents, entitlement.currency)}`} />
            <Row label='Net payable' tone='brand' value={formatCents(entitlement.netAmountCents, entitlement.currency)} />
          </div>
        </section>

        <section className='soft-box'>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Tax</div>
          <div className='mt-2 flex flex-col gap-1.5 text-[13px]'>
            <Row label='Residency' value={entitlement.taxResidency ?? 'Unknown'} />
            <Row label='Form status' value={entitlement.taxFormStatus ? <TaxFormBadge status={entitlement.taxFormStatus} /> : '—'} />
            <Row
              label='Withholding reason'
              value={entitlement.withholdingReason ? WITHHOLDING_REASON_LABEL[entitlement.withholdingReason] : '—'}
            />
            {entitlement.treatyRate && <Row label='Treaty rate' value={`${entitlement.treatyRate}%`} />}
          </div>
        </section>

        <section className='soft-box'>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Payment</div>
          <div className='mt-2 flex flex-col gap-1.5 text-[13px]'>
            <Row label='Method' value={<Badge tone='neutral'>{entitlement.paymentMethod ?? 'Not set'}</Badge>} />
            <Row label='Status' value={<EntitlementStatusBadge status={entitlement.paymentStatus} />} />
          </div>
        </section>
      </div>
    </DetailDrawer>
  )
}

function Row({ label, tone, value }: { label: string; tone?: 'brand'; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className='text-ink-500'>{label}</span>
      <span className={`num font-semibold ${tone === 'brand' ? 'text-brand-700' : 'text-ink-900'}`}>{value}</span>
    </div>
  )
}
