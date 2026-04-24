import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import { Icon } from '@/components/icon'
import { ConfidenceInterval, StepProgress } from '@/components/primitives'
import { Badge, Confidence, Metric, PageHeader, Panel, StatusPill } from '@/components/ui'

const payoutSteps = [
  {
    label: 'Declared',
    state: 'done' as const,
    value: 'Board · $0.18/sh',
  },
  {
    label: 'Ledger event',
    state: 'done' as const,
    value: 'Posted · Jan 14',
  },
  {
    label: 'Eligibility',
    state: 'done' as const,
    value: '19,210 holders',
  },
  {
    label: 'Treasury',
    state: 'current' as const,
    value: '$3.57M ready',
  },
  {
    label: 'Disburse',
    state: 'upcoming' as const,
    value: 'Jan 24 · ACH + mail',
  },
  {
    label: '1099-DIV',
    state: 'upcoming' as const,
    value: 'Q1 2026',
  },
]

const history = [
  {
    coverage: '2.8×',
    disbursement: '$3,568,890',
    drip: '41.2%',
    event: 'Q4 2025',
    payDate: 'Jan 24, 2026',
    perShare: '$0.18',
    recordDate: 'Jan 22, 2026',
    status: 'pending' as const,
  },
  {
    coverage: '2.9×',
    disbursement: '$3,412,002',
    drip: '40.6%',
    event: 'Q3 2025',
    payDate: 'Oct 24, 2025',
    perShare: '$0.17',
    recordDate: 'Oct 22, 2025',
    status: 'completed' as const,
  },
  {
    coverage: '2.7×',
    disbursement: '$3,378,190',
    drip: '39.8%',
    event: 'Q2 2025',
    payDate: 'Jul 25, 2025',
    perShare: '$0.17',
    recordDate: 'Jul 23, 2025',
    status: 'completed' as const,
  },
  {
    coverage: '3.1×',
    disbursement: '$3,201,402',
    drip: '38.4%',
    event: 'Q1 2025',
    payDate: 'Apr 26, 2025',
    perShare: '$0.16',
    recordDate: 'Apr 24, 2025',
    status: 'completed' as const,
  },
  {
    coverage: '3.2×',
    disbursement: '$3,098,884',
    drip: '37.9%',
    event: 'Q4 2024',
    payDate: 'Jan 24, 2025',
    perShare: '$0.16',
    recordDate: 'Jan 22, 2025',
    status: 'completed' as const,
  },
]

const exceptions = [
  {
    amount: '$148.20',
    confHigh: 62,
    confLow: 42,
    id: 'EX-4418',
    issue: 'Fractional share policy unclear · 0.873 sh held via DRIP',
    kind: 'Fractional handling',
    shareholder: 'Nguyen, T. · SH-10284',
  },
  {
    amount: '$1,804.00',
    confHigh: 88,
    confLow: 74,
    id: 'EX-4419',
    issue: 'Missing W-9 · backup withholding will apply @ 24%',
    kind: 'Withholding',
    shareholder: 'Pemberton Trust · SH-02119',
  },
  {
    amount: '$412.80',
    confHigh: 92,
    confLow: 85,
    id: 'EX-4420',
    issue: 'Non-US holder · 1042-S filing required',
    kind: 'Tax classification',
    shareholder: 'Okada, K. · SH-33712',
  },
  {
    amount: '$54.00',
    confHigh: 58,
    confLow: 41,
    id: 'EX-4421',
    issue: 'Address RTS · returned Q3 mail, cert holder, no ACH',
    kind: 'Undeliverable',
    shareholder: 'Ellis Family Trust · SH-88103',
  },
]

const boardResolution = [
  {
    confidence: 98,
    field: 'Resolution date',
    source: 'Board minutes · pg 1, line 4',
    value: 'Jan 14, 2026',
  },
  {
    confidence: 97,
    field: 'Dividend amount per share',
    source: 'Board minutes · pg 2, line 22',
    value: '$0.18 (cash)',
  },
  {
    confidence: 97,
    field: 'Record date',
    source: 'Board minutes · pg 2, line 28',
    value: 'Jan 22, 2026',
  },
  {
    confidence: 97,
    field: 'Payment date',
    source: 'Board minutes · pg 2, line 29',
    value: 'Jan 24, 2026',
  },
  {
    confidence: 74,
    field: 'Fractional handling',
    source: 'Board minutes · pg 3, line 9',
    value: 'Cash-in-lieu at VWAP',
  },
  {
    confidence: 94,
    field: 'Payment instructions',
    source: 'Treasurer memo · attached',
    value: 'ACH primary · check fallback',
  },
]

