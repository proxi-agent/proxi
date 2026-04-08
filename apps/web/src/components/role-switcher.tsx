'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { defaultPortalPathForRole, ROLE_LABELS, ROLES, type Role } from '@/lib/auth/rbac'

export default function RoleSwitcher() {
  const router = useRouter()
  const { setRole, user } = useAuth()

  if (!user) {
    return null
  }

  return (
    <label className='flex items-center gap-2 text-sm text-slate-600'>
      Role
      <select
        className='rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800'
        onChange={event => {
          const nextRole = event.target.value as Role
          setRole(nextRole)
          router.replace(defaultPortalPathForRole(nextRole))
        }}
        value={user.role}
      >
        {ROLES.map(role => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </label>
  )
}
