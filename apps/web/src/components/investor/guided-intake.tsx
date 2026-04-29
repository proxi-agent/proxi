'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ProxiAssistant } from '@/components/assistant'
import { Callout } from '@/components/callout'
import { Icon } from '@/components/icon'
import {
  LedgerImpactPanel,
  type ReviewSection,
  ReviewValidationSummary,
  TransferConfirmationScreen,
  TransferReviewSummary,
  TransferStepper,
  type ValidationCheck,
  ValidationResultPanel,
} from '@/components/transfer'
import { Badge, Panel } from '@/components/ui'

type StepId = 'confirm' | 'destination' | 'documents' | 'holding' | 'intent' | 'kyc' | 'success' | 'validation'

const STEPS: Array<{ id: StepId; label: string; sub: string }> = [
  { id: 'intent', label: 'Transfer type', sub: 'Pick a workflow' },
  { id: 'holding', label: 'Source', sub: 'Current holder' },
  { id: 'destination', label: 'Recipient', sub: 'New holder' },
  { id: 'documents', label: 'Documents', sub: 'Supporting evidence' },
  { id: 'kyc', label: 'Identity', sub: 'Verify holder' },
  { id: 'validation', label: 'Validation', sub: 'Compliance checks' },
  { id: 'confirm', label: 'Review', sub: 'Final summary' },
  { id: 'success', label: 'Submitted', sub: 'Tracker live' },
]

const WIZARD_STEPS = STEPS.filter(s => s.id !== 'success')

const holdings = [
  { available: 1240, issuer: 'Meridian Optics, Inc.', restriction: null, ticker: 'MRDN · DRS' },
  { available: 800, issuer: 'Halcyon Industrial Co.', restriction: 'Rule 144', ticker: 'HALC · Cert (electronic)' },
  { available: 2500, issuer: 'Ridgefield Energy Holdings', restriction: 'Lock-up · 62 days', ticker: 'RDG · DRS' },
  { available: 180, issuer: 'Teagan Biosciences', restriction: null, ticker: 'TGBX · ESPP' },
]

const intents = [
  {
    blurb: 'DTC DWAC to your brokerage account',
    id: 'broker',
    icon: 'landmark',
    label: 'Transfer shares to a broker',
    reasonLabel: 'Brokerage delivery',
    turnaround: '~1 business day',
  },
  {
    blurb: 'DRS-to-DRS or to joint / trust registration',
    id: 'registration',
    icon: 'send',
    label: 'Transfer to another registration',
    reasonLabel: 'Re-registration',
    turnaround: '1–2 business days',
  },
  {
    blurb: 'Request certificate issuance from DRS',
    id: 'certificate',
    icon: 'file-text',
    label: 'Issue a physical certificate',
    reasonLabel: 'Certificate issuance',
    turnaround: '5–7 business days',
  },
  {
    blurb: 'Sell through Proxi’s book-entry sell program',
    id: 'sell',
    icon: 'arrow-down-right',
    label: 'Sell shares',
    reasonLabel: 'Sell program',
    turnaround: 'Same day',
  },
] as const

const brokers = [
  'Charles Schwab & Co., Inc.',
  'Fidelity Brokerage Services LLC',
  'Interactive Brokers LLC',
  'Robinhood Securities, LLC',
  'Vanguard Brokerage',
]

const DESTINATION_TYPES = [
  { icon: 'landmark', id: 'broker' as const, label: 'Brokerage account' },
  { icon: 'user-round', id: 'individual' as const, label: 'Individual (re-registration)' },
  { icon: 'users', id: 'joint' as const, label: 'Joint tenants' },
  { icon: 'shield', id: 'trust' as const, label: 'Trust' },
  { icon: 'building', id: 'entity' as const, label: 'Entity / LLC' },
  { icon: 'file-text', id: 'certificate' as const, label: 'Physical certificate' },
]

const documentChecklist = [
  { blurb: 'Signed stock power · generated from your inputs', id: 'stock-power', label: 'Stock power', required: true },
  { blurb: 'Medallion signature guarantee (STA or MSP)', id: 'medallion', label: 'Medallion guarantee', required: true },
  { blurb: 'Refresh required · on file from 2024', id: 'w9', label: 'W-9 tax form', required: true },
  { blurb: 'Only for accounts over $250K', id: 'account-statement', label: 'Destination account statement', required: false },
]

type RunState = 'idle' | 'running' | 'done'

const DRAFT_CASE_ID = 'TR-DRAFT-120502'
const SUBMITTED_CASE_ID = 'TR-120502'

