export const PERMISSIONS = [
  'agent.admin',
  'ledger.post',
  'report.view',
  'shareholder.transfer.create',
  'transfer.review',
  'transfer.view',
  'user.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLES = [
  'agent_admin',
  'agent_processor',
  'agent_reviewer',
  'compliance_reviewer',
  'issuer_admin',
  'issuer_viewer',
  'shareholder',
  'super_admin',
] as const

export type Role = (typeof ROLES)[number]

export type User = {
  email: string
  name: string
  role: Role
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  agent_admin: ['agent.admin', 'ledger.post', 'report.view', 'transfer.review', 'transfer.view', 'user.manage'],
  agent_processor: ['ledger.post', 'transfer.review', 'transfer.view'],
  agent_reviewer: ['transfer.review', 'transfer.view'],
  compliance_reviewer: ['report.view', 'transfer.review', 'transfer.view'],
  issuer_admin: ['report.view', 'transfer.view', 'user.manage'],
  issuer_viewer: ['report.view', 'transfer.view'],
  shareholder: ['shareholder.transfer.create', 'transfer.view'],
  super_admin: [...PERMISSIONS],
}

type Portal = 'agent' | 'issuer' | 'shareholder'

const ROLE_PORTALS: Record<Role, Portal[]> = {
  agent_admin: ['agent'],
  agent_processor: ['agent'],
  agent_reviewer: ['agent'],
  compliance_reviewer: ['agent'],
  issuer_admin: ['issuer'],
  issuer_viewer: ['issuer'],
  shareholder: ['shareholder'],
  super_admin: ['agent', 'issuer', 'shareholder'],
}

export const ROLE_LABELS: Record<Role, string> = {
  agent_admin: 'Agent Admin',
  agent_processor: 'Agent Processor',
  agent_reviewer: 'Agent Reviewer',
  compliance_reviewer: 'Compliance Reviewer',
  issuer_admin: 'Issuer Admin',
  issuer_viewer: 'Issuer Viewer',
  shareholder: 'Shareholder',
  super_admin: 'Super Admin',
}

export function can(user: User | null, permission: Permission): boolean {
  if (!user) {
    return false
  }
  if (user.role === 'super_admin') {
    return true
  }
  return ROLE_PERMISSIONS[user.role].includes(permission)
}

export function canAccessPortal(user: User | null, portal: Portal): boolean {
  if (!user) {
    return false
  }
  return ROLE_PORTALS[user.role].includes(portal)
}

export function defaultPortalPathForRole(role: Role): string {
  switch (role) {
    case 'issuer_admin':
    case 'issuer_viewer':
      return '/issuer'
    case 'shareholder':
      return '/shareholder'
    default:
      return '/agent'
  }
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}
