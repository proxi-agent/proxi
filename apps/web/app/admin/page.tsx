import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import {
  Avatar,
  Badge,
  Chip,
  Confidence,
  Metric,
  PageHeader,
  Panel,
  StatusPill,
  Tabs,
} from '@/components/ui'

const risks = [
  {
    age: '14h',
    confidence: 28,
    entity: 'Teagan Estate → Meridian Optics',
    flag: 'Potential identity fraud',
    id: 'RSK-9042',
    severity: 'Critical',
    tone: 'danger' as const,
  },
  {
    age: '2d',
    confidence: 52,
    entity: 'Lumen Capital Partners LP',
    flag: 'Large insider position change',
    id: 'RSK-9038',
    severity: 'High',
    tone: 'warning' as const,
  },
  {
    age: '3d',
    confidence: 61,
    entity: 'Jonas Winters · NRA',
    flag: 'Tax form inconsistency',
    id: 'RSK-9025',
    severity: 'Medium',
    tone: 'warning' as const,
  },
  {
    age: '5d',
    confidence: 74,
    entity: 'Northbank Asset Mgmt',
    flag: 'Unusual transfer pattern (geo)',
    id: 'RSK-9019',
    severity: 'Medium',
    tone: 'warning' as const,
  },
]

const policies = [
  {
    category: 'Transfers',
    enforcement: 'Automatic',
    name: 'Straight-through confidence threshold',
    status: 'Enforced',
    tone: 'positive' as const,
    updated: 'Jan 12',
    value: '≥ 92%',
  },
  {
    category: 'KYC',
    enforcement: 'Blocking',
    name: 'Medallion required above value threshold',
    status: 'Enforced',
    tone: 'positive' as const,
    updated: 'Nov 04',
    value: '≥ $250K',
  },
  {
    category: 'Transfers',
    enforcement: 'Hold',
    name: 'Insider lock-up auto-hold',
    status: 'Enforced',
    tone: 'positive' as const,
    updated: 'Oct 28',
    value: 'By schedule',
  },
  {
    category: 'Dividends',
    enforcement: 'Manual approval',
    name: 'NRA withholding exception review',
    status: 'Under review',
    tone: 'warning' as const,
    updated: 'Yesterday',
    value: '30% default',
  },
  {
    category: 'Access',
    enforcement: 'Required',
    name: 'MFA for reviewer actions',
    status: 'Enforced',
    tone: 'positive' as const,
    updated: 'Mar 2025',
    value: 'All reviewers',
  },
]

const audit = [
  {
    actor: 'Proxi AI',
    body: '94.6% straight-through · 22 exceptions raised to human review',
    status: 'ok' as const,
    subject: 'Transfer pipeline ran',
    time: '10:02 ET',
  },
  {
    actor: 'Daniel Chen',
    body: 'Override: approved name variance TR-120612 with note',
    status: 'info' as const,
    subject: 'Reviewer override',
    time: '09:45 ET',
  },
  {
    actor: 'Maya Ruiz',
    body: 'NRA withholding manual exception rule moved to review',
    status: 'warn' as const,
    subject: 'Policy amendment queued',
    time: '09:12 ET',
  },
  {
    actor: 'Proxi AI',
    body: 'Ledger snapshot taken · hash 0x1ad9…be42',
    status: 'ok' as const,
    subject: 'Immutable snapshot',
    time: '03:00 ET',
  },
  {
    actor: 'System',
    body: '2 failed login attempts on admin@meridianoptics.com · blocked',
    status: 'danger' as const,
    subject: 'Access event',
    time: '02:18 ET',
  },
]

const roles = [
  { count: 14, label: 'Compliance officers', tone: 'accent' as const },
  { count: 42, label: 'Reviewers', tone: 'brand' as const },
  { count: 28, label: 'Issuer admins', tone: 'violet' as const },
  { count: 3, label: 'Platform super-admins', tone: 'info' as const },
]