export function GuidedIntake() {
  const [step, setStep] = useState<StepId>('intent')
  const [intent, setIntent] = useState<(typeof intents)[number]['id']>('broker')
  const [holding, setHolding] = useState(holdings[0]!.issuer)
  const [scope, setScope] = useState<'full' | 'partial'>('partial')
  const [shares, setShares] = useState('500')
  const [destinationType, setDestinationType] = useState<(typeof DESTINATION_TYPES)[number]['id']>('broker')
  const [broker, setBroker] = useState(brokers[1]!)
  const [account, setAccount] = useState('Z12345678')
  const [accountTitle, setAccountTitle] = useState('Eleanor M. Hayes IRA')
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [notes, setNotes] = useState('')
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({ medallion: false, 'stock-power': false, w9: false })
  const [medallionPath, setMedallionPath] = useState<'affidavit' | 'medallion' | 'waiver'>('medallion')
  const [idVerified, setIdVerified] = useState(false)
  const [validationRun, setValidationRun] = useState<RunState>('idle')
  const [submitted, setSubmitted] = useState(false)

  const activeHolding = holdings.find(h => h.issuer === holding) ?? holdings[0]!
  const shareCount = scope === 'full' ? activeHolding.available : Number(shares) || 0
  const intentMeta = intents.find(i => i.id === intent)!

  const stepIdx = WIZARD_STEPS.findIndex(s => s.id === step)
  const totalSteps = WIZARD_STEPS.length
  const progressPct = step === 'success' ? 100 : Math.round((stepIdx / (totalSteps - 1)) * 100)

  const canContinue = useMemo(() => {
    switch (step) {
      case 'intent':
        return Boolean(intent)
      case 'holding':
        return Boolean(holding) && shareCount > 0 && shareCount <= activeHolding.available
      case 'destination':
        return Boolean(broker && account && accountTitle)
      case 'documents':
        return uploaded['stock-power'] && uploaded.medallion && uploaded.w9
      case 'kyc':
        return idVerified
      case 'validation':
        return validationRun === 'done'
      case 'confirm':
        return true
      default:
        return true
    }
  }, [account, accountTitle, activeHolding.available, broker, holding, idVerified, intent, shareCount, step, uploaded, validationRun])

  const go = useCallback((target: StepId) => setStep(target), [])
  const nextStepId = useCallback(() => {
    const order: StepId[] = WIZARD_STEPS.map(s => s.id).concat(['success'])
    const idx = order.indexOf(step)
    if (idx < order.length - 1) setStep(order[idx + 1]!)
  }, [step])
  const prevStepId = useCallback(() => {
    const order: StepId[] = WIZARD_STEPS.map(s => s.id)
    const idx = order.indexOf(step)
    if (idx > 0) setStep(order[idx - 1]!)
  }, [step])

  // Ensure every time the user arrives fresh at validation, we re-run
  useEffect(() => {
    if (step === 'validation' && validationRun === 'idle') {
      setValidationRun('running')
      const t = window.setTimeout(() => setValidationRun('done'), 700)
      return () => window.clearTimeout(t)
    }
  }, [step, validationRun])

  // Compute validation checks deterministically from form state
  const checks: ValidationCheck[] = useMemo(() => {
    const all: ValidationCheck[] = []

    all.push({
      citation: 'Reg SHO · Available shares',
      description: `${shareCount.toLocaleString('en-US')} of ${activeHolding.available.toLocaleString('en-US')} shares available.`,
      howToFix: shareCount > activeHolding.available ? 'Reduce the share count to at or below the available balance.' : undefined,
      id: 'available-shares',
      label: 'Sufficient available shares',
      status: shareCount > 0 && shareCount <= activeHolding.available ? 'passed' : 'blocked',
    })

    all.push({
      citation: activeHolding.restriction ? 'Rule 144 / lock-up' : undefined,
      description: activeHolding.restriction
        ? `Holding is restricted: ${activeHolding.restriction}. Proxi will route to reviewer.`
        : 'No lock-up, Rule 144 hold, or legend detected.',
      howToFix: activeHolding.restriction ? 'Reviewer sign-off is required; submit when ready.' : undefined,
      id: 'restrictions',
      label: 'Restrictions & legends',
      status: activeHolding.restriction ? 'review' : 'passed',
    })

    all.push({
      citation: medallionPath === 'medallion' ? 'STA Medallion Program' : undefined,
      description:
        medallionPath === 'medallion'
          ? 'Medallion guarantee uploaded; image quality looks clean.'
          : medallionPath === 'waiver'
            ? 'Under-$25K threshold waiver selected — value is within policy.'
            : 'Affidavit of loss selected for lost-certificate replacement.',
      howToFix: medallionPath !== 'medallion' ? 'Reviewer must sign off on alternative path; continue to submit for review.' : undefined,
      id: 'medallion',
      label: 'Signature guarantee',
      status: uploaded.medallion ? (medallionPath === 'medallion' ? 'passed' : 'review') : 'blocked',
    })

    all.push({
      description: uploaded.w9 ? 'Current-year W-9 on file.' : 'W-9 has not been provided yet.',
      howToFix: uploaded.w9 ? undefined : 'Upload a signed W-9 from your documents step.',
      id: 'w9',
      label: 'W-9 on file',
      status: uploaded.w9 ? 'passed' : 'blocked',
    })

    all.push({
      citation: 'KYC/CIP · OFAC SDN',
      description: idVerified ? 'Face match 97% · liveness passed · OFAC cleared.' : 'Identity verification not yet completed.',
      howToFix: idVerified ? undefined : 'Complete identity verification in the Identity step.',
      id: 'identity',
      label: 'Identity verified (KYC / OFAC)',
      status: idVerified ? 'passed' : 'blocked',
    })

    all.push({
      citation: 'DTC DWAC format',
      description:
        destinationType === 'broker'
          ? `DTC participant 0226 (${broker.split(' ')[0]}) validated; account format OK.`
          : 'Re-registration — DTC participant check not applicable.',
      id: 'dtc',
      label: 'Destination routing',
      status: destinationType === 'broker' ? 'passed' : 'skipped',
    })

    return all
  }, [activeHolding, broker, destinationType, idVerified, medallionPath, shareCount, uploaded])

  const blockers = checks.filter(c => c.status === 'blocked')
  const reviews = checks.filter(c => c.status === 'review')
  const passedCount = checks.filter(c => c.status === 'passed').length

  // Assistant copy per step
  const stepMessaging: Record<StepId, { body: string; meta?: string }> = {
    confirm: {
      body: `Last check. I’ll open case ${DRAFT_CASE_ID} with the transfer agent. Nothing posts to the ledger until a human approves it.`,
      meta: 'Every action is logged and reversible until ledger posting.',
    },
    destination: {
      body: 'I recognize Fidelity’s DTC participant 0226. I’ll pre-fill the DWAC instruction and validate the account number format.',
      meta: 'I never send shares to an address you haven’t verified.',
    },
    documents: {
      body: 'I’ll generate the stock power from your inputs. Upload a medallion stamp and a W-9 — I’ll scan for cropping and expiration.',
      meta: 'I need these items to be straight-through eligible.',
    },
    holding: {
      body: `Transferring from ${activeHolding.issuer} · ${activeHolding.available.toLocaleString('en-US')} available. I’ll check cost-basis lots and any lock-ups.`,
    },
    intent: {
      body: `Let’s set up a ${intentMeta.label.toLowerCase()}. I’ll only ask for what I don’t already know. Typical turnaround: ${intentMeta.turnaround}.`,
      meta: 'I save progress automatically · you can resume anytime.',
    },
    kyc: {
      body: 'Quick identity check. I match your photo to the government ID on file. Liveness takes ~10 seconds.',
      meta: 'Biometric data is never stored — only a pass/fail result.',
    },
    success: {
      body: 'Submitted. I’ll ping you if the reviewer needs anything. Typical straight-through completion is under 1 business day.',
    },
    validation: {
      body: 'Running automated compliance checks: share availability, restrictions, medallion, W-9, KYC/OFAC, and DTC routing.',
      meta: 'Blockers must be resolved before submission — warnings are flagged for reviewer sign-off.',
    },
  }

  const reviewSections: ReviewSection[] = [
    {
      fields: [
        { label: 'Workflow', value: intentMeta.label },
        { label: 'Reason', value: intentMeta.reasonLabel },
      ],
      icon: 'file-text',
      onEdit: () => go('intent'),
      title: 'Transfer type',
    },
    {
      fields: [
        { label: 'Security / class', value: activeHolding.issuer, hint: activeHolding.ticker },
        {
          label: 'Shares',
          value: <span className='num'>{shareCount.toLocaleString('en-US')}</span>,
          hint: scope === 'full' ? 'Full position' : `of ${activeHolding.available.toLocaleString('en-US')} available`,
        },
        {
          hint: activeHolding.restriction ? 'Restricted — reviewer sign-off required.' : 'No restrictions detected.',
          label: 'Restrictions',
          value: activeHolding.restriction ? (
            <Badge tone='warning'>{activeHolding.restriction}</Badge>
          ) : (
            <Badge tone='positive'>None</Badge>
          ),
        },
      ],
      icon: 'user-round',
      onEdit: () => go('holding'),
      title: 'Current holder / source',
    },
    {
      fields: [
        { label: 'Registration type', value: DESTINATION_TYPES.find(t => t.id === destinationType)?.label ?? destinationType },
        { label: 'Broker / registrar', value: broker },
        { label: 'Account number', value: <span className='mono'>{account}</span> },
        { label: 'Account title', value: accountTitle },
        { label: 'DTC participant', value: <span className='mono'>0226 · National Financial</span>, hint: 'Auto-matched' },
      ],
      icon: 'send',
      onEdit: () => go('destination'),
      title: 'Recipient / new holder',
    },
    {
      fields: [
        {
          label: 'Effective date',
          value: new Date(effectiveDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
        },
        { label: 'Submitted by', value: 'Eleanor M. Hayes' },
        { label: 'Notes to reviewer', value: notes || <span className='text-ink-400'>—</span> },
      ],
      icon: 'calendar-clock',
      onEdit: () => go('holding'),
      title: 'Transfer details',
    },
    {
      fields: [
        {
          hint: 'Generated by Proxi · ready to sign.',
          label: 'Stock power',
          value: uploaded['stock-power'] ? <Badge tone='positive'>Uploaded</Badge> : <Badge tone='danger'>Missing</Badge>,
        },
        {
          hint: `Path: ${medallionPath}`,
          label: 'Signature guarantee',
          value: uploaded.medallion ? <Badge tone='positive'>Uploaded</Badge> : <Badge tone='danger'>Missing</Badge>,
        },
        { label: 'W-9', value: uploaded.w9 ? <Badge tone='positive'>Uploaded</Badge> : <Badge tone='danger'>Missing</Badge> },
      ],
      icon: 'file-text',
      onEdit: () => go('documents'),
      title: 'Required documents',
    },
    {
      fields: [
        {
          label: 'Approver',
          hint: 'Licensed transfer agent at Proxi · independent of the shareholder.',
          value: 'Proxi Transfer Agent Services',
        },
        {
          label: 'Ledger impact',
          value: `−${shareCount.toLocaleString('en-US')} from source · +${shareCount.toLocaleString('en-US')} to destination`,
        },
        { label: 'Posting trigger', value: 'Only after transfer-agent review approves this case.' },
      ],
      icon: 'shield-check',
      title: 'Approval requirements',
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      {step !== 'success' && (
        <div
          aria-label='Draft status'
          className='flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-ink-500'
          role='status'
        >
          <span className='flex items-center gap-1.5'>
            <span aria-hidden className='relative flex h-1.5 w-1.5'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500/60' />
              <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600' />
            </span>
            <span>Live case draft</span>
            <span className='num font-semibold text-ink-800'>{DRAFT_CASE_ID}</span>
          </span>
          <span aria-hidden className='h-3 w-px bg-line' />
          <span className='flex items-center gap-1.5'>
            <Icon aria-hidden name='shield-check' size={11} />
            Saved securely · encrypted at rest
          </span>
          <span aria-hidden className='h-3 w-px bg-line' />
          <span className='flex items-center gap-1.5'>
            <Icon aria-hidden name='landmark' size={11} />
            Registrar: Proxi Transfer Agent Services
          </span>
          <span className='ml-auto flex items-center gap-1.5'>
            <span className='num font-semibold text-ink-800'>{progressPct}%</span>
            <span>complete</span>
          </span>
        </div>
      )}

      <div className='wizard'>
        <TransferStepper activeStepId={step === 'success' ? 'confirm' : step} onStepClick={id => go(id as StepId)} steps={WIZARD_STEPS} />

        <div className='flex flex-col gap-4'>
          <div className='panel'>
            <div className='panel-header'>
              <div>
                <div className='panel-title'>{STEPS.find(s => s.id === step)?.label}</div>
                <div className='panel-subtitle'>
                  {step === 'success'
                    ? 'All done · tracker is live'
                    : `Step ${Math.min(stepIdx + 1, totalSteps)} of ${totalSteps} · Guided intake`}
                </div>
              </div>
              <Badge icon='shield-check' tone='positive'>
                Encrypted session
              </Badge>
            </div>

            <div className='panel-body pt-5'>
              {step === 'intent' && (
                <fieldset className='flex flex-col gap-3'>
                  <legend className='text-[13px] text-ink-600'>What would you like Proxi to do? You can change your mind later.</legend>
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
                            <Icon aria-hidden className='text-brand-700' name={i.icon} size={14} />
                            <span className='text-[13.5px] font-semibold text-ink-900'>{i.label}</span>
                          </div>
                          <div className='mt-1 text-[12px] text-ink-600'>{i.blurb}</div>
                          <div className='mt-1 text-[11.5px] text-ink-500'>Turnaround: {i.turnaround}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {step === 'holding' && (
                <div className='flex flex-col gap-4'>
                  <p className='text-[13px] text-ink-600'>Which holding would you like to transfer from?</p>
                  <div className='table-wrap'>
                    <table className='table'>
                      <caption className='sr-only'>Your current holdings</caption>
                      <thead>
                        <tr>
                          <th scope='col'>
                            <span className='sr-only'>Select</span>
                          </th>
                          <th scope='col'>Issuer</th>
                          <th className='cell-num' scope='col'>
                            Available
                          </th>
                          <th scope='col'>Restrictions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map(h => (
                          <tr
                            aria-selected={holding === h.issuer}
                            className={`table-row-clickable ${holding === h.issuer ? 'bg-surface-2' : ''}`}
                            key={h.issuer}
                            onClick={() => setHolding(h.issuer)}
                          >
                            <td style={{ width: 32 }}>
                              <input
                                aria-label={`Select ${h.issuer}`}
                                checked={holding === h.issuer}
                                name='holding'
                                onChange={() => setHolding(h.issuer)}
                                type='radio'
                              />
                            </td>
                            <td>
                              <div className='cell-primary'>{h.issuer}</div>
                              <div className='mono text-[11.5px] text-ink-500'>{h.ticker}</div>
                            </td>
                            <td className='cell-num num'>{h.available.toLocaleString('en-US')}</td>
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

                  <fieldset className='flex flex-col gap-2'>
                    <legend className='text-[12px] font-medium text-ink-700'>Transfer scope</legend>
                    <div className='inline-flex self-start rounded-md border border-line bg-white p-0.5' role='radiogroup'>
                      <button
                        aria-pressed={scope === 'full'}
                        className={`rounded-sm px-3 py-1.5 text-[12.5px] font-medium ${scope === 'full' ? 'bg-surface-sunken text-ink-900' : 'text-ink-500'}`}
                        onClick={() => {
                          setScope('full')
                          setShares(String(activeHolding.available))
                        }}
                        type='button'
                      >
                        Full position
                      </button>
                      <button
                        aria-pressed={scope === 'partial'}
                        className={`rounded-sm px-3 py-1.5 text-[12.5px] font-medium ${scope === 'partial' ? 'bg-surface-sunken text-ink-900' : 'text-ink-500'}`}
                        onClick={() => setScope('partial')}
                        type='button'
                      >
                        Partial
                      </button>
                    </div>
                  </fieldset>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                    <label className='text-[12px] font-medium text-ink-700'>
                      <span>
                        Shares to transfer{' '}
                        <span aria-hidden className='text-danger-700'>
                          *
                        </span>
                        <span className='sr-only'>required</span>
                      </span>
                      <input
                        aria-describedby='shares-help'
                        aria-invalid={shareCount > activeHolding.available ? true : undefined}
                        className='input num mt-1 max-w-[220px]'
                        disabled={scope === 'full'}
                        max={activeHolding.available}
                        min={1}
                        onChange={e => setShares(e.target.value)}
                        type='number'
                        value={shares}
                      />
                      <div className='mt-1 text-[11.5px] text-ink-500' id='shares-help'>
                        {scope === 'full'
                          ? `All ${activeHolding.available.toLocaleString('en-US')} shares will transfer — this closes the position.`
                          : `${activeHolding.available.toLocaleString('en-US')} available · lots FIFO unless specified`}
                      </div>
                      {shareCount > activeHolding.available && (
                        <div className='mt-1 text-[11.5px] text-danger-700' role='alert'>
                          Exceeds available balance — reduce to {activeHolding.available.toLocaleString('en-US')} or fewer.
                        </div>
                      )}
                    </label>

                    <label className='text-[12px] font-medium text-ink-700'>
                      <span>
                        Effective date{' '}
                        <span aria-hidden className='text-danger-700'>
                          *
                        </span>
                        <span className='sr-only'>required</span>
                      </span>
                      <input
                        className='input mt-1 max-w-[220px]'
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={e => setEffectiveDate(e.target.value)}
                        type='date'
                        value={effectiveDate}
                      />
                      <div className='mt-1 text-[11.5px] text-ink-500'>Ledger posting date requested. Subject to reviewer approval.</div>
                    </label>
                  </div>
                </div>
              )}

              {step === 'destination' && (
                <div className='flex flex-col gap-4'>
                  <p className='text-[13px] text-ink-600'>Where should these shares go?</p>

                  <fieldset className='flex flex-col gap-2'>
                    <legend className='text-[12px] font-medium text-ink-700'>Destination registration type</legend>
                    <div className='grid grid-cols-2 gap-2 md:grid-cols-3'>
                      {DESTINATION_TYPES.map(t => (
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] ${
                            destinationType === t.id ? 'border-ink-900 bg-surface-2' : 'border-line bg-white hover:border-border-strong'
                          }`}
                          key={t.id}
                        >
                          <input
                            checked={destinationType === t.id}
                            className='sr-only'
                            name='dest-type'
                            onChange={() => setDestinationType(t.id)}
                            type='radio'
                          />
                          <Icon aria-hidden className='text-brand-700' name={t.icon} size={13} />
                          <span className='font-medium text-ink-900'>{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                    <label className='text-[12px] font-medium text-ink-700'>
                      <span>
                        Destination broker{' '}
                        <span aria-hidden className='text-danger-700'>
                          *
                        </span>
                        <span className='sr-only'>required</span>
                      </span>
                      <select className='select mt-1' onChange={e => setBroker(e.target.value)} value={broker}>
                        {brokers.map(b => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className='text-[12px] font-medium text-ink-700'>
                      <span>
                        Destination account #{' '}
                        <span aria-hidden className='text-danger-700'>
                          *
                        </span>
                        <span className='sr-only'>required</span>
                      </span>
                      <input
                        aria-describedby='account-help'
                        className='input mono mt-1'
                        onChange={e => setAccount(e.target.value)}
                        value={account}
                      />
                      <div className='mt-1 text-[11.5px] text-ink-500' id='account-help'>
                        Format varies by broker. Proxi validates against the participant’s known patterns.
                      </div>
                    </label>
                    <label className='text-[12px] font-medium text-ink-700'>
                      <span>
                        Account title{' '}
                        <span aria-hidden className='text-danger-700'>
                          *
                        </span>
                        <span className='sr-only'>required</span>
                      </span>
                      <input className='input mt-1' onChange={e => setAccountTitle(e.target.value)} value={accountTitle} />
                    </label>
                    <label className='text-[12px] font-medium text-ink-700'>
                      DTC participant (auto-matched)
                      <input className='input mono mt-1' disabled value='0226 · National Financial' />
                    </label>
                  </div>

                  <label className='text-[12px] font-medium text-ink-700'>
                    Notes to reviewer <span className='font-normal text-ink-500'>(optional)</span>
                    <textarea
                      className='input mt-1'
                      onChange={e => setNotes(e.target.value)}
                      placeholder='Anything the reviewer should know about this request?'
                      rows={3}
                      value={notes}
                    />
                  </label>

                  <Callout icon='sparkles' tone='brand'>
                    Proxi will send a DTC DWAC instruction. You’ll see the draft before anything moves.
                  </Callout>
                </div>
              )}

              {step === 'documents' && (
                <div className='flex flex-col gap-3'>
                  <Callout icon='sparkles' title='What you need' tone='brand'>
                    A signed stock power, a signature guarantee (or approved alternative), and a current W-9. Proxi generates what it can
                    and asks you for the rest.
                  </Callout>

                  <fieldset className='flex flex-col gap-2'>
                    <legend className='text-[12px] font-medium text-ink-700'>Signature guarantee path</legend>
                    <div className='grid grid-cols-1 gap-2 md:grid-cols-3'>
                      {(
                        [
                          { blurb: 'STA / MSP / SEMP surety stamp', id: 'medallion', label: 'Medallion guarantee' },
                          { blurb: 'Transfer value is under $25,000', id: 'waiver', label: 'Under-threshold waiver' },
                          { blurb: 'Only for lost-certificate replacement', id: 'affidavit', label: 'Affidavit of loss' },
                        ] as const
                      ).map(p => (
                        <label
                          className={`flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-[12.5px] ${
                            medallionPath === p.id ? 'border-ink-900 bg-surface-2' : 'border-line bg-white hover:border-border-strong'
                          }`}
                          key={p.id}
                        >
                          <input
                            checked={medallionPath === p.id}
                            className='sr-only'
                            name='medallion-path'
                            onChange={() => setMedallionPath(p.id)}
                            type='radio'
                          />
                          <span className='font-semibold text-ink-900'>{p.label}</span>
                          <span className='text-[11.5px] text-ink-500'>{p.blurb}</span>
                        </label>
                      ))}
                    </div>
                    {medallionPath !== 'medallion' && (
                      <div className='text-[11.5px] text-warning-700' role='status'>
                        Alternative paths require reviewer sign-off and may extend turnaround by 1 business day.
                      </div>
                    )}
                  </fieldset>

                  <p className='text-[13px] text-ink-600'>
                    I need these documents to process straight-through. Proxi generates what it can and asks you for the rest.
                  </p>
                  <ul aria-label='Document checklist' className='divide-y divide-line rounded-md border border-line'>
                    {documentChecklist.map(d => (
                      <li className='flex items-center gap-3 bg-white px-4 py-3' key={d.id}>
                        <div
                          aria-hidden
                          className={`flex h-8 w-8 items-center justify-center rounded-sm ${
                            uploaded[d.id] ? 'bg-positive-100 text-positive-700' : 'bg-surface-sunken text-ink-600'
                          }`}
                        >
                          <Icon name={uploaded[d.id] ? 'check-circle' : 'file-text'} size={15} />
                        </div>
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-center gap-2'>
                            <span className='text-[13.5px] font-semibold text-ink-900'>{d.label}</span>
                            {d.required && !uploaded[d.id] && <Badge tone='warning'>Required</Badge>}
                            {!d.required && !uploaded[d.id] && <Badge tone='info'>Optional</Badge>}
                            {uploaded[d.id] && (
                              <Badge icon='check' tone='positive'>
                                Uploaded
                              </Badge>
                            )}
                          </div>
                          <div className='text-[11.5px] text-ink-500'>{d.blurb}</div>
                        </div>
                        <button
                          aria-label={`${uploaded[d.id] ? 'Replace' : 'Upload'} ${d.label}`}
                          className={`btn btn-sm ${uploaded[d.id] ? 'btn-ghost' : 'btn-secondary'}`}
                          onClick={() => setUploaded(u => ({ ...u, [d.id]: !u[d.id] }))}
                          type='button'
                        >
                          {uploaded[d.id] ? (
                            <>
                              <Icon aria-hidden name='refresh' size={12} />
                              Replace
                            </>
                          ) : (
                            <>
                              <Icon aria-hidden name='upload' size={12} />
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
                      <Icon aria-hidden name='id-card' size={28} />
                      <div className='evidence-thumb-label'>Government ID · on file</div>
                      <span className='evidence-thumb-badge'>2028 expiry</span>
                    </div>
                    <div className='evidence-thumb'>
                      <Icon aria-hidden name='scan-search' size={28} />
                      <div className='evidence-thumb-label'>Liveness check</div>
                      <span className='evidence-thumb-badge'>Camera</span>
                    </div>
                    <div className='evidence-thumb'>
                      <Icon aria-hidden name='shield-check' size={28} />
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
                        <Icon aria-hidden name='refresh' size={13} />
                        Re-run verification
                      </>
                    ) : (
                      <>
                        <Icon aria-hidden name='scan-search' size={13} />
                        Start verification
                      </>
                    )}
                  </button>
                  {idVerified && (
                    <Callout icon='check-circle' tone='positive'>
                      Identity verified · face match 97% · liveness passed
                    </Callout>
                  )}
                </div>
              )}

              {step === 'validation' && (
                <div className='flex flex-col gap-3'>
                  <p className='text-[13px] text-ink-600'>
                    Proxi runs these checks against regulatory rules and ledger data. Fix blockers before submitting; warnings flag items
                    for reviewer sign-off.
                  </p>
                  <ValidationResultPanel
                    actions={
                      <button
                        className='btn btn-secondary btn-sm'
                        disabled={validationRun === 'running'}
                        onClick={() => {
                          setValidationRun('running')
                          window.setTimeout(() => setValidationRun('done'), 600)
                        }}
                        type='button'
                      >
                        <Icon aria-hidden name='refresh' size={12} />
                        Re-run validation
                      </button>
                    }
                    checks={checks}
                    loading={validationRun === 'running'}
                  />
                </div>
              )}

              {step === 'confirm' && (
                <TransferReviewSummary
                  auditNote={
                    <span>
                      Every action from here is logged to an immutable case file. The transfer agent must approve this request before any
                      change posts to the shareholder ledger.
                    </span>
                  }
                  ledgerImpact={
                    <LedgerImpactPanel
                      destination={{
                        after: shareCount,
                        before: 0,
                        registration: `${DESTINATION_TYPES.find(t => t.id === destinationType)?.label ?? destinationType}`,
                        title: 'Destination',
                        who: `${accountTitle} · ${broker}`,
                      }}
                      shares={shareCount}
                      source={{
                        after: Math.max(0, activeHolding.available - shareCount),
                        before: activeHolding.available,
                        registration: activeHolding.ticker,
                        title: 'Source',
                        who: 'Eleanor M. Hayes',
                      }}
                    />
                  }
                  sections={reviewSections}
                  validationSummary={<ReviewValidationSummary blocked={blockers.length} passed={passedCount} review={reviews.length} />}
                />
              )}

              {step === 'success' && (
                <TransferConfirmationScreen
                  actions={
                    <>
                      <Link className='btn btn-secondary btn-sm' href='/investor/transfers'>
                        All my transfers
                      </Link>
                      <Link className='btn btn-brand btn-sm' href={`/investor/transfers/${SUBMITTED_CASE_ID}`}>
                        View status tracker
                        <Icon aria-hidden name='arrow-right' size={13} />
                      </Link>
                    </>
                  }
                  caseId={SUBMITTED_CASE_ID}
                  message={
                    <>
                      Proxi is routing your request to a transfer-agent reviewer. Nothing posts to the ledger until a human approves this
                      case.
                    </>
                  }
                  nextSteps={[
                    {
                      description: 'Proxi scans documents and re-runs validation against live ledger data.',
                      icon: 'sparkles',
                      title: 'AI pre-check',
                    },
                    {
                      description: 'A licensed transfer-agent reviewer confirms evidence and approves the transfer.',
                      icon: 'shield-check',
                      title: 'Reviewer sign-off',
                    },
                    {
                      description: 'Shares move on the shareholder ledger. You get a ledger-posted confirmation.',
                      icon: 'check-circle',
                      title: 'Ledger posting',
                    },
                  ]}
                  title='Transfer submitted for review'
                  turnaround={intentMeta.turnaround}
                />
              )}
            </div>

            {step !== 'success' && (
              <div className='panel-footer'>
                <button className='btn btn-ghost btn-sm' disabled={stepIdx === 0} onClick={prevStepId} type='button'>
                  <Icon aria-hidden name='arrow-left' size={13} />
                  Back
                </button>
                <div className='flex items-center gap-2'>
                  <Link className='btn btn-ghost btn-sm' href='/investor'>
                    Save draft &amp; exit
                  </Link>
                  <PrimaryStepCta
                    blockers={blockers.length}
                    canContinue={canContinue}
                    onClick={() => {
                      if (step === 'confirm') {
                        setSubmitted(true)
                        go('success')
                      } else {
                        nextStepId()
                      }
                    }}
                    step={step}
                    validationRunning={validationRun === 'running'}
                  />
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
              { author: 'user', body: 'How long does this usually take?' },
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
              'Can I pause this?',
              'Explain medallion guarantee',
              'Talk to a human',
              'Upload a different document',
              'Why do you need a W-9?',
            ]}
            subtitle='Guided intake · cites every answer'
            title='Proxi assistant'
          />

          {step === 'validation' && (blockers.length > 0 || reviews.length > 0) && (
            <Panel subtitle='Fix before submission' title='Outstanding items'>
              <ul className='flex flex-col gap-1.5 text-[12.5px] text-ink-700'>
                {blockers.map(b => (
                  <li className='flex items-start gap-2' key={b.id}>
                    <Icon aria-hidden className='mt-0.5 text-danger-700' name='alert-triangle' size={12} />
                    <span>{b.label}</span>
                  </li>
                ))}
                {reviews.map(r => (
                  <li className='flex items-start gap-2' key={r.id}>
                    <Icon aria-hidden className='mt-0.5 text-warning-700' name='alert-triangle' size={12} />
                    <span>{r.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {submitted && step === 'success' && null}

          <Panel title='Why Proxi asks this'>
            <ul className='flex flex-col gap-2 text-[12.5px] text-ink-600'>
              <li className='flex items-start gap-2'>
                <Icon aria-hidden className='mt-0.5 text-brand-700' name='shield-check' size={12} />
                <span>Every request is logged to an immutable case file with timestamps.</span>
              </li>
              <li className='flex items-start gap-2'>
                <Icon aria-hidden className='mt-0.5 text-brand-700' name='shield-check' size={12} />
                <span>High-confidence cases go straight-through without human delay.</span>
              </li>
              <li className='flex items-start gap-2'>
                <Icon aria-hidden className='mt-0.5 text-brand-700' name='shield-check' size={12} />
                <span>Only transfer agents at Proxi can post to the shareholder ledger.</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}

/**
 * Renders the correct primary CTA for each step — explicit labels like
 * "Run validation" or "Submit transfer for review" instead of a generic "Submit".
 */
function PrimaryStepCta({
  blockers,
  canContinue,
  onClick,
  step,
  validationRunning,
}: {
  blockers: number
  canContinue: boolean
  onClick: () => void
  step: StepId
  validationRunning: boolean
}) {
  const config = (() => {
    switch (step) {
      case 'confirm':
        return {
          disabled: blockers > 0,
          icon: 'check',
          label: blockers > 0 ? `Fix ${blockers} blocker${blockers === 1 ? '' : 's'}` : 'Submit transfer for review',
        }
      case 'destination':
        return { icon: 'arrow-right', label: 'Continue to documents' }
      case 'documents':
        return { icon: 'arrow-right', label: 'Continue to identity' }
      case 'holding':
        return { icon: 'arrow-right', label: 'Continue to recipient' }
      case 'intent':
        return { icon: 'arrow-right', label: 'Continue' }
      case 'kyc':
        return { icon: 'arrow-right', label: 'Run validation' }
      case 'validation':
        return { disabled: validationRunning, icon: 'arrow-right', label: validationRunning ? 'Running checks…' : 'Review transfer' }
      default:
        return { icon: 'arrow-right', label: 'Continue' }
    }
  })()

  const disabled = Boolean(config.disabled) || !canContinue
  return (
    <button className='btn btn-brand btn-sm' disabled={disabled} onClick={onClick} type='button'>
      {config.label}
      <Icon aria-hidden name={config.icon} size={13} />
    </button>
  )
}
