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

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === 'super_admin') {
    return true
  }
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}
