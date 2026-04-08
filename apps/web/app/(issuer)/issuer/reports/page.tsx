'use client'

import { can } from '@/lib/auth/rbac'
import { useAuth } from '@/lib/auth/auth-context'

export default function IssuerReportsPage() {
  const { user } = useAuth()

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <h2 className='text-xl font-semibold text-slate-900'>Issuer reports</h2>
      <p className='mt-2 text-sm text-slate-600'>Operational and compliance reporting for issuer teams.</p>
      <p className='mt-4 text-sm text-slate-700'>Can view reports: {String(can(user, 'report.view'))}</p>
    </section>
  )
}