const officers = [
  {
    name: 'Richard T. Albright',
    role: 'Chief Executive Officer',
    signed: true,
    when: 'Jan 14 · 3:41pm',
  },
  {
    name: 'Sophia Chen',
    role: 'Chief Financial Officer',
    signed: true,
    when: 'Jan 14 · 4:02pm',
  },
  {
    name: 'Miguel Ortega',
    role: 'Corporate Secretary',
    signed: true,
    when: 'Jan 14 · 4:15pm',
  },
  {
    name: 'Yvonne Park',
    role: 'Board Chair',
    signed: false,
    when: 'Awaiting · due Jan 20',
  },
]

const sustainability = [
  {
    label: 'Dividend coverage',
    sub: '2.8× · last 4 quarters',
    tone: 'positive' as const,
    value: '2.8×',
  },
  {
    label: 'Payout ratio',
    sub: 'Target 35-40%',
    tone: 'positive' as const,
    value: '36%',
  },
  {
    label: 'FCF coverage',
    sub: 'Rolling 12m',
    tone: 'positive' as const,
    value: '1.9×',
  },
  {
    label: 'Consecutive raises',
    sub: 'Up $0.02 from Q4 2024',
    tone: 'positive' as const,
    value: '7 qtrs',
  },
  {
    label: 'Forward yield',
    sub: 'Industry median 1.8%',
    tone: 'neutral' as const,
    value: '1.42%',
  },
]

