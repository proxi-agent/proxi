'use client'

import CaseDetailPanel from '@/components/case-detail-panel'
import { can } from '@/lib/auth/rbac'
import { useAuth } from '@/lib/auth/auth-context'
import { useParams } from 'next/navigation'

export default function AgentTransferLedgerPage() {
  const params = useParams<{ transferId: string }>()
  const transferId = Number(params?.transferId || 0)
  const { user } = useAuth()

  if (!transferId) {
    return <p className='rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>Invalid transfer ID.</p>
  }

  return (
    <div className='space-y-4'>
      <section className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Transfer {transferId} ledger</h2>
        <p className='mt-2 text-sm text-slate-600'>Post and verify ledger entries for approved transfers.</p>
        <p className='mt-4 text-sm text-slate-700'>can(user, 'ledger.post') = {String(can(user, 'ledger.post'))}</p>
      </section>
      <CaseDetailPanel caseId={transferId} mode='review' />
    </div>
  )
}
