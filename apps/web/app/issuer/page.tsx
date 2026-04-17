import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { ProxiAssistant } from '@/components/assistant'
import { Icon } from '@/components/icon'
import { Avatar, Badge, Metric, PageHeader, Panel, StatusPill } from '@/components/ui'

const segments = [
  { count: 18420, label: 'Retail direct', pct: 68, tone: 'brand' as const },
  {
    count: 412,
    label: 'Institutional',
    pct: 22,
    tone: 'violet' as const,
  },
  { count: 286, label: 'Employees', pct: 7, tone: 'info' as const },
  { count: 92, label: 'Insiders', pct: 3, tone: 'accent' as const },
]

const topHolders = [
  {
    change: '+0.4%',
    name: 'Columbia Threadneedle Investments',
    pct: '9.12%',
    shares: '1,812,402',
    type: 'Institutional',
  },
  {
    change: '-0.2%',
    name: 'Blackrock Advisors LLC',
    pct: '7.88%',
    shares: '1,566,820',
    type: 'Institutional',
  },
  {
    change: '+1.1%',
    name: 'Richard T. Albright, CEO',
    pct: '4.25%',
    shares: '844,120',
    type: 'Insider',
  },
  {
    change: '0.0%',
    name: 'Everstone Capital Partners III',
    pct: '3.74%',
    shares: '744,281',
    type: 'Institutional',
  },
]

const sentComms = [
  {
    audience: 'All retail · 18,420',
    channel: 'Email + portal',
    delivered: '99.4%',
    engagement: '41% open · 9.2% click',
    id: 'comm-q4-div',
    sent: 'Jan 12, 2026',
    status: 'completed' as const,
    subject: 'Q4 cash dividend declared · $0.18/share',
  },
  {
    audience: 'Voting shareholders · 19,102',
    channel: 'Email + mail',
    delivered: '98.1%',
    engagement: '23% ballots returned',
    id: 'comm-proxy',
    sent: 'Jan 08, 2026',
    status: 'completed' as const,
    subject: '2026 annual meeting notice',
  },
  {
    audience: 'Insiders · 24',
    channel: 'Portal · acknowledged',
    delivered: '100%',
    engagement: 'Ack required · 21 / 24',
    id: 'comm-bw',
    sent: 'Jan 05, 2026',
    status: 'pending' as const,
    subject: 'Trading blackout window reminder',
  },
]

const drafts = [
  {
    audience: 'Retail · 18,420 shareholders',
    body: 'Dear shareholder, we are pleased to confirm our Q4 2025 cash dividend of $0.18 per share, payable on January 24, 2026 to holders of record as of January 14, 2026. DRIP participants will receive shares at a weighted average price of…',
    id: 'd1',
    issuerNote: 'Uses Q4 board-approved language · fractional policy disclosed',
    suggestedBy: 'Proxi · grounded in board resolution DIV-2026-Q4',
    title: 'Q4 2025 dividend announcement · draft',
  },
  {
    audience: 'All shareholders · 19,210',
    body: 'We are writing to provide advance notice of a 3-for-1 forward stock split. Record date: February 28, 2026. Effective date: March 14, 2026. Fractional share treatment: cash-in-lieu at the 20-day VWAP preceding the split…',
    id: 'd2',
    issuerNote: 'Awaiting corporate counsel review before approval',
    suggestedBy: 'Proxi · drafted from corporate action CA-2026-01',
    title: 'Forward stock split · advance notice · draft',
  },
]

