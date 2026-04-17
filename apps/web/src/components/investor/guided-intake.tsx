'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ProxiAssistant } from '@/components/assistant'
import { Icon } from '@/components/icon'
import { StepProgress } from '@/components/primitives'
import { Badge, Panel } from '@/components/ui'

type StepId = 'confirm' | 'destination' | 'documents' | 'holding' | 'intent' | 'kyc' | 'success'

type WizardStep = {
  id: StepId
  label: string
  sub: string
}

const STEPS: WizardStep[] = [
  { id: 'intent', label: 'What to do', sub: 'Choose a workflow' },
  { id: 'holding', label: 'Which holding', sub: 'Select position' },
  { id: 'destination', label: 'Destination', sub: 'Where shares go' },
  { id: 'documents', label: 'Documents', sub: 'Upload evidence' },
  { id: 'kyc', label: 'Identity', sub: 'Verify you' },
  { id: 'confirm', label: 'Review & submit', sub: 'Final check' },
  { id: 'success', label: 'Submitted', sub: 'Tracker live' },
]

const holdings = [
  {
    available: '1,240',
    issuer: 'Meridian Optics, Inc.',
    restriction: null,
    ticker: 'MRDN · DRS',
  },
  {
    available: '800',
    issuer: 'Halcyon Industrial Co.',
    restriction: 'Rule 144',
    ticker: 'HALC · Cert (electronic)',
  },
  {
    available: '2,500',
    issuer: 'Ridgefield Energy Holdings',
    restriction: 'Lock-up · 62 days',
    ticker: 'RDG · DRS',
  },
  {
    available: '180',
    issuer: 'Teagan Biosciences',
    restriction: null,
    ticker: 'TGBX · ESPP',
  },
]

const intents = [
  {
    blurb: 'DTC DWAC to your brokerage account',
    id: 'broker',
    icon: 'landmark',
    label: 'Transfer shares to a broker',
    turnaround: '~1 business day',
  },
  {
    blurb: 'DRS-to-DRS or to joint / trust registration',
    id: 'registration',
    icon: 'send',
    label: 'Transfer to another registration',
    turnaround: '1–2 business days',
  },
  {
    blurb: 'Request certificate issuance from DRS',
    id: 'certificate',
    icon: 'file-text',
    label: 'Issue a physical certificate',
    turnaround: '5–7 business days',
  },
  {
    blurb: 'Sell through Proxi’s book-entry sell program',
    id: 'sell',
    icon: 'arrow-down-right',
    label: 'Sell shares',
    turnaround: 'Same day',
  },
] as const

const brokers = [
  'Fidelity Brokerage Services LLC',
  'Charles Schwab & Co., Inc.',
  'Vanguard Brokerage',
  'Interactive Brokers LLC',
  'Robinhood Securities, LLC',
]

const documentChecklist = [
  {
    blurb: 'Signed stock power · generated from your inputs',
    id: 'stock-power',
    label: 'Stock power',
    required: true,
  },
  {
    blurb: 'Medallion signature guarantee (STA or MSP)',
    id: 'medallion',
    label: 'Medallion guarantee',
    required: true,
  },
  {
    blurb: 'Refresh required · on file from 2024',
    id: 'w9',
    label: 'W-9 tax form',
    required: true,
  },
  {
    blurb: 'Only for accounts over $250K',
    id: 'account-statement',
    label: 'Destination account statement',
    required: false,
  },
]

