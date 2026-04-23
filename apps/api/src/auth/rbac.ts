export const PERMISSIONS = [
  'agent.admin',
  'dividend.manage',
  'issuer.manage',
  'ledger.adjust',
  'ledger.post',
  'meeting.manage',
  'notice.manage',
  'report.view',
  'shareholder.manage',
  'shareholder.transfer.create',
  'task.manage',
  'transfer.ai.process',
  'transfer.approve',
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
  'issuer_operator',
  'issuer_viewer',
  'shareholder',
  'super_admin',
  'transfer_agent_admin',
] as const

export type Role = (typeof ROLES)[number]

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  agent_admin: [
    'agent.admin',
    'dividend.manage',
    'issuer.manage',
    'ledger.adjust',
    'ledger.post',
    'meeting.manage',
    'notice.manage',
    'report.view',
    'shareholder.manage',
    'task.manage',
    'transfer.ai.process',
    'transfer.approve',
    'transfer.review',
    'transfer.view',
    'user.manage',
  ],
  agent_processor: ['ledger.post', 'task.manage', 'transfer.ai.process', 'transfer.review', 'transfer.view'],
  agent_reviewer: ['task.manage', 'transfer.approve', 'transfer.review', 'transfer.view'],
  compliance_reviewer: ['report.view', 'task.manage', 'transfer.approve', 'transfer.review', 'transfer.view'],
  issuer_admin: [
    'dividend.manage',
    'issuer.manage',
    'meeting.manage',
    'notice.manage',
    'report.view',
    'shareholder.manage',
    'task.manage',
    'transfer.approve',
    'transfer.review',
    'transfer.view',
    'user.manage',
  ],
  issuer_operator: [
    'dividend.manage',
    'meeting.manage',
    'notice.manage',
    'report.view',
    'shareholder.manage',
    'task.manage',
    'transfer.review',
    'transfer.view',
  ],
  issuer_viewer: ['report.view', 'transfer.view'],
  shareholder: ['shareholder.transfer.create', 'transfer.view'],
  super_admin: [...PERMISSIONS],
  transfer_agent_admin: [...PERMISSIONS],
}

export function hasPermission(role: Role | readonly Role[], permission: Permission): boolean {
  const roles = Array.isArray(role) ? role : [role]
  if (roles.includes('super_admin') || roles.includes('transfer_agent_admin')) {
    return true
  }
  return roles.some(item => ROLE_PERMISSIONS[item].includes(permission))
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}

/**
 * Maps legacy role labels and IdP-provided aliases to canonical app roles.
 * Keep this function pure and side-effect free; it is called from auth guards.
 */
export function normalizeRole(value: unknown): Role | null {
  if (!value || typeof value !== 'string') return null
  const input = value.trim().toLowerCase()

  const aliasMap: Record<string, Role> = {
    admin: 'transfer_agent_admin',
    agent_admin: 'agent_admin',
    agent_operator: 'agent_processor',
    compliance_reviewer: 'compliance_reviewer',
    issuer_admin: 'issuer_admin',
    issuer_operator: 'issuer_operator',
    issuer_viewer: 'issuer_viewer',
    investor: 'shareholder',
    reviewer: 'agent_reviewer',
    shareholder: 'shareholder',
    super_admin: 'super_admin',
    transfer_agent_admin: 'transfer_agent_admin',
  }

  return aliasMap[input] ?? null
}