export default function IssuerDashboard() {
  return (
    <AppShell portal='issuer'>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='download' size={13} />
              Export register
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='mail' size={13} />
              New communication
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='plus' size={13} />
              New corporate action
            </button>
          </>
        }
        eyebrow='Meridian Optics, Inc. · MRDN · NYSE'
        subtitle='Shareholder register, communications, and operational workflows — live from the Proxi ledger.'
        title='Issuer dashboard'
      />

      <div className='mb-6 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric delta='+182 this month' helper='Across all registrations' label='Holders of record' trend='up' value='19,210' />
        <Metric helper='Free float 14.82M' label='Shares outstanding' value='19.86M' />
        <Metric delta='-4% vs. Q3' helper='Q4 2025 scheduled Jan 24' label='Next dividend' trend='down' value='$0.18 / sh' />
        <Metric helper='3 awaiting your approval' label='Open workflows' value='7' />
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_440px]'>
        <div className='flex flex-col gap-5'>
          <Panel
            actions={
              <Link className='btn btn-ghost btn-sm' href='/issuer/ledger'>
                Open register
                <Icon name='arrow-right' size={13} />
              </Link>
            }
            subtitle='Composition of the register on the Proxi ledger'
            title='Shareholder analytics'
          >
            <div className='grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]'>
              <div className='flex flex-col gap-3'>
                <div className='flex h-3 w-full overflow-hidden rounded-full border border-line bg-surface-sunken'>
                  {segments.map(s => (
                    <div
                      key={s.label}
                      style={{
                        background: `var(--color-${s.tone}-500)`,
                        width: `${s.pct}%`,
                      }}
                    />
                  ))}
                </div>
                <ul className='flex flex-col gap-2 text-[13px]'>
                  {segments.map(s => (
                    <li className='flex items-center gap-2' key={s.label}>
                      <span className='h-2 w-2 rounded-full' style={{ background: `var(--color-${s.tone}-500)` }} />
                      <span className='flex-1 text-ink-700'>{s.label}</span>
                      <span className='num font-semibold text-ink-900'>{s.count.toLocaleString()}</span>
                      <span className='w-10 text-right text-ink-500'>{s.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className='table-wrap'>
                <table className='table'>
                  <thead>
                    <tr>
                      <th>Top holders</th>
                      <th>Type</th>
                      <th className='cell-num'>Shares</th>
                      <th className='cell-num'>% out</th>
                      <th className='cell-num'>30d Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topHolders.map(h => (
                      <tr key={h.name}>
                        <td>
                          <div className='cell-primary'>{h.name}</div>
                        </td>
                        <td>
                          <Badge tone={h.type === 'Insider' ? 'warning' : 'neutral'}>{h.type}</Badge>
                        </td>
                        <td className='cell-num num'>{h.shares}</td>
                        <td className='cell-num num cell-primary'>{h.pct}</td>
                        <td
                          className={`cell-num num ${h.change.startsWith('+') ? 'trend-up' : h.change.startsWith('-') ? 'trend-down' : ''}`}
                        >
                          {h.change}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>

          <Panel
            actions={
              <button className='btn btn-brand btn-sm' type='button'>
                <Icon name='sparkles' size={13} />
                Draft with AI
              </button>
            }
            subtitle='AI-drafted using your board resolutions, SEC filings, and last 12 months of shareholder comms. Always review before sending.'
            title='AI-drafted shareholder communications'
          >
            <div className='flex flex-col gap-3'>
              {drafts.map(d => (
                <div className='rounded-[10px] border border-line bg-white p-4' key={d.id}>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <div className='text-[13.5px] font-semibold text-ink-900'>{d.title}</div>
                      <div className='text-[12px] text-ink-500'>Audience · {d.audience}</div>
                    </div>
                    <Badge icon='sparkles' tone='violet'>
                      Draft
                    </Badge>
                  </div>
                  <p className='mt-3 line-clamp-3 text-[12.5px] text-ink-700'>{d.body}</p>
                  <div className='mt-3 flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-2 text-[11.5px] text-ink-500'>
                      <Icon className='text-brand-700' name='sparkles' size={11} />
                      {d.suggestedBy}
                    </div>
                    <div className='flex items-center gap-1.5'>
                      <button className='btn btn-ghost btn-sm' type='button'>
                        Discard
                      </button>
                      <button className='btn btn-secondary btn-sm' type='button'>
                        <Icon name='pencil' size={12} />
                        Edit
                      </button>
                      <button className='btn btn-brand btn-sm' type='button'>
                        Schedule send
                        <Icon name='arrow-right' size={12} />
                      </button>
                    </div>
                  </div>
                  <div className='mt-2 text-[11.5px] text-ink-500'>{d.issuerNote}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            actions={
              <button className='btn btn-ghost btn-sm' type='button'>
                View all
                <Icon name='arrow-right' size={13} />
              </button>
            }
            padded={false}
            subtitle='Delivery, engagement, and acknowledgment metrics by channel'
            title='Sent communications'
          >
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Audience</th>
                    <th>Channel</th>
                    <th className='cell-num'>Delivered</th>
                    <th>Engagement</th>
                    <th>Status</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {sentComms.map(c => (
                    <tr className='table-row-clickable' key={c.id}>
                      <td>
                        <div className='cell-primary'>{c.subject}</div>
                        <div className='mono text-[11px] text-ink-500'>{c.id}</div>
                      </td>
                      <td className='cell-muted'>{c.audience}</td>
                      <td>
                        <Badge tone='neutral'>{c.channel}</Badge>
                      </td>
                      <td className='cell-num num'>{c.delivered}</td>
                      <td className='cell-muted'>{c.engagement}</td>
                      <td>
                        <StatusPill status={c.status} />
                      </td>
                      <td className='cell-muted'>{c.sent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <aside className='flex flex-col gap-5 lg:sticky lg:top-[80px] lg:self-start'>
          <ProxiAssistant
            footerNote='Every AI draft is grounded in your records and reviewed before sending.'
            messages={[
              {
                author: 'assistant',
                body: 'Good morning. Three items today: Q4 dividend ops sign-off is due Jan 20, the AGM proxy ballot closes Mar 12, and I drafted the stock-split advance notice for counsel review.',
                meta: 'Grounded in: DIV-2026-Q4 · PRX-2026-AM · CA-2026-01',
              },
              {
                author: 'user',
                body: 'Draft a warm update for holders who reinvested in DRIP last quarter',
              },
              {
                author: 'assistant',
                body: 'Done — scoped to the 4,412 DRIP-participating holders, 201 of whom joined in Q3. I included the weighted average reinvestment price and a one-click link to tax forms. Want me to schedule it for Jan 18?',
                meta: 'Draft saved · ready for your edits',
              },
            ]}
            quickActions={[
              'Draft Q1 2026 dividend memo',
              'Who sold shares in the last 30 days?',
              'Explain the AGM quorum status',
              'Start a corporate action',
              'Request transfer agent report',
            ]}
            subtitle='Your issuer copilot · cites every source'
            title='Proxi assistant'
          />

          <Panel actions={<Badge tone='warning'>3 need you</Badge>} subtitle='Items routed to your executive team' title='Your approvals'>
            <ul className='flex flex-col divide-y divide-line'>
              {[
                {
                  due: 'Due Jan 20',
                  meta: 'DIV-2026-Q4 · $3.57M disbursement',
                  title: 'Q4 dividend authorization',
                },
                {
                  due: 'Due Feb 02',
                  meta: 'CA-2026-01 · Forward 3-for-1',
                  title: 'Stock split counsel sign-off',
                },
                {
                  due: 'Due Jan 22',
                  meta: 'Insider · 24 recipients',
                  title: 'Blackout extension memo',
                },
              ].map(a => (
                <li className='flex items-start justify-between gap-3 py-3' key={a.title}>
                  <div>
                    <div className='text-[13px] font-semibold text-ink-900'>{a.title}</div>
                    <div className='text-[11.5px] text-ink-500'>{a.meta}</div>
                  </div>
                  <div className='flex flex-col items-end gap-1'>
                    <Badge icon='clock' tone='warning'>
                      {a.due}
                    </Badge>
                    <button className='btn btn-ghost btn-sm' type='button'>
                      Review
                      <Icon name='arrow-right' size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            actions={<Badge tone='positive'>SOC 2 · SSAE 21</Badge>}
            subtitle='Ledger integrity & regulatory posture'
            title='Compliance posture'
          >
            <ul className='flex flex-col gap-2 text-[13px]'>
              {[
                { label: 'Ledger integrity', tone: 'positive', value: 'Healthy · 0 unposted events' },
                { label: 'Record date accuracy', tone: 'positive', value: '99.98% · last 12 months' },
                { label: 'Exception rate', tone: 'warning', value: '0.42% · slight uptick' },
                { label: 'Median turnaround', tone: 'positive', value: '14 h · best in cohort' },
              ].map(c => (
                <li className='flex items-center justify-between' key={c.label}>
                  <span className='text-ink-700'>{c.label}</span>
                  <Badge tone={c.tone as 'positive' | 'warning'}>{c.value}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title='Operations contacts'>
            <ul className='flex flex-col gap-3'>
              {[
                { initials: 'MH', name: 'Maya Hernández', role: 'Your transfer agent' },
                { initials: 'AR', name: 'Arjun Rao', role: 'Compliance lead' },
                { initials: 'PX', name: 'Proxi Ops', role: 'After-hours support' },
              ].map(o => (
                <li className='flex items-center gap-3' key={o.name}>
                  <Avatar name={o.name} size={30} tone='ink' />
                  <div>
                    <div className='text-[13px] font-semibold text-ink-900'>{o.name}</div>
                    <div className='text-[11.5px] text-ink-500'>{o.role}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
