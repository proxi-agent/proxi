'use client'

import { useParams } from 'next/navigation'

export default function ShareholderTransferDocumentsPage() {
  const params = useParams<{ transferId: string }>()
  const transferId = params?.transferId || 'unknown'

  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6'>
      <h2 className='text-xl font-semibold text-slate-900'>Transfer {transferId} documents</h2>
      <p className='mt-2 text-sm text-slate-600'>Upload and review transfer documentation.</p>
    </section>
  )
}
