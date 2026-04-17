'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { ConfidenceInterval } from '@/components/primitives'
import { Avatar, Badge, type StatusTone } from '@/components/ui'

export type Risk = {
  body: string
  severity: 'high' | 'low' | 'med'
  title: string
}

export type ExtractedField = {
  confHigh: number
  confLow: number
  label: string
  page: number
  sourceDoc: string
  tone: StatusTone
  value: string
  warning?: string
}

export type AgentDoc = {
  kind: string
  label: string
  pages: number
  state: 'issue' | 'ok' | 'pending'
}

export type AgentCase = {
  assignee: { initials: string; name: string }
  confHigh: number
  confLow: number
  docs: AgentDoc[]
  due: string
  extraction: ExtractedField[]
  id: string
  inquiryType: string
  issuer: string
  kyc: {
    match: number
    status: 'failed' | 'passed' | 'pending'
    when: string
  }
  overview: string
  risks: Risk[]
  shareholder: string
  shares: string
  summary: string
  suggestedFocus: string[]
  title: string
  urgency: 'high' | 'low' | 'med'
  value: string
}

function urgencyLabel(u: AgentCase['urgency']) {
  return u === 'high' ? 'Urgent' : u === 'med' ? 'Normal' : 'Low'
}

function confidenceReason(c: AgentCase) {
  if (c.confLow < 65) return 'Confidence is low because multiple extracted fields disagree with our registration-of-record.'
  if (c.confLow < 85) return 'Confidence is moderate — a few fields need reviewer confirmation before posting.'
  return 'Confidence is high. Straight-through eligible after a quick visual sanity check.'
}

