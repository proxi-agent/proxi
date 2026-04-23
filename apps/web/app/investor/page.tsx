import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { ProxiAssistant } from '@/components/assistant'
import { Icon } from '@/components/icon'
import { type Holding, HoldingsTable } from '@/components/investor/holdings-table'
import { InboxTabs } from '@/components/investor/inbox-tabs'
import { type RequestTrack, RequestTracker } from '@/components/investor/request-tracker'
import { Badge, Metric, PageHeader, Panel } from '@/components/ui'

const holdings: Holding[] = [
  {
    basis: '$42.11',
    cusip: '589543 10 2',
    issuer: 'Meridian Optics, Inc.',
    market: '$103,215.80',
    restriction: null,
    shares: '1,240',
    ticker: 'MRDN',
    type: 'DRS',
    unrealized: '+$50,198.40',
  },
  {
    basis: '$18.77',
    cusip: '402163 20 8',
    issuer: 'Halcyon Industrial Co.',
    market: '$31,780.00',
    restriction: 'Rule 144',
    shares: '800',
    ticker: 'HALC',
    type: 'Cert (electronic)',
    unrealized: '+$16,764.00',
  },
  {
    basis: '$7.92',
    cusip: '771004 11 5',
    issuer: 'Ridgefield Energy Holdings',
    market: '$12,480.00',
    restriction: 'Lock-up · 62 days',
    shares: '2,500',
    ticker: 'RDG',
    type: 'DRS',
    unrealized: '-$7,320.00',
  },
  {
    basis: '$112.44',
    cusip: '88160R 10 1',
    issuer: 'Teagan Biosciences',
    market: '$26,898.00',
    restriction: null,
    shares: '180',
    ticker: 'TGBX',
    type: 'ESPP',
    unrealized: '+$6,658.80',
  },
]

const requests: RequestTrack[] = [
  {
    currentStep: 'human-review',
    detail: 'To Fidelity · 500 shares MRDN · submitted Jan 18',
    eta: '1 business day',
    id: 'TR-120458',
    notes: 'Proxi flagged one signature variance · W-9 still needed to unblock straight-through.',
    title: 'Broker transfer · DRS → Fidelity',
    urgency: 'high',
  },
  {
    currentStep: 'ai-review',
    detail: 'Teagan Biosciences ESPP lot #3 · basis reconciliation',
    eta: '< 2 hours',
    id: 'SR-222188',
    notes: 'Proxi is matching broker confirmation to ledger lots. No action needed from you.',
    title: 'Cost basis adjustment',
  },
]

