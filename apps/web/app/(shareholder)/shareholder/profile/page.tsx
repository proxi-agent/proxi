import EndpointPreview from '@/components/endpoint-preview'

export default function ShareholderProfilePage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Profile</h2>
        <p className='mt-2 text-sm text-slate-600'>Manage your contact preferences and account details.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Shareholder profile records' path='/operations/holders' />
        <EndpointPreview label='Profile readiness checks' path='/operations/mock?page=shareholder.profile' />
      </div>
    </section>
  )
}
