import EndpointPreview from '@/components/endpoint-preview'

export default function IssuerDashboardPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Issuer dashboard</h2>
        <p className='mt-2 text-sm text-slate-600'>Monitor transfers, shareholder activity, and issuer-level KPIs.</p>
      </div>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <EndpointPreview label='Issuer KPI summary' path='/operations/reports/summary' />
        <EndpointPreview label='Transfer volume' path='/cases' />
      </div>
    </section>
  )
}
