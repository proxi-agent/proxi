import EndpointPreview from '@/components/endpoint-preview'

export default function AgentIssuersPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Issuers</h2>
        <p className='mt-2 text-sm text-slate-600'>Manage issuer onboarding state and assignment metadata.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Issuer profile directory' path='/operations/holders' />
        <EndpointPreview label='Issuer data quality exceptions' path='/operations/exceptions' />
      </div>
    </section>
  )
}