export default function AdminOverview() {
  return (
    <AppShell portal='admin'>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='download' size={14} />
              Export audit
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='scroll' size={14} />
              Manage policies
            </button>
            <button className='btn btn-primary btn-sm' type='button'>
              <Icon name='shield-check' size={14} />
              Run attestation
            </button>
          </>
        }
        eyebrow='Platform-wide · 8 issuers · 42,102 holders'
        subtitle='Risk review, audit controls, and policy visibility across every tenant.'
        title='Compliance overview'
      />

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric
          delta='-6 pts WoW'
          helper='composite score'
          label='Platform risk score'
          trend='down'
          value='Low · 14'
        />
        <Metric
          delta='4 new today'
          helper='14 critical · 11 high'
          label='Cases in review'
          trend='up'
          value='25'
        />
        <Metric
          helper='resolved in 48h'
          label='Escalations closed'
          value='9'
        />
        <Metric
          delta='0 overdue'
          helper='SOC 2 control'
          label='Policy violations'
          trend='flat'
          value='0'
        />
      </div>

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]'>
        <div className='flex flex-col gap-5'>
          <Panel
            actions={
              <>
                <Chip active count={14}>
                  Critical
                </Chip>
                <Chip count={11}>High</Chip>
                <Chip count={4}>Fraud signals</Chip>
                <button className='btn btn-ghost btn-sm' type='button'>
                  <Icon name='filter' size={13} />
                  More
                </button>
              </>
            }
            padded={false}
            subtitle='Cases that AI or rules engines flagged for human judgment'
            title='Risk review · 25 items'
          >
            <div className='table-wrap rounded-none border-none shadow-none'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Flag</th>
                    <th>Entity</th>
                    <th>AI confidence</th>
                    <th>Severity</th>
                    <th>Age</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r) => (
                    <tr className='table-row-clickable' key={r.id}>
                      <td>
                        <div className='mono text-[12px] font-semibold text-[color:var(--color-ink-800)]'>
                          {r.id}
                        </div>
                      </td>
                      <td>
                        <Badge icon='alert-triangle' tone={r.tone}>
                          {r.flag}
                        </Badge>
                      </td>
                      <td className='cell-primary'>{r.entity}</td>
                      <td>
                        <Confidence value={r.confidence} />
                      </td>
                      <td>
                        <Badge tone={r.tone}>{r.severity}</Badge>
                      </td>
                      <td className='cell-muted num'>{r.age}</td>
                      <td>
                        <button
                          className='btn btn-ghost btn-sm'
                          type='button'
                        >
                          Review
                          <Icon name='chevron-right' size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className='grid grid-cols-1 gap-5 md:grid-cols-[1.3fr_1fr]'>
            <Panel
              actions={
                <button className='btn btn-ghost btn-sm' type='button'>
                  Policy library
                  <Icon name='arrow-right' size={13} />
                </button>
              }
              padded={false}
              subtitle='Policies, thresholds, and rule enforcement across tenants'
              title='Policy visibility'
            >
              <div className='table-wrap rounded-none border-none shadow-none'>
                <table className='table'>
                  <thead>
                    <tr>
                      <th>Policy</th>
                      <th>Category</th>
                      <th>Value</th>
                      <th>Enforcement</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((p) => (
                      <tr key={p.name}>
                        <td className='cell-primary'>{p.name}</td>
                        <td className='cell-muted'>{p.category}</td>
                        <td className='num'>{p.value}</td>
                        <td>
                          <Badge outline>{p.enforcement}</Badge>
                        </td>
                        <td>
                          <Badge tone={p.tone}>{p.status}</Badge>
                        </td>
                        <td className='cell-muted num'>{p.updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel padded={false} title='Audit stream'>
              <div className='p-4'>
                <Tabs
                  items={[
                    { id: 'today', label: 'Today' },
                    { count: 312, id: 'week', label: 'Last 7 days' },
                    { id: 'pinned', label: 'Pinned' },
                  ]}
                  value='today'
                />
                <div className='timeline mt-4'>
                  {audit.map((a, i) => (
                    <div className={`timeline-item ${a.status}`} key={i}>
                      <div className='timeline-meta'>
                        {a.time} · {a.actor}
                      </div>
                      <div className='timeline-title'>{a.subject}</div>
                      <div className='timeline-body'>{a.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <aside className='flex flex-col gap-5'>
          <Panel
            actions={<Badge tone='positive'>SOC 2 · Ready</Badge>}
            title='Control health'
          >
            <ul className='flex flex-col gap-3'>
              {[
                {
                  label: 'Immutable ledger integrity',
                  status: 'Verified · hourly',
                  tone: 'positive' as const,
                },
                {
                  label: 'Reviewer MFA enforcement',
                  status: '100% coverage',
                  tone: 'positive' as const,
                },
                {
                  label: 'Segregation of duties',
                  status: 'Enforced · 0 violations',
                  tone: 'positive' as const,
                },
                {
                  label: 'Vendor key rotation',
                  status: 'Due in 14 days',
                  tone: 'warning' as const,
                },
                {
                  label: 'Data retention policy',
                  status: 'Aligned to FINRA 3110',
                  tone: 'positive' as const,
                },
              ].map((c) => (
                <li
                  className='flex items-center justify-between'
                  key={c.label}
                >
                  <span className='text-[13px] text-[color:var(--color-ink-800)]'>
                    {c.label}
                  </span>
                  <Badge tone={c.tone}>{c.status}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel padded={false} title='Users & roles'>
            <div className='p-4'>
              <div className='grid grid-cols-2 gap-2'>
                {roles.map((r) => (
                  <div
                    className='rounded-[8px] border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2.5'
                    key={r.label}
                  >
                    <div className='flex items-center gap-2 text-[11.5px] text-[color:var(--color-ink-500)]'>
                      <Badge tone={r.tone}>{r.label.split(' ')[0]}</Badge>
                    </div>
                    <div className='mt-1 flex items-baseline justify-between'>
                      <span className='num text-[18px] font-semibold text-[color:var(--color-ink-900)]'>
                        {r.count}
                      </span>
                      <span className='text-[11.5px] text-[color:var(--color-ink-500)]'>
                        active
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className='hr' />
              <div className='flex items-center justify-between'>
                <span className='text-[12.5px] text-[color:var(--color-ink-600)]'>
                  Pending access reviews
                </span>
                <Badge tone='warning'>7 due</Badge>
              </div>
              <button className='btn btn-secondary btn-sm mt-3 w-full' type='button'>
                <Icon name='users' size={13} />
                Open access review
              </button>
            </div>
          </Panel>

          <Panel subtitle='Oversight on-call' title='On-shift'>
            <ul className='flex flex-col gap-2'>
              {[
                {
                  name: 'Maya Ruiz',
                  role: 'Compliance officer · Lead',
                  tone: 'ink' as const,
                },
                {
                  name: 'Ravi Menon',
                  role: 'KYC specialist',
                  tone: 'brand' as const,
                },
                {
                  name: 'Cam Lopez',
                  role: 'AML analyst',
                  tone: 'violet' as const,
                },
              ].map((u) => (
                <li
                  className='flex items-center gap-2 rounded-[8px] border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2'
                  key={u.name}
                >
                  <Avatar name={u.name} size={26} tone={u.tone} />
                  <div>
                    <div className='text-[13px] font-semibold text-[color:var(--color-ink-900)]'>
                      {u.name}
                    </div>
                    <div className='text-[11.5px] text-[color:var(--color-ink-500)]'>
                      {u.role}
                    </div>
                  </div>
                  <StatusPill status='ready' />
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </AppShell>
  )
}
