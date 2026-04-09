'use client'

import CaseDetailPanel from '@/components/case-detail-panel'
import { useParams } from 'next/navigation'

export default function AgentTransferDetailPage() {
  const params = useParams<{ transferId: string }>()
  const transferId = Number(params?.transferId || 0)

  if (!transferId) {
    return <p className='rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>Invalid transfer ID.</p>
  }

  return <CaseDetailPanel caseId={transferId} mode='summary' />
}
