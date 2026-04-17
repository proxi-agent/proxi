export type PortalId = 'investor' | 'issuer' | 'agent' | 'admin'

export type NavItem = {
  label: string
  href: string
  icon: string
  badge?: string | number
}

export type NavSection = {
  label: string
  items: NavItem[]
}

export type PortalConfig = {
  id: PortalId
  name: string
  role: string
  company?: string
  user: { name: string; email: string; initials: string }
  sections: NavSection[]
}

export const PORTAL_META: Record<PortalId, { name: string; tag: string }> = {
  admin: { name: 'Admin & Compliance', tag: 'Internal' },
  agent: { name: 'Transfer Agent Workbench', tag: 'Operations' },
  investor: { name: 'Investor Portal', tag: 'Shareholder' },
  issuer: { name: 'Issuer Portal', tag: 'Company' },
}

export const PORTAL_ORDER: PortalId[] = ['investor', 'issuer', 'agent', 'admin']

export const PORTALS: Record<PortalId, PortalConfig> = {
  admin: {
    company: 'Proxi Internal',
    id: 'admin',
    name: 'Admin & Compliance',
    role: 'Compliance officer',
    sections: [
      {
        items: [
          { href: '/admin', icon: 'shield', label: 'Overview' },
          {
            badge: 14,
            href: '/admin/risk',
            icon: 'alert-triangle',
            label: 'Risk review',
          },
          { href: '/admin/audit', icon: 'file-search', label: 'Audit logs' },
          { href: '/admin/policies', icon: 'scroll', label: 'Policies' },
        ],
        label: 'Oversight',
      },
      {
        items: [
          { href: '/admin/users', icon: 'users', label: 'Users & roles' },
          { href: '/admin/tenants', icon: 'building', label: 'Issuer tenants' },
          { href: '/admin/keys', icon: 'key', label: 'API & keys' },
        ],
        label: 'Platform',
      },
    ],
    user: {
      email: 'maya@proxi.co',
      initials: 'MR',
      name: 'Maya Ruiz',
    },
  },
  agent: {
    id: 'agent',
    name: 'Transfer Agent Workbench',
    role: 'Reviewer · Senior',
    sections: [
      {
        items: [
          { href: '/agent', icon: 'layout-dashboard', label: 'Workbench' },
          {
            badge: 38,
            href: '/agent/queue',
            icon: 'inbox',
            label: 'Action queue',
          },
          {
            href: '/agent/review',
            icon: 'scan-search',
            label: 'Review center',
          },
          {
            href: '/agent/exceptions',
            icon: 'alert-triangle',
            label: 'Exceptions',
          },
        ],
        label: 'Operations',
      },
      {
        items: [
          {
            href: '/agent/transfers',
            icon: 'arrow-left-right',
            label: 'Transfers',
          },
          { href: '/agent/issuance', icon: 'plus-square', label: 'Issuance' },
          { href: '/agent/dividends', icon: 'coins', label: 'Dividends' },
          {
            href: '/agent/corporate-actions',
            icon: 'git-merge',
            label: 'Corporate actions',
          },
          {
            href: '/agent/kyc',
            icon: 'id-card',
            label: 'KYC & identity',
          },
        ],
        label: 'Workflows',
      },
      {
        items: [
          {
            href: '/agent/shareholders',
            icon: 'book-open',
            label: 'Shareholder ledger',
          },
          { href: '/agent/documents', icon: 'folder', label: 'Documents' },
          {
            href: '/agent/support',
            icon: 'message-square',
            label: 'Support cases',
          },
        ],
        label: 'Records',
      },
    ],
    user: {
      email: 'daniel@proxi.co',
      initials: 'DC',
      name: 'Daniel Chen',
    },
  },
  investor: {
    id: 'investor',
    name: 'Investor Portal',
    role: 'Registered shareholder',
    sections: [
      {
        items: [
          {
            href: '/investor',
            icon: 'layout-dashboard',
            label: 'Investor Dashboard',
          },
          {
            badge: 3,
            href: '/investor/inbox',
            icon: 'inbox',
            label: 'Inbox',
          },
        ],
        label: 'Account',
      },
      {
        items: [
          {
            href: '/investor/dividends',
            icon: 'coins',
            label: 'Dividends',
          },
          {
            href: '/investor/proxy',
            icon: 'vote',
            label: 'Proxy voting',
          },
          {
            href: '/investor/corporate-actions',
            icon: 'git-merge',
            label: 'Corporate actions',
          },
        ],
        label: 'Events',
      },
      {
        items: [
          {
            href: '/investor/tax',
            icon: 'file-text',
            label: 'Tax & compliance reporting',
          },
        ],
        label: 'Reporting',
      },
    ],
    user: {
      email: 'eleanor.hayes@example.com',
      initials: 'EH',
      name: 'Eleanor Hayes',
    },
  },
  issuer: {
    company: 'Meridian Optics, Inc.',
    id: 'issuer',
    name: 'Issuer Portal',
    role: 'Corporate secretary',
    sections: [
      {
        items: [
          { href: '/issuer', icon: 'layout-dashboard', label: 'Overview' },
          {
            href: '/issuer/shareholders',
            icon: 'users',
            label: 'Shareholders',
          },
          {
            href: '/issuer/analytics',
            icon: 'chart-bar',
            label: 'Analytics',
          },
        ],
        label: 'Company',
      },
      {
        items: [
          {
            badge: 'Run',
            href: '/issuer/dividends',
            icon: 'coins',
            label: 'Dividends',
          },
          { href: '/issuer/proxy', icon: 'vote', label: 'Proxy campaigns' },
          {
            href: '/issuer/corporate-actions',
            icon: 'git-merge',
            label: 'Corporate actions',
          },
          {
            href: '/issuer/esp',
            icon: 'handshake',
            label: 'Employee plans',
          },
        ],
        label: 'Workflows',
      },
      {
        items: [
          {
            href: '/issuer/communications',
            icon: 'mail',
            label: 'Communications',
          },
          { href: '/issuer/reports', icon: 'file-text', label: 'Reports' },
        ],
        label: 'Outreach',
      },
    ],
    user: {
      email: 'krishna@proxiagent.ai',
      initials: 'KA',
      name: 'Krishna Ajmeri',
    },
  },
}
