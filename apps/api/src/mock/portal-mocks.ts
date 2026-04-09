export type PortalMockPayload = {
  highlights: Array<{ label: string; value: string }>
  notes: string[]
  table?: Array<Record<string, string | number>>
}

export const PORTAL_MOCKS: Record<string, PortalMockPayload> = {
  'agent.admin': {
    highlights: [
      { label: 'Queue SLA', value: '2h' },
      { label: 'Policy version', value: 'v3.4' },
    ],
    notes: ['Policy updates pending legal sign-off.', 'Role entitlements synced nightly.'],
  },
  'agent.dashboard': {
    highlights: [
      { label: 'Pending reviews', value: '12' },
      { label: 'Ready to post', value: '4' },
    ],
    notes: ['Morning cut-off at 11:00 ET.', 'Two high-priority transfers flagged for compliance.'],
  },
  'agent.issuers': {
    highlights: [
      { label: 'Active issuers', value: '18' },
      { label: 'Onboarding', value: '3' },
    ],
    notes: ['Issuer KYC refresh due this week.'],
  },
  'agent.queue': {
    highlights: [
      { label: 'New items', value: '9' },
      { label: 'Aging >24h', value: '2' },
    ],
    notes: ['Queue sorted by risk and settlement window.'],
  },
  'agent.reports': {
    highlights: [
      { label: 'Daily accuracy', value: '99.1%' },
      { label: 'Open exceptions', value: '3' },
    ],
    notes: ['Compliance packet generated at 18:00 ET.'],
  },
  'agent.transfer.detail': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Lifecycle', value: 'RESTRICTIONS_REVIEW' },
    ],
    notes: ['Transfer routed to reviewer workbench.'],
  },
  'agent.transfer.documents': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Documents complete', value: '3 / 4' },
    ],
    notes: ['Medallion guarantee still required.'],
  },
  'agent.transfer.ledger': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Postable', value: 'Yes' },
    ],
    notes: ['Ledger posting queued for next batch window.'],
  },
  'agent.transfer.review': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Risk score', value: 'Low' },
    ],
    notes: ['No transfer restrictions detected for this holder pair.'],
  },
  'agent.transfers': {
    highlights: [
      { label: 'In-flight transfers', value: '27' },
      { label: 'Completed today', value: '6' },
    ],
    notes: ['Most volume from PROXI-CLASS-A.'],
  },
  'agent.users': {
    highlights: [
      { label: 'Agent users', value: '31' },
      { label: 'Pending invites', value: '2' },
    ],
    notes: ['Two reviewer accounts waiting for MFA setup.'],
  },
  'issuer.dashboard': {
    highlights: [
      { label: 'Transfers this week', value: '14' },
      { label: 'Open exceptions', value: '1' },
    ],
    notes: ['Issuer operations are within policy tolerance.'],
  },
  'issuer.reports': {
    highlights: [
      { label: 'Reconciliation accuracy', value: '98.9%' },
      { label: 'Settlement latency', value: '1.8h' },
    ],
    notes: ['Quarterly board summary draft available.'],
  },
  'issuer.settings': {
    highlights: [
      { label: 'Approval mode', value: 'Dual control' },
      { label: 'Notification channels', value: 'Email + Slack' },
    ],
    notes: ['Change freeze begins Friday 17:00 ET.'],
  },
  'issuer.shareholders': {
    highlights: [
      { label: 'Shareholders tracked', value: '142' },
      { label: 'High risk profiles', value: '5' },
    ],
    notes: ['Three profiles need updated beneficial-owner docs.'],
  },
  'issuer.transfer.detail': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Issuer approval', value: 'Pending' },
    ],
    notes: ['Awaiting issuer admin approval step.'],
  },
  'issuer.transfers': {
    highlights: [
      { label: 'Submitted', value: '11' },
      { label: 'Awaiting approval', value: '4' },
    ],
    notes: ['Average turnaround target is 4 business hours.'],
  },
  'shareholder.dashboard': {
    highlights: [
      { label: 'Current holdings', value: '3 securities' },
      { label: 'Pending transfers', value: '1' },
    ],
    notes: ['Latest transfer moved to document review.'],
  },
  'shareholder.holdings': {
    highlights: [
      { label: 'Total units', value: '91,000' },
      { label: 'Last updated', value: 'Today' },
    ],
    notes: ['Holdings synced after ledger close.'],
  },
  'shareholder.profile': {
    highlights: [
      { label: 'KYC status', value: 'Verified' },
      { label: 'Tax profile', value: 'W-8BEN on file' },
    ],
    notes: ['Next profile review due in 90 days.'],
  },
  'shareholder.transfer.detail': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Status', value: 'IN_REVIEW' },
    ],
    notes: ['Agent reviewer currently validating evidence set.'],
  },
  'shareholder.transfer.documents': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Uploaded files', value: '2' },
    ],
    notes: ['Add medallion guarantee PDF to complete packet.'],
  },
  'shareholder.transfer.new': {
    highlights: [
      { label: 'Required docs', value: '4' },
      { label: 'Draft autosave', value: 'Enabled' },
    ],
    notes: ['Draft expires after 7 days of inactivity.'],
  },
  'shareholder.transfer.status': {
    highlights: [
      { label: 'Transfer', value: '{{transferId}}' },
      { label: 'Current stage', value: 'COMPLIANCE_REVIEW' },
    ],
    notes: ['Expected completion window: 1-2 business days.'],
  },
}
