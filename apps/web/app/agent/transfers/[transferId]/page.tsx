import { AppShell } from '@/components/app-shell'
import { ProxiAssistant } from '@/components/assistant'
import { Icon } from '@/components/icon'
import { Avatar, Badge, Confidence, PageHeader, Panel, StatusPill, Tabs } from '@/components/ui'

type ExtractedField = {
  confidence: number
  label: string
  note?: string
  source: string
  value: string
  warning?: string
}

const extracted: ExtractedField[] = [
  {
    confidence: 98,
    label: 'Issuer',
    source: 'Stock power p.1 §1 · CUSIP match',
    value: 'Meridian Optics, Inc. (CUSIP 589543 10 2)',
  },
  {
    confidence: 97,
    label: 'Shares',
    source: 'Stock power p.1 §2 · numeric + written cross-check',
    value: '500',
  },
  {
    confidence: 42,
    label: 'Registered holder',
    note: 'Name on form is "Elenor Hayes" but ledger has "Eleanor M. Hayes".',
    source: 'Stock power p.1 signer block',
    value: 'Eleanor M. Hayes',
    warning: 'Name variance vs. ledger',
  },
  {
    confidence: 94,
    label: 'Destination broker',
    source: 'DTC participant code 0226 · National Financial (Fidelity)',
    value: 'Fidelity Brokerage Services LLC',
  },
  {
    confidence: 92,
    label: 'Destination account',
    source: 'DTC DWAC instruction form',
    value: '••••••4512 (Eleanor M. Hayes – IRA)',
  },
  {
    confidence: 64,
    label: 'Medallion guarantee',
    note: 'Signature reviewed at 72% · stamp OCR at 64%.',
    source: 'Stock power p.2 medallion stamp',
    value: 'STA surety · id MGA-2189',
    warning: 'Stamp image is partially cropped',
  },
  {
    confidence: 88,
    label: 'Tax form (W-9)',
    note: 'Exists but predates last address change.',
    source: 'Uploaded 2024-11-02',
    value: 'On file · refresh recommended',
  },
]

const documents = [
  {
    confidence: 97,
    name: 'Stock power.pdf',
    pages: 2,
    size: '482 KB',
    status: 'Parsed · 14 fields',
    tone: 'positive' as const,
    type: 'Transfer instruction',
  },
  {
    confidence: 98,
    name: 'Photo ID - DL (CA).jpg',
    pages: 1,
    size: '1.1 MB',
    status: 'Liveness check passed',
    tone: 'positive' as const,
    type: 'KYC · Government ID',
  },
  {
    confidence: 64,
    name: 'Medallion guarantee.pdf',
    pages: 1,
    size: '220 KB',
    status: 'Stamp partially cropped',
    tone: 'warning' as const,
    type: 'KYC · Guarantee',
  },
  {
    confidence: 0,
    name: 'W-9 refresh (2026)',
    pages: 0,
    size: '—',
    status: 'Missing · requested from holder',
    tone: 'danger' as const,
    type: 'Tax form',
  },
]

const timeline = [
  {
    author: 'Proxi AI',
    body: 'Medallion stamp OCR scored 64%. Escalated to reviewer queue.',
    status: 'warn' as const,
    time: '2 hours ago',
    title: 'AI confidence under threshold',
  },
  {
    author: 'Proxi AI',
    body: 'Stock power extraction complete · 14 fields · overall confidence 42%.',
    status: 'info' as const,
    time: '2 hours ago',
    title: 'Extraction complete',
  },
  {
    author: 'Proxi AI',
    body: 'Textract finished 3 pages in 1.8s · hash 0x81fa…aa3e',
    status: 'info' as const,
    time: '2 hours ago',
    title: 'OCR pipeline run',
  },
  {
    author: 'Eleanor Hayes',
    body: 'Uploaded stock power, photo ID, medallion guarantee.',
    status: 'ok' as const,
    time: '2 hours ago',
    title: 'Shareholder submitted request',
  },
]

