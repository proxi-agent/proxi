export type EndpointConfig = {
  label: string
  path: string
}

type EndpointMatcher = {
  endpoints: EndpointConfig[]
  test: RegExp
}

const matchers: EndpointMatcher[] = [
  {
    test: /^\/agent\/transfers\/[^/]+\/review$/,
    endpoints: [
      { label: 'Case list', path: '/cases' },
      { label: 'Review mock', path: '/operations/mock?page=agent.transfer.review&transferId={transferId}' },
    ],
  },
  {
    test: /^\/agent\/transfers\/[^/]+\/documents$/,
    endpoints: [
      { label: 'Audit trail', path: '/operations/audit-trail' },
      { label: 'Document mock', path: '/operations/mock?page=agent.transfer.documents&transferId={transferId}' },
    ],
  },
  {
    test: /^\/agent\/transfers\/[^/]+\/ledger$/,
    endpoints: [
      { label: 'Ledger events', path: '/ledger/events' },
      { label: 'Ledger mock', path: '/operations/mock?page=agent.transfer.ledger&transferId={transferId}' },
    ],
  },
  {
    test: /^\/agent\/transfers\/[^/]+$/,
    endpoints: [
      { label: 'Case list', path: '/cases' },
      { label: 'Transfer detail mock', path: '/operations/mock?page=agent.transfer.detail&transferId={transferId}' },
    ],
  },
  {
    test: /^\/agent\/queue$/,
    endpoints: [
      { label: 'Cases queue', path: '/cases' },
      { label: 'Queue mock', path: '/operations/mock?page=agent.queue' },
    ],
  },
  {
    test: /^\/agent\/transfers$/,
    endpoints: [
      { label: 'Cases', path: '/cases' },
      { label: 'Transfers mock', path: '/operations/mock?page=agent.transfers' },
    ],
  },
  {
    test: /^\/agent\/issuers$/,
    endpoints: [
      { label: 'Holders', path: '/operations/holders' },
      { label: 'Issuer catalog mock', path: '/operations/mock?page=agent.issuers' },
    ],
  },
  {
    test: /^\/agent\/users$/,
    endpoints: [
      { label: 'Audit trail', path: '/operations/audit-trail' },
      { label: 'Users mock', path: '/operations/mock?page=agent.users' },
    ],
  },
  {
    test: /^\/agent\/reports$/,
    endpoints: [
      { label: 'Report summary', path: '/operations/reports/summary' },
      { label: 'Reports mock', path: '/operations/mock?page=agent.reports' },
    ],
  },
  {
    test: /^\/agent\/admin$/,
    endpoints: [
      { label: 'Exceptions', path: '/operations/exceptions' },
      { label: 'Admin mock', path: '/operations/mock?page=agent.admin' },
    ],
  },
  {
    test: /^\/agent$/,
    endpoints: [
      { label: 'Health', path: '/health' },
      { label: 'Agent dashboard mock', path: '/operations/mock?page=agent.dashboard' },
    ],
  },
  {
    test: /^\/issuer\/transfers\/[^/]+$/,
    endpoints: [
      { label: 'Case list', path: '/cases' },
      { label: 'Issuer transfer mock', path: '/operations/mock?page=issuer.transfer.detail&transferId={transferId}' },
    ],
  },
  {
    test: /^\/issuer\/transfers$/,
    endpoints: [
      { label: 'Cases', path: '/cases' },
      { label: 'Issuer transfers mock', path: '/operations/mock?page=issuer.transfers' },
    ],
  },
  {
    test: /^\/issuer\/shareholders$/,
    endpoints: [
      { label: 'Shareholder profiles', path: '/operations/holders' },
      { label: 'Issuer shareholders mock', path: '/operations/mock?page=issuer.shareholders' },
    ],
  },
  {
    test: /^\/issuer\/reports$/,
    endpoints: [
      { label: 'Report summary', path: '/operations/reports/summary' },
      { label: 'Issuer reports mock', path: '/operations/mock?page=issuer.reports' },
    ],
  },
  {
    test: /^\/issuer\/settings$/,
    endpoints: [
      { label: 'Audit trail', path: '/operations/audit-trail' },
      { label: 'Issuer settings mock', path: '/operations/mock?page=issuer.settings' },
    ],
  },
  {
    test: /^\/issuer$/,
    endpoints: [
      { label: 'Health', path: '/health' },
      { label: 'Issuer dashboard mock', path: '/operations/mock?page=issuer.dashboard' },
    ],
  },
  {
    test: /^\/shareholder\/transfers\/[^/]+\/documents$/,
    endpoints: [
      { label: 'Upload endpoint', path: '/evidence/upload' },
      { label: 'Shareholder docs mock', path: '/operations/mock?page=shareholder.transfer.documents&transferId={transferId}' },
    ],
  },
  {
    test: /^\/shareholder\/transfers\/[^/]+\/status$/,
    endpoints: [
      { label: 'Case list', path: '/cases' },
      { label: 'Shareholder status mock', path: '/operations/mock?page=shareholder.transfer.status&transferId={transferId}' },
    ],
  },
  {
    test: /^\/shareholder\/transfers\/new$/,
    endpoints: [
      { label: 'Cases', path: '/cases' },
      { label: 'New transfer mock', path: '/operations/mock?page=shareholder.transfer.new' },
    ],
  },
  {
    test: /^\/shareholder\/transfers\/[^/]+$/,
    endpoints: [
      { label: 'Case list', path: '/cases' },
      { label: 'Shareholder transfer mock', path: '/operations/mock?page=shareholder.transfer.detail&transferId={transferId}' },
    ],
  },
  {
    test: /^\/shareholder\/holdings$/,
    endpoints: [
      { label: 'Ledger positions', path: '/ledger/positions' },
      { label: 'Holdings mock', path: '/operations/mock?page=shareholder.holdings' },
    ],
  },
  {
    test: /^\/shareholder\/profile$/,
    endpoints: [
      { label: 'Holder profiles', path: '/operations/holders' },
      { label: 'Profile mock', path: '/operations/mock?page=shareholder.profile' },
    ],
  },
  {
    test: /^\/shareholder$/,
    endpoints: [
      { label: 'Health', path: '/health' },
      { label: 'Shareholder dashboard mock', path: '/operations/mock?page=shareholder.dashboard' },
    ],
  },
]

export function getEndpointsForPath(pathname: string): EndpointConfig[] {
  const transferId = pathname.match(/\/transfers\/([^/]+)/)?.[1]
  const matcher = matchers.find(entry => entry.test.test(pathname))
  if (!matcher) {
    return [{ label: 'Health', path: '/health' }]
  }
  return matcher.endpoints.map(endpoint => ({
    ...endpoint,
    path: endpoint.path.replaceAll('{transferId}', transferId || '1'),
  }))
}
