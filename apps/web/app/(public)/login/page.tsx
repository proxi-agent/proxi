'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { defaultPortalPathForRole, ROLE_LABELS, ROLES, type Role } from '@/lib/auth/rbac'

export default function LoginPage() {
  const router = useRouter()
  const { loginAs } = useAuth()
  const [role, setRole] = useState<Role>('shareholder')

  function handleLogin() {
    loginAs(role)
    const nextPath = new URLSearchParams(window.location.search).get('next')
    router.push(nextPath || defaultPortalPathForRole(role))
  }

  return (
    <main className='mx-auto max-w-xl px-6 py-16'>
      <h1 className='text-2xl font-semibold text-slate-900'>Sign in</h1>
      <p className='mt-2 text-sm text-slate-600'>Demo role-based auth is enabled. Choose a role to enter a portal.</p>
      <div className='mt-6 rounded-xl border border-slate-200 bg-white p-5'>
        <label className='flex flex-col gap-2 text-sm text-slate-700'>
          Role
          <select className='rounded-md border border-slate-300 px-3 py-2' onChange={e => setRole(e.target.value as Role)} value={role}>
            {ROLES.map(item => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <button className='mt-4 rounded-md bg-blue-700 px-4 py-2 text-white' onClick={handleLogin} type='button'>
          Continue
        </button>
      </div>
    </main>
  )
}