export default async function TransferDetail({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params
  const id = transferId || 'TR-120458'

  return (
    <AppShell breadcrumbs={[{ href: '/agent', label: 'Action queue' }, { label: id }]} portal='agent'>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='message-square' size={14} />
              Message holder
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='flag' size={14} />
              Escalate
            </button>
            <button className='btn btn-danger btn-sm' type='button'>
              <Icon name='x' size={14} />
              Deny
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='check' size={14} />
              Approve & post
            </button>
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{id}</Badge>
            <StatusPill status='in review' />
            <Badge icon='alert-triangle' tone='warning'>
              High priority · due 16:00 ET
            </Badge>
          </div>
        }
        subtitle='Broker transfer · DRS → Fidelity · requested by Eleanor M. Hayes'
        title='Transfer of 500 shares of Meridian Optics (MRDN)'
      />

      <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]'>
        <div className='flex flex-col gap-5'>
          <Panel padded={false}>
            <div className='px-4'>
              <Tabs
                items={[
                  { id: 'summary', label: 'Summary' },
                  { count: extracted.length, id: 'fields', label: 'Extracted fields' },
                  { count: documents.length, id: 'docs', label: 'Documents' },
                  { id: 'kyc', label: 'KYC' },
                  { count: timeline.length, id: 'audit', label: 'Audit timeline' },
                  { id: 'messages', label: 'Messages' },
                ]}
                value='fields'
              />
            </div>

            <div className='p-5'>
              <div className='mb-4 flex items-center justify-between'>
                <div>
                  <div className='text-[13px] font-semibold text-ink-900'>AI-extracted fields</div>
                  <div className='text-[12px] text-ink-500'>Hover a field to see its source. Edits are logged.</div>
                </div>
                <div className='flex items-center gap-2 text-[12px]'>
                  <span className='text-ink-500'>Overall confidence</span>
                  <Confidence value={42} />
                </div>
              </div>

              <ul className='divide-y divide-line rounded-md border border-line'>
                {extracted.map(f => (
                  <li className='grid grid-cols-[180px_1fr_140px] items-start gap-3 bg-surface px-4 py-3' key={f.label}>
                    <div>
                      <div className='text-[12.5px] font-semibold text-ink-500'>{f.label}</div>
                      <div className='mt-1 text-[11px] text-ink-400'>{f.source}</div>
                    </div>
                    <div>
                      <div className='text-[13px] font-semibold text-ink-900'>{f.value}</div>
                      {f.warning && (
                        <div className='mt-1.5 flex items-start gap-1.5 text-[12px] text-warning-700'>
                          <Icon name='alert-triangle' size={12} />
                          <span>{f.warning}</span>
                        </div>
                      )}
                      {f.note && <div className='mt-1 text-[11.5px] text-ink-500'>{f.note}</div>}
                    </div>
                    <div className='flex flex-col items-end gap-1'>
                      <Confidence value={f.confidence} />
                      <button className='btn btn-ghost btn-sm' type='button'>
                        <Icon name='eye' size={12} />
                        View source
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className='mt-4 flex items-center justify-between rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-[12.5px] text-brand-900'>
                <div className='flex items-start gap-2'>
                  <Icon className='mt-0.5 text-brand-700' name='sparkles' size={14} />
                  <div>
                    <span className='font-semibold'>Proxi recommendation:</span> Approve with reviewer override on{' '}
                    <span className='font-semibold'>Registered holder</span> (name variance is legitimate per KYC). Request medallion
                    re-upload out-of-band.
                  </div>
                </div>
                <button className='btn btn-brand btn-sm' type='button'>
                  Apply suggestion
                </button>
              </div>
            </div>
          </Panel>

          <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
            <Panel
              actions={
                <button className='btn btn-ghost btn-sm' type='button'>
                  <Icon name='upload' size={13} />
                  Upload
                </button>
              }
              subtitle='Evidence linked to this case'
              title='Documents'
            >
              <ul className='flex flex-col divide-y divide-line -my-4'>
                {documents.map(d => (
                  <li className='flex items-start gap-3 py-3' key={d.name}>
                    <div className='mt-0.5 flex h-9 w-9 items-center justify-center rounded-sm bg-surface-sunken text-ink-700'>
                      <Icon name='file-text' size={15} />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2'>
                        <span className='truncate text-[13px] font-semibold text-ink-900'>{d.name}</span>
                        <Badge tone={d.tone}>{d.status}</Badge>
                      </div>
                      <div className='text-[11.5px] text-ink-500'>
                        {d.type} · {d.pages > 0 ? `${d.pages} pages · ` : ''}
                        {d.size}
                      </div>
                    </div>
                    {d.confidence > 0 && (
                      <div className='shrink-0'>
                        <Confidence value={d.confidence} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel subtitle='Identity verification artifacts' title='KYC & identity'>
              <ul className='flex flex-col gap-2'>
                <li className='soft-box flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Icon className='text-positive-500' name='shield-check' size={14} />
                    <div>
                      <div className='text-[13px] font-semibold text-ink-900'>Government ID match</div>
                      <div className='text-[11.5px] text-ink-500'>Face match · liveness · document authenticity</div>
                    </div>
                  </div>
                  <Badge tone='positive'>97%</Badge>
                </li>
                <li className='soft-box flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Icon className='text-positive-500' name='shield-check' size={14} />
                    <div>
                      <div className='text-[13px] font-semibold text-ink-900'>OFAC / SDN screening</div>
                      <div className='text-[11.5px] text-ink-500'>Refinitiv World-Check · 4 variants scored</div>
                    </div>
                  </div>
                  <Badge tone='positive'>Clear</Badge>
                </li>
                <li className='soft-box flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Icon className='text-warning-500' name='alert-triangle' size={14} />
                    <div>
                      <div className='text-[13px] font-semibold text-ink-900'>Medallion guarantee</div>
                      <div className='text-[11.5px] text-ink-500'>Stamp cropped · recommend re-upload</div>
                    </div>
                  </div>
                  <Badge tone='warning'>Attention</Badge>
                </li>
                <li className='soft-box flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Icon className='text-danger-500' name='alert-triangle' size={14} />
                    <div>
                      <div className='text-[13px] font-semibold text-ink-900'>Tax form (W-9)</div>
                      <div className='text-[11.5px] text-ink-500'>On file from 2024 · requested refresh</div>
                    </div>
                  </div>
                  <Badge tone='danger'>Blocking</Badge>
                </li>
              </ul>
            </Panel>
          </div>

          <Panel subtitle='Immutable event log for this case' title='Audit timeline'>
            <div className='timeline'>
              {timeline.map((t, i) => (
                <div className={`timeline-item ${t.status}`} key={i}>
                  <div className='timeline-meta'>
                    {t.time} · {t.author}
                  </div>
                  <div className='timeline-title'>{t.title}</div>
                  <div className='timeline-body'>{t.body}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className='flex flex-col gap-5'>
          <Panel title='Decision panel'>
            <div className='mb-4 text-[12px] text-ink-500'>Sensitive action · requires a reason</div>
            <div className='flex flex-col gap-3'>
              <label className='text-[12px] font-medium text-ink-700'>
                Reviewer note
                <textarea
                  className='textarea mt-1 min-h-[86px]'
                  defaultValue={`Name variance confirmed against photo ID (match 97%). Awaiting re-uploaded medallion stamp before final approval.`}
                  placeholder='Document your rationale · will be permanently logged'
                />
              </label>

              <div className='flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2'>
                <span className='flex items-center gap-2 text-[12.5px] text-ink-700'>
                  <Icon name='lock' size={13} />
                  Require second approver
                </span>
                <Badge tone='info'>Auto-enabled</Badge>
              </div>

              <div className='flex gap-2'>
                <button className='btn btn-brand flex-1' type='button'>
                  <Icon name='check' size={14} />
                  Approve & post
                </button>
                <button className='btn btn-danger flex-1' type='button'>
                  <Icon name='x' size={14} />
                  Deny
                </button>
              </div>
              <button className='btn btn-secondary' type='button'>
                <Icon name='flag' size={14} />
                Request holder info
              </button>
            </div>
          </Panel>

          <Panel subtitle='Parties & routing' title='Case details'>
            <dl className='dl'>
              <dt>From registration</dt>
              <dd>Eleanor M. Hayes · DRS · 1,240 sh available</dd>
              <dt>To brokerage</dt>
              <dd>Fidelity ••4512 (IRA)</dd>
              <dt>Shares</dt>
              <dd className='num'>500 · ~$41,650.00</dd>
              <dt>Restriction</dt>
              <dd>None · lot #2 lock-up cleared 2024-08-01</dd>
              <dt>Submitted</dt>
              <dd className='num'>Jan 18 · 15:02 ET</dd>
              <dt>SLA</dt>
              <dd>
                <Badge icon='clock' tone='warning'>
                  Due today 16:00
                </Badge>
              </dd>
              <dt>Assigned</dt>
              <dd>
                <div className='flex items-center gap-2'>
                  <Avatar name='Daniel Chen' size={22} tone='ink' />
                  <span>Daniel Chen</span>
                </div>
              </dd>
            </dl>
          </Panel>

          <ProxiAssistant
            footerNote='The assistant cannot approve on your behalf.'
            messages={[
              {
                author: 'assistant',
                body: 'I see two risk signals on this case: (1) signer name variance vs. ledger and (2) low medallion OCR. The variance is likely a typo. I can message Eleanor with a pre-filled medallion re-upload link.',
                meta: 'Draft message ready · review before sending',
              },
              {
                author: 'user',
                body: 'Show similar approved cases in the last 90 days.',
              },
              {
                author: 'assistant',
                body: 'Found 12 similar cases approved with reviewer override on name variance. 0 were later reversed. Median time-to-decision: 6m.',
                meta: 'Precedents · View evidence →',
              },
            ]}
            quickActions={['Message Eleanor', 'Show precedents', 'Draft approval note', 'Ping KYC specialist']}
            subtitle='Case-scoped assistant'
            title='Proxi copilot'
          />
        </aside>
      </div>
    </AppShell>
  )
}
