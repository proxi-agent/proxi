import { type AgentCase, Workbench } from '@/components/agent/workbench'
import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { Metric, PageHeader } from '@/components/ui'

const cases: AgentCase[] = [
  {
    assignee: { initials: 'MH', name: 'Maya H.' },
    confHigh: 58,
    confLow: 42,
    docs: [
      { kind: 'Stock power', label: 'Stock-power.pdf', pages: 2, state: 'ok' },
      { kind: 'Medallion', label: 'Medallion.jpg', pages: 1, state: 'issue' },
      { kind: 'W-9', label: 'W9-2024.pdf', pages: 1, state: 'pending' },
    ],
    due: 'Today · 4:30pm',
    extraction: [
      {
        confHigh: 96,
        confLow: 92,
        label: 'Shareholder name',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'neutral',
        value: 'Eleanor M. Hayes',
      },
      {
        confHigh: 98,
        confLow: 96,
        label: 'Issuer · CUSIP',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'neutral',
        value: 'Meridian Optics · 589543102',
      },
      {
        confHigh: 95,
        confLow: 88,
        label: 'Shares to transfer',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'neutral',
        value: '500 shares',
      },
      {
        confHigh: 62,
        confLow: 41,
        label: 'Destination broker',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'warning',
        value: 'Fidelity · DTC 0226',
        warning: 'DTC match 62% — verify',
      },
      {
        confHigh: 54,
        confLow: 38,
        label: 'Medallion stamp',
        page: 1,
        sourceDoc: 'Medallion.jpg',
        tone: 'danger',
        value: 'Partially cropped',
        warning: 'Right edge missing',
      },
      {
        confHigh: 82,
        confLow: 74,
        label: 'Signature (shareholder)',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'warning',
        value: 'Present — variance vs. 2023 specimen',
        warning: 'Slope / loop variance 0.71',
      },
    ],
    id: 'TR-120458',
    inquiryType: 'Broker transfer · DWAC',
    issuer: 'Meridian Optics, Inc. (MRDN)',
    kyc: {
      match: 86,
      status: 'passed',
      when: 'Jan 18 · 9:58am',
    },
    overview:
      '500 MRDN shares moving DRS → Fidelity brokerage. Stock power is clean, but the medallion stamp is cropped and the signature shows notable variance vs. the specimen on file.',
    risks: [
      {
        body: 'Right edge of the medallion guarantee stamp is cropped. Cannot verify the STA/MSP bank code — may be an expired stamp.',
        severity: 'high',
        title: 'Medallion stamp cropped',
      },
      {
        body: 'Signature slope variance 0.71 vs. 2023 specimen on file. Same registration, similar style, but warrants a second look.',
        severity: 'med',
        title: 'Signature variance',
      },
      {
        body: 'W-9 on file expired December 2024. Best-practice refresh before any transfer.',
        severity: 'med',
        title: 'W-9 stale',
      },
    ],
    shareholder: 'Eleanor M. Hayes · SH-01923',
    shares: '500',
    suggestedFocus: [
      'Open the medallion at pg 1 and verify the stamp bank code is visible',
      'Compare signature against the 2025-Q2 exemplar we have on file',
      'Request a refreshed W-9 before ledger posting',
    ],
    summary:
      'This transfer is blocked straight-through because of 3 risk flags. If medallion is re-imaged and signature verified, it’s safe to approve. W-9 can be collected in parallel and is not a blocker for DTC posting.',
    title: 'Broker transfer · DRS → Fidelity',
    urgency: 'high',
    value: '$41,655.00',
  },
  {
    assignee: { initials: 'AR', name: 'Arjun R.' },
    confHigh: 92,
    confLow: 88,
    docs: [
      { kind: 'Stock power', label: 'Stock-power.pdf', pages: 2, state: 'ok' },
      { kind: 'Medallion', label: 'Medallion.jpg', pages: 1, state: 'ok' },
    ],
    due: 'Tomorrow · 12:00pm',
    extraction: [
      {
        confHigh: 98,
        confLow: 96,
        label: 'Shareholder name',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'neutral',
        value: 'Theodore F. Nguyen',
      },
      {
        confHigh: 96,
        confLow: 92,
        label: 'Shares to transfer',
        page: 1,
        sourceDoc: 'Stock-power.pdf',
        tone: 'neutral',
        value: '200 shares',
      },
      {
        confHigh: 92,
        confLow: 84,
        label: 'New registration',
        page: 2,
        sourceDoc: 'Stock-power.pdf',
        tone: 'neutral',
        value: 'Nguyen Family Trust u/a/d 2021',
      },
    ],
    id: 'TR-120471',
    inquiryType: 'Re-registration · DRS → Trust',
    issuer: 'Halcyon Industrial Co.',
    kyc: {
      match: 94,
      status: 'passed',
      when: 'Jan 18 · 11:12am',
    },
    overview: 'Straightforward DRS-to-DRS re-registration into a trust. All documents clean; trustee certification included.',
    risks: [
      {
        body: 'Trust effective date (2021) confirmed against grantor letter.',
        severity: 'low',
        title: 'Trust vintage verified',
      },
    ],
    shareholder: 'Theodore F. Nguyen · SH-10284',
    shares: '200',
    suggestedFocus: ['Confirm trustee names against signature block', 'Post straight through after a final sanity check'],
    summary: 'No significant risk flags. Eligible for same-day posting pending a 10-second sanity check.',
    title: 'Re-registration into trust',
    urgency: 'med',
    value: '$7,948.00',
  },
  {
    assignee: { initials: '—', name: 'Unassigned' },
    confHigh: 74,
    confLow: 62,
    docs: [
      { kind: 'Account form', label: 'DRIP-enroll.pdf', pages: 1, state: 'ok' },
      { kind: 'Bank letter', label: 'Bank-ltr.pdf', pages: 1, state: 'ok' },
    ],
    due: 'Jan 22 · 5:00pm',
    extraction: [
      {
        confHigh: 98,
        confLow: 94,
        label: 'Shareholder name',
        page: 1,
        sourceDoc: 'DRIP-enroll.pdf',
        tone: 'neutral',
        value: 'Sujata B. Iyer',
      },
      {
        confHigh: 72,
        confLow: 58,
        label: 'Routing / account',
        page: 1,
        sourceDoc: 'Bank-ltr.pdf',
        tone: 'warning',
        value: '•••• 7821 · Capital One',
        warning: 'OCR partial',
      },
    ],
    id: 'DR-44811',
    inquiryType: 'DRIP enrollment',
    issuer: 'Teagan Biosciences',
    kyc: {
      match: 91,
      status: 'passed',
      when: 'Jan 17 · 3:22pm',
    },
    overview: 'DRIP enrollment with ACH bank letter. Routing/account digits partially obscured; verify the last 4.',
    risks: [
      {
        body: 'Last four digits of the account legible but the middle digits are partially redacted. Confirm with the bank letter image.',
        severity: 'med',
        title: 'Partial ACH digits',
      },
    ],
    shareholder: 'Sujata B. Iyer · SH-22091',
    shares: '180',
    suggestedFocus: [
      'Zoom into the bank letter header to confirm ACH digits',
      'Default to reinvest in-full unless holder specified partial',
    ],
    summary: 'Enrollment looks fine but the ACH letter has a smudge on the account digits. Cross-reference the masked deposit on file.',
    title: 'DRIP enrollment · ACH setup',
    urgency: 'med',
    value: '$26,898.00',
  },
  {
    assignee: { initials: 'MH', name: 'Maya H.' },
    confHigh: 96,
    confLow: 92,
    docs: [{ kind: 'Cert request', label: 'Cert-req.pdf', pages: 1, state: 'ok' }],
    due: 'Jan 24 · 5:00pm',
    extraction: [
      {
        confHigh: 98,
        confLow: 96,
        label: 'Shareholder',
        page: 1,
        sourceDoc: 'Cert-req.pdf',
        tone: 'neutral',
        value: 'Okoye Holdings LLC',
      },
    ],
    id: 'IS-30122',
    inquiryType: 'Certificate issuance',
    issuer: 'Ridgefield Energy Holdings',
    kyc: { match: 98, status: 'passed', when: 'Jan 18 · 7:40am' },
    overview: 'Cert issuance from DRS. Low complexity, signed and notarized.',
    risks: [],
    shareholder: 'Okoye Holdings LLC · SH-55120',
    shares: '1,000',
    suggestedFocus: ['Verify registered address on cert face', 'Queue for mail-room batch'],
    summary: 'Straight-through eligible. Queue for next mail batch.',
    title: 'Issue physical certificate',
    urgency: 'low',
    value: '$4,992.00',
  },
]

export default function AgentWorkbenchPage() {
  return (
    <AppShell portal='agent'>
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='kanban-square' size={13} />
              Board view
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='history' size={13} />
              Audit trail
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='play' size={13} />
              Next case
            </button>
          </>
        }
        eyebrow='Transfer agent · operations workbench'
        subtitle='Urgency, confidence intervals, and full approval context — everything reviewers need on one canvas.'
        title='Agent workbench'
      />

      <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-4'>
        <Metric helper='18 assigned to you' label='Active queue' value={cases.length.toString().padStart(2, '0')} />
        <Metric delta='–28 min vs. 30d avg' helper='Target 60m' label='Median review time' trend='up' value='42m' />
        <Metric delta='+3.2 pts' helper='7-day moving avg' label='Straight-through rate' trend='up' value='86.4%' />
        <Metric helper='1 high, 2 med today' label='Risk-flagged' value='3' />
      </div>

      <Workbench cases={cases} />
    </AppShell>
  )
}
