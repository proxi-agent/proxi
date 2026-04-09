import EndpointPreview from '@/components/endpoint-preview'

export default function AgentDashboardPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Agent dashboard</h2>
        <p className='mt-2 text-sm text-slate-600'>Monitor intake queue, pending reviews, and ledger posting activity.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Operational summary' path='/operations/reports/summary' />
        <EndpointPreview label='Exception queue snapshot' path='/operations/exceptions' />
      </div>
    </section>
  )
}
