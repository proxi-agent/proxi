import EndpointPreview from '@/components/endpoint-preview'

export default function HoldingsPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Holdings</h2>
        <p className='mt-2 text-sm text-slate-600'>View your share balances and recent ownership changes.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Current positions' path='/ledger/positions' />
        <EndpointPreview label='Recent ledger events' path='/ledger/events' />
      </div>
    </section>
  )
}
