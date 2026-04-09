import EndpointPreview from '@/components/endpoint-preview'

export default function AgentAdminPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Agent admin</h2>
        <p className='mt-2 text-sm text-slate-600'>Manage queue rules, policy defaults, and platform configuration for processing teams.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Open exceptions' path='/operations/exceptions' />
        <EndpointPreview label='Policy and process audit trail' path='/operations/audit-trail' />
      </div>
    </section>
  )
}
