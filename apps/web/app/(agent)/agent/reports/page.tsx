import EndpointPreview from '@/components/endpoint-preview'

export default function AgentReportsPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Reports</h2>
        <p className='mt-2 text-sm text-slate-600'>Generate operational and compliance reports for agent teams.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Reports summary' path='/operations/reports/summary' />
        <EndpointPreview label='Reconciliation breaks' path='/operations/reconciliation' />
      </div>
      <EndpointPreview label='Audit trail' path='/operations/audit-trail' />
    </section>
  )
}
