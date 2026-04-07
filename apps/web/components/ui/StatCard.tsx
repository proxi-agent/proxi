interface StatCardProps {
  label: string
  loading?: boolean
  value: string
}

export default function StatCard({ label, loading = false, value }: StatCardProps) {
  return (
    <article className='rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 to-blue-50 p-4'>
      <p className='text-sm text-slate-500'>{label}</p>
      <p className='mt-1 text-2xl font-bold text-slate-900'>{loading ? '...' : value}</p>
    </article>
  )
}
