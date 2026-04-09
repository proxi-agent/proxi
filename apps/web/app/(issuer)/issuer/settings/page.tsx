import EndpointPreview from '@/components/endpoint-preview'

export default function IssuerSettingsPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Issuer settings</h2>
        <p className='mt-2 text-sm text-slate-600'>Configure issuer-level policies, notification routing, and defaults.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Recent policy changes' path='/operations/audit-trail' />
        <EndpointPreview label='Issuer setting health checks' path='/operations/mock?page=issuer.settings' />
      </div>
    </section>
  )
}
