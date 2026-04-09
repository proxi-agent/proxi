import EndpointPreview from '@/components/endpoint-preview'

export default function IssuerShareholdersPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Issuer shareholders</h2>
        <p className='mt-2 text-sm text-slate-600'>View and segment shareholders associated with the issuer.</p>
      </div>
      <EndpointPreview label='Shareholder profile directory' path='/operations/holders' />
    </section>
  )
}