export default function IssuerDividendsPage() {
  return (
    <AppShell breadcrumbs={[{ href: '/issuer', label: 'Issuer' }, { label: 'Dividends · Q4 2025' }]} portal='issuer'>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='download' size={13} />
              Export register
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='pause' size={13} />
              Pause event
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='check' size={13} />
              Authorize disbursement
            </button>
          </>
        }
        eyebrow='DIV-2026-Q4 · Meridian Optics, Inc.'
        subtitle='Q4 2025 cash dividend · $0.18/share · record Jan 22, pay Jan 24'
        title='Dividend workflow'
      />

      <div className='mb-6 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric helper='19,210 holders of record' label='Gross disbursement' value='$3.57M' />
        <Metric helper='7 quarters of increases' label='Per-share amount' trend='up' value='$0.18' />
        <Metric delta='+0.6 pp QoQ' helper='4,412 DRIP-enrolled' label='DRIP participation' trend='up' value='41.2%' />
        <Metric helper='3 unresolved · 1 high risk' label='Exceptions' value='4' />
      </div>

      <Panel
        subtitle='From board declaration to 1099-DIV filing. Every step is timestamped and reversible until disbursement.'
        title='Event process tracker'
      >
        <StepProgress steps={payoutSteps} />
        <div className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-3'>
          <div className='soft-box'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Next action</div>
            <div className='mt-0.5 text-[14px] font-semibold text-ink-900'>Authorize disbursement</div>
            <div className='mt-1 text-[12px] text-ink-600'>CFO + Treasurer dual approval · due Jan 20 · $3.57M to settle.</div>
          </div>
          <div className='soft-box'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Eligibility snapshot</div>
            <div className='mt-0.5 text-[14px] font-semibold text-ink-900'>19,210 holders · 19.87M shares</div>
            <div className='mt-1 text-[12px] text-ink-600'>Frozen at record date Jan 22 · ledger reconciliation 100%.</div>
          </div>
          <div className='soft-box'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Straight-through</div>
            <div className='mt-0.5 text-[14px] font-semibold text-ink-900'>18,982 / 19,210 · 98.8%</div>
            <div className='mt-1 text-[12px] text-ink-600'>228 holders routed to exception queue for review.</div>
          </div>
        </div>
      </Panel>

      <div className='mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]'>
        <div className='flex flex-col gap-5'>
          <Panel
            actions={
              <button className='btn btn-ghost btn-sm' type='button'>
                Export · CSV
                <Icon name='download' size={13} />
              </button>
            }
            padded={false}
            subtitle='Disbursements, DRIP participation, and coverage ratios'
            title='Payment history'
          >
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Record</th>
                    <th>Pay</th>
                    <th className='cell-num'>Per share</th>
                    <th className='cell-num'>Disbursement</th>
                    <th className='cell-num'>DRIP %</th>
                    <th className='cell-num'>Coverage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.event}>
                      <td>
                        <div className='cell-primary'>{h.event}</div>
                      </td>
                      <td className='cell-muted'>{h.recordDate}</td>
                      <td className='cell-muted'>{h.payDate}</td>
                      <td className='cell-num num cell-primary'>{h.perShare}</td>
                      <td className='cell-num num'>{h.disbursement}</td>
                      <td className='cell-num num'>{h.drip}</td>
                      <td className='cell-num num'>{h.coverage}</td>
                      <td>
                        <StatusPill status={h.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            actions={
              <>
                <button className='btn btn-secondary btn-sm' type='button'>
                  <Icon name='filter' size={12} />
                  High-risk only
                </button>
                <button className='btn btn-ghost btn-sm' type='button'>
                  Bulk resolve
                </button>
              </>
            }
            padded={false}
            subtitle='Holders routed out of straight-through — resolve before disbursement'
            title='Exception queue · 4'
          >
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Holder</th>
                    <th>Kind</th>
                    <th>Issue</th>
                    <th className='cell-num'>Amount</th>
                    <th>AI confidence</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map(e => (
                    <tr className='table-row-clickable' key={e.id}>
                      <td>
                        <div className='cell-primary'>{e.shareholder}</div>
                        <div className='mono text-[11px] text-ink-500'>{e.id}</div>
                      </td>
                      <td>
                        <Badge tone='warning'>{e.kind}</Badge>
                      </td>
                      <td className='cell-muted'>{e.issue}</td>
                      <td className='cell-num num'>{e.amount}</td>
                      <td>
                        <ConfidenceInterval high={e.confHigh} low={e.confLow} />
                      </td>
                      <td>
                        <button className='btn btn-ghost btn-sm' type='button'>
                          Review
                          <Icon name='arrow-right' size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            actions={
              <Badge icon='sparkles' tone='brand'>
                AI-extracted
              </Badge>
            }
            subtitle='Proxi extracted these fields from your board minutes and treasurer memo. Hover or click a field to see the source.'
            title='Board resolution · document intake'
          >
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]'>
              <div>
                <div className='table-wrap'>
                  <table className='table'>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Confidence</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boardResolution.map(f => (
                        <tr className='table-row-clickable' key={f.field}>
                          <td className='cell-muted'>{f.field}</td>
                          <td className='cell-primary'>{f.value}</td>
                          <td>
                            <Confidence value={f.confidence} />
                          </td>
                          <td className='cell-muted'>
                            <span className='flex items-center gap-1.5'>
                              <Icon className='text-ink-400' name='file-text' size={12} />
                              {f.source}
                              <Icon className='text-ink-400' name='eye' size={12} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className='mt-3'>
                  <Callout icon='alert-triangle' tone='warning'>
                    Fractional handling extracted at 74% · confirm cash-in-lieu vs. round-down before disbursement.
                  </Callout>
                </div>
              </div>
              <div className='soft-box'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Supporting documents</div>
                <ul className='mt-2 flex flex-col gap-2 text-[12.5px]'>
                  {[
                    { label: 'Board minutes · Jan 14, 2026', meta: '6 pages · signed' },
                    { label: 'Treasurer memo', meta: '2 pages · signed' },
                    { label: 'Dividend calculation', meta: 'XLSX · AI-matched' },
                    { label: 'Prior 10-Q', meta: 'SEC · cross-referenced' },
                  ].map(d => (
                    <li className='flex items-center gap-2 rounded-sm border border-line bg-white px-2.5 py-2' key={d.label}>
                      <Icon className='text-ink-500' name='file-text' size={13} />
                      <div className='flex-1 min-w-0'>
                        <div className='truncate text-[13px] font-semibold text-ink-900'>{d.label}</div>
                        <div className='text-[11px] text-ink-500'>{d.meta}</div>
                      </div>
                      <Icon className='text-ink-400' name='eye' size={12} />
                    </li>
                  ))}
                </ul>
                <button className='btn btn-secondary btn-sm mt-3 w-full justify-center' type='button'>
                  <Icon name='upload' size={12} />
                  Upload another document
                </button>
              </div>
            </div>
          </Panel>

          <Panel subtitle='Signature and approval trail for this declaration' title='Officer signatures'>
            <ul className='divide-y divide-line'>
              {officers.map(o => (
                <li className='flex items-center justify-between gap-3 py-3' key={o.name}>
                  <div className='flex items-center gap-3'>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        o.signed ? 'bg-positive-100 text-positive-700' : 'bg-surface-sunken text-ink-500'
                      }`}
                    >
                      <Icon name={o.signed ? 'badge-check' : 'clock'} size={16} />
                    </div>
                    <div>
                      <div className='text-[13px] font-semibold text-ink-900'>{o.name}</div>
                      <div className='text-[11.5px] text-ink-500'>{o.role}</div>
                    </div>
                  </div>
                  <Badge tone={o.signed ? 'positive' : 'warning'}>{o.when}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <aside className='flex flex-col gap-5 lg:sticky lg:top-[80px] lg:self-start'>
          <Panel
            actions={<Badge tone='positive'>Healthy</Badge>}
            subtitle='Proxi evaluates whether this dividend is sustainable against your own financial history.'
            title='Sustainability analysis'
          >
            <ul className='flex flex-col gap-3'>
              {sustainability.map(s => (
                <li className='flex items-center justify-between gap-3' key={s.label}>
                  <div>
                    <div className='text-[13px] font-semibold text-ink-900'>{s.label}</div>
                    <div className='text-[11.5px] text-ink-500'>{s.sub}</div>
                  </div>
                  <Badge tone={s.tone}>{s.value}</Badge>
                </li>
              ))}
            </ul>
            <div className='mt-3'>
              <Callout icon='sparkles' tone='brand'>
                No sustainability flags. Dividend is covered 2.8× by TTM net income.
              </Callout>
            </div>
          </Panel>

          <Panel
            actions={<Badge tone='brand'>41.2%</Badge>}
            subtitle='4,412 holders enrolled in the dividend reinvestment plan'
            title='DRIP participation'
          >
            <ul className='flex flex-col gap-2 text-[13px]'>
              <li className='flex items-center justify-between'>
                <span className='text-ink-700'>Auto-enrolled</span>
                <span className='num font-semibold text-ink-900'>3,802</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-700'>Opted-in this quarter</span>
                <span className='num font-semibold text-ink-900'>+610</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-700'>Shares to be reinvested</span>
                <span className='num font-semibold text-ink-900'>~22,412</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-700'>Reinvestment price (est.)</span>
                <span className='num font-semibold text-ink-900'>$82.44 VWAP</span>
              </li>
              <li className='flex items-center justify-between'>
                <span className='text-ink-700'>Fractional handling</span>
                <Badge tone='warning'>Cash-in-lieu</Badge>
              </li>
            </ul>
          </Panel>

          <Panel subtitle='Dual approval required before Treasury releases funds' title='Approval chain'>
            <ol className='timeline'>
              <li className='timeline-item ok'>
                <div className='timeline-meta'>Jan 14 · 4:02pm</div>
                <div className='timeline-title'>CFO sign-off</div>
                <div className='timeline-body'>Sophia Chen · approved</div>
              </li>
              <li className='timeline-item info'>
                <div className='timeline-meta'>Jan 18 · pending</div>
                <div className='timeline-title'>Treasurer release</div>
                <div className='timeline-body'>Dual approval · awaiting Aisha K.</div>
              </li>
              <li className='timeline-item'>
                <div className='timeline-meta'>Jan 24 · scheduled</div>
                <div className='timeline-title'>ACH file generated</div>
                <div className='timeline-body'>Proxi · disburses automatically once released</div>
              </li>
            </ol>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
