'use client'

import { can } from '@/lib/auth/rbac'
import { useAuth } from '@/lib/auth/auth-context'
import { useParams } from 'next/navigation'

export default function AgentTransferReviewPage() {
  const params = useParams<{ transferId: string }>()
  const transferId = params?.transferId || 'unknown'
  const { user } = useAuth()

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <h2 className='text-xl font-semibold text-slate-900'>Transfer {transferId} review</h2>
      <p className='mt-2 text-sm text-slate-600'>Decision workspace for review and compliance checks.</p>
      <p className='mt-4 text-sm text-slate-700'>can(user, 'transfer.review') = {String(can(user, 'transfer.review'))}</p>
    </section>
  )
}
