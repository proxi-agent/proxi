import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import { EntitlementStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { InfoTooltip } from '@/components/info-tooltip'
import { DividendPaymentTimeline } from '@/components/investor/dividend-payment-timeline'
import { Badge, PageHeader, Panel } from '@/components/ui'
import { DIVIDEND_TYPE_LABEL, formatCents, formatDate, formatShares, RATE_TYPE_LABEL, TOOLTIPS } from '@/lib/dividends/copy'
import { describeStatus, fetchMyDividend } from '@/lib/dividends/shareholder'

export default async function InvestorDividendDetailPage({ params }: { params: Promise<{ dividendId: string }> }) {
  const { dividendId } = await params
  const dividend = await fetchMyDividend(dividendId)
  if (!dividend) notFound()

  const status = describeStatus(dividend.paymentStatus)
  const isPaid = dividend.paymentStatus === 'PAID' || dividend.paymentStatus === 'RECONCILED'

  return (
    <AppShell
      breadcrumbs={[
        { href: '/investor', label: 'Investor' },
        { href: '/investor/dividends', label: 'Dividends' },
        { label: dividend.issuerName },
      ]}
      portal='investor'
    >
      <PageHeader
        actions={
          <>
            <Link className='btn btn-ghost btn-sm' href='/investor/dividends'>
              <Icon name='arrow-left' size={13} />
              Back
            </Link>
            <Link className='btn btn-brand btn-sm' href={`/investor/dividends/${dividend.id}/statement`}>
              <Icon name='file-text' size={13} />
              View statement
            </Link>
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{dividend.issuerName}</Badge>
            <Badge tone='neutral'>{DIVIDEND_TYPE_LABEL[dividend.dividendType]}</Badge>
            <EntitlementStatusBadge status={dividend.paymentStatus} />
            <span className='text-[12px] text-ink-500'>{dividend.securityLabel}</span>
          </div>
        }
        subtitle={dividend.description ?? `Pay date ${formatDate(dividend.paymentDate)}`}
        title='Dividend detail'
      />

      <div className='mb-4'>
        <Callout
          actions={
            isPaid ? (
              <Link className='btn btn-secondary btn-sm' href={`/investor/dividends/${dividend.id}/statement`}>
                <Icon name='download' size={12} />
                Statement
              </Link>
            ) : undefined
          }
          tone={isPaid ? 'positive' : dividend.paymentStatus === 'FAILED' || dividend.paymentStatus === 'RETURNED' ? 'danger' : 'info'}
        >
          <span className='font-semibold'>{status.description}.</span> {status.reassuring}
        </Callout>
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]'>
        <div className='flex flex-col gap-5'>
          <Panel subtitle='What was decided when' title='Important dates'>
            <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
              <DateBox label='Declared' value={formatDate(dividend.declarationDate)} />
              <DateBox
                label={
                  <span className='inline-flex items-center gap-1'>
                    Record
                    <InfoTooltip>{TOOLTIPS.recordDate}</InfoTooltip>
                  </span>
                }
                value={formatDate(dividend.recordDate)}
              />
              <DateBox label='Ex-date' value={formatDate(dividend.exDividendDate)} />
              <DateBox
                label={
                  <span className='inline-flex items-center gap-1'>
                    Pay date
                    <InfoTooltip>{TOOLTIPS.paymentDate}</InfoTooltip>
                  </span>
                }
                value={formatDate(dividend.paymentDate)}
              />
            </div>
          </Panel>

          <Panel subtitle='How your dividend amount was calculated' title='Your amount'>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <div className='soft-box'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Holding</div>
                <div className='mt-1 text-[14px] font-semibold text-ink-900'>
                  {formatShares(dividend.sharesEligible)} shares of {dividend.issuerTicker ?? dividend.issuerName}
                </div>
                <div className='cell-muted'>{dividend.securityLabel}</div>
              </div>
              <div className='soft-box'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Rate</div>
                <div className='mt-1 text-[14px] font-semibold text-ink-900'>
                  {dividend.currency} {dividend.rateAmount} {RATE_TYPE_LABEL.PER_SHARE.toLowerCase()}
                </div>
                <div className='cell-muted'>Set by the issuer</div>
              </div>
            </div>
            <div className='mt-3 rounded-md border border-line bg-surface-2 p-4'>
              <table className='w-full border-separate border-spacing-0 text-[13.5px]'>
                <tbody>
                  <AmountRow label='Gross amount' value={formatCents(dividend.grossCents, dividend.currency)} />
                  <AmountRow
                    label={
                      <span className='inline-flex items-center gap-1'>
                        Withholding
                        <InfoTooltip>{TOOLTIPS.withholding}</InfoTooltip>
                      </span>
                    }
                    value={dividend.withholdingCents === 0 ? '—' : `− ${formatCents(dividend.withholdingCents, dividend.currency)}`}
                  />
                  <AmountRow label='Net to you' tone='brand' value={formatCents(dividend.netCents, dividend.currency)} />
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel subtitle='Step-by-step status of this dividend payment' title='Payment timeline'>
            <DividendPaymentTimeline events={dividend.payoutEvents} />
          </Panel>
        </div>

        <aside className='flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel subtitle='Where the funds are headed' title='Payment method'>
            <div className='flex flex-col gap-2 text-[13px]'>
              <div className='flex items-center justify-between'>
                <span className='text-ink-500'>Method</span>
                <Badge tone='neutral'>{dividend.paymentMethod === 'DRIP' ? 'Reinvested (DRIP)' : `${dividend.paymentMethod}`}</Badge>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-ink-500'>Currency</span>
                <span className='font-semibold text-ink-900'>{dividend.currency}</span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-ink-500'>Reference</span>
                <span className='mono text-[12px] text-ink-700'>{dividend.externalReference ?? 'Not yet issued'}</span>
              </div>
            </div>
            <Link className='btn btn-secondary btn-sm mt-3 w-full justify-center' href='/investor/tax'>
              <Icon name='settings' size={12} />
              Update payment instructions
            </Link>
          </Panel>

          <Panel subtitle='Tax treatment for this dividend' title='Tax'>
            <div className='flex flex-col gap-2 text-[13px]'>
              <div className='flex items-center justify-between'>
                <span className='text-ink-500'>Reason</span>
                <span className='font-semibold text-ink-900'>
                  {dividend.withholdingReason === 'DOMESTIC_NONE'
                    ? 'Domestic — none'
                    : dividend.withholdingReason === 'TREATY'
                      ? `Treaty (${dividend.treatyRate ?? '—'}%)`
                      : dividend.withholdingReason === 'BACKUP'
                        ? 'Backup withholding'
                        : 'Foreign — default'}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <span className='text-ink-500'>Withheld</span>
                <span className='num font-semibold text-warning-700'>{formatCents(dividend.withholdingCents, dividend.currency)}</span>
              </div>
            </div>
            <Callout tone='info'>This is a platform-generated summary, not tax advice.</Callout>
          </Panel>

          <Panel subtitle='Save or print a record of this dividend' title='Statement'>
            <Link className='btn btn-brand btn-sm w-full justify-center' href={`/investor/dividends/${dividend.id}/statement`}>
              <Icon name='file-text' size={12} />
              View statement
            </Link>
            <p className='mt-2 text-[12px] text-ink-500'>Use your browser print dialog (⌘P) to save the statement as PDF.</p>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}

function DateBox({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className='soft-box'>
      <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>{label}</div>
      <div className='mt-0.5 text-[14px] font-semibold text-ink-900'>{value}</div>
    </div>
  )
}

function AmountRow({ label, tone, value }: { label: React.ReactNode; tone?: 'brand'; value: string }) {
  return (
    <tr>
      <td className='py-1.5 text-ink-600'>{label}</td>
      <td className={`num py-1.5 text-right font-semibold ${tone === 'brand' ? 'text-brand-700' : 'text-ink-900'}`}>{value}</td>
    </tr>
  )
}