export default function InvestorDashboard() {
  return (
    <AppShell portal='investor'>
      <PageHeader
        actions={
          <>
            <Link className='btn btn-secondary btn-sm' href='/investor/tax'>
              <Icon name='download' size={14} />
              Statements & tax
            </Link>
            <Link className='btn btn-brand btn-sm' href='/investor/transfer/new'>
              <Icon name='send' size={14} />
              Start a transfer
            </Link>
          </>
        }
        eyebrow='Good afternoon, Eleanor'
        subtitle='Your holdings, requests, and communications — timestamped, immutable, and available in one place.'
        title='Investor dashboard'
      />

      <div className='mb-6 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric delta='+3.2% vs. last quarter' label='Portfolio value' trend='up' value='$174,373.80' />
        <Metric helper='Across 4 issuers' label='Total shares' value='4,720' />
        <Metric helper='Q4 2025 + Q1 2026' label='Dividends YTD' value='$1,862.40' />
        <Metric helper='1 awaiting action' label='Open requests' value='2' />
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_440px]'>
        <div className='flex flex-col gap-5'>
          <Panel
            actions={
              <>
                <span className='text-[11.5px] text-ink-500'>Select rows to act on them</span>
                <button className='btn btn-ghost btn-sm' type='button'>
                  <Icon name='filter' size={13} />
                  Filter
                </button>
              </>
            }
            padded={false}
            subtitle='Positions of record on the Proxi ledger. Select one or more to transfer, sell, or ask Proxi.'
            title='Holdings'
          >
            <div className='px-px pb-px'>
              <HoldingsTable holdings={holdings} />
            </div>
          </Panel>

          <Panel
            actions={
              <Link className='btn btn-ghost btn-sm' href='/investor/transfer/new'>
                New request
                <Icon name='arrow-right' size={13} />
              </Link>
            }
            subtitle='Lifecycle of your open cases with expected turnaround'
            title='Request status'
          >
            <div className='flex flex-col gap-3'>
              {requests.map(r => (
                <RequestTracker key={r.id} request={r} />
              ))}
            </div>
          </Panel>

          <Panel
            actions={
              <button className='btn btn-secondary btn-sm' type='button'>
                <Icon name='pencil' size={13} />
                New message
              </button>
            }
            subtitle='Communications, notifications, and drafted messages'
            title='Inbox'
          >
            <InboxTabs />
          </Panel>
        </div>

        <aside className='flex flex-col gap-5 lg:sticky lg:top-[80px] lg:self-start'>
          <div className='relative'>
            <ProxiAssistant
              footerNote='Proxi never auto-submits requests without your confirmation.'
              messages={[
                {
                  author: 'assistant',
                  body: 'Welcome back, Eleanor. Two items need attention today: your Fidelity transfer is waiting on a W-9, and Halcyon’s annual meeting ballot is open through Mar 12.',
                  meta: 'Grounded in: TR-120458 · PX-2026-HALC',
                },
                {
                  author: 'user',
                  body: 'Start a transfer to my brokerage for 250 MRDN shares',
                },
                {
                  author: 'assistant',
                  body: 'I can set that up. I already have your Fidelity account on file (IRA ••4512). I’ll collect a stock power, verify your medallion, and confirm the W-9 on record is current — should take about 1 business day end-to-end.',
                  meta: 'I’ll walk you through it step by step.',
                },
                {
                  author: 'assistant',
                  body: 'Ready to start? I’ll use a guided intake — you only answer what I don’t already know.',
                },
              ]}
              quickActions={[
                'Transfer shares',
                'Transfer to a broker',
                'Check a request’s status',
                'Explain my last dividend',
                'What is DRIP?',
                'Update my tax documents',
              ]}
              subtitle='High-trust transfer assistant · Cites every answer'
              title='Proxi assistant'
            />
          </div>

          <Panel
            padded={false}
            subtitle='Guided intake flows — Proxi collects everything needed for straight-through processing.'
            title='Start a workflow'
          >
            <ul className='divide-y divide-line'>
              {[
                {
                  blurb: 'DRS → broker · guided form · ~5 min',
                  href: '/investor/transfer/new',
                  icon: 'landmark',
                  label: 'Transfer shares to a broker',
                },
                {
                  blurb: 'DRS → DRS between registrations',
                  href: '/investor/transfer/new',
                  icon: 'send',
                  label: 'Transfer to another registration',
                },
                {
                  blurb: 'DRIP, bank instructions, 1099-DIV',
                  href: '/investor/dividends',
                  icon: 'coins',
                  label: 'Manage dividends',
                },
                {
                  blurb: '5 proposals · closes Mar 12',
                  href: '/investor/proxy',
                  icon: 'vote',
                  label: 'Vote Halcyon 2026 proxy',
                },
                {
                  blurb: '1099-DIV · 1042-S · cost basis',
                  href: '/investor/tax',
                  icon: 'file-text',
                  label: 'Tax & compliance forms',
                },
              ].map(w => (
                <li key={w.label}>
                  <Link className='flex items-center gap-3 px-4 py-3 hover:bg-surface-2' href={w.href}>
                    <div className='flex h-8 w-8 items-center justify-center rounded-sm bg-brand-50 text-brand-700'>
                      <Icon name={w.icon} size={15} />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='text-[13px] font-semibold text-ink-900'>{w.label}</div>
                      <div className='text-[11.5px] text-ink-500'>{w.blurb}</div>
                    </div>
                    <Icon className='text-ink-400' name='chevron-right' size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            actions={<Badge tone='positive'>Up to date</Badge>}
            subtitle='Documents Proxi has on file across all issuers'
            title='Your compliance file'
          >
            <ul className='flex flex-col gap-2 text-[13px]'>
              {[
                { label: 'W-9 (2024)', status: 'On file · refresh suggested', tone: 'warning' as const },
                { label: 'Government ID · verified', status: 'Valid to 2028', tone: 'positive' as const },
                { label: 'Medallion guarantee', status: 'Recent · 2025-Q4', tone: 'positive' as const },
                { label: 'ACH instructions', status: 'Verified', tone: 'positive' as const },
              ].map(d => (
                <li className='flex items-center justify-between' key={d.label}>
                  <span className='text-ink-800'>{d.label}</span>
                  <Badge tone={d.tone}>{d.status}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
