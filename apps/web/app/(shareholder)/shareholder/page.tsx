'use client'

import { can } from '@/lib/auth/rbac'
import { useAuth } from '@/lib/auth/auth-context'

export default function ShareholderDashboardPage() {
  const { user } = useAuth()

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <h2 className='text-xl font-semibold text-slate-900'>Shareholder dashboard</h2>
      <p className='mt-2 text-sm text-slate-600'>Track holdings, submit transfer requests, and view transfer status.</p>
      <p className='mt-4 text-sm text-slate-700'>Can create transfer: {String(can(user, 'shareholder.transfer.create'))}</p>
    </section>
  )
}