export function Workbench({ cases }: { cases: AgentCase[] }) {
  const [activeId, setActiveId] = useState(cases[0]!.id)
  const [tab, setTab] = useState<'documents' | 'fields' | 'kyc' | 'summary' | 'timeline'>('fields')
  const [filter, setFilter] = useState<'assigned' | 'high' | 'low-conf' | 'queue'>('queue')

  const visibleCases = useMemo(() => {
    if (filter === 'high') return cases.filter(c => c.urgency === 'high')
    if (filter === 'low-conf') return cases.filter(c => c.confLow < 75)
    if (filter === 'assigned') return cases.filter(c => c.assignee.name === 'Maya H.')
    return cases
  }, [cases, filter])

  const active = cases.find(c => c.id === activeId) ?? cases[0]!

  return (
    <div className='grid min-h-[720px] grid-cols-1 gap-4 lg:grid-cols-[340px_1fr_340px]'>
      {/* LEFT: Queue */}
      <aside className='panel flex flex-col' style={{ overflow: 'hidden' }}>
        <div className='panel-header'>
          <div>
            <div className='panel-title'>Action queue</div>
            <div className='panel-subtitle'>{cases.length} cases · sorted by urgency</div>
          </div>
          <button className='btn btn-ghost btn-sm' type='button'>
            <Icon name='filter' size={13} />
          </button>
        </div>
        <div className='border-b border-line px-3 pb-3 pt-1'>
          <div
            className='tabs text-[12px]'
            onClick={e => {
              const t = (e.target as HTMLElement).closest('[data-f]')
              if (t) setFilter(t.getAttribute('data-f') as typeof filter)
            }}
            role='tablist'
          >
            <div className={`tab ${filter === 'queue' ? 'active' : ''}`} data-f='queue'>
              Queue
              <span className='tab-count num'>{cases.length}</span>
            </div>
            <div className={`tab ${filter === 'high' ? 'active' : ''}`} data-f='high'>
              Urgent
              <span className='tab-count num'>{cases.filter(c => c.urgency === 'high').length}</span>
            </div>
            <div className={`tab ${filter === 'low-conf' ? 'active' : ''}`} data-f='low-conf'>
              Low conf
              <span className='tab-count num'>{cases.filter(c => c.confLow < 75).length}</span>
            </div>
            <div className={`tab ${filter === 'assigned' ? 'active' : ''}`} data-f='assigned'>
              Mine
            </div>
          </div>
        </div>
        <div className='queue-list flex-1'>
          {visibleCases.map(c => (
            <button
              className={`queue-item w-full text-left ${c.id === activeId ? 'active' : ''}`}
              key={c.id}
              onClick={() => setActiveId(c.id)}
              type='button'
            >
              <div className='queue-item-top'>
                <div className='flex items-center gap-2'>
                  <span className={`urgency-dot ${c.urgency}`} />
                  <span className='queue-item-title'>{c.title}</span>
                </div>
                <Avatar name={c.assignee.name} size={22} tone={c.assignee.name === 'Unassigned' ? 'neutral' : 'ink'} />
              </div>
              <div className='queue-item-meta'>
                <span className='mono'>{c.id}</span>
                <span>·</span>
                <span>{c.inquiryType}</span>
              </div>
              <div className='queue-item-meta'>
                <span className='flex items-center gap-1'>
                  <Icon name='clock' size={10} />
                  {c.due}
                </span>
                <span className='ml-auto'>
                  <ConfidenceInterval high={c.confHigh} low={c.confLow} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* CENTER: Review panel */}
      <section className='panel flex flex-col'>
        <div className='panel-header'>
          <div className='min-w-0'>
            <div className='mb-1 flex items-center gap-2'>
              <span className='mono text-[11.5px] text-ink-500'>{active.id}</span>
              <Badge
                icon={active.urgency === 'high' ? 'alert-triangle' : 'clock'}
                tone={active.urgency === 'high' ? 'danger' : active.urgency === 'med' ? 'warning' : 'neutral'}
              >
                {urgencyLabel(active.urgency)} · due {active.due}
              </Badge>
              <Badge tone='brand'>{active.inquiryType}</Badge>
            </div>
            <div className='panel-title'>{active.title}</div>
            <div className='panel-subtitle'>
              {active.shareholder} · {active.issuer} · {active.shares} shares · {active.value}
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <button className='btn btn-ghost btn-sm' type='button'>
              <Icon name='copy' size={13} />
              Copy case link
            </button>
            <Link className='btn btn-secondary btn-sm' href={`/agent/transfers/${active.id}`}>
              Open full case
              <Icon name='arrow-right' size={13} />
            </Link>
          </div>
        </div>

        <div className='panel-body flex flex-col gap-4'>
          <div className='soft-box'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>AI summary</div>
                <p className='mt-1 text-[13px] text-ink-800'>{active.overview}</p>
              </div>
              <div className='flex shrink-0 flex-col items-end gap-1'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>AI confidence</div>
                <ConfidenceInterval high={active.confHigh} low={active.confLow} />
              </div>
            </div>
          </div>

          <div
            className='tabs'
            onClick={e => {
              const t = (e.target as HTMLElement).closest('[data-tab]')
              if (t) setTab(t.getAttribute('data-tab') as typeof tab)
            }}
            role='tablist'
          >
            {(
              [
                { count: undefined, id: 'summary', label: 'Summary' },
                {
                  count: active.extraction.length,
                  id: 'fields',
                  label: 'Extracted fields',
                },
                {
                  count: active.docs.length,
                  id: 'documents',
                  label: 'Documents',
                },
                { count: undefined, id: 'kyc', label: 'KYC' },
                { count: undefined, id: 'timeline', label: 'Timeline' },
              ] as const
            ).map(t => (
              <div className={`tab ${tab === t.id ? 'active' : ''}`} data-tab={t.id} key={t.id} role='tab'>
                {t.label}
                {t.count !== undefined && <span className='tab-count num'>{t.count}</span>}
              </div>
            ))}
          </div>

          {tab === 'summary' && (
            <div className='flex flex-col gap-3'>
              <p className='text-[13.5px] text-ink-700'>{active.summary}</p>
              <dl className='dl rounded-[10px] border border-line bg-surface-2 p-4'>
                <dt>Assigned to</dt>
                <dd>{active.assignee.name}</dd>
                <dt>Inquiry type</dt>
                <dd>{active.inquiryType}</dd>
                <dt>Shareholder</dt>
                <dd>{active.shareholder}</dd>
                <dt>Issuer</dt>
                <dd>{active.issuer}</dd>
                <dt>Shares · value</dt>
                <dd className='num'>
                  {active.shares} · {active.value}
                </dd>
              </dl>
            </div>
          )}

          {tab === 'fields' && (
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Extracted value</th>
                    <th>Confidence</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {active.extraction.map(f => (
                    <tr key={f.label}>
                      <td className='cell-muted'>{f.label}</td>
                      <td>
                        <div className='cell-primary flex items-center gap-2'>
                          {f.value}
                          {f.warning && (
                            <Badge icon='alert-triangle' tone='warning'>
                              {f.warning}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <ConfidenceInterval high={f.confHigh} low={f.confLow} />
                      </td>
                      <td>
                        <button className='inline-flex items-center gap-1.5 text-[12.5px] text-ink-600 hover:text-ink-900' type='button'>
                          <Icon name='file-text' size={12} />
                          {f.sourceDoc} · pg {f.page}
                          <Icon name='eye' size={12} />
                        </button>
                      </td>
                      <td>
                        <div className='flex items-center gap-1'>
                          <button className='btn btn-ghost btn-sm' title='Approve field' type='button'>
                            <Icon name='check' size={12} />
                          </button>
                          <button className='btn btn-ghost btn-sm' title='Edit value' type='button'>
                            <Icon name='pencil' size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'documents' && (
            <div className='evidence-strip'>
              {active.docs.map(d => (
                <button className='evidence-thumb' key={d.label} type='button'>
                  <Icon name='file-text' size={28} />
                  <span className='evidence-thumb-badge'>{d.pages} pp</span>
                  <span className='evidence-thumb-label'>
                    {d.label}
                    <span
                      className='block text-[10px] opacity-80'
                      style={{
                        color: d.state === 'ok' ? 'var(--color-positive-500)' : d.state === 'issue' ? 'var(--color-danger-500)' : 'white',
                      }}
                    >
                      {d.kind} · {d.state}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === 'kyc' && (
            <div className='flex flex-col gap-3'>
              <div className='flex items-center gap-3 rounded-[10px] border border-line bg-white p-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700'>
                  <Icon name='id-card' size={18} />
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='text-[13.5px] font-semibold text-ink-900'>
                    Identity match · <span className='num'>{active.kyc.match}%</span>
                  </div>
                  <div className='text-[11.5px] text-ink-500'>
                    {active.kyc.when} · {active.kyc.status} · OFAC / SDN cleared
                  </div>
                </div>
                <Badge tone={active.kyc.status === 'passed' ? 'positive' : active.kyc.status === 'failed' ? 'danger' : 'warning'}>
                  {active.kyc.status}
                </Badge>
              </div>
              <div className='evidence-strip'>
                <div className='evidence-thumb'>
                  <Icon name='id-card' size={28} />
                  <span className='evidence-thumb-badge'>Primary</span>
                  <span className='evidence-thumb-label'>Government ID (front)</span>
                </div>
                <div className='evidence-thumb'>
                  <Icon name='id-card' size={28} />
                  <span className='evidence-thumb-badge'>Back</span>
                  <span className='evidence-thumb-label'>Government ID (back)</span>
                </div>
                <div className='evidence-thumb'>
                  <Icon name='scan-search' size={28} />
                  <span className='evidence-thumb-badge'>Selfie</span>
                  <span className='evidence-thumb-label'>Liveness check</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <ol className='timeline'>
              <li className='timeline-item ok'>
                <div className='timeline-meta'>Jan 18 · 10:02am</div>
                <div className='timeline-title'>Case created · documents received</div>
                <div className='timeline-body'>3 files · 11 pages · SHA-256 hashed</div>
              </li>
              <li className='timeline-item ok'>
                <div className='timeline-meta'>Jan 18 · 10:02am</div>
                <div className='timeline-title'>AI extraction ran</div>
                <div className='timeline-body'>OpenAI structured output + Textract · model gpt-4.1-mini</div>
              </li>
              <li className='timeline-item info'>
                <div className='timeline-meta'>Jan 18 · 10:04am</div>
                <div className='timeline-title'>Routed to reviewer</div>
                <div className='timeline-body'>{active.assignee.name} · confidence below straight-through threshold</div>
              </li>
              <li className='timeline-item warn'>
                <div className='timeline-meta'>Jan 18 · 10:18am</div>
                <div className='timeline-title'>Risk flags raised</div>
                <div className='timeline-body'>{active.risks.length} flags · see assistant panel</div>
              </li>
            </ol>
          )}
        </div>

        <footer className='panel-footer'>
          <div className='flex items-center gap-2 text-[11.5px] text-ink-500'>
            <Icon name='shield-check' size={12} />
            All reviewer actions are logged · dual approval required for ledger posting
          </div>
          <div className='flex items-center gap-2'>
            <button className='btn btn-secondary btn-sm' type='button'>
              Request more info
            </button>
            <button className='btn btn-danger btn-sm' type='button'>
              <Icon name='x' size={13} />
              Deny
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='check' size={13} />
              Approve
            </button>
          </div>
        </footer>
      </section>

      {/* RIGHT: Assistant + risks */}
      <aside className='flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start'>
        <section className='panel'>
          <div className='panel-header'>
            <div>
              <div className='panel-title flex items-center gap-2'>
                <span className='flex h-6 w-6 items-center justify-center rounded-sm bg-brand-700 text-white'>
                  <Icon name='sparkles' size={13} />
                </span>
                Proxi copilot · {active.id}
              </div>
              <div className='panel-subtitle'>Explains why confidence is lower and what to focus on</div>
            </div>
          </div>
          <div className='panel-body flex flex-col gap-3'>
            <div className='soft-box'>
              <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>
                Why confidence is {active.confLow}–{active.confHigh}%
              </div>
              <p className='mt-1 text-[13px] text-ink-700'>{confidenceReason(active)}</p>
            </div>
            <div>
              <div className='mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>
                Risk flags ({active.risks.length})
              </div>
              <div className='risk-list'>
                {active.risks.map(r => (
                  <div className={`risk-item ${r.severity}`} key={r.title}>
                    <div
                      style={{
                        color:
                          r.severity === 'high'
                            ? 'var(--color-danger-700)'
                            : r.severity === 'med'
                              ? 'var(--color-warning-700)'
                              : 'var(--color-ink-500)',
                      }}
                    >
                      <Icon name='alert-triangle' size={15} />
                    </div>
                    <div>
                      <div className='risk-title'>{r.title}</div>
                      <div className='risk-body'>{r.body}</div>
                    </div>
                    <button className='btn btn-ghost btn-sm' type='button'>
                      <Icon name='eye' size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className='mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Suggested review focus</div>
              <ul className='flex flex-col gap-1.5'>
                {active.suggestedFocus.map(s => (
                  <li className='flex items-start gap-2 text-[12.5px] text-ink-700' key={s}>
                    <Icon className='mt-0.5 text-brand-700' name='check' size={12} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <footer className='panel-footer'>
            <div className='flex w-full items-center gap-2'>
              <Icon className='text-brand-700' name='sparkles' size={13} />
              <input className='input flex-1' placeholder='Ask about this case · e.g. "Compare to SH-10284 history"' />
              <button className='btn btn-brand btn-sm' type='button'>
                <Icon name='send' size={12} />
              </button>
            </div>
          </footer>
        </section>

        <section className='panel'>
          <div className='panel-header'>
            <div>
              <div className='panel-title'>Similar cases</div>
              <div className='panel-subtitle'>Best-practice benchmarks</div>
            </div>
          </div>
          <div className='panel-body'>
            <ul className='flex flex-col gap-2 text-[12.5px]'>
              {[
                {
                  id: 'TR-119882',
                  meta: 'Same issuer · signature variance resolved',
                  outcome: 'approved',
                },
                {
                  id: 'TR-120001',
                  meta: 'DRS → DTC · medallion re-stamped',
                  outcome: 'approved',
                },
                {
                  id: 'TR-120188',
                  meta: 'Registration mismatch · rejected',
                  outcome: 'rejected',
                },
              ].map(s => (
                <li className='flex items-center justify-between gap-2' key={s.id}>
                  <div>
                    <div className='mono text-[12px] text-ink-800'>{s.id}</div>
                    <div className='text-[11px] text-ink-500'>{s.meta}</div>
                  </div>
                  <Badge tone={s.outcome === 'approved' ? 'positive' : 'danger'}>{s.outcome}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </aside>
    </div>
  )
}
