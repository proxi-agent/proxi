import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import { EntitlementStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { InfoTooltip } from '@/components/info-tooltip'
import { DividendHistoryTable } from '@/components/investor/dividend-history-table'
import { MissingInfoList } from '@/components/investor/missing-info-callout'
import { Badge, EmptyState, Metric, PageHeader, Panel } from '@/components/ui'
import { DIVIDEND_TYPE_LABEL, formatCents, formatDate, formatRelative, formatShares, TOOLTIPS } from '@/lib/dividends/copy'
import { fetchMyDividendOverview, fetchMyDividends, fetchMyProfile } from '@/lib/dividends/shareholder'

export default async function InvestorDividendsOverviewPage() {
  const [overview, dividends, profile] = await Promise.all([fetchMyDividendOverview(), fetchMyDividends(), fetchMyProfile()])

  return (
    <AppShell breadcrumbs={[{ label: 'Dividends' }]} portal='investor'>
      <PageHeader
        actions={
          <>
            <Link className='btn btn-secondary btn-sm' href='/investor/tax'>
              <Icon name='file-text' size={13} />
              Tax & 1099-DIV
            </Link>
            <Link className='btn btn-brand btn-sm' href='/investor/dividends/history'>
              <Icon name='history' size={13} />
              Full history
            </Link>
          </>
        }
        eyebrow={`Hi ${profile.name.split(' ')[0]} — here are your dividends`}
        subtitle='What you’ve been paid, what’s coming up, and anything we need from you to keep payments on time.'
        title='Dividends'
      />

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric helper='Net of any withholding' label='Paid year-to-date' value={formatCents(overview.totalPaidYtdCents)} />
        <Metric helper='Reported on 1099-DIV' label='Tax withheld YTD' value={formatCents(overview.ytdWithholdingCents)} />
        <Metric helper='Awaiting funds release' label='Pending payments' value={String(overview.pendingPayments)} />
        <Metric
          helper={overview.failedReturnedCount === 0 ? 'No issues' : 'We’ll reach out'}
          label='Failed / returned'
          value={String(overview.failedReturnedCount)}
        />
      </div>

      {overview.missingInfo.length > 0 && (
        <div className='mb-5'>
          <MissingInfoList items={overview.missingInfo} />
        </div>
      )}

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]'>
        <div className='flex flex-col gap-5'>
          <Panel
            actions={
              <Link className='btn btn-ghost btn-sm' href='/investor/dividends/history'>
                See all
                <Icon name='arrow-right' size={12} />
              </Link>
            }
            padded={false}
            subtitle='Dividends from companies you currently hold shares in'
            title={`Upcoming · ${overview.upcoming.length}`}
          >
            {overview.upcoming.length === 0 ? (
              <div className='p-8'>
                <EmptyState icon='calendar-clock' title='No upcoming dividends'>
                  When an issuer declares a new dividend, you’ll see it here.
                </EmptyState>
              </div>
            ) : (
              <ul className='divide-y divide-line'>
                {overview.upcoming.map(d => (
                  <li className='flex items-start justify-between gap-3 px-4 py-3' key={d.id}>
                    <div className='min-w-0'>
                      <Link className='cell-primary' href={`/investor/dividends/${d.id}`}>
                        {d.issuerName} <span className='text-ink-500'>· {DIVIDEND_TYPE_LABEL[d.dividendType]}</span>
                      </Link>
                      <div className='cell-muted'>
                        {formatShares(d.sharesEligible)} shares · pay {formatDate(d.paymentDate)} ({formatRelative(d.paymentDate)})
                      </div>
                    </div>
                    <div className='flex flex-col items-end gap-1'>
                      <span className='num font-semibold text-ink-900'>{formatCents(d.netCents, d.currency)}</span>
                      <EntitlementStatusBadge status={d.paymentStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            padded={false}
            subtitle='Most recent dividends paid to your account'
            title={`Recently paid · ${overview.recentlyPaid.length}`}
          >
            {overview.recentlyPaid.length === 0 ? (
              <div className='p-8'>
                <EmptyState icon='inbox' title='No paid dividends yet'>
                  Once you receive your first dividend, it will show up here with a downloadable statement.
                </EmptyState>
              </div>
            ) : (
              <DividendHistoryTable rows={overview.recentlyPaid} />
            )}
          </Panel>

          <Panel
            actions={
              <Link className='btn btn-ghost btn-sm' href='/investor/dividends/history'>
                Open history
                <Icon name='arrow-right' size={12} />
              </Link>
            }
            padded={false}
            subtitle='Every dividend you’ve received, sortable and downloadable'
            title={`All dividends · ${dividends.length}`}
          >
            {dividends.length === 0 ? (
              <div className='p-8'>
                <EmptyState icon='coins' title='Nothing to show yet'>
                  As soon as your first dividend is declared, you’ll see it here.
                </EmptyState>
              </div>
            ) : (
              <DividendHistoryTable rows={dividends.slice(0, 6)} />
            )}
          </Panel>
        </div>

        <aside className='flex flex-col gap-5 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel subtitle='What we’ll use to send you payments' title='Payment instructions'>
            <ul className='flex flex-col gap-2 text-[13px]'>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-ink-700'>ACH on file</span>
                <Badge tone={profile.achInstructionsOnFile ? 'positive' : 'warning'}>
                  {profile.achInstructionsOnFile ? 'Verified' : 'Missing'}
                </Badge>
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-ink-700'>Mailing address</span>
                <Badge tone={profile.mailingAddressOnFile ? 'positive' : 'warning'}>
                  {profile.mailingAddressOnFile ? 'On file' : 'Missing'}
                </Badge>
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-ink-700'>Default delivery</span>
                <Badge tone='neutral'>ACH ••4512</Badge>
              </li>
            </ul>
            <Link className='btn btn-secondary btn-sm mt-3 w-full justify-center' href='/investor/tax'>
              <Icon name='settings' size={12} />
              Update payment instructions
            </Link>
          </Panel>

          <Panel subtitle='What the IRS sees on your 1099-DIV' title='Tax status'>
            <ul className='flex flex-col gap-2 text-[13px]'>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-ink-700'>Tax form</span>
                <Badge tone={profile.taxFormStatus === 'W9_ON_FILE' ? 'positive' : 'warning'}>
                  {profile.taxFormStatus === 'W9_ON_FILE' ? 'W-9 on file' : profile.taxFormStatus.replace(/_/g, ' ')}
                </Badge>
              </li>
              <li className='flex items-center justify-between gap-2'>
                <span className='text-ink-700'>Residency</span>
                <Badge tone='neutral'>{profile.taxResidency}</Badge>
              </li>
              <li className='flex items-center justify-between gap-2 text-ink-500'>
                <span className='inline-flex items-center gap-1'>
                  Withholding policy
                  <InfoTooltip>{TOOLTIPS.withholding}</InfoTooltip>
                </span>
                <span className='text-[12px] text-ink-700'>Domestic — none</span>
              </li>
            </ul>
            <Callout tone='info'>
              We never give tax advice — but if your form expires, we’ll let you know before your next dividend.
            </Callout>
          </Panel>

          <Panel subtitle='Need a quick refresher on dividend terms' title='Glossary'>
            <ul className='flex flex-col gap-3 text-[13px]'>
              <li>
                <span className='font-semibold text-ink-800'>Record date</span>
                <span className='ml-1 text-ink-500'>— {TOOLTIPS.recordDate}</span>
              </li>
              <li>
                <span className='font-semibold text-ink-800'>Pay date</span>
                <span className='ml-1 text-ink-500'>— {TOOLTIPS.paymentDate}</span>
              </li>
              <li>
                <span className='font-semibold text-ink-800'>Withholding</span>
                <span className='ml-1 text-ink-500'>— {TOOLTIPS.withholding}</span>
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