export function GuidedIntake() {
  const [step, setStep] = useState<StepId>('intent')
  const [intent, setIntent] = useState<(typeof intents)[number]['id']>('broker')
  const [holding, setHolding] = useState(holdings[0]!.issuer)
  const [shares, setShares] = useState('500')
  const [broker, setBroker] = useState(brokers[0]!)
  const [account, setAccount] = useState('Z12345678')
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({
    medallion: false,
    'stock-power': false,
    w9: false,
  })
  const [idVerified, setIdVerified] = useState(false)

  const stepIdx = STEPS.findIndex(s => s.id === step)
  const intentMeta = intents.find(i => i.id === intent)!

  const progressSteps = STEPS.slice(0, 6).map((s, idx) => ({
    label: s.label,
    state: idx < stepIdx ? ('done' as const) : idx === stepIdx ? ('current' as const) : ('upcoming' as const),
    value: s.sub,
  }))

  const canContinue = useMemo(() => {
    if (step === 'intent') return Boolean(intent)
    if (step === 'holding') return Boolean(holding && Number(shares) > 0)
    if (step === 'destination') return Boolean(broker && account)
    if (step === 'documents') return uploaded['stock-power'] && uploaded.medallion && uploaded.w9
    if (step === 'kyc') return idVerified
    return true
  }, [account, broker, holding, idVerified, intent, shares, step, uploaded])

  const next = () => {
    const order: StepId[] = ['intent', 'holding', 'destination', 'documents', 'kyc', 'confirm', 'success']
    const idx = order.indexOf(step)
    if (idx < order.length - 1) setStep(order[idx + 1]!)
  }

  const back = () => {
    const order: StepId[] = ['intent', 'holding', 'destination', 'documents', 'kyc', 'confirm', 'success']
    const idx = order.indexOf(step)
    if (idx > 0) setStep(order[idx - 1]!)
  }

  const stepMessaging: Record<StepId, { body: string; meta?: string }> = {
    confirm: {
      body: `Last check. I’ll create case TR-120502 and start AI review. If everything matches, this goes straight-through in under an hour.`,
      meta: 'Every action from here is logged and reversible until ledger posting.',
    },
    destination: {
      body: 'I recognize Fidelity’s DTC participant 0226. I’ll pre-fill the DWAC instruction and validate the account number format.',
      meta: 'I never send money or shares to an address you haven’t verified.',
    },
    documents: {
      body: 'I’ll generate the stock power from your inputs. Upload a medallion stamp and a W-9 — I’ll scan for cropping and expiration before you submit.',
      meta: 'I need these items to be straight-through eligible.',
    },
    holding: {
      body: `Transferring from Meridian Optics (MRDN) · 1,240 available. I’ll check lot-level cost basis and any lock-ups when you pick the amount.`,
    },
    intent: {
      body: `Great — let’s set up a ${intentMeta.label.toLowerCase()}. I’ll collect only what I don’t already know. Expected turnaround: ${intentMeta.turnaround}.`,
      meta: 'I can pause and resume any time · your progress is saved.',
    },
    kyc: {
      body: 'I’ll verify your identity by matching your photo to the government ID on file. Liveness check takes ~10 seconds.',
      meta: 'Biometric data is never stored — only a pass/fail result.',
    },
    success: {
      body: 'Submitted. You’ll get a ledger-posted confirmation typically within 1 business day. I’ll ping you if anything needs your attention.',
    },
  }

  return (
    <div className='wizard'>
      <div className='wizard-steps'>
        {STEPS.slice(0, 6).map((s, idx) => {
          const state = idx < stepIdx ? 'done' : idx === stepIdx ? 'current' : ''
          return (
            <div className={`wizard-step ${state}`} key={s.id}>
              <span className='wizard-step-num'>{idx < stepIdx ? <Icon name='check' size={12} /> : idx + 1}</span>
              <div>
                <div className='wizard-step-title'>{s.label}</div>
                <div className='wizard-step-sub'>{s.sub}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className='flex flex-col gap-4'>
        <div className='panel'>
          <div className='panel-header'>
            <div>
              <div className='panel-title'>{STEPS[stepIdx]?.label}</div>
              <div className='panel-subtitle'>Step {Math.min(stepIdx + 1, 6)} of 6 · Proxi guided intake</div>
            </div>
            <Badge icon='shield-check' tone='positive'>
              Secure session · encrypted
            </Badge>
          </div>

          <div className='px-5 pt-4'>
            <StepProgress steps={progressSteps} />
          </div>

          <div className='panel-body pt-5'>
            {step === 'intent' && (
              <div className='flex flex-col gap-3'>
                <p className='text-[13px] text-ink-600'>What would you like Proxi to do? You can change your mind later.</p>
                <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                  {intents.map(i => (
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-3 ${
                        intent === i.id ? 'border-ink-900 bg-surface-2' : 'border-line bg-white hover:border-border-strong'
                      }`}
                      key={i.id}
                    >
                      <input checked={intent === i.id} className='mt-1' name='intent' onChange={() => setIntent(i.id)} type='radio' />
                      <div className='flex-1'>
                        <div className='flex items-center gap-2'>
                          <Icon className='text-brand-700' name={i.icon} size={14} />
                          <span className='text-[13.5px] font-semibold text-ink-900'>{i.label}</span>
                        </div>
                        <div className='mt-1 text-[12px] text-ink-600'>{i.blurb}</div>
                        <div className='mt-1 text-[11.5px] text-ink-500'>Turnaround: {i.turnaround}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 'holding' && (
              <div className='flex flex-col gap-4'>
                <p className='text-[13px] text-ink-600'>Which holding would you like to transfer from?</p>
                <div className='table-wrap'>
                  <table className='table'>
                    <thead>
                      <tr>
                        <th />
                        <th>Issuer</th>
                        <th className='cell-num'>Available</th>
                        <th>Restrictions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map(h => (
                        <tr
                          className={`table-row-clickable ${holding === h.issuer ? 'bg-surface-2' : ''}`}
                          key={h.issuer}
                          onClick={() => setHolding(h.issuer)}
                        >
                          <td style={{ width: 32 }}>
                            <input checked={holding === h.issuer} name='holding' onChange={() => setHolding(h.issuer)} type='radio' />
                          </td>
                          <td>
                            <div className='cell-primary'>{h.issuer}</div>
                            <div className='mono text-[11.5px] text-ink-500'>{h.ticker}</div>
                          </td>
                          <td className='cell-num num'>{h.available}</td>
                          <td>
                            {h.restriction ? (
                              <Badge icon='lock' tone='warning'>
                                {h.restriction}
                              </Badge>
                            ) : (
                              <Badge tone='positive'>None</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <label className='text-[12px] font-medium text-ink-700'>
                    Shares to transfer
                    <input
                      className='input mt-1 max-w-[220px] num'
                      onChange={e => setShares(e.target.value)}
                      type='number'
                      value={shares}
                    />
                  </label>
                  <div className='mt-1 text-[11.5px] text-ink-500'>1,240 available · lots FIFO unless specified</div>
                </div>
              </div>
            )}

            {step === 'destination' && (
              <div className='flex flex-col gap-4'>
                <p className='text-[13px] text-ink-600'>Where should these shares go?</p>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                  <label className='text-[12px] font-medium text-ink-700'>
                    Destination broker
                    <select className='select mt-1' onChange={e => setBroker(e.target.value)} value={broker}>
                      {brokers.map(b => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className='text-[12px] font-medium text-ink-700'>
                    Destination account #
                    <input className='input mt-1 mono' onChange={e => setAccount(e.target.value)} value={account} />
                  </label>
                  <label className='text-[12px] font-medium text-ink-700'>
                    Account title
                    <input className='input mt-1' defaultValue='Eleanor M. Hayes IRA' />
                  </label>
                  <label className='text-[12px] font-medium text-ink-700'>
                    DTC participant (auto-matched)
                    <input className='input mt-1 mono' disabled value='0226 · National Financial' />
                  </label>
                </div>
                <div className='rounded-md border border-brand-100 bg-brand-50 px-3 py-2.5 text-[12.5px] text-brand-900'>
                  <Icon className='mr-1 inline text-brand-700' name='sparkles' size={12} />
                  Proxi will send a DTC DWAC instruction. You’ll see the draft before anything moves.
                </div>
              </div>
            )}

            {step === 'documents' && (
              <div className='flex flex-col gap-3'>
                <p className='text-[13px] text-ink-600'>
                  I need these documents to process straight-through. Proxi generates what it can and asks you for the rest.
                </p>
                <ul className='divide-y divide-line rounded-md border border-line'>
                  {documentChecklist.map(d => (
                    <li className='flex items-center gap-3 bg-white px-4 py-3' key={d.id}>
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-sm ${
                          uploaded[d.id] ? 'bg-positive-100 text-positive-700' : 'bg-surface-sunken text-ink-600'
                        }`}
                      >
                        <Icon name={uploaded[d.id] ? 'check-circle' : 'file-text'} size={15} />
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2'>
                          <span className='text-[13.5px] font-semibold text-ink-900'>{d.label}</span>
                          {d.required && !uploaded[d.id] && <Badge tone='warning'>Required</Badge>}
                          {uploaded[d.id] && (
                            <Badge icon='check' tone='positive'>
                              Uploaded
                            </Badge>
                          )}
                        </div>
                        <div className='text-[11.5px] text-ink-500'>{d.blurb}</div>
                      </div>
                      <button
                        className={`btn btn-sm ${uploaded[d.id] ? 'btn-ghost' : 'btn-secondary'}`}
                        onClick={() => setUploaded(u => ({ ...u, [d.id]: !u[d.id] }))}
                        type='button'
                      >
                        {uploaded[d.id] ? (
                          <>
                            <Icon name='refresh' size={12} />
                            Replace
                          </>
                        ) : (
                          <>
                            <Icon name='upload' size={12} />
                            Upload
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 'kyc' && (
              <div className='flex flex-col gap-4'>
                <p className='text-[13px] text-ink-600'>One quick identity check. Match your face to your ID on file.</p>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                  <div className='evidence-thumb'>
                    <Icon name='id-card' size={28} />
                    <div className='evidence-thumb-label'>Government ID · on file</div>
                    <span className='evidence-thumb-badge'>2028 expiry</span>
                  </div>
                  <div className='evidence-thumb'>
                    <Icon name='scan-search' size={28} />
                    <div className='evidence-thumb-label'>Liveness check</div>
                    <span className='evidence-thumb-badge'>Camera</span>
                  </div>
                  <div className='evidence-thumb'>
                    <Icon name='shield-check' size={28} />
                    <div className='evidence-thumb-label'>OFAC / SDN</div>
                    <span className='evidence-thumb-badge'>Auto</span>
                  </div>
                </div>
                <button
                  className={`btn ${idVerified ? 'btn-ghost' : 'btn-brand'}`}
                  onClick={() => setIdVerified(!idVerified)}
                  type='button'
                >
                  {idVerified ? (
                    <>
                      <Icon name='refresh' size={13} />
                      Re-run verification
                    </>
                  ) : (
                    <>
                      <Icon name='scan-search' size={13} />
                      Start verification
                    </>
                  )}
                </button>
                {idVerified && (
                  <div className='rounded-md border border-positive-100 bg-positive-100/60 px-3 py-2.5 text-[12.5px] text-positive-700'>
                    <Icon className='mr-1 inline' name='check-circle' size={12} />
                    Identity verified · face match 97% · liveness passed
                  </div>
                )}
              </div>
            )}

            {step === 'confirm' && (
              <div className='flex flex-col gap-4'>
                <p className='text-[13px] text-ink-600'>Review the request. You can still cancel — nothing has been submitted yet.</p>
                <dl className='dl rounded-md border border-line bg-surface-2 p-4'>
                  <dt>Action</dt>
                  <dd>{intentMeta.label}</dd>
                  <dt>From</dt>
                  <dd>{holding}</dd>
                  <dt>Shares</dt>
                  <dd className='num'>{shares}</dd>
                  <dt>To broker</dt>
                  <dd>{broker}</dd>
                  <dt>Account</dt>
                  <dd className='mono'>{account}</dd>
                  <dt>Documents</dt>
                  <dd>
                    Stock power, medallion, W-9 · all present · <span className='trend-up'>AI pre-check 96%</span>
                  </dd>
                  <dt>Identity</dt>
                  <dd>Verified · 97% · {new Date().toLocaleDateString()}</dd>
                  <dt>Turnaround</dt>
                  <dd>{intentMeta.turnaround}</dd>
                </dl>
              </div>
            )}

            {step === 'success' && (
              <div className='flex flex-col items-center gap-3 py-6 text-center'>
                <div className='flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700'>
                  <Icon name='check-circle' size={24} />
                </div>
                <div className='text-[18px] font-semibold text-ink-900'>Request submitted · case TR-120502</div>
                <p className='max-w-md text-[13px] text-ink-600'>
                  Proxi is reviewing your evidence. Typical turnaround for this workflow is <strong>1 business day</strong>. You’ll be
                  notified at every state change.
                </p>
                <div className='flex gap-2'>
                  <Link className='btn btn-secondary btn-sm' href='/investor'>
                    Back to dashboard
                  </Link>
                  <Link className='btn btn-brand btn-sm' href='/investor'>
                    View status tracker
                    <Icon name='arrow-right' size={13} />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {step !== 'success' && (
            <div className='panel-footer'>
              <button className='btn btn-ghost btn-sm' disabled={stepIdx === 0} onClick={back} type='button'>
                <Icon name='chevron-right' size={13} />
                Back
              </button>
              <div className='flex items-center gap-2'>
                <Link className='btn btn-ghost btn-sm' href='/investor'>
                  Save & exit
                </Link>
                <button className='btn btn-brand btn-sm' disabled={!canContinue} onClick={next} type='button'>
                  {step === 'confirm' ? 'Submit request' : 'Continue'}
                  <Icon name='arrow-right' size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        <ProxiAssistant
          footerNote='I pause any time you need to step away.'
          messages={[
            {
              author: 'assistant',
              body: stepMessaging[step].body,
              meta: stepMessaging[step].meta,
            },
            {
              author: 'user',
              body: 'How long does this usually take?',
            },
            {
              author: 'assistant',
              body:
                step === 'success'
                  ? 'Typical straight-through completion: under 1 business day when all documents pass.'
                  : `For ${intentMeta.label.toLowerCase()}, typical turnaround is ${intentMeta.turnaround}. I’ll show it as a live tracker once submitted.`,
              meta: 'Based on last 90 days of similar cases on Proxi',
            },
          ]}
          quickActions={[
            'Upload a different document',
            'Explain medallion guarantee',
            'Why do you need a W-9?',
            'Can I pause this?',
            'Talk to a human',
          ]}
          subtitle='Guided intake · cites every answer'
          title='Proxi assistant'
        />

        <Panel title='Why Proxi asks this'>
          <ul className='flex flex-col gap-2 text-[12.5px] text-ink-600'>
            <li className='flex items-start gap-2'>
              <Icon className='mt-0.5 text-brand-700' name='shield-check' size={12} />
              <span>Every request is logged to an immutable case file with timestamps.</span>
            </li>
            <li className='flex items-start gap-2'>
              <Icon className='mt-0.5 text-brand-700' name='shield-check' size={12} />
              <span>High-confidence cases go straight-through without human delay.</span>
            </li>
            <li className='flex items-start gap-2'>
              <Icon className='mt-0.5 text-brand-700' name='shield-check' size={12} />
              <span>Only transfer agents at Proxi can post to the shareholder ledger.</span>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}
