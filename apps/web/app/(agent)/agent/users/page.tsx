import EndpointPreview from '@/components/endpoint-preview'

export default function AgentUsersPage() {
  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-slate-200 bg-white p-6'>
        <h2 className='text-xl font-semibold text-slate-900'>Users</h2>
        <p className='mt-2 text-sm text-slate-600'>Provision issuer and agent user access and role assignments.</p>
      </div>
      <EndpointPreview label='User administration activity feed' path='/operations/audit-trail' />
    </section>
  )
}
